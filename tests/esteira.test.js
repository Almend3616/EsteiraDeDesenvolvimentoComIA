import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

describe('Suíte de Validação da Ferramenta de Gestão da Esteira com IA', () => {
    const testDbPath = join(process.cwd(), 'tests', 'test_esteira.db');
    const testProjectPath = join(process.cwd(), 'tests', 'mock_project');
    let app;

    before(() => {
        if (existsSync(testDbPath)) rmSync(testDbPath);
        if (existsSync(testProjectPath)) rmSync(testProjectPath, { recursive: true });
        mkdirSync(testProjectPath, { recursive: true });
        app = createApp(testDbPath);
    });

    after(() => {
        app.watcherService.stop();
        app.db.close();
        if (existsSync(testDbPath)) rmSync(testDbPath);
        if (existsSync(testProjectPath)) rmSync(testProjectPath, { recursive: true });
    });

    test('1. Deve criar projeto e inicializar estrutura /gestao-ia com 4 Markdowns e IAs padrão', () => {
        const project = app.projectService.createProject({
            title: 'Sistema de Cobrança',
            description: 'Módulo financeiro automatizado com validações',
            root_path: testProjectPath
        });

        assert.strictEqual(project.id, 'PRJ-001');
        assert.strictEqual(project.revision, 1);

        // Verificar estrutura de pastas
        const gestaoDir = join(testProjectPath, 'gestao-ia');
        assert.ok(existsSync(join(gestaoDir, 'Projeto.md')));
        assert.ok(existsSync(join(gestaoDir, 'Tarefas.md')));
        assert.ok(existsSync(join(gestaoDir, 'Decisões.md')));
        assert.ok(existsSync(join(gestaoDir, 'Validação.md')));
        assert.ok(existsSync(join(gestaoDir, 'entrada')));
        assert.ok(existsSync(join(gestaoDir, 'processados')));
        assert.ok(existsSync(join(gestaoDir, 'rejeitados')));
        assert.ok(existsSync(join(gestaoDir, 'evidencias')));

        // Verificar IAs padrão criadas
        const ais = app.db.db.prepare('SELECT * FROM ai_participants WHERE project_id = ?').all(project.id);
        assert.strictEqual(ais.length, 3);
    });

    test('2. Deve permitir configurar até 5 IAs com nomes livres e papéis específicos', () => {
        const ai4 = app.projectService.addAiParticipant('PRJ-001', 'Gemini Flash Análise', ['Verificar']);
        const ai5 = app.projectService.addAiParticipant('PRJ-001', 'Llama Local Testes', ['Validar']);

        assert.strictEqual(ai4.id, 'IA-004');
        assert.strictEqual(ai5.id, 'IA-005');

        // Tentar adicionar a 6ª IA deve falhar respeitando o limite de 5 IAs
        assert.throws(() => {
            app.projectService.addAiParticipant('PRJ-001', 'IA Excedente', ['Definir']);
        }, /Limite máximo de 5 IAs/);
    });

    test('3. Rito Obrigatório: Definir -> Exigência de aprovação humana de requisito antes de Desenvolver', () => {
        const feat = app.projectService.addFeature('PRJ-001', 'Autenticação JWT', 'Login com tokens seguros');
        assert.strictEqual(feat.id, 'FUN-001');

        const req = app.projectService.addRequirement(feat.id, 'Token Expirável', 'Emitir JWT com TTL de 15 minutos', ['Validar assinatura'], false);
        const task = app.projectService.addTask(feat.id, 'Implementar Auth JWT', 'Criar controller e middleware', [], 'alta', 'Definir');

        // Iniciar etapa Definir com IA Arquiteta (IA-001)
        const execDef = app.stateMachineService.startExecution(task.id, 'IA-001', 'Definir', 'Levantamento de requisitos', []);
        assert.strictEqual(execDef.executionId, 'EXE-001');

        // Tentar iniciar Desenvolver antes de concluir a execução ativa deve ser BLOQUEADO
        assert.throws(() => {
            app.stateMachineService.startExecution(task.id, 'IA-002', 'Desenvolver', 'Codificação', []);
        }, /já possui uma execução ativa/);

        // Simulando entrega da definição
        const defPayload = {
            schema_version: '1.0',
            submission_id: 'sub-def-001',
            project_id: 'PRJ-001',
            feature_id: 'FUN-001',
            task_id: task.id,
            execution_id: execDef.executionId,
            stage: 'Definir',
            actor_id: 'IA-001',
            previous_delivery_ref: null,
            base_revision: 1,
            title: 'Definição da arquitetura de Auth',
            description: 'Especificação do modelo de tokens e endpoints',
            context_read: ['gestao-ia/Projeto.md'],
            code_version: { commit: null, manifest_ref: 'evidencias/manifesto.json', dirty: false },
            files: [],
            logic_changes: [],
            tests: [],
            errors: []
        };

        const resDeliv = app.ingestionService.processDeliveryFile(null, JSON.stringify(defPayload));
        assert.ok(resDeliv.success);

        // Aceite humano da etapa Definir
        app.ingestionService.acceptDelivery(resDeliv.deliveryId, 'Definição aprovada');

        // Agora a tarefa está com status 'etapa_aceita', mas o requisito AINDA NÃO FOI APROVADO por humano
        assert.throws(() => {
            app.stateMachineService.startExecution(task.id, 'IA-002', 'Desenvolver', 'Codificação', []);
        }, /aguarda aprovação humana antes de iniciar o desenvolvimento/);

        // Aprovação humana explícita do requisito
        app.projectService.approveRequirement(req.id);

        // Agora o início do Desenvolvimento é permitido
        const execDev = app.stateMachineService.startExecution(task.id, 'IA-002', 'Desenvolver', 'Codificar JWT', ['src/auth/jwt.js']);
        assert.strictEqual(execDev.executionId, 'EXE-002');
    });

    test('4. Bloqueio por Concorrência: Recursos reservados não podem colidir em execuções paralelas', () => {
        // Criar segunda funcionalidade e tarefa independente
        const feat2 = app.projectService.addFeature('PRJ-001', 'Módulo de Usuários', 'CRUD de perfis');
        const task2 = app.projectService.addTask(feat2.id, 'Perfil de Usuário', 'Editar dados do usuário', [], 'media', 'Desenvolver');

        // Tentar iniciar reservando o mesmo arquivo 'src/auth/jwt.js' já reservado por EXE-002 deve falhar
        assert.throws(() => {
            app.stateMachineService.startExecution(task2.id, 'IA-002', 'Desenvolver', 'Alterar perfil', ['src/auth/jwt.js']);
        }, /Conflito de recursos/);

        // Iniciar com recurso independente deve ser permitido
        const execIndep = app.stateMachineService.startExecution(task2.id, 'IA-002', 'Desenvolver', 'Alterar perfil', ['src/users/profile.js']);
        assert.strictEqual(execIndep.executionId, 'EXE-003');
    });

    test('5. Contrato de Entrega: Idempotência de hash idêntico e detecção de conflito', () => {
        const devPayload = {
            schema_version: '1.0',
            submission_id: 'sub-dev-001',
            project_id: 'PRJ-001',
            feature_id: 'FUN-001',
            task_id: 'TSK-001',
            execution_id: 'EXE-002',
            stage: 'Desenvolver',
            actor_id: 'IA-002',
            previous_delivery_ref: 'ENT-001',
            base_revision: 2,
            title: 'Código JWT implementado',
            description: 'Tokens assinados com chave secreta',
            context_read: ['gestao-ia/Projeto.md'],
            code_version: { commit: null, manifest_ref: 'evidencias/manifesto.json', dirty: true },
            files: [{ path: 'src/auth/jwt.js', operation: 'created', description: 'Geração e validação de tokens' }],
            logic_changes: ['Implementação de HMAC SHA-256'],
            tests: [{ test_id: 'TST-001', status: 'passed', command: 'npm test', environment: 'node24' }],
            errors: []
        };

        const raw = JSON.stringify(devPayload);

        // 1ª submissão: Sucesso
        const res1 = app.ingestionService.processDeliveryFile(null, raw);
        assert.ok(res1.success);
        assert.strictEqual(res1.deliveryId, 'ENT-002');

        // Reenvio idêntico com mesmo submission_id: Idempotente sem duplicar
        const res2 = app.ingestionService.processDeliveryFile(null, raw);
        assert.ok(res2.success);
        assert.ok(res2.idempotent);
        assert.strictEqual(res2.deliveryId, 'ENT-002');

        // Reenvio com MESMO submission_id mas payload divergente: Rejeição por conflito
        const conflictingPayload = { ...devPayload, title: 'Alteração conflituosa' };
        const resConflict = app.ingestionService.processDeliveryFile(null, JSON.stringify(conflictingPayload));
        assert.strictEqual(resConflict.success, false);
        assert.ok(resConflict.errors[0].includes('Conflito de submissão'));
    });

    test('6. Segurança: Bloqueio absoluto contra Path Traversal em files[].path', () => {
        const maliciousPayload = {
            schema_version: '1.0',
            submission_id: 'sub-hack-001',
            project_id: 'PRJ-001',
            feature_id: 'FUN-001',
            task_id: 'TSK-001',
            execution_id: 'EXE-002',
            stage: 'Desenvolver',
            actor_id: 'IA-002',
            previous_delivery_ref: 'ENT-001',
            base_revision: 2,
            title: 'Tentativa de Path Traversal',
            description: 'Teste de injeção',
            context_read: [],
            code_version: { commit: null, dirty: false },
            files: [{ path: '../../windows/system32/cmd.exe', operation: 'modified', description: 'Ataque' }],
            logic_changes: [],
            tests: []
        };

        const res = app.ingestionService.processDeliveryFile(null, JSON.stringify(maliciousPayload));
        assert.strictEqual(res.success, false);
        assert.ok(res.errors.some(e => e.includes('viola limites da raiz')));
    });

    test('7. Rito: Aceite de entrega libera recursos e atualiza revisão dos 4 Markdowns', () => {
        const resAccept = app.ingestionService.acceptDelivery('ENT-002', 'Código de autenticação aprovado');
        assert.ok(resAccept.success);
        assert.strictEqual(resAccept.nextStatus, 'etapa_aceita');
        assert.strictEqual(resAccept.newRevision, 3);

        // Verificar se os 4 arquivos foram atualizados no disco com a nova revisão
        const tarefasMd = readFileSync(join(testProjectPath, 'gestao-ia', 'Tarefas.md'), 'utf8');
        assert.ok(tarefasMd.includes('Revisão do Projeto: 3'));
        assert.ok(tarefasMd.includes('ENT-002'));
    });

    test('8. Rito: Correção Dispensada com justificativa avança diretamente para Validar', () => {
        // TSK-001 em etapa_aceita em Desenvolver -> Iniciar Verificar com IA-003
        const execVerif = app.stateMachineService.startExecution('TSK-001', 'IA-003', 'Verificar', 'Auditoria de segurança', []);
        
        // Simular entrega de Verificação sem erros
        const verifPayload = {
            schema_version: '1.0',
            submission_id: 'sub-verif-001',
            project_id: 'PRJ-001',
            feature_id: 'FUN-001',
            task_id: 'TSK-001',
            execution_id: execVerif.executionId,
            stage: 'Verificar',
            actor_id: 'IA-003',
            previous_delivery_ref: 'ENT-002',
            base_revision: 3,
            title: 'Verificação concluída sem vulnerabilidades',
            description: 'Código auditado e testes automatizados executados',
            context_read: ['gestao-ia/Projeto.md', 'gestao-ia/Tarefas.md'],
            code_version: { commit: null, dirty: false },
            files: [],
            logic_changes: [],
            tests: [{ test_id: 'TST-002', status: 'passed', command: 'npm test security', environment: 'node24' }],
            errors: []
        };
        const resVerifDeliv = app.ingestionService.processDeliveryFile(null, JSON.stringify(verifPayload));
        app.ingestionService.acceptDelivery(resVerifDeliv.deliveryId, 'Verificação auditada com sucesso');

        // Dispensa da etapa de Correção com justificativa válida
        const resDispense = app.stateMachineService.dispenseCorrection('TSK-001', 'Nenhum erro de segurança ou lógica encontrado na etapa de verificação.');
        assert.ok(resDispense.success);
        assert.strictEqual(resDispense.newStage, 'Validar');

        // Verificar registro de Decisão de dispensa
        const dec = app.db.db.prepare("SELECT * FROM decisions WHERE title = 'Correção Dispensada'").get();
        assert.ok(dec);
        assert.strictEqual(dec.status, 'aprovada');
    });

    test('9. Rito: Etapa Validar -> Teste Humano Obrigatório para Conclusão', () => {
        // Iniciar etapa Validar com IA-003
        const execVal = app.stateMachineService.startExecution('TSK-001', 'IA-003', 'Validar', 'Testes de regressão e critérios de aceite', []);
        
        const valPayload = {
            schema_version: '1.0',
            submission_id: 'sub-val-001',
            project_id: 'PRJ-001',
            feature_id: 'FUN-001',
            task_id: 'TSK-001',
            execution_id: execVal.executionId,
            stage: 'Validar',
            actor_id: 'IA-003',
            previous_delivery_ref: 'ENT-003',
            base_revision: 4,
            title: 'Validação técnica final',
            description: 'Todos os testes de regressão passaram',
            context_read: ['gestao-ia/Projeto.md'],
            code_version: { commit: null, dirty: false },
            files: [],
            logic_changes: [],
            tests: [{ test_id: 'TST-003', status: 'passed', command: 'npm test all', environment: 'node24' }],
            errors: []
        };

        const resValDeliv = app.ingestionService.processDeliveryFile(null, JSON.stringify(valPayload));
        const resValAccept = app.ingestionService.acceptDelivery(resValDeliv.deliveryId, 'Aceite técnico da validação');

        // Entrega técnica aceita encaminha a tarefa para 'aguardando_teste_humano'
        assert.strictEqual(resValAccept.nextStatus, 'aguardando_teste_humano');

        const taskBeforeHuman = app.db.db.prepare('SELECT status FROM tasks WHERE id = ?').get('TSK-001');
        assert.strictEqual(taskBeforeHuman.status, 'aguardando_teste_humano');

        // Aprovação humana explícita
        const resHuman = app.stateMachineService.submitHumanValidation('TSK-001', true, 'Aprovado em ambiente de homologação.');
        assert.ok(resHuman.success);
        assert.strictEqual(resHuman.status, 'concluida');

        const taskAfterHuman = app.db.db.prepare('SELECT status FROM tasks WHERE id = ?').get('TSK-001');
        assert.strictEqual(taskAfterHuman.status, 'concluida');
    });

    test('10. Regra de Limite de Tentativas: 3 reprovações de correção suspendem a funcionalidade', () => {
        // Criar funcionalidade FUN-003 para simular falhas consecutivas
        const feat3 = app.projectService.addFeature('PRJ-001', 'Upload de Imagens', 'Armazenamento de mídia');
        app.db.db.prepare("UPDATE features SET stage = 'Corrigir' WHERE id = ?").run(feat3.id);
        const task3 = app.projectService.addTask(feat3.id, 'Processar Upload', 'Redimensionar imagens', [], 'alta', 'Corrigir');
        task3.status = 'pronta_para_iniciar';
        app.db.db.prepare("UPDATE tasks SET status = 'pronta_para_iniciar' WHERE id = ?").run(task3.id);

        // 1ª Reprovação de correção
        const exec1 = app.stateMachineService.startExecution(task3.id, 'IA-002', 'Corrigir', 'Tentativa 1', []);
        const deliv1 = app.ingestionService.processDeliveryFile(null, JSON.stringify({
            schema_version: '1.0', submission_id: 'sub-err-1', project_id: 'PRJ-001', feature_id: feat3.id,
            task_id: task3.id, execution_id: exec1.executionId, stage: 'Corrigir', actor_id: 'IA-002',
            previous_delivery_ref: null, base_revision: 5, title: 'Fix 1', description: 'Tentativa 1',
            context_read: [], code_version: { dirty: false }, files: [], logic_changes: [], tests: []
        }));
        const rej1 = app.ingestionService.rejectDelivery(deliv1.deliveryId, 'Falha no teste de redimensionamento');
        assert.strictEqual(rej1.failedCorrectionsCount, 1);
        assert.strictEqual(rej1.suspended, false);

        // 2ª Reprovação de correção
        const exec2 = app.stateMachineService.startExecution(task3.id, 'IA-002', 'Corrigir', 'Tentativa 2', []);
        const deliv2 = app.ingestionService.processDeliveryFile(null, JSON.stringify({
            schema_version: '1.0', submission_id: 'sub-err-2', project_id: 'PRJ-001', feature_id: feat3.id,
            task_id: task3.id, execution_id: exec2.executionId, stage: 'Corrigir', actor_id: 'IA-002',
            previous_delivery_ref: deliv1.deliveryId, base_revision: 5, title: 'Fix 2', description: 'Tentativa 2',
            context_read: [], code_version: { dirty: false }, files: [], logic_changes: [], tests: []
        }));
        const rej2 = app.ingestionService.rejectDelivery(deliv2.deliveryId, 'Formato PNG corrompido');
        assert.strictEqual(rej2.failedCorrectionsCount, 2);
        assert.strictEqual(rej2.suspended, false);

        // 3ª Reprovação de correção -> Deve suspender a funcionalidade
        const exec3 = app.stateMachineService.startExecution(task3.id, 'IA-002', 'Corrigir', 'Tentativa 3', []);
        const deliv3 = app.ingestionService.processDeliveryFile(null, JSON.stringify({
            schema_version: '1.0', submission_id: 'sub-err-3', project_id: 'PRJ-001', feature_id: feat3.id,
            task_id: task3.id, execution_id: exec3.executionId, stage: 'Corrigir', actor_id: 'IA-002',
            previous_delivery_ref: deliv2.deliveryId, base_revision: 5, title: 'Fix 3', description: 'Tentativa 3',
            context_read: [], code_version: { dirty: false }, files: [], logic_changes: [], tests: []
        }));
        const rej3 = app.ingestionService.rejectDelivery(deliv3.deliveryId, 'Crash por estouro de memória');
        assert.strictEqual(rej3.failedCorrectionsCount, 3);
        assert.strictEqual(rej3.suspended, true);
        assert.strictEqual(rej3.status, 'bloqueada');

        // Tentar iniciar nova execução na funcionalidade suspensa DEVE SER BLOQUEADO
        assert.throws(() => {
            app.stateMachineService.startExecution(task3.id, 'IA-002', 'Corrigir', 'Tentativa 4 não autorizada', []);
        }, /suspensa devido a 3 rodadas de correção reprovadas/);

        // Decisão humana cadastrada para deliberação
        const pendingDec = app.db.db.prepare("SELECT * FROM decisions WHERE feature_id = ? AND status = 'pendente'").get(feat3.id);
        assert.ok(pendingDec);

        // Humano resolve a decisão com nova estratégia e libera o ciclo
        app.stateMachineService.resolveDecision(pendingDec.id, 'Mudança da biblioteca de processamento gráfico para Sharp', 'aprovada');

        // Agora o contador foi resetado e a execução pode ser retomada
        const exec4 = app.stateMachineService.startExecution(task3.id, 'IA-002', 'Corrigir', 'Nova abordagem com Sharp', []);
        assert.ok(exec4.executionId);
    });

    test('11. Geração de Prompt oficial de retomada (Seção 10) e Prompt de Preparação Documental', () => {
        const promptData = app.promptService.generateTaskPrompt('EXE-001');
        assert.strictEqual(promptData.taskId, 'TSK-001');
        assert.ok(promptData.promptText.includes('Trabalhe no projeto Sistema de Cobrança'));
        assert.ok(promptData.promptText.includes('Sua execução autorizada é EXE-001'));
        assert.ok(promptData.promptText.includes('leia Projeto.md, Tarefas.md, Decisões.md e Validação.md'));
        assert.ok(promptData.promptText.includes('Não invente informações nem declare leitura ou teste que não realizou.'));
        assert.ok(promptData.promptText.includes('AVISO CRÍTICO DE EXECUÇÃO: REGRA DE CONCLUSÃO DA ESTEIRA'));
        assert.ok(promptData.promptText.includes('O ÚNICO GATILHO que faz o sistema reconhecer o seu trabalho'));

        // Testar prompt de preparação da estrutura /gestao-ia do zero
        const prepDocs = app.promptService.generatePrepDocsPrompt('PRJ-001');
        assert.ok(prepDocs.promptText.includes('CRIAÇÃO DA ESTRUTURA DOCUMENTAL /gestao-ia DO ZERO'));
        assert.ok(prepDocs.promptText.includes('Projeto.md'));
        assert.ok(prepDocs.promptText.includes('Tarefas.md'));
        assert.ok(prepDocs.promptText.includes('Decisões.md'));
        assert.ok(prepDocs.promptText.includes('Validação.md'));
    });

    test('12. Backup e Restauração local preservam todo o histórico e entidades', () => {
        const backup = app.backupService.exportFullBackup();
        assert.strictEqual(backup.version, '1.0');
        assert.ok(backup.tables.projects.length >= 1);
        assert.ok(backup.tables.deliveries.length >= 1);

        // Restaurar backup
        const restoreRes = app.backupService.restoreFullBackup(backup);
        assert.ok(restoreRes.success);

        // Conferir persistência
        const projectsAfter = app.db.db.prepare('SELECT * FROM projects').all();
        assert.strictEqual(projectsAfter.length, backup.tables.projects.length);
    });

    test('13. Deve permitir excluir tarefas e funcionalidades com sincronização documental e eventos', () => {
        // Criar funcionalidade e tarefa para exclusão
        const feat = app.projectService.addFeature('PRJ-001', 'Funcionalidade Teste Exclusão', 'Será excluída');
        const task1 = app.projectService.addTask(feat.id, 'Tarefa para Excluir 1', 'Desc 1');
        const task2 = app.projectService.addTask(feat.id, 'Tarefa para Excluir 2', 'Desc 2');

        // 1. Excluir uma tarefa isolada
        const delTaskRes = app.projectService.deleteTask(task1.id);
        assert.strictEqual(delTaskRes.success, true);
        const taskInDb = app.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task1.id);
        assert.strictEqual(taskInDb, undefined);

        // 2. Excluir a funcionalidade completa (deve remover task2 em cascata)
        const delFeatRes = app.projectService.deleteFeature(feat.id);
        assert.strictEqual(delFeatRes.success, true);
        const featInDb = app.db.db.prepare('SELECT * FROM features WHERE id = ?').get(feat.id);
        assert.strictEqual(featInDb, undefined);
        const task2InDb = app.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(task2.id);
        assert.strictEqual(task2InDb, undefined);

        // 3. Verificar eventos registrados
        const events = app.db.db.prepare("SELECT * FROM events WHERE project_id = ? AND type IN ('TAREFA_EXCLUIDA', 'FUNCIONALIDADE_EXCLUIDA')").all('PRJ-001');
        assert.ok(events.length >= 2);
    });
});

