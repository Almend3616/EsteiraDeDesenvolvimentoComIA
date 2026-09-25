import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Database } from './db/database.js';
import { DocumentSyncService } from './services/documentSyncService.js';
import { StateMachineService } from './services/stateMachineService.js';
import { IngestionService } from './services/ingestionService.js';
import { PromptGeneratorService } from './services/promptGeneratorService.js';
import { WatcherService } from './services/watcherService.js';
import { ProjectService } from './services/projectService.js';
import { BackupService } from './services/backupService.js';
import { TutorialService } from './services/tutorialService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp(dbPath) {
    const db = new Database(dbPath);
    const docSyncService = new DocumentSyncService(db);
    const stateMachineService = new StateMachineService(db);
    const ingestionService = new IngestionService(db, docSyncService);
    const promptService = new PromptGeneratorService(db);
    const watcherService = new WatcherService(db, ingestionService);
    const projectService = new ProjectService(db, docSyncService);
    const backupService = new BackupService(db);
    const tutorialService = new TutorialService(db, docSyncService);

    return {
        db,
        docSyncService,
        stateMachineService,
        ingestionService,
        promptService,
        watcherService,
        projectService,
        backupService,
        tutorialService
    };
}

export function startServer(port = 3000, host = '127.0.0.1', dbPath = null) {
    const app = createApp(dbPath);
    app.watcherService.start(3000);

    const publicDir = join(__dirname, '..', 'public');

    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.png': 'image/png'
    };

    const server = createServer(async (req, res) => {
        // Proteção CSRF / Origem: apenas localhost
        const hostHeader = req.headers['host'] || '';
        const originHeader = req.headers['origin'] || '';
        if (originHeader && !originHeader.includes('localhost') && !originHeader.includes('127.0.0.1')) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Acesso externo proibido por política de segurança local.' }));
            return;
        }

        const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const pathname = urlObj.pathname;
        const method = req.method;

        // Helper para ler JSON do body
        const readJsonBody = () => new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                if (!body.trim()) return resolve({});
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(new Error('JSON inválido na requisição.'));
                }
            });
            req.on('error', reject);
        });

        // Helper para responder JSON
        const sendJson = (statusCode, data) => {
            res.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            res.end(JSON.stringify(data));
        };

        try {
            // === ROTAS DA API ===

            // Listar e Criar Projetos
            if (pathname === '/api/projects' && method === 'GET') {
                return sendJson(200, app.projectService.listProjects());
            }
            if (pathname === '/api/projects' && method === 'POST') {
                const body = await readJsonBody();
                const project = app.projectService.createProject(body);
                return sendJson(201, project);
            }

            // Detalhes do Projeto
            const projMatch = pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)$/);
            if (projMatch && method === 'GET') {
                const details = app.projectService.getProjectDetails(projMatch[1]);
                if (!details) return sendJson(404, { error: 'Projeto não encontrado.' });
                return sendJson(200, details);
            }

            if (projMatch && method === 'PATCH') {
                const body = await readJsonBody();
                const project = app.projectService.renameProject(projMatch[1], body.title);
                if (!project) return sendJson(404, { error: 'Projeto não encontrado.' });
                return sendJson(200, project);
            }

            // Conciliação / Regeneração forçada de Documentos
            const reconcileMatch = pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/reconcile$/);
            if (reconcileMatch && method === 'POST') {
                const project = app.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(reconcileMatch[1]);
                if (!project) return sendJson(404, { error: 'Projeto não encontrado.' });
                const result = app.docSyncService.exportProjectDocuments(project, true);
                return sendJson(200, result);
            }

            // Adicionar IA participante
            const aiMatch = pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/ais$/);
            if (aiMatch && method === 'POST') {
                const body = await readJsonBody();
                const ai = app.projectService.addAiParticipant(aiMatch[1], body.name, body.allowed_stages);
                return sendJson(201, ai);
            }

            // Atualizar Nome ou Etapas Permitidas da IA participante
            const updateAiMatch = pathname.match(/^\/api\/ais\/([A-Za-z0-9_-]+)$/);
            if (updateAiMatch && (method === 'PATCH' || method === 'PUT')) {
                const body = await readJsonBody();
                const updatedAi = app.projectService.updateAiParticipant(updateAiMatch[1], body.allowed_stages, body.name);
                return sendJson(200, updatedAi);
            }

            // Excluir IA participante
            if (updateAiMatch && method === 'DELETE') {
                const resDel = app.projectService.deleteAiParticipant(updateAiMatch[1]);
                return sendJson(200, resDel);
            }

            // Adicionar Funcionalidade
            const featMatch = pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/features$/);
            if (featMatch && method === 'POST') {
                const body = await readJsonBody();
                const feat = app.projectService.addFeature(featMatch[1], body.title, body.description, true);
                return sendJson(201, feat);
            }

            // Adicionar Requisito
            const reqMatch = pathname.match(/^\/api\/features\/([A-Za-z0-9_-]+)\/requirements$/);
            if (reqMatch && method === 'POST') {
                const body = await readJsonBody();
                const reqItem = app.projectService.addRequirement(reqMatch[1], body.title, body.description, body.acceptance_criteria, body.human_approved);
                return sendJson(201, reqItem);
            }

            // Aprovar Requisito
            const appReqMatch = pathname.match(/^\/api\/requirements\/([A-Za-z0-9_-]+)\/approve$/);
            if (appReqMatch && method === 'POST') {
                const resApp = app.projectService.approveRequirement(appReqMatch[1]);
                return sendJson(200, resApp);
            }

            // Adicionar Tarefa
            const taskMatch = pathname.match(/^\/api\/features\/([A-Za-z0-9_-]+)\/tasks$/);
            if (taskMatch && method === 'POST') {
                const body = await readJsonBody();
                const task = app.projectService.addTask(taskMatch[1], body.title, body.description, body.dependencies, body.priority, body.stage);
                return sendJson(201, task);
            }

            // Excluir Tarefa
            const delTaskMatch = pathname.match(/^\/api\/tasks\/([A-Za-z0-9_-]+)$/);
            if (delTaskMatch && method === 'DELETE') {
                const resDel = app.projectService.deleteTask(delTaskMatch[1]);
                return sendJson(200, resDel);
            }

            // Excluir Funcionalidade
            const delFeatMatch = pathname.match(/^\/api\/features\/([A-Za-z0-9_-]+)$/);
            if (delFeatMatch && method === 'DELETE') {
                const resDel = app.projectService.deleteFeature(delFeatMatch[1]);
                return sendJson(200, resDel);
            }

            // Iniciar Execução de Etapa
            const startExecMatch = pathname.match(/^\/api\/tasks\/([A-Za-z0-9_-]+)\/start$/);
            if (startExecMatch && method === 'POST') {
                const body = await readJsonBody();
                const exec = app.stateMachineService.startExecution(
                    startExecMatch[1],
                    body.actor_id,
                    body.stage,
                    body.scope || 'Execução autorizada de escopo',
                    body.reserved_resources || []
                );
                return sendJson(201, exec);
            }

            // Obter Prompt de Retomada Formatado
            const promptMatch = pathname.match(/^\/api\/executions\/([A-Za-z0-9_-]+)\/prompt$/);
            if (promptMatch && method === 'GET') {
                const promptData = app.promptService.generateTaskPrompt(promptMatch[1]);
                return sendJson(200, promptData);
            }

            // Obter Prompt Determinístico de Preparação Documental (/gestao-ia)
            const prepDocsPromptMatch = pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)\/prep-docs-prompt$/);
            if (prepDocsPromptMatch && method === 'GET') {
                const prepDocsData = app.promptService.generatePrepDocsPrompt(prepDocsPromptMatch[1]);
                return sendJson(200, prepDocsData);
            }

            // Importar Entrega Manualmente (JSON via POST)
            if (pathname === '/api/deliveries/import' && method === 'POST') {
                const body = await readJsonBody();
                const rawString = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
                const result = app.ingestionService.processDeliveryFile(null, rawString);
                return sendJson(result.success ? 200 : 400, result);
            }

            // Aceitar Entrega
            const acceptDelivMatch = pathname.match(/^\/api\/deliveries\/([A-Za-z0-9_-]+)\/accept$/);
            if (acceptDelivMatch && method === 'POST') {
                const body = await readJsonBody();
                const resAccept = app.ingestionService.acceptDelivery(acceptDelivMatch[1], body.review_notes || '');
                return sendJson(200, resAccept);
            }

            // Rejeitar Entrega
            const rejectDelivMatch = pathname.match(/^\/api\/deliveries\/([A-Za-z0-9_-]+)\/reject$/);
            if (rejectDelivMatch && method === 'POST') {
                const body = await readJsonBody();
                const resReject = app.ingestionService.rejectDelivery(rejectDelivMatch[1], body.reason || '');
                return sendJson(200, resReject);
            }

            // Dispensar Correção
            const dispenseMatch = pathname.match(/^\/api\/tasks\/([A-Za-z0-9_-]+)\/dispense-correction$/);
            if (dispenseMatch && method === 'POST') {
                const body = await readJsonBody();
                const resDispense = app.stateMachineService.dispenseCorrection(dispenseMatch[1], body.justification);
                return sendJson(200, resDispense);
            }

            // Validação Humana Final
            const valMatch = pathname.match(/^\/api\/tasks\/([A-Za-z0-9_-]+)\/human-validation$/);
            if (valMatch && method === 'POST') {
                const body = await readJsonBody();
                const resVal = app.stateMachineService.submitHumanValidation(
                    valMatch[1],
                    Boolean(body.approved),
                    body.feedback || '',
                    'USUARIO',
                    Boolean(body.is_requirement_change)
                );
                return sendJson(200, resVal);
            }

            // Resolver Decisão
            const decMatch = pathname.match(/^\/api\/decisions\/([A-Za-z0-9_-]+)\/resolve$/);
            if (decMatch && method === 'POST') {
                const body = await readJsonBody();
                const resDec = app.stateMachineService.resolveDecision(
                    decMatch[1],
                    body.response,
                    body.status || 'aprovada'
                );
                return sendJson(200, resDec);
            }

            // Backup Exportar
            if (pathname === '/api/backup' && method === 'GET') {
                const backup = app.backupService.exportFullBackup();
                return sendJson(200, backup);
            }

            // Backup Restaurar
            if (pathname === '/api/backup/restore' && method === 'POST') {
                const body = await readJsonBody();
                const resRest = app.backupService.restoreFullBackup(body);
                return sendJson(200, resRest);
            }

            // === ROTAS DO TUTORIAL E ONBOARDING ===

            // Validação de pasta local
            if (pathname === '/api/tutorial/validate-folder' && method === 'POST') {
                const body = await readJsonBody();
                const validation = app.tutorialService.validateProjectFolder(body.folderPath);
                return sendJson(200, validation);
            }

            // Estado e progresso do tutorial para um projeto
            const tutStateMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)$/);
            if (tutStateMatch && method === 'GET') {
                const state = app.tutorialService.getOrCreateTutorialState(tutStateMatch[1]);
                return sendJson(200, state);
            }

            // Ativar ou desativar tutorial
            const tutEnableMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/enable$/);
            if (tutEnableMatch && method === 'POST') {
                const body = await readJsonBody();
                const resEn = app.tutorialService.setTutorialEnabled(tutEnableMatch[1], body.enabled);
                return sendJson(200, resEn);
            }

            // Mudar etapa atual do tutorial
            const tutStepMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/step$/);
            if (tutStepMatch && method === 'POST') {
                const body = await readJsonBody();
                const resStep = app.tutorialService.setCurrentStep(tutStepMatch[1], body.step);
                return sendJson(200, resStep);
            }

            // Reiniciar tutorial
            const tutResetMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/reset$/);
            if (tutResetMatch && method === 'POST') {
                const resReset = app.tutorialService.resetTutorial(tutResetMatch[1]);
                return sendJson(200, resReset);
            }

            // Gerar token e prompt para teste de conexão local da IA
            const tutConnTokenMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/connection-token$/);
            if (tutConnTokenMatch && method === 'POST') {
                const connData = app.tutorialService.generateConnectionToken(tutConnTokenMatch[1]);
                return sendJson(200, connData);
            }

            // Verificar se o arquivo temporário de confirmação foi criado
            const tutVerifyConnMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/verify-connection$/);
            if (tutVerifyConnMatch && method === 'POST') {
                const resVerif = app.tutorialService.verifyConnectionToken(tutVerifyConnMatch[1]);
                return sendJson(200, resVerif);
            }

            // Definir modo de comunicação (local ou manual)
            const tutCommModeMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/communication-mode$/);
            if (tutCommModeMatch && method === 'POST') {
                const body = await readJsonBody();
                const resMode = app.tutorialService.setCommunicationMode(tutCommModeMatch[1], body.mode);
                return sendJson(200, resMode);
            }

            // Dicas contextuais pendentes
            const tutTipsMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/tips$/);
            if (tutTipsMatch && method === 'GET') {
                const tips = app.tutorialService.getPendingTips(tutTipsMatch[1]);
                return sendJson(200, tips);
            }

            // Registrar que dica foi visualizada
            const tutTipSeenMatch = pathname.match(/^\/api\/tutorial\/([A-Za-z0-9_-]+)\/tip-seen$/);
            if (tutTipSeenMatch && method === 'POST') {
                const body = await readJsonBody();
                const resTip = app.tutorialService.markTipSeen(tutTipSeenMatch[1], body.tipId);
                return sendJson(200, resTip);
            }

            // Preferências do usuário (key/value)
            const prefMatch = pathname.match(/^\/api\/preferences\/([A-Za-z0-9_.-]+)$/);
            if (prefMatch && method === 'GET') {
                const val = app.tutorialService.getUserPreference(prefMatch[1]);
                return sendJson(200, { key: prefMatch[1], value: val });
            }
            if (prefMatch && method === 'POST') {
                const body = await readJsonBody();
                const resPref = app.tutorialService.setUserPreference(prefMatch[1], body.value);
                return sendJson(200, resPref);
            }

            // Servir Arquivos Estáticos da pasta public/
            let safePath = pathname === '/' ? '/index.html' : pathname;
            const fullStaticPath = resolve(join(publicDir, safePath));

            // Proteção contra Directory Traversal na rota estática
            if (!fullStaticPath.startsWith(resolve(publicDir))) {
                res.writeHead(403);
                return res.end('Acesso proibido.');
            }

            if (existsSync(fullStaticPath) && statSync(fullStaticPath).isFile()) {
                const ext = extname(fullStaticPath);
                const contentType = mimeTypes[ext] || 'text/plain';
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                return res.end(readFileSync(fullStaticPath));
            }

            // 404 Not Found
            return sendJson(404, { error: 'Rota não encontrada.' });

        } catch (err) {
            return sendJson(400, { error: err.message || 'Erro ao processar requisição.' });
        }
    });

    server.listen(port, host, () => {
        console.log(`[ESTEIRA IA] Servidor executando em http://${host}:${port}`);
    });

    return { server, app };
}

// Iniciar servidor se executado diretamente
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
    const port = parseInt(process.env.PORT || '3000', 10);
    startServer(port, '127.0.0.1');
}
