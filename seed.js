import { createApp } from './src/server.js';
import { resolve, join } from 'node:path';

const app = createApp();

console.log('[SEED] Populando projeto de demonstração da Esteira com IA...');

const mockProjectRoot = resolve(join(process.cwd(), 'projeto_exemplo'));

// 1. Criar Projeto
const project = app.projectService.createProject({
    title: 'Portal de Gestão com IA (Exemplo)',
    description: 'Sistema corporativo de autenticação, faturamento e relatórios automatizados.',
    root_path: mockProjectRoot
});
console.log(`[SEED] Projeto criado: ${project.id} em ${project.root_path}`);

// 2. Funcionalidade 1: Autenticação Segura
const feat1 = app.projectService.addFeature(project.id, 'Autenticação e Permissões', 'Módulo de login JWT e RBAC');
const req1 = app.projectService.addRequirement(feat1.id, 'Emissão de JWT com TTL', 'Tokens assinados com expiração de 15m', ['Validar assinatura HMAC', 'Bloquear tokens expirados'], true);
const req2 = app.projectService.addRequirement(feat1.id, 'Controle por Papéis (RBAC)', 'Papéis: Admin, Gerente, Operador', ['Middleware de verificação', 'Auditoria de acesso negado'], false);

// Tarefas de FUN-001
const tsk1 = app.projectService.addTask(feat1.id, 'Arquitetura de Sessão JWT', 'Modelar endpoints de login e refresh token', [], 'alta', 'Desenvolver');
const tsk2 = app.projectService.addTask(feat1.id, 'Middleware RBAC', 'Proteger rotas administrativas', ['TSK-001'], 'media', 'Definir');

// Aprovação humana do requisito antes do desenvolvimento
app.projectService.approveRequirement(req2.id);

// Iniciar e simular avanço da TSK-001
const exec1 = app.stateMachineService.startExecution(tsk1.id, 'IA-002', 'Desenvolver', 'Codificar middleware JWT', ['src/auth/jwt.js']);

// 3. Funcionalidade 2: Faturamento Automático
const feat2 = app.projectService.addFeature(project.id, 'Módulo de Cobrança PIX', 'Integração e webhook de pagamentos instantâneos');
const req3 = app.projectService.addRequirement(feat2.id, 'Geração de QR Code Estático e Dinâmico', 'Emitir payload padrão BACEN', ['Validar CRC16'], true);
const tsk3 = app.projectService.addTask(feat2.id, 'Gerador de Copia e Cola PIX', 'Implementar parser do padrão EMV', [], 'critica', 'Verificar');
tsk3.status = 'entrega_recebida';
tsk3.last_delivery_ref = 'ENT-001';
app.db.db.prepare("UPDATE tasks SET status = 'entrega_recebida', last_delivery_ref = 'ENT-001' WHERE id = ?").run(tsk3.id);

// 4. Cadastrar uma Decisão Pendente para avaliação humana
const decId = app.db.getNextId('DEC');
app.db.db.prepare(`
    INSERT INTO decisions (id, project_id, feature_id, task_id, title, description, alternatives, impact, status, created_at)
    VALUES (?, ?, ?, ?, 'Política de Suspensão por 3 Correções Reprovadas', ?, ?, 'Impacto direto no fluxo de trabalho e ritmo da esteira', 'pendente', ?)
`).run(
    decId, project.id, feat1.id, tsk1.id,
    'Confirmar a interpretação da regra de suspensão: 3 rodadas de correção reprovadas da funcionalidade (proposta recomendada) vs 3 bugs individuais encontrados em testes.',
    JSON.stringify(['Interpretação A (Recomendada): 3 rodadas de entrega de correção reprovadas', 'Interpretação B: 3 defeitos encontrados na verificação']),
    new Date().toISOString()
);

// Atualizar e exportar markdowns
app.docSyncService.exportProjectDocuments(project, true);

console.log('[SEED] Concluído com sucesso! Os 4 Markdowns foram gerados em:', join(mockProjectRoot, 'gestao-ia'));
app.watcherService.stop();
app.db.close();
