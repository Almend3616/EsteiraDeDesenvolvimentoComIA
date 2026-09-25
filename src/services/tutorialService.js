import { existsSync, statSync, accessSync, constants, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';

export class TutorialService {
    constructor(db, docSyncService) {
        this.db = db;
        this.docSyncService = docSyncService;
    }

    /**
     * Valida uma pasta local para uso em um projeto
     */
    validateProjectFolder(folderPath) {
        if (!folderPath || typeof folderPath !== 'string' || !folderPath.trim()) {
            return {
                valid: false,
                reason: 'O caminho da pasta deve ser informado.'
            };
        }

        const absolutePath = resolve(normalize(folderPath.trim()));

        // 1. Checar se existe
        if (!existsSync(absolutePath)) {
            return {
                valid: false,
                absolutePath,
                reason: `O caminho informado não existe no sistema local: ${absolutePath}`
            };
        }

        // 2. Checar se é diretório
        try {
            const stats = statSync(absolutePath);
            if (!stats.isDirectory()) {
                return {
                    valid: false,
                    absolutePath,
                    reason: `O caminho informado não é uma pasta válida: ${absolutePath}`
                };
            }
        } catch (err) {
            return {
                valid: false,
                absolutePath,
                reason: `Erro ao inspecionar caminho: ${err.message}`
            };
        }

        // 3. Checar permissões de leitura e escrita
        try {
            accessSync(absolutePath, constants.R_OK | constants.W_OK);
            // Teste real de criação e remoção de arquivo temporário
            const testFile = join(absolutePath, `.perm_check_${Date.now()}.tmp`);
            writeFileSync(testFile, 'test', 'utf8');
            unlinkSync(testFile);
        } catch (err) {
            return {
                valid: false,
                absolutePath,
                reason: `Permissão negada: o processo não possui acesso de leitura/escrita na pasta: ${err.message}`
            };
        }

        // 4. Checar se já possui estrutura /gestao-ia existente
        const gestaoDir = join(absolutePath, 'gestao-ia');
        const hasExistingGestao = existsSync(gestaoDir) && existsSync(join(gestaoDir, 'Projeto.md'));

        // 5. Checar se já é raiz de algum projeto cadastrado no banco
        const existingProject = this.db.db.prepare(
            'SELECT id, title FROM projects WHERE root_path = ?'
        ).get(absolutePath);

        return {
            valid: true,
            absolutePath,
            hasExistingGestao,
            alreadyRegistered: Boolean(existingProject),
            existingProjectId: existingProject ? existingProject.id : null,
            existingProjectTitle: existingProject ? existingProject.title : null
        };
    }

    /**
     * Recupera ou inicializa o estado do tutorial de um projeto
     */
    getOrCreateTutorialState(projectId) {
        let state = this.db.db.prepare(
            'SELECT * FROM tutorial_state WHERE project_id = ?'
        ).get(projectId);

        const now = new Date().toISOString();

        if (!state) {
            this.db.db.prepare(`
                INSERT INTO tutorial_state (
                    project_id, enabled, current_step, completed_steps,
                    communication_mode, connection_token, connection_verified,
                    shown_tips, updated_at
                ) VALUES (?, 1, 1, '[]', 'local', null, 0, '[]', ?)
            `).run(projectId, now);

            state = this.db.db.prepare(
                'SELECT * FROM tutorial_state WHERE project_id = ?'
            ).get(projectId);
        }

        return this.evaluateDynamicProgress(projectId, state);
    }

    /**
     * Avalia o progresso real e evidências no projeto para atualizar passos concluídos
     */
    evaluateDynamicProgress(projectId, state) {
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) return state;

        let completed = [];
        try { completed = JSON.parse(state.completed_steps); } catch { completed = []; }
        const completedSet = new Set(completed);

        // Passo 1: Pasta validada e projeto cadastrado
        if (existsSync(project.root_path)) {
            completedSet.add(1);
        }

        // Passo 2: Conexão da IA (ou verificado local ou modo manual escolhido)
        if (state.connection_verified === 1 || state.communication_mode === 'manual') {
            completedSet.add(2);
        }

        // Passo 3: Arquitetura de documentação (/gestao-ia e 4 markdowns)
        const gestaoDir = join(project.root_path, 'gestao-ia');
        const docsExist = existsSync(join(gestaoDir, 'Projeto.md')) &&
                          existsSync(join(gestaoDir, 'Tarefas.md')) &&
                          existsSync(join(gestaoDir, 'Decisões.md')) &&
                          existsSync(join(gestaoDir, 'Validação.md'));
        if (docsExist) {
            completedSet.add(3);
        }

        // Passo 4: Cadastrar as IAs participantes (mínimo 1 IA com todas as 5 etapas cobertas)
        const ais = this.db.db.prepare('SELECT allowed_stages FROM ai_participants WHERE project_id = ?').all(projectId);
        if (ais.length >= 1) {
            const allCoveredStages = new Set();
            ais.forEach(ai => {
                try {
                    const stages = JSON.parse(ai.allowed_stages);
                    stages.forEach(s => allCoveredStages.add(s));
                } catch {}
            });
            const requiredStages = ['Definir', 'Desenvolver', 'Verificar', 'Corrigir', 'Validar'];
            const allCovered = requiredStages.every(s => allCoveredStages.has(s));
            if (allCovered) {
                completedSet.add(4);
            }
        }

        // Passo 5: Primeira funcionalidade e tarefa criadas
        const feature = this.db.db.prepare('SELECT id FROM features WHERE project_id = ? LIMIT 1').get(projectId);
        const task = feature ? this.db.db.prepare('SELECT id, stage FROM tasks WHERE feature_id = ? LIMIT 1').get(feature.id) : null;
        if (feature && task) {
            completedSet.add(5);
        }

        // Passo 6: Iniciar a tarefa e copiar o prompt (execução iniciada)
        const execution = task ? this.db.db.prepare('SELECT id FROM executions WHERE task_id = ? LIMIT 1').get(task.id) : null;
        if (execution) {
            completedSet.add(6);
        }

        // Passo 7: Receber a primeira entrega
        const delivery = task ? this.db.db.prepare('SELECT id, result FROM deliveries WHERE task_id = ? LIMIT 1').get(task.id) : null;
        if (delivery) {
            completedSet.add(7);
        }

        // Passo 8: Conferir e aceitar a entrega
        if (delivery && delivery.result === 'aceita') {
            completedSet.add(8);
        }

        // Passo 9: Conclusão do onboarding (se passo 8 foi aceito e o usuário avançou)
        if (completedSet.has(8) && state.current_step >= 9) {
            completedSet.add(9);
        }

        const newCompleted = Array.from(completedSet).sort((a, b) => a - b);
        const newCompletedJson = JSON.stringify(newCompleted);

        // Se houve atualização de passos concluídos, persiste
        if (newCompletedJson !== state.completed_steps) {
            const now = new Date().toISOString();
            this.db.db.prepare(`
                UPDATE tutorial_state 
                SET completed_steps = ?, updated_at = ?
                WHERE project_id = ?
            `).run(newCompletedJson, now, projectId);
            state.completed_steps = newCompletedJson;
        }

        return {
            ...state,
            completed_steps: newCompleted,
            shown_tips: JSON.parse(state.shown_tips || '[]')
        };
    }

    /**
     * Altera se o tutorial está ativado/desativado para o projeto
     */
    setTutorialEnabled(projectId, enabled) {
        const val = enabled ? 1 : 0;
        const now = new Date().toISOString();
        this.db.db.prepare(`
            UPDATE tutorial_state SET enabled = ?, updated_at = ? WHERE project_id = ?
        `).run(val, now, projectId);
        return { success: true, enabled: Boolean(val) };
    }

    /**
     * Define a etapa atual do tutorial
     */
    setCurrentStep(projectId, step) {
        const validStep = Math.min(Math.max(parseInt(step, 10) || 1, 1), 9);
        const now = new Date().toISOString();
        this.db.db.prepare(`
            UPDATE tutorial_state SET current_step = ?, updated_at = ? WHERE project_id = ?
        `).run(validStep, now, projectId);
        return { success: true, currentStep: validStep };
    }

    /**
     * Reinicia o tutorial no passo 1 sem apagar nem recriar dados
     */
    resetTutorial(projectId) {
        const now = new Date().toISOString();
        this.db.db.prepare(`
            UPDATE tutorial_state 
            SET current_step = 1, enabled = 1, updated_at = ?
            WHERE project_id = ?
        `).run(now, projectId);
        return this.getOrCreateTutorialState(projectId);
    }

    /**
     * Gera token temporário para teste de conexão da IA com a pasta local
     */
    generateConnectionToken(projectId) {
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);

        const token = `CONFIRM-IA-${randomBytes(6).toString('hex').toUpperCase()}`;
        const fileName = 'confirmacao_conexao.tmp';
        const confirmationPath = join(project.root_path, fileName);
        const now = new Date().toISOString();

        this.db.db.prepare(`
            UPDATE tutorial_state 
            SET connection_token = ?, connection_token_created_at = ?, connection_verified = 0, updated_at = ?
            WHERE project_id = ?
        `).run(token, now, now, projectId);

        const prompt = [
            `================================================================================`,
            `TESTE OBRIGATÓRIO DE CONEXÃO E GRAVAÇÃO LOCAL (ESTEIRA IA)`,
            `================================================================================`,
            ``,
            `Você está configurando o ambiente para este projeto.`,
            `Para comprovar que sua ferramenta possui permissão ativa de leitura e escrita no disco:`,
            ``,
            `1. O QUE FAZER:`,
            `   Criar um arquivo temporário contendo estritamente o token de autenticação gerado pelo sistema.`,
            ``,
            `2. ONDE SALVAR (CAMINHO ABSOLUTO NO DISCO):`,
            `   >>> ${confirmationPath}`,
            `   - Diretório: ${project.root_path} (diretamente na raiz do projeto)`,
            `   - Nome exato do arquivo: ${fileName}`,
            ``,
            `3. CONTEÚDO OBRIGATÓRIO DO ARQUIVO:`,
            `   O conteúdo do arquivo deve ser única e exclusivamente esta linha (sem aspas e sem formatação markdown dentro do arquivo):`,
            `${token}`,
            ``,
            `4. COMO FAZER:`,
            `   - Se você tem acesso a ferramentas de sistema de arquivos (WriteFile, Terminal/PowerShell/Bash): crie e salve o arquivo ${fileName} diretamente no caminho absoluto indicado.`,
            `   - Se você é uma IA em chat web sem acesso local ao disco: informe o operador para salvar o arquivo ${fileName} na raiz do projeto com exatamente o token acima.`,
            ``,
            `5. O QUE NÃO FAZER (PROIBIÇÕES MANDATÓRIAS):`,
            `   - NÃO crie nenhuma pasta ou subpasta. O arquivo deve ficar diretamente na raiz.`,
            `   - NÃO insira textos extras, comentários ou rótulos dentro do arquivo. Apenas o token.`,
            `   - NÃO altere, renomeie nem apague nenhum outro arquivo existente no projeto.`,
            `================================================================================`
        ].join('\n');

        return {
            token,
            fileName,
            confirmationPath,
            prompt,
            rootPath: project.root_path
        };
    }

    /**
     * Verifica se a IA gravou o arquivo temporário de teste de conexão com o token correto
     */
    verifyConnectionToken(projectId) {
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) throw new Error(`Projeto ${projectId} não encontrado.`);

        const state = this.db.db.prepare('SELECT * FROM tutorial_state WHERE project_id = ?').get(projectId);
        if (!state || !state.connection_token) {
            return {
                verified: false,
                reason: 'Nenhum token de confirmação foi emitido. Gere o prompt primeiro.'
            };
        }

        // Verifica na raiz do projeto (nome limpo e suporte ao legado)
        const primaryPath = join(project.root_path, 'confirmacao_conexao.tmp');
        const legacyPath = join(project.root_path, '.esteira_confirmacao.tmp');
        const foundPath = existsSync(primaryPath) ? primaryPath : (existsSync(legacyPath) ? legacyPath : null);

        if (!foundPath) {
            return {
                verified: false,
                confirmationPath: primaryPath,
                reason: `O arquivo temporário 'confirmacao_conexao.tmp' ainda não foi criado na raiz da pasta do projeto (${project.root_path}).`
            };
        }

        let content = '';
        try {
            content = readFileSync(foundPath, 'utf8').trim();
        } catch (err) {
            return {
                verified: false,
                confirmationPath: foundPath,
                reason: `Falha ao ler arquivo de confirmação: ${err.message}`
            };
        }

        if (!content.includes(state.connection_token)) {
            const tokenFoundMatch = content.match(/CONFIRM-IA-[A-F0-9]{12}/);
            const foundTokenStr = tokenFoundMatch ? tokenFoundMatch[0] : content.substring(0, 30);
            return {
                verified: false,
                confirmationPath: foundPath,
                reason: `O arquivo na raiz contém o código '${foundTokenStr}', mas o sistema aguarda '${state.connection_token}'. Copie o prompt atual da tela para a IA.`
            };
        }

        // Token confirmado com sucesso! Remover arquivo temporário de teste
        try {
            unlinkSync(foundPath);
        } catch {}

        const now = new Date().toISOString();
        let completed = [];
        try { completed = JSON.parse(state.completed_steps); } catch { completed = []; }
        if (!completed.includes(2)) completed.push(2);

        this.db.db.prepare(`
            UPDATE tutorial_state 
            SET connection_verified = 1, communication_mode = 'local', completed_steps = ?, updated_at = ?
            WHERE project_id = ?
        `).run(JSON.stringify(completed), now, projectId);

        return {
            verified: true,
            communicationMode: 'local',
            message: 'Acesso local da IA confirmado com sucesso! Arquivo temporário removido.'
        };
    }

    /**
     * Define o modo de comunicação (local ou manual)
     */
    setCommunicationMode(projectId, mode) {
        const validMode = (mode === 'manual' || mode === 'local') ? mode : 'local';
        const now = new Date().toISOString();

        const state = this.db.db.prepare('SELECT completed_steps FROM tutorial_state WHERE project_id = ?').get(projectId);
        let completed = [];
        try { completed = JSON.parse(state ? state.completed_steps : '[]'); } catch { completed = []; }
        if (!completed.includes(2)) completed.push(2);

        this.db.db.prepare(`
            UPDATE tutorial_state 
            SET communication_mode = ?, completed_steps = ?, updated_at = ?
            WHERE project_id = ?
        `).run(validMode, JSON.stringify(completed), now, projectId);

        return { success: true, communicationMode: validMode };
    }

    /**
     * Detecta ocorrências reais no projeto para exibição de dicas contextuais
     */
    getPendingTips(projectId) {
        const state = this.db.db.prepare('SELECT shown_tips, enabled FROM tutorial_state WHERE project_id = ?').get(projectId);
        if (!state || state.enabled === 0) return [];

        let shown = [];
        try { shown = JSON.parse(state.shown_tips || '[]'); } catch { shown = []; }

        const pending = [];

        // 1. Decisão Pendente
        if (!shown.includes('decisao_pendente')) {
            const dec = this.db.db.prepare("SELECT id, title FROM decisions WHERE project_id = ? AND status = 'pendente' LIMIT 1").get(projectId);
            if (dec) {
                pending.push({
                    id: 'decisao_pendente',
                    title: 'Decisão Humana Pendente',
                    message: `A decisão '${dec.title}' (${dec.id}) está aguardando sua deliberação. O rito não avança requisitos ou regras sem a resposta do usuário.`,
                    actionLabel: 'Ver Decisões',
                    elementHighlight: '#metricDecisao'
                });
            }
        }

        // 2. Teste Não Executado
        if (!shown.includes('teste_nao_executado')) {
            const unrunTest = this.db.db.prepare(`
                SELECT t.id, t.title FROM tests t
                JOIN features f ON t.feature_id = f.id
                WHERE f.project_id = ? AND t.status = 'not_run' LIMIT 1
            `).get(projectId);
            if (unrunTest) {
                pending.push({
                    id: 'teste_nao_executado',
                    title: 'Teste Não Executado Declarado',
                    message: `O teste '${unrunTest.title}' foi reportado como 'not_run'. Testes não executados exigem justificativa e não equivalem a aprovação técnica.`,
                    actionLabel: 'Ver Validação',
                    elementHighlight: '#btnReconcileDocs'
                });
            }
        }

        // 3. Reprovação de Entrega
        if (!shown.includes('reprovacao')) {
            const rejected = this.db.db.prepare(`
                SELECT d.id FROM deliveries d
                JOIN tasks t ON d.task_id = t.id
                JOIN features f ON t.feature_id = f.id
                WHERE f.project_id = ? AND d.result = 'rejeitada' LIMIT 1
            `).get(projectId);
            if (rejected) {
                pending.push({
                    id: 'reprovacao',
                    title: 'Entrega Reprovada na Esteira',
                    message: `A entrega foi rejeitada. Quando na etapa Corrigir, cada rodada reprovada incrementa o contador da funcionalidade.`,
                    actionLabel: 'Ver Tarefas',
                    elementHighlight: '.kanban-board'
                });
            }
        }

        // 4. Conflito de Arquivos / Concorrência
        if (!shown.includes('conflito_arquivos')) {
            const activeExecs = this.db.db.prepare(`
                SELECT e.id, e.reserved_resources FROM executions e
                JOIN tasks t ON e.task_id = t.id
                JOIN features f ON t.feature_id = f.id
                WHERE f.project_id = ? AND e.status = 'ativa'
            `).all(projectId);
            if (activeExecs.length > 1) {
                pending.push({
                    id: 'conflito_arquivos',
                    title: 'Operação Paralela com Recursos Reservados',
                    message: 'Tarefas independentes podem avançar simultaneamente, desde que não declarem reservas de arquivos em conflito.',
                    actionLabel: 'Entendido',
                    elementHighlight: '#projectContextBar'
                });
            }
        }

        // 5. Dependência Bloqueada
        if (!shown.includes('dependencia_bloqueada')) {
            const blockedTask = this.db.db.prepare(`
                SELECT t.id, t.title FROM tasks t
                JOIN features f ON t.feature_id = f.id
                WHERE f.project_id = ? AND t.status = 'bloqueada' LIMIT 1
            `).get(projectId);
            if (blockedTask) {
                pending.push({
                    id: 'dependencia_bloqueada',
                    title: 'Tarefa Bloqueada',
                    message: `A tarefa '${blockedTask.title}' (${blockedTask.id}) está bloqueada por dependências ou decisões pendentes.`,
                    actionLabel: 'Ver Tarefa',
                    elementHighlight: '#metricBloqueadas'
                });
            }
        }

        // 6. Limite de Tentativas (3 Reprovações)
        if (!shown.includes('limite_tentativas')) {
            const suspendedFeat = this.db.db.prepare(
                'SELECT id, title FROM features WHERE project_id = ? AND failed_corrections_count >= 3 LIMIT 1'
            ).get(projectId);
            if (suspendedFeat) {
                pending.push({
                    id: 'limite_tentativas',
                    title: 'Funcionalidade Suspensa por Limite de Tentativas',
                    message: `A funcionalidade '${suspendedFeat.title}' atingiu 3 rodadas de correção reprovadas. É necessária uma decisão humana para liberar um novo ciclo.`,
                    actionLabel: 'Deliberar Estratégia',
                    elementHighlight: '#metricDecisao'
                });
            }
        }

        // 7. Liberada para Teste Humano
        if (!shown.includes('teste_humano')) {
            const humanTask = this.db.db.prepare(`
                SELECT t.id, t.title FROM tasks t
                JOIN features f ON t.feature_id = f.id
                WHERE f.project_id = ? AND t.status = 'aguardando_teste_humano' LIMIT 1
            `).get(projectId);
            if (humanTask) {
                pending.push({
                    id: 'teste_humano',
                    title: 'Aguardando Aprovação Humana Final',
                    message: `A validação técnica da tarefa '${humanTask.title}' foi aceita. A conclusão formal da tarefa exige a sua aprovação explícita.`,
                    actionLabel: 'Realizar Teste Humano',
                    elementHighlight: '#metricHumano'
                });
            }
        }

        return pending;
    }

    /**
     * Marca dica contextual como exibida
     */
    markTipSeen(projectId, tipId) {
        const state = this.db.db.prepare('SELECT shown_tips FROM tutorial_state WHERE project_id = ?').get(projectId);
        if (!state) return { success: false };

        let shown = [];
        try { shown = JSON.parse(state.shown_tips || '[]'); } catch { shown = []; }

        if (!shown.includes(tipId)) {
            shown.push(tipId);
            const now = new Date().toISOString();
            this.db.db.prepare(`
                UPDATE tutorial_state SET shown_tips = ?, updated_at = ? WHERE project_id = ?
            `).run(JSON.stringify(shown), now, projectId);
        }

        return { success: true, tipId };
    }

    /**
     * Preferências globais do usuário
     */
    getUserPreference(key) {
        const row = this.db.db.prepare('SELECT value FROM user_preferences WHERE key = ?').get(key);
        return row ? row.value : null;
    }

    setUserPreference(key, value) {
        this.db.db.prepare(`
            INSERT INTO user_preferences (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        `).run(key, String(value));
        return { success: true, key, value };
    }
}
