import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export class DocumentSyncService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Inicializa a estrutura da pasta /gestao-ia na raiz do projeto
     */
    initProjectStructure(projectRoot) {
        const baseDir = join(projectRoot, 'gestao-ia');
        const subDirs = ['entrada', 'processados', 'rejeitados', 'evidencias', 'contexto', 'prompts'];
        
        if (!existsSync(baseDir)) {
            mkdirSync(baseDir, { recursive: true });
        }
        for (const sub of subDirs) {
            const dir = join(baseDir, sub);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }
        return baseDir;
    }

    calculateFileHash(filePath) {
        if (!existsSync(filePath)) return null;
        const content = readFileSync(filePath);
        return createHash('sha256').update(content).digest('hex');
    }

    calculateStringHash(content) {
        return createHash('sha256').update(content, 'utf8').digest('hex');
    }

    /**
     * Verifica se os arquivos locais no disco foram alterados externamente
     */
    checkExternalDivergences(project) {
        const baseDir = join(project.root_path, 'gestao-ia');
        const docNames = ['Projeto.md', 'Tarefas.md', 'Decisões.md', 'Validação.md'];
        const divergences = [];

        const stmtGetSync = this.db.db.prepare(
            'SELECT file_name, sha256 FROM document_sync WHERE project_id = ?'
        );
        const syncRecords = stmtGetSync.all(project.id);
        const syncMap = new Map(syncRecords.map(r => [r.file_name, r.sha256]));

        for (const docName of docNames) {
            const filePath = join(baseDir, docName);
            if (existsSync(filePath)) {
                const currentDiskHash = this.calculateFileHash(filePath);
                const recordedHash = syncMap.get(docName);
                if (recordedHash && currentDiskHash !== recordedHash) {
                    divergences.push({
                        fileName: docName,
                        filePath,
                        diskHash: currentDiskHash,
                        dbHash: recordedHash
                    });
                }
            }
        }

        return divergences;
    }

    /**
     * Gera e salva atomicamente os 4 arquivos Markdown
     */
    exportProjectDocuments(project, force = false) {
        const baseDir = this.initProjectStructure(project.root_path);

        if (!force) {
            const divergences = this.checkExternalDivergences(project);
            if (divergences.length > 0) {
                const names = divergences.map(d => d.fileName).join(', ');
                throw new Error(`Divergência detectada! Arquivos alterados externamente no disco: ${names}. É necessária a conciliação antes de sobrescrever.`);
            }
        }

        const projectContent = this.generateProjetoMd(project);
        const tarefasContent = this.generateTarefasMd(project);
        const decisoesContent = this.generateDecisoesMd(project);
        const validacaoContent = this.generateValidacaoMd(project);

        const docs = [
            { name: 'Projeto.md', content: projectContent },
            { name: 'Tarefas.md', content: tarefasContent },
            { name: 'Decisões.md', content: decisoesContent },
            { name: 'Validação.md', content: validacaoContent }
        ];

        const now = new Date().toISOString();

        for (const doc of docs) {
            const finalPath = join(baseDir, doc.name);
            const tmpPath = join(baseDir, `${doc.name}.tmp`);

            // Escrita atômica e substituição segura (compatível com Windows e POSIX)
            writeFileSync(tmpPath, doc.content, 'utf8');
            try {
                renameSync(tmpPath, finalPath);
            } catch (renameErr) {
                // No Windows, renameSync falha se o arquivo de destino já existe
                copyFileSync(tmpPath, finalPath);
                try { unlinkSync(tmpPath); } catch {}
            }

            const hash = this.calculateStringHash(doc.content);

            const stmtUpsert = this.db.db.prepare(`
                INSERT INTO document_sync (project_id, file_name, sha256, last_exported_at, divergent)
                VALUES (?, ?, ?, ?, 0)
                ON CONFLICT(project_id, file_name) DO UPDATE SET
                    sha256 = excluded.sha256,
                    last_exported_at = excluded.last_exported_at,
                    divergent = 0;
            `);
            stmtUpsert.run(project.id, doc.name, hash, now);
        }

        return { success: true, exportedAt: now };
    }

    generateProjetoMd(project) {
        const features = this.db.db.prepare(
            'SELECT * FROM features WHERE project_id = ? ORDER BY id ASC'
        ).all(project.id);

        let md = `# ${project.title} (${project.id})\n\n`;
        md += `> Revisão Oficial: ${project.revision} | Atualizado em: ${new Date().toISOString()}\n\n`;
        md += `## Objetivo do Projeto\n${project.description}\n\n`;
        md += `## Raiz Local\n\`${project.root_path}\`\n\n`;
        md += `## Funcionalidades e Requisitos\n\n`;

        for (const f of features) {
            md += `### ${f.id} — ${f.title}\n`;
            md += `- **Etapa Atual:** ${f.stage} | **Situação:** ${f.status} | **Rodadas Reprovadas:** ${f.failed_corrections_count}\n`;
            md += `- **Descrição:** ${f.description}\n\n`;

            const reqs = this.db.db.prepare(
                'SELECT * FROM requirements WHERE feature_id = ? ORDER BY id ASC'
            ).all(f.id);

            if (reqs.length > 0) {
                md += `#### Requisitos Cadastrados\n`;
                for (const r of reqs) {
                    let criteria = [];
                    try {
                        const parsed = JSON.parse(r.acceptance_criteria);
                        if (Array.isArray(parsed)) criteria = parsed;
                        else if (typeof parsed === 'string' && parsed.trim().length > 0) criteria = [parsed];
                    } catch {
                        if (r.acceptance_criteria) criteria = [r.acceptance_criteria];
                    }
                    const approvedTag = r.human_approved ? '✅ Aprovado pelo Usuário' : '⏳ Aguardando Aprovação Humana';
                    md += `- **${r.id} (v${r.version})**: ${r.title} [${approvedTag}]\n`;
                    md += `  - *Descrição:* ${r.description}\n`;
                    if (Array.isArray(criteria) && criteria.length > 0) {
                        md += `  - *Critérios de Aceite:*\n`;
                        criteria.forEach(c => md += `    - ${c}\n`);
                    }
                }
                md += `\n`;
            }
        }

        return md;
    }

    generateTarefasMd(project) {
        const features = this.db.db.prepare(
            'SELECT * FROM features WHERE project_id = ? ORDER BY id ASC'
        ).all(project.id);

        let md = `# Tarefas da Esteira — ${project.title} (${project.id})\n\n`;
        md += `> Revisão do Projeto: ${project.revision} | Sincronizado em: ${new Date().toISOString()}\n\n`;

        for (const f of features) {
            md += `## Funcionalidade: ${f.id} — ${f.title}\n\n`;
            const tasks = this.db.db.prepare(
                'SELECT * FROM tasks WHERE feature_id = ? ORDER BY id ASC'
            ).all(f.id);

            if (tasks.length === 0) {
                md += `*Nenhuma tarefa cadastrada nesta funcionalidade.*\n\n`;
                continue;
            }

            for (const t of tasks) {
                let deps = [];
                try {
                    const parsed = JSON.parse(t.dependencies);
                    if (Array.isArray(parsed)) deps = parsed;
                    else if (typeof parsed === 'string' && parsed.trim().length > 0) deps = [parsed];
                } catch {
                    if (t.dependencies) deps = [t.dependencies];
                }
                const depsStr = (Array.isArray(deps) && deps.length > 0) ? deps.join(', ') : 'Nenhuma';
                const assignee = t.assignee_id ? t.assignee_id : 'Não atribuído';
                const delivery = t.last_delivery_ref ? t.last_delivery_ref : 'Nenhuma';

                md += `### ${t.id} — ${t.title}\n`;
                md += `- **Etapa:** ${t.stage} | **Situação:** ${t.status} | **Prioridade:** ${t.priority}\n`;
                md += `- **Responsável:** ${assignee} | **Dependências:** ${depsStr} | **Última Entrega:** ${delivery}\n`;
                md += `- **Descrição:** ${t.description}\n\n`;

                // Próxima ação recomendada
                const nextAction = this.computeNextActionText(t);
                md += `> **Próxima Ação:** ${nextAction}\n\n`;
            }
        }

        return md;
    }

    computeNextActionText(t) {
        if (t.status === 'concluida') return 'Tarefa totalmente concluída.';
        if (t.status === 'aguardando_teste_humano') return 'Executar e aprovar/reprovar teste humano no dashboard.';
        if (t.status === 'entrega_recebida' || t.status === 'aguardando_conferencia') {
            return `Conferir entrega ${t.last_delivery_ref || ''} e aceitar ou rejeitar.`;
        }
        if (t.status === 'bloqueada') return 'Resolver bloqueios ou dependências antes de prosseguir.';
        if (t.status === 'aguardando_decisao') return 'Aguardando deliberação humana em Decisões.md / Dashboard.';
        if (t.status === 'em_execucao') return `Etapa ${t.stage} em andamento pela IA responsável.`;
        if (t.status === 'pronta_para_iniciar' || t.status === 'planejada') {
            return `Iniciar etapa ${t.stage} com a IA autorizada.`;
        }
        if (t.status === 'etapa_aceita') {
            const nextStage = this.getNextStage(t.stage);
            return nextStage ? `Iniciar ${nextStage} usando a última entrega ${t.last_delivery_ref || ''}.` : 'Avançar etapa.';
        }
        return `Aguardando ação do programador na etapa ${t.stage}.`;
    }

    getNextStage(stage) {
        const order = ['Definir', 'Desenvolver', 'Verificar', 'Corrigir', 'Validar'];
        const idx = order.indexOf(stage);
        return (idx >= 0 && idx < order.length - 1) ? order[idx + 1] : null;
    }

    generateDecisoesMd(project) {
        let md = `# Registro de Decisões — ${project.title} (${project.id})\n\n`;
        md += `> Decisões arquiteturais, mudanças de escopo e deliberações humanas\n\n`;

        const decisions = this.db.db.prepare(
            'SELECT * FROM decisions WHERE project_id = ? ORDER BY id DESC'
        ).all(project.id);

        if (decisions.length === 0) {
            md += `*Nenhuma decisão registrada até o momento.*\n`;
            return md;
        }

        for (const d of decisions) {
            let alts = [];
            try {
                const parsed = JSON.parse(d.alternatives);
                if (Array.isArray(parsed)) alts = parsed;
                else if (typeof parsed === 'string' && parsed.trim().length > 0) alts = [parsed];
            } catch {
                if (d.alternatives) alts = [d.alternatives];
            }
            md += `### ${d.id} — ${d.title}\n`;
            md += `- **Situação:** ${d.status.toUpperCase()} | **Criado em:** ${d.created_at} | **Resolvido em:** ${d.resolved_at || 'Pendente'}\n`;
            if (d.feature_id) md += `- **Funcionalidade:** ${d.feature_id}\n`;
            if (d.task_id) md += `- **Tarefa:** ${d.task_id}\n`;
            if (d.impact) md += `- **Impacto:** ${d.impact}\n`;
            if (d.description) md += `- **Descrição:** ${d.description}\n`;
            if (Array.isArray(alts) && alts.length > 0) {
                md += `- **Alternativas Avaliadas:**\n`;
                alts.forEach(a => md += `  - ${a}\n`);
            }
            if (d.human_response) {
                md += `- **Decisão e Resposta Humana:**\n  > ${d.human_response}\n`;
            }
            md += `\n---\n\n`;
        }

        return md;
    }

    generateValidacaoMd(project) {
        let md = `# Validação, Testes e Erros — ${project.title} (${project.id})\n\n`;
        md += `> Rastreabilidade de testes executados, evidências e tratamento de defeitos\n\n`;

        const features = this.db.db.prepare(
            'SELECT * FROM features WHERE project_id = ? ORDER BY id ASC'
        ).all(project.id);

        for (const f of features) {
            md += `## Funcionalidade: ${f.id} — ${f.title}\n\n`;

            const tests = this.db.db.prepare(
                'SELECT * FROM tests WHERE feature_id = ? ORDER BY id ASC'
            ).all(f.id);

            md += `### Testes Registrados\n`;
            if (tests.length === 0) {
                md += `*Nenhum teste registrado para esta funcionalidade.*\n\n`;
            } else {
                for (const t of tests) {
                    md += `- **${t.id}**: ${t.title} [Status: **${t.status}**]\n`;
                    if (t.command) md += `  - *Comando:* \`${t.command}\` | *Ambiente:* ${t.environment || 'N/A'}\n`;
                    if (t.status === 'not_run' && t.reason_not_run) {
                        md += `  - *Motivo de não execução:* ${t.reason_not_run}\n`;
                    }
                    let evs = [];
                    try {
                        const parsed = JSON.parse(t.evidence);
                        if (Array.isArray(parsed)) {
                            evs = parsed;
                        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
                            evs = [parsed];
                        } else if (parsed && typeof parsed === 'object') {
                            evs = Object.values(parsed).map(String);
                        }
                    } catch {
                        if (t.evidence && typeof t.evidence === 'string') {
                            evs = [t.evidence];
                        }
                    }
                    if (Array.isArray(evs) && evs.length > 0) {
                        md += `  - *Evidências:* ${evs.join(', ')}\n`;
                    }
                }
                md += `\n`;
            }

            const errors = this.db.db.prepare(
                'SELECT * FROM errors WHERE feature_id = ? ORDER BY id ASC'
            ).all(f.id);

            md += `### Erros e Defeitos Encontrados\n`;
            if (errors.length === 0) {
                md += `*Nenhum erro registrado.*\n\n`;
            } else {
                for (const e of errors) {
                    const statusErr = e.resolved ? 'RESOLVIDO' : 'ABERTO';
                    md += `- **${e.id} [${statusErr}]**: ${e.title} (Gravidade: ${e.severity})\n`;
                    md += `  - *Descrição:* ${e.description}\n`;
                    md += `  - *Passos para reprodução:* ${e.reproduction_steps}\n`;
                    md += `  - *Esperado:* ${e.expected_behavior} | *Obtido:* ${e.actual_behavior}\n`;
                    md += `  - *Tentativas de correção:* ${e.attempts_count}\n`;
                    if (e.regression_test_ref) md += `  - *Teste de Regressão:* ${e.regression_test_ref}\n`;
                }
                md += `\n`;
            }
        }

        return md;
    }
}
