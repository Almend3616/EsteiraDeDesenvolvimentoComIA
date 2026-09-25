import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

describe('Suíte de Testes do Tutorial Interativo de Primeira Utilização', () => {
    const testDbPath = join(process.cwd(), 'tests', 'test_tutorial.db');
    const testProjectPath = join(process.cwd(), 'tests', 'mock_tutorial_project');
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

    test('1. Validação de Pasta: Detecta pasta inexistente, permissões e pastas válidas', () => {
        // Pasta inexistente
        const nonExistent = join(testProjectPath, 'pasta_fantasma');
        const resInvalid = app.tutorialService.validateProjectFolder(nonExistent);
        assert.strictEqual(resInvalid.valid, false);
        assert.ok(resInvalid.reason.includes('não existe no sistema local'));

        // Pasta válida
        const resValid = app.tutorialService.validateProjectFolder(testProjectPath);
        assert.strictEqual(resValid.valid, true);
        assert.strictEqual(resValid.hasExistingGestao, false);
        assert.strictEqual(resValid.alreadyRegistered, false);
    });

    test('2. Etapa 1: Criar projeto e inicializar estado do tutorial com progresso real', () => {
        const project = app.projectService.createProject({
            title: 'Projeto Tutorial E2E',
            description: 'Demonstração de integração do tutorial interativo',
            root_path: testProjectPath
        });

        // Validar que agora a pasta tem gestao-ia existente
        const valAfterCreate = app.tutorialService.validateProjectFolder(testProjectPath);
        assert.strictEqual(valAfterCreate.valid, true);
        assert.strictEqual(valAfterCreate.hasExistingGestao, true);
        assert.strictEqual(valAfterCreate.alreadyRegistered, true);

        // Obter estado inicial do tutorial
        const tutState = app.tutorialService.getOrCreateTutorialState(project.id);
        assert.strictEqual(tutState.project_id, project.id);
        assert.strictEqual(tutState.enabled, 1);
        assert.strictEqual(tutState.current_step, 1);

        // Como o projeto e pasta existem e os markdowns foram gerados, os passos 1 e 3 já foram reconhecidos
        assert.ok(tutState.completed_steps.includes(1));
        assert.ok(tutState.completed_steps.includes(3));
    });

    test('3. Etapa 2: Conectar ferramenta de IA via Token Temporário e confirmar remoção segura', () => {
        // Gerar token de conexão
        const connData = app.tutorialService.generateConnectionToken('PRJ-001');
        assert.ok(connData.token.startsWith('CONFIRM-IA-'));
        assert.ok(connData.prompt.includes(connData.token));
        assert.ok(connData.confirmationPath.includes('confirmacao_conexao.tmp'));

        // Tentar verificar antes da IA criar o arquivo
        const checkBefore = app.tutorialService.verifyConnectionToken('PRJ-001');
        assert.strictEqual(checkBefore.verified, false);
        assert.ok(checkBefore.reason.includes('ainda não foi criado'));

        // Simular a IA gravando o arquivo temporário na pasta correta
        writeFileSync(connData.confirmationPath, `Confirmação de acesso: ${connData.token}`, 'utf8');

        // Verificar novamente: Deve validar e remover automaticamente o arquivo temporário
        const checkAfter = app.tutorialService.verifyConnectionToken('PRJ-001');
        assert.strictEqual(checkAfter.verified, true);
        assert.strictEqual(checkAfter.communicationMode, 'local');

        // Confirmar que o arquivo temporário foi removido do disco
        assert.strictEqual(existsSync(connData.confirmationPath), false);

        // Estado do tutorial agora inclui o passo 2
        const state = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.ok(state.completed_steps.includes(2));
    });

    test('4. Etapa 2 (Alternativa): Modo manual via navegador', () => {
        const resMode = app.tutorialService.setCommunicationMode('PRJ-001', 'manual');
        assert.strictEqual(resMode.success, true);
        assert.strictEqual(resMode.communicationMode, 'manual');

        const state = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.strictEqual(state.communication_mode, 'manual');
        assert.ok(state.completed_steps.includes(2));
    });

    test('5. Etapas 4, 5, 6, 7, 8: O progresso reflete rigorosamente as ações e evidências reais', () => {
        // Passo 4: Verificar se as etapas do rito estão cobertas
        const stateInitial = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.ok(stateInitial.completed_steps.includes(4)); // As IAs padrão do PRJ cobrem Definir, Desenvolver, Corrigir, Verificar, Validar

        // Passo 5: Criar funcionalidade e tarefa
        const feat = app.projectService.addFeature('PRJ-001', 'Tutorial Login', 'Primeira funcionalidade do tutorial');
        const req = app.projectService.addRequirement(feat.id, 'Formulário Simples', 'Campos email e senha', ['Validar email'], true);
        const task = app.projectService.addTask(feat.id, 'Desenho da Tela', 'Especificar componentes', [], 'alta', 'Definir');

        const stateAfterTask = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.ok(stateAfterTask.completed_steps.includes(5));
        assert.strictEqual(stateAfterTask.completed_steps.includes(6), false);

        // Passo 6: Iniciar execução da tarefa
        const exec = app.stateMachineService.startExecution(task.id, 'IA-001', 'Definir', 'Levantamento de requisitos', []);
        const stateAfterExec = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.ok(stateAfterExec.completed_steps.includes(6));
        assert.strictEqual(stateAfterExec.completed_steps.includes(7), false);

        // Passo 7: Receber entrega válida
        const payload = {
            schema_version: '1.0',
            submission_id: 'sub-tut-001',
            project_id: 'PRJ-001',
            feature_id: feat.id,
            task_id: task.id,
            execution_id: exec.executionId,
            stage: 'Definir',
            actor_id: 'IA-001',
            previous_delivery_ref: null,
            base_revision: 1,
            title: 'Entrega inicial do tutorial',
            description: 'Especificação completa dos requisitos',
            context_read: ['gestao-ia/Projeto.md'],
            code_version: { dirty: false },
            files: [],
            logic_changes: [],
            tests: []
        };
        const resDeliv = app.ingestionService.processDeliveryFile(null, JSON.stringify(payload));
        assert.ok(resDeliv.success);

        const stateAfterDeliv = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.ok(stateAfterDeliv.completed_steps.includes(7));
        assert.strictEqual(stateAfterDeliv.completed_steps.includes(8), false);

        // Passo 8: Conferir e aceitar entrega
        const resAccept = app.ingestionService.acceptDelivery(resDeliv.deliveryId, 'Aceite do tutorial');
        assert.ok(resAccept.success);

        const stateAfterAccept = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.ok(stateAfterAccept.completed_steps.includes(8));
    });

    test('6. Pausa, Desativação e Reinício: Preservam integridade sem apagar dados', () => {
        // Desativar tutorial
        app.tutorialService.setTutorialEnabled('PRJ-001', false);
        let state = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.strictEqual(state.enabled, 0);

        // Reativar tutorial
        app.tutorialService.setTutorialEnabled('PRJ-001', true);
        state = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.strictEqual(state.enabled, 1);

        // Mudar etapa
        app.tutorialService.setCurrentStep('PRJ-001', 9);
        state = app.tutorialService.getOrCreateTutorialState('PRJ-001');
        assert.strictEqual(state.current_step, 9);
        assert.ok(state.completed_steps.includes(9));

        // Reiniciar tutorial desde o início
        const resetState = app.tutorialService.resetTutorial('PRJ-001');
        assert.strictEqual(resetState.current_step, 1);
        assert.strictEqual(resetState.enabled, 1);

        // Os dados do projeto continuam intactos no banco
        const tasks = app.db.db.prepare('SELECT * FROM tasks WHERE feature_id = ?').all('FUN-001');
        assert.strictEqual(tasks.length, 1);
        const deliveries = app.db.db.prepare('SELECT * FROM deliveries WHERE task_id = ?').all(tasks[0].id);
        assert.strictEqual(deliveries.length, 1);
    });

    test('7. Dicas Contextuais: Detecta ocorrências reais e registra visualização', () => {
        // Cadastrar uma decisão pendente
        const decId = app.db.getNextId('DEC');
        app.db.db.prepare(`
            INSERT INTO decisions (id, project_id, title, description, alternatives, impact, status, created_at)
            VALUES (?, 'PRJ-001', 'Decisão de Arquitetura', 'Escolha do banco', '[]', 'Geral', 'pendente', ?)
        `).run(decId, new Date().toISOString());

        // Buscar dicas pendentes
        const tips = app.tutorialService.getPendingTips('PRJ-001');
        assert.ok(tips.some(t => t.id === 'decisao_pendente'));

        // Marcar dica como visualizada
        app.tutorialService.markTipSeen('PRJ-001', 'decisao_pendente');

        // Buscar dicas pendentes novamente: Não deve repetir 'decisao_pendente'
        const tipsAfter = app.tutorialService.getPendingTips('PRJ-001');
        assert.strictEqual(tipsAfter.some(t => t.id === 'decisao_pendente'), false);
    });
});
