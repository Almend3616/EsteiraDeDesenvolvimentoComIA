import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export class ProjectService {
    constructor(db, docSyncService) {
        this.db = db;
        this.docSyncService = docSyncService;
    }

    createProject(data) {
        const { title, description, root_path } = data;
        if (!title || !description || !root_path) {
            throw new Error('Título, descrição e caminho da raiz local são obrigatórios.');
        }

        const absoluteRoot = resolve(root_path);
        if (!existsSync(absoluteRoot)) {
            mkdirSync(absoluteRoot, { recursive: true });
        }

        return this.db.transaction((db) => {
            const id = this.db.getNextId('PRJ');
            const now = new Date().toISOString();

            db.prepare(`
                INSERT INTO projects (id, title, description, root_path, revision, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
            `).run(id, title, description, absoluteRoot, now, now);

            // Criar participantes padrão recomendados (1 a 5 IAs customizáveis)
            const defaultAis = [
                { name: 'IA Arquiteta (ex: ChatGPT)', stages: ['Definir'] },
                { name: 'IA Desenvolvedora (ex: Claude)', stages: ['Desenvolver', 'Corrigir'] },
                { name: 'IA Auditora de QA (ex: Gemini)', stages: ['Verificar', 'Validar'] }
            ];

            for (const ai of defaultAis) {
                const aiId = this.db.getNextId('IA');
                db.prepare(`
                    INSERT INTO ai_participants (id, project_id, name, allowed_stages, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(aiId, id, ai.name, JSON.stringify(ai.stages), now);
            }

            const project = { id, title, description, root_path: absoluteRoot, revision: 1 };
            // Inicializar pastas e documentos Markdown
            this.docSyncService.exportProjectDocuments(project, true);

            // Registrar evento
            const eventId = this.db.getNextId('EVT');
            db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'PROJETO_CRIADO', 'USUARIO', ?, '{}', ?)
            `).run(eventId, id, now, JSON.stringify({ title, root_path: absoluteRoot }));

            return project;
        });
    }

    renameProject(projectId, title) {
        if (typeof title !== 'string' || !title.trim()) {
            throw new Error('O nome do projeto é obrigatório.');
        }
        return this.db.transaction((db) => {
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
            if (!project) return null;
            const newTitle = title.trim();
            if (newTitle === project.title) return project;
            const updated = { ...project, title: newTitle, revision: project.revision + 1, updated_at: new Date().toISOString() };
            db.prepare('UPDATE projects SET title = ?, revision = ?, updated_at = ? WHERE id = ?')
                .run(updated.title, updated.revision, updated.updated_at, projectId);
            db.prepare(`INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'PROJETO_RENOMEADO', 'USUARIO', ?, '{}', ?)`)
                .run(this.db.getNextId('EVT'), projectId, updated.updated_at, JSON.stringify({ previous_title: project.title, title: newTitle }));
            this.docSyncService.exportProjectDocuments(updated);
            return updated;
        });
    }

    listProjects() {
        return this.db.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    }

    getProjectDetails(projectId) {
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!project) return null;

        const ais = this.db.db.prepare('SELECT * FROM ai_participants WHERE project_id = ?').all(projectId);
        const features = this.db.db.prepare('SELECT * FROM features WHERE project_id = ? ORDER BY id ASC').all(projectId);
        
        const tasks = this.db.db.prepare(`
            SELECT t.*, f.title as feature_title, a.name as assignee_name
            FROM tasks t
            JOIN features f ON t.feature_id = f.id
            LEFT JOIN ai_participants a ON t.assignee_id = a.id
            WHERE f.project_id = ?
            ORDER BY t.id ASC
        `).all(projectId);

        const decisions = this.db.db.prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY id DESC').all(projectId);
        const errors = this.db.db.prepare(`
            SELECT e.* FROM errors e
            JOIN features f ON e.feature_id = f.id
            WHERE f.project_id = ?
            ORDER BY e.id DESC
        `).all(projectId);

        const executions = this.db.db.prepare(`
            SELECT ex.*, t.title as task_title, a.name as actor_name
            FROM executions ex
            JOIN tasks t ON ex.task_id = t.id
            JOIN features f ON t.feature_id = f.id
            JOIN ai_participants a ON ex.actor_id = a.id
            WHERE f.project_id = ?
            ORDER BY ex.id DESC
        `).all(projectId);

        const deliveries = this.db.db.prepare(`
            SELECT d.*, t.title as task_title
            FROM deliveries d
            JOIN tasks t ON d.task_id = t.id
            JOIN features f ON t.feature_id = f.id
            WHERE f.project_id = ?
            ORDER BY d.id DESC
        `).all(projectId);

        const events = this.db.db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(projectId);

        const requirements = this.db.db.prepare(`
            SELECT r.*, f.title as feature_title
            FROM requirements r
            JOIN features f ON r.feature_id = f.id
            WHERE f.project_id = ?
            ORDER BY r.id ASC
        `).all(projectId);

        const divergences = this.docSyncService.checkExternalDivergences(project);

        return {
            project,
            ais,
            features,
            tasks,
            requirements,
            decisions,
            errors,
            executions,
            deliveries,
            events,
            divergences
        };
    }

    addAiParticipant(projectId, name, allowedStages) {
        if (!name || !Array.isArray(allowedStages) || allowedStages.length === 0) {
            throw new Error('Nome da IA e etapas permitidas são obrigatórios.');
        }

        const count = this.db.db.prepare('SELECT COUNT(*) as cnt FROM ai_participants WHERE project_id = ?').get(projectId);
        if (count.cnt >= 5) {
            throw new Error('Limite máximo de 5 IAs por projeto atingido.');
        }

        const id = this.db.getNextId('IA');
        const now = new Date().toISOString();
        this.db.db.prepare(`
            INSERT INTO ai_participants (id, project_id, name, allowed_stages, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, projectId, name, JSON.stringify(allowedStages), now);

        return { id, name, allowedStages };
    }

    updateAiParticipant(aiId, allowedStages, name = null) {
        if (!Array.isArray(allowedStages) || allowedStages.length === 0) {
            throw new Error('As etapas permitidas devem ser informadas como array não vazio.');
        }

        const ai = this.db.db.prepare('SELECT * FROM ai_participants WHERE id = ?').get(aiId);
        if (!ai) throw new Error(`Participante IA ${aiId} não encontrado.`);

        const finalName = (name && name.trim()) ? name.trim() : ai.name;

        this.db.db.prepare(`
            UPDATE ai_participants SET name = ?, allowed_stages = ? WHERE id = ?
        `).run(finalName, JSON.stringify(allowedStages), aiId);

        return { id: aiId, name: finalName, allowedStages };
    }

    deleteAiParticipant(aiId) {
        const ai = this.db.db.prepare('SELECT * FROM ai_participants WHERE id = ?').get(aiId);
        if (!ai) throw new Error(`Participante IA ${aiId} não encontrado.`);

        const count = this.db.db.prepare('SELECT COUNT(*) as cnt FROM ai_participants WHERE project_id = ?').get(ai.project_id);
        if (count.cnt <= 1) {
            throw new Error('O projeto deve manter ao menos 1 participante IA cadastrado.');
        }

        this.db.db.prepare('DELETE FROM ai_participants WHERE id = ?').run(aiId);
        return { success: true, id: aiId };
    }

    addFeature(projectId, title, description, autoCreateTask = false) {
        if (!title || !description) throw new Error('Título e descrição da funcionalidade são obrigatórios.');

        return this.db.transaction((db) => {
            const id = this.db.getNextId('FUN');
            const now = new Date().toISOString();

            db.prepare(`
                INSERT INTO features (id, project_id, title, description, stage, status, failed_corrections_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'Definir', 'planejada', 0, ?, ?)
            `).run(id, projectId, title, description, now, now);

            let initialTaskId = null;
            if (autoCreateTask) {
                initialTaskId = this.db.getNextId('TSK');
                const taskTitle = `Definir: ${title.trim()}`;
                db.prepare(`
                    INSERT INTO tasks (id, feature_id, title, description, dependencies, priority, stage, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, '[]', 'media', 'Definir', 'planejada', ?, ?)
                `).run(initialTaskId, id, taskTitle, description, now, now);
            }

            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
            this.docSyncService.exportProjectDocuments(project, true);

            return { id, title, description, stage: 'Definir', status: 'planejada', initialTaskId };
        });
    }

    addRequirement(featureId, title, description, acceptanceCriteria = [], humanApproved = false) {
        if (!title || !description) throw new Error('Título e descrição do requisito são obrigatórios.');

        return this.db.transaction((db) => {
            const id = this.db.getNextId('REQ');
            const now = new Date().toISOString();

            db.prepare(`
                INSERT INTO requirements (id, feature_id, title, description, acceptance_criteria, version, human_approved, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            `).run(id, featureId, title, description, JSON.stringify(acceptanceCriteria), humanApproved ? 1 : 0, now);

            const feature = db.prepare('SELECT project_id FROM features WHERE id = ?').get(featureId);
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);
            this.docSyncService.exportProjectDocuments(project, true);

            return { id, title, description, acceptanceCriteria, humanApproved };
        });
    }

    approveRequirement(requirementId) {
        return this.db.transaction((db) => {
            const req = db.prepare('SELECT * FROM requirements WHERE id = ?').get(requirementId);
            if (!req) throw new Error(`Requisito ${requirementId} não encontrado.`);

            db.prepare('UPDATE requirements SET human_approved = 1 WHERE id = ?').run(requirementId);

            const feature = db.prepare('SELECT project_id FROM features WHERE id = ?').get(req.feature_id);
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);
            this.docSyncService.exportProjectDocuments(project, true);

            return { success: true, requirementId };
        });
    }

    addTask(featureId, title, description, dependencies = [], priority = 'media', stage = 'Definir') {
        if (!title || !description) throw new Error('Título e descrição da tarefa são obrigatórios.');

        return this.db.transaction((db) => {
            const id = this.db.getNextId('TSK');
            const now = new Date().toISOString();

            db.prepare(`
                INSERT INTO tasks (id, feature_id, title, description, dependencies, priority, stage, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'planejada', ?, ?)
            `).run(id, featureId, title, description, JSON.stringify(dependencies), priority, stage, now, now);

            const feature = db.prepare('SELECT project_id FROM features WHERE id = ?').get(featureId);
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);
            this.docSyncService.exportProjectDocuments(project, true);

            return { id, title, description, dependencies, priority, stage, status: 'planejada' };
        });
    }

    deleteTask(taskId) {
        if (!taskId) throw new Error('ID da tarefa é obrigatório.');

        return this.db.transaction((db) => {
            const task = db.prepare(`
                SELECT t.*, f.project_id
                FROM tasks t
                JOIN features f ON t.feature_id = f.id
                WHERE t.id = ?
            `).get(taskId);

            if (!task) {
                throw new Error(`Tarefa ${taskId} não encontrada.`);
            }

            db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id);
            if (project) {
                this.docSyncService.exportProjectDocuments(project, true);
                const eventId = this.db.getNextId('EVT');
                const now = new Date().toISOString();
                db.prepare(`
                    INSERT INTO events (id, project_id, type, author, created_at, links, details)
                    VALUES (?, ?, 'TAREFA_EXCLUIDA', 'USUARIO', ?, '{}', ?)
                `).run(eventId, project.id, now, JSON.stringify({ taskId, title: task.title }));
            }

            return { success: true, taskId };
        });
    }

    deleteFeature(featureId) {
        if (!featureId) throw new Error('ID da funcionalidade é obrigatório.');

        return this.db.transaction((db) => {
            const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(featureId);
            if (!feature) {
                throw new Error(`Funcionalidade ${featureId} não encontrada.`);
            }

            db.prepare('DELETE FROM features WHERE id = ?').run(featureId);

            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);
            if (project) {
                this.docSyncService.exportProjectDocuments(project, true);
                const eventId = this.db.getNextId('EVT');
                const now = new Date().toISOString();
                db.prepare(`
                    INSERT INTO events (id, project_id, type, author, created_at, links, details)
                    VALUES (?, ?, 'FUNCIONALIDADE_EXCLUIDA', 'USUARIO', ?, '{}', ?)
                `).run(eventId, project.id, now, JSON.stringify({ featureId, title: feature.title }));
            }

            return { success: true, featureId };
        });
    }
}
