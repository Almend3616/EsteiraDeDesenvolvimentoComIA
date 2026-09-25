import { existsSync, renameSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { validateDeliveryPayload } from '../contracts/deliverySchema.js';

export class IngestionService {
    constructor(db, docSyncService) {
        this.db = db;
        this.docSyncService = docSyncService;
    }

    /**
     * Processa um arquivo JSON de entrega recebido via pasta de entrada ou upload manual
     */
    processDeliveryFile(filePath, rawContentString) {
        const fileHash = createHash('sha256').update(rawContentString, 'utf8').digest('hex');
        
        let payload;
        try {
            payload = JSON.parse(rawContentString);
        } catch (err) {
            return this.handleRejection(filePath, rawContentString, null, [
                `Formato JSON malformado ou inválido: ${err.message}`
            ]);
        }

        // Validação de Schema
        const schemaValidation = validateDeliveryPayload(payload);
        if (!schemaValidation.valid) {
            return this.handleRejection(filePath, rawContentString, payload.project_id, schemaValidation.errors);
        }

        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(payload.project_id);
        if (!project) {
            return this.handleRejection(filePath, rawContentString, null, [
                `Projeto ${payload.project_id} não existe no sistema.`
            ]);
        }

        // Checagem de idempotência e conflito de submissão
        const existingDelivery = this.db.db.prepare(
            'SELECT * FROM deliveries WHERE submission_id = ?'
        ).get(payload.submission_id);

        if (existingDelivery) {
            if (existingDelivery.payload_hash === fileHash) {
                // Idempotente: arquivo e ID idênticos
                this.archiveProcessed(project.root_path, filePath, existingDelivery.id);
                return {
                    success: true,
                    idempotent: true,
                    deliveryId: existingDelivery.id,
                    message: `Submissão ${payload.submission_id} já processada anteriormente (idempotente). Nenhum registro duplicado.`
                };
            } else {
                // Conflito: mesmo submission_id com hash diferente
                return this.handleRejection(filePath, rawContentString, project.id, [
                    `Conflito de submissão: O submission_id '${payload.submission_id}' já foi utilizado com conteúdo diferente.`
                ]);
            }
        }

        // Validação de Vínculos de Negócio
        const validation = this.validateBusinessLinks(payload, project);
        if (!validation.valid) {
            return this.handleRejection(filePath, rawContentString, project.id, validation.errors);
        }

        // Ingestão transacional válida
        const result = this.db.transaction((db) => {
            const deliveryId = this.db.getNextId('ENT');
            const now = new Date().toISOString();

            // Inserir Entrega com status pendente de conferência humana
            const stmtDeliv = db.prepare(`
                INSERT INTO deliveries (
                    id, submission_id, execution_id, task_id, previous_delivery_ref,
                    code_version, result, payload, payload_hash, evidence, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?)
            `);

            const evidenceList = (payload.tests || [])
                .flatMap(t => t.evidence || [])
                .concat(payload.errors ? payload.errors.flatMap(e => e.evidence || []) : []);

            stmtDeliv.run(
                deliveryId,
                payload.submission_id,
                payload.execution_id,
                payload.task_id,
                payload.previous_delivery_ref || null,
                JSON.stringify(payload.code_version),
                rawContentString,
                fileHash,
                JSON.stringify(evidenceList),
                now
            );

            // Atualizar Tarefa para situação 'entrega_recebida' / 'aguardando_conferencia'
            db.prepare(`
                UPDATE tasks 
                SET status = 'entrega_recebida', last_delivery_ref = ?, updated_at = ?
                WHERE id = ?
            `).run(deliveryId, now, payload.task_id);

            // Registrar Erros reportados no payload
            if (Array.isArray(payload.errors)) {
                for (const err of payload.errors) {
                    const errId = this.db.getNextId('ERR');
                    db.prepare(`
                        INSERT INTO errors (
                            id, feature_id, task_id, delivery_id, title, description,
                            reproduction_steps, severity, expected_behavior, actual_behavior,
                            evidence, known_cause, attempts_count, resolved, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
                    `).run(
                        errId,
                        payload.feature_id,
                        payload.task_id,
                        deliveryId,
                        err.title || 'Erro reportado na entrega',
                        err.description || '',
                        err.reproduction_steps || 'Não informado',
                        err.severity || 'media',
                        err.expected_behavior || '',
                        err.actual_behavior || '',
                        JSON.stringify(err.evidence || []),
                        err.known_cause || null,
                        now
                    );
                }
            }

            // Registrar Testes reportados no payload
            if (Array.isArray(payload.tests)) {
                for (const t of payload.tests) {
                    const testDbId = this.db.getNextId('TST');
                    db.prepare(`
                        INSERT INTO tests (
                            id, feature_id, delivery_id, criterion_id, title, command,
                            environment, status, evidence, reason_not_run, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        testDbId,
                        payload.feature_id,
                        deliveryId,
                        t.criterion_id || null,
                        t.title || t.test_id,
                        t.command || null,
                        t.environment || null,
                        t.status,
                        JSON.stringify(Array.isArray(t.evidence) ? t.evidence : (t.evidence ? [String(t.evidence)] : [])),
                        t.reason || null,
                        now
                    );
                }
            }

            // Registrar Evento
            const eventId = this.db.getNextId('EVT');
            db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'ENTREGA_RECEBIDA', ?, ?, ?, ?)
            `).run(
                eventId,
                project.id,
                payload.actor_id,
                now,
                JSON.stringify({ task_id: payload.task_id, delivery_id: deliveryId, execution_id: payload.execution_id }),
                JSON.stringify({ title: payload.title, stage: payload.stage, submission_id: payload.submission_id })
            );

            return { deliveryId, taskId: payload.task_id, projectId: project.id };
        });

        // Mover arquivo para gestao-ia/processados/
        this.archiveProcessed(project.root_path, filePath, result.deliveryId);

        return {
            success: true,
            deliveryId: result.deliveryId,
            taskId: result.taskId,
            message: `Entrega ${result.deliveryId} recebida com sucesso. Aguardando conferência do usuário.`
        };
    }

    validateBusinessLinks(payload, project) {
        const errors = [];

        // 1. Verificar Execução Autorizada
        const exec = this.db.db.prepare('SELECT * FROM executions WHERE id = ?').get(payload.execution_id);
        if (!exec) {
            errors.push(`Execução ${payload.execution_id} não existe no sistema.`);
            return { valid: false, errors };
        }
        if (exec.status !== 'ativa') {
            errors.push(`A execução ${payload.execution_id} não está ativa (situação: ${exec.status}).`);
        }
        if (exec.task_id !== payload.task_id) {
            errors.push(`Divergência: Execução ${payload.execution_id} pertence à tarefa ${exec.task_id}, não a ${payload.task_id}.`);
        }
        if (exec.stage !== payload.stage) {
            errors.push(`Divergência: Etapa autorizada na execução é '${exec.stage}', mas a entrega declara '${payload.stage}'.`);
        }
        if (exec.actor_id !== payload.actor_id) {
            errors.push(`Divergência: IA autorizada é '${exec.actor_id}', mas a entrega foi feita por '${payload.actor_id}'.`);
        }

        // 2. Verificar Revisão Base
        if (payload.base_revision < exec.source_revision) {
            errors.push(`Entrega obsoleta: Revisão base informada (${payload.base_revision}) é anterior à revisão de autorização (${exec.source_revision}).`);
        }

        // 3. Verificar Referência Anterior
        const task = this.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(payload.task_id);
        if (task && task.last_delivery_ref) {
            if (payload.previous_delivery_ref !== task.last_delivery_ref) {
                errors.push(`Referência anterior divergente: Esperado '${task.last_delivery_ref}', informado '${payload.previous_delivery_ref}'.`);
            }
        }

        return { valid: errors.length === 0, errors };
    }

    handleRejection(filePath, rawContentString, projectId, errors) {
        let destPath = null;
        if (projectId) {
            const project = this.db.db.prepare('SELECT root_path FROM projects WHERE id = ?').get(projectId);
            if (project) {
                const rejDir = join(project.root_path, 'gestao-ia', 'rejeitados');
                const base = basename(filePath || 'entrega.json');
                const stamp = Date.now();
                destPath = join(rejDir, `${stamp}_${base}`);
                try {
                    writeFileSync(destPath, rawContentString, 'utf8');
                    writeFileSync(`${destPath}.rejection.json`, JSON.stringify({ errors, rejected_at: new Date().toISOString() }, null, 2), 'utf8');
                    if (filePath && existsSync(filePath)) unlinkSync(filePath);
                } catch {}
            }
        }

        return {
            success: false,
            rejected: true,
            errors,
            archivedAt: destPath
        };
    }

    archiveProcessed(projectRoot, filePath, deliveryId) {
        if (!filePath || !existsSync(filePath)) return;
        const procDir = join(projectRoot, 'gestao-ia', 'processados');
        const stamp = Date.now();
        const base = basename(filePath);
        const dest = join(procDir, `${stamp}_${deliveryId}_${base}`);
        try {
            copyFileSync(filePath, dest);
            unlinkSync(filePath);
        } catch {}
    }

    /**
     * Aceite manual da entrega pelo usuário
     */
    acceptDelivery(deliveryId, reviewNotes = '', userId = 'USUARIO') {
        const deliv = this.db.db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
        if (!deliv) throw new Error(`Entrega ${deliveryId} não encontrada.`);
        if (deliv.result !== 'pendente') {
            throw new Error(`A entrega ${deliveryId} já foi avaliada anteriormente (resultado: ${deliv.result}).`);
        }

        let payload = {};
        try { payload = JSON.parse(deliv.payload); } catch {}

        const task = this.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(deliv.task_id);
        const feature = this.db.db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);

        return this.db.transaction((db) => {
            const now = new Date().toISOString();

            // 1. Atualizar Entrega para 'aceita'
            db.prepare(`
                UPDATE deliveries 
                SET result = 'aceita', review_notes = ?, accepted_at = ?
                WHERE id = ?
            `).run(reviewNotes, now, deliveryId);

            // 2. Finalizar Execução Ativa
            db.prepare(`
                UPDATE executions 
                SET status = 'finalizada'
                WHERE id = ?
            `).run(deliv.execution_id);

            // 3. Determinar próximo estado da tarefa
            let nextTaskStatus = 'etapa_aceita';
            if (payload.stage === 'Validar') {
                // Em Validar, aprovação técnica encaminha para 'aguardando_teste_humano'
                nextTaskStatus = 'aguardando_teste_humano';
            }

            db.prepare(`
                UPDATE tasks 
                SET status = ?, last_delivery_ref = ?, updated_at = ?
                WHERE id = ?
            `).run(nextTaskStatus, deliveryId, now, task.id);

            db.prepare(`
                UPDATE features 
                SET status = ?, updated_at = ?
                WHERE id = ?
            `).run(nextTaskStatus, now, feature.id);

            // 4. Incrementar revisão oficial do projeto
            const newRevision = project.revision + 1;
            db.prepare(`
                UPDATE projects SET revision = ?, updated_at = ? WHERE id = ?
            `).run(newRevision, now, project.id);

            // 5. Registrar Evento
            const eventId = this.db.getNextId('EVT');
            db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'ENTREGA_ACEITA', ?, ?, ?, ?)
            `).run(
                eventId,
                project.id,
                userId,
                now,
                JSON.stringify({ task_id: task.id, delivery_id: deliveryId, execution_id: deliv.execution_id }),
                JSON.stringify({ stage: payload.stage, newRevision, reviewNotes })
            );

            // 6. Atualizar Documentação Oficial no Disco
            project.revision = newRevision;
            this.docSyncService.exportProjectDocuments(project, true);

            return {
                success: true,
                deliveryId,
                taskId: task.id,
                nextStatus: nextTaskStatus,
                newRevision
            };
        });
    }

    /**
     * Rejeição manual da entrega pelo usuário
     */
    rejectDelivery(deliveryId, rejectionReason, userId = 'USUARIO') {
        if (!rejectionReason || rejectionReason.trim().length < 5) {
            throw new Error('Informe o motivo da rejeição da entrega.');
        }

        const deliv = this.db.db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
        if (!deliv) throw new Error(`Entrega ${deliveryId} não encontrada.`);
        if (deliv.result !== 'pendente') {
            throw new Error(`A entrega ${deliveryId} já foi avaliada anteriormente (resultado: ${deliv.result}).`);
        }

        let payload = {};
        try { payload = JSON.parse(deliv.payload); } catch {}

        const task = this.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(deliv.task_id);
        const feature = this.db.db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
        const project = this.db.db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);

        return this.db.transaction((db) => {
            const now = new Date().toISOString();

            // 1. Atualizar Entrega para 'rejeitada'
            db.prepare(`
                UPDATE deliveries 
                SET result = 'rejeitada', review_notes = ?
                WHERE id = ?
            `).run(rejectionReason, deliveryId);

            // 2. Finalizar Execução Ativa
            db.prepare(`
                UPDATE executions SET status = 'finalizada' WHERE id = ?
            `).run(deliv.execution_id);

            // 3. Regra de Limite de Tentativas: se estiver na etapa 'Corrigir', incrementa o contador da funcionalidade
            let newFailedCount = feature.failed_corrections_count;
            if (payload.stage === 'Corrigir') {
                newFailedCount += 1;
            }

            const isSuspended = newFailedCount >= 3;
            const newStatus = isSuspended ? 'bloqueada' : 'pronta_para_iniciar';

            db.prepare(`
                UPDATE tasks 
                SET status = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, now, task.id);

            db.prepare(`
                UPDATE features 
                SET status = ?, failed_corrections_count = ?, updated_at = ?
                WHERE id = ?
            `).run(newStatus, newFailedCount, now, feature.id);

            if (isSuspended) {
                const decId = this.db.getNextId('DEC');
                db.prepare(`
                    INSERT INTO decisions (id, project_id, feature_id, task_id, title, description, alternatives, impact, status, created_at)
                    VALUES (?, ?, ?, ?, 'Funcionalidade Suspensa por 3 Correções Reprovadas', ?, ?, 'Bloqueio total de novas execuções da funcionalidade', 'pendente', ?)
                `).run(
                    decId, project.id, feature.id, task.id,
                    `A entrega ${deliveryId} de correção foi reprovada, totalizando 3 rodadas de correção malsucedidas. Motivo: ${rejectionReason}`,
                    JSON.stringify(['Revisar arquitetura e escopo', 'Redefinir requisitos', 'Reiniciar ciclo']),
                    now
                );
            }

            // Registrar Evento
            const eventId = this.db.getNextId('EVT');
            db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'ENTREGA_REJEITADA', ?, ?, ?, ?)
            `).run(
                eventId,
                project.id,
                userId,
                now,
                JSON.stringify({ task_id: task.id, delivery_id: deliveryId, execution_id: deliv.execution_id }),
                JSON.stringify({ stage: payload.stage, rejectionReason, failedCorrectionsCount: newFailedCount })
            );

            // Atualizar Documentação
            this.docSyncService.exportProjectDocuments(project, true);

            return {
                success: true,
                deliveryId,
                status: newStatus,
                failedCorrectionsCount: newFailedCount,
                suspended: isSuspended
            };
        });
    }
}
