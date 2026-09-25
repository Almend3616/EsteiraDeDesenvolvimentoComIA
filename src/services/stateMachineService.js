export const STAGES_ORDER = ['Definir', 'Desenvolver', 'Verificar', 'Corrigir', 'Validar'];

export class StateMachineService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Valida se uma tarefa pode iniciar uma execução de uma determinada etapa
     */
    canStartExecution(taskId, actorId, stage, requestedResources = []) {
        const task = this.db.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!task) {
            return { allowed: false, reason: `Tarefa ${taskId} não encontrada.` };
        }

        const feature = this.db.db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
        if (!feature) {
            return { allowed: false, reason: `Funcionalidade ${task.feature_id} não encontrada.` };
        }

        // 1. Verificar se a funcionalidade está suspensa por 3 reprovações de correção
        if (feature.failed_corrections_count >= 3) {
            return {
                allowed: false,
                reason: `Funcionalidade ${feature.id} suspensa devido a 3 rodadas de correção reprovadas. É necessária uma decisão humana para reavaliar a estratégia e liberar novo ciclo.`
            };
        }

        // 2. Verificar se há decisões pendentes bloqueando o escopo
        const pendingDecision = this.db.db.prepare(`
            SELECT id, title FROM decisions 
            WHERE status = 'pendente' AND (feature_id = ? OR task_id = ?)
        `).get(feature.id, task.id);
        if (pendingDecision) {
            return {
                allowed: false,
                reason: `Bloqueado por decisão pendente: ${pendingDecision.id} — ${pendingDecision.title}. Delibere no painel de Decisões antes de iniciar.`
            };
        }

        // 3. Verificar dependências não concluídas
        let deps = [];
        try { deps = JSON.parse(task.dependencies); } catch {}
        if (deps.length > 0) {
            for (const depId of deps) {
                const depTask = this.db.db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(depId);
                if (!depTask || depTask.status !== 'concluida') {
                    return {
                        allowed: false,
                        reason: `Dependência pendente: Tarefa ${depId} (${depTask ? depTask.status : 'inexistente'}) ainda não está concluída.`
                    };
                }
            }
        }

        // 4. Verificar se a tarefa já tem uma execução ativa
        const activeExec = this.db.db.prepare(`
            SELECT id, stage, actor_id FROM executions 
            WHERE task_id = ? AND status = 'ativa'
        `).get(taskId);
        if (activeExec) {
            return {
                allowed: false,
                reason: `A tarefa ${taskId} já possui uma execução ativa (${activeExec.id}) na etapa ${activeExec.stage} atribuída a ${activeExec.actor_id}.`
            };
        }

        // 5. Verificar rito de transição da etapa
        if (stage !== task.stage) {
            // Permitir início se a situação for 'etapa_aceita' e a nova etapa for a imediatamente seguinte
            const currentIdx = STAGES_ORDER.indexOf(task.stage);
            const targetIdx = STAGES_ORDER.indexOf(stage);
            if (task.status === 'etapa_aceita') {
                if (targetIdx !== currentIdx + 1) {
                    return {
                        allowed: false,
                        reason: `Transição inválida: Não é permitido pular de ${task.stage} para ${stage}. A próxima etapa deve ser ${STAGES_ORDER[currentIdx + 1]}.`
                    };
                }
            } else {
                return {
                    allowed: false,
                    reason: `A tarefa está na etapa ${task.stage} (${task.status}). Para mudar para ${stage}, a etapa atual precisa estar aceita pelo usuário.`
                };
            }
        }

        // 6. Se for etapa Definir -> Desenvolver, verificar se os requisitos foram aprovados por humano
        if (stage === 'Desenvolver') {
            const unapprovedReq = this.db.db.prepare(`
                SELECT id, title FROM requirements 
                WHERE feature_id = ? AND human_approved = 0
            `).get(feature.id);
            if (unapprovedReq) {
                return {
                    allowed: false,
                    reason: `Requisito ${unapprovedReq.id} (${unapprovedReq.title}) aguarda aprovação humana antes de iniciar o desenvolvimento.`
                };
            }
        }

        // 7. Verificar se o participante IA tem permissão para esta etapa
        const actor = this.db.db.prepare('SELECT * FROM ai_participants WHERE id = ?').get(actorId);
        if (!actor) {
            return { allowed: false, reason: `Participante IA ${actorId} não cadastrado.` };
        }
        let allowedStages = [];
        try { allowedStages = JSON.parse(actor.allowed_stages); } catch {}
        if (!allowedStages.includes(stage)) {
            return {
                allowed: false,
                reason: `A IA ${actor.name} (${actor.id}) não possui permissão configurada para a etapa ${stage}. Etapas permitidas: ${allowedStages.join(', ')}.`
            };
        }

        // 8. Verificar concorrência de recursos reservados por outras execuções ativas
        if (requestedResources && requestedResources.length > 0) {
            const allActiveExecs = this.db.db.prepare(
                "SELECT id, task_id, reserved_resources FROM executions WHERE status = 'ativa'"
            ).all();

            for (const exec of allActiveExecs) {
                let existingRes = [];
                try { existingRes = JSON.parse(exec.reserved_resources); } catch {}
                const conflict = requestedResources.find(r => existingRes.includes(r));
                if (conflict) {
                    return {
                        allowed: false,
                        reason: `Conflito de recursos: O recurso ou arquivo '${conflict}' já está reservado pela execução ativa ${exec.id} (Tarefa ${exec.task_id}).`
                    };
                }
            }
        }

        return { allowed: true };
    }

    /**
     * Inicia uma execução autorizada pelo usuário
     */
    startExecution(taskId, actorId, stage, scope, reservedResources = []) {
        const check = this.canStartExecution(taskId, actorId, stage, reservedResources);
        if (!check.allowed) {
            throw new Error(check.reason);
        }

        return this.db.transaction((db) => {
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);

            const now = new Date().toISOString();
            const execId = this.db.getNextId('EXE');

            // Inserir Execução
            const stmtExec = db.prepare(`
                INSERT INTO executions (
                    id, task_id, stage, actor_id, human_authorized, 
                    authorized_at, source_revision, reserved_resources, scope, status, created_at
                ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'ativa', ?)
            `);
            stmtExec.run(
                execId, taskId, stage, actorId, now, 
                project.revision, JSON.stringify(reservedResources), scope, now
            );

            // Atualizar Tarefa
            const stmtTask = db.prepare(`
                UPDATE tasks 
                SET stage = ?, status = 'em_execucao', assignee_id = ?, updated_at = ?
                WHERE id = ?
            `);
            stmtTask.run(stage, actorId, now, taskId);

            // Atualizar Funcionalidade se aplicável
            const stmtFeature = db.prepare(`
                UPDATE features SET stage = ?, status = 'em_execucao', updated_at = ? WHERE id = ?
            `);
            stmtFeature.run(stage, now, feature.id);

            // Registrar Evento
            const eventId = this.db.getNextId('EVT');
            const stmtEvent = db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'EXECUCAO_INICIADA', 'USUARIO', ?, ?, ?)
            `);
            stmtEvent.run(
                eventId, project.id, now,
                JSON.stringify({ task_id: taskId, execution_id: execId, actor_id: actorId }),
                JSON.stringify({ stage, scope, reserved_resources: reservedResources })
            );

            return {
                executionId: execId,
                taskId,
                stage,
                actorId,
                sourceRevision: project.revision,
                authorizedAt: now
            };
        });
    }

    /**
     * Dispensa a etapa de correção quando a etapa de Verificação não encontrou erros
     */
    dispenseCorrection(taskId, justification, userId = 'USUARIO') {
        if (!justification || justification.trim().length < 10) {
            throw new Error('A justificativa para dispensar a correção deve conter no mínimo 10 caracteres.');
        }

        return this.db.transaction((db) => {
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            if (!task) throw new Error(`Tarefa ${taskId} não encontrada.`);

            if (task.stage !== 'Corrigir' && task.stage !== 'Verificar') {
                throw new Error(`Correção só pode ser dispensada a partir de Verificar ou Corrigir. Etapa atual: ${task.stage}.`);
            }

            // Verificar se há erros abertos não resolvidos vinculados a esta tarefa
            const openError = db.prepare('SELECT id, title FROM errors WHERE task_id = ? AND resolved = 0').get(taskId);
            if (openError) {
                throw new Error(`Não é possível dispensar correção: existe o erro aberto ${openError.id} (${openError.title}) pendente de resolução.`);
            }

            const now = new Date().toISOString();
            const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);

            // Transitar tarefa para Corrigir (dispensada) -> Validar (pronta para iniciar)
            db.prepare(`
                UPDATE tasks 
                SET stage = 'Validar', status = 'pronta_para_iniciar', updated_at = ?
                WHERE id = ?
            `).run(now, taskId);

            db.prepare(`
                UPDATE features SET stage = 'Validar', status = 'pronta_para_iniciar', updated_at = ? WHERE id = ?
            `).run(now, feature.id);

            // Registrar evento e decisão de dispensa
            const decId = this.db.getNextId('DEC');
            db.prepare(`
                INSERT INTO decisions (id, project_id, feature_id, task_id, title, description, alternatives, impact, status, human_response, created_at, resolved_at)
                VALUES (?, ?, ?, ?, 'Correção Dispensada', ?, '[]', 'Avanço direto para a etapa Validar', 'aprovada', ?, ?, ?)
            `).run(
                decId, project.id, feature.id, taskId,
                `Etapa de correção dispensada por ausência de inconformidades na verificação. Justificativa: ${justification}`,
                justification, now, now
            );

            const eventId = this.db.getNextId('EVT');
            db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'CORRECAO_DISPENSADA', ?, ?, ?, ?)
            `).run(
                eventId, project.id, userId, now,
                JSON.stringify({ task_id: taskId, feature_id: feature.id, decision_id: decId }),
                JSON.stringify({ justification })
            );

            return { success: true, taskId, newStage: 'Validar' };
        });
    }

    /**
     * Validação humana final (aprovação ou reprovação explícita)
     */
    submitHumanValidation(taskId, approved, feedback, userId = 'USUARIO', isRequirementChange = false) {
        return this.db.transaction((db) => {
            const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
            if (!task) throw new Error(`Tarefa ${taskId} não encontrada.`);

            if (task.status !== 'aguardando_teste_humano') {
                throw new Error(`A tarefa ${taskId} não está em 'aguardando_teste_humano' (situação atual: ${task.status}).`);
            }

            const now = new Date().toISOString();
            const feature = db.prepare('SELECT * FROM features WHERE id = ?').get(task.feature_id);
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(feature.project_id);

            if (approved) {
                // Conclusão bem-sucedida da tarefa e da funcionalidade
                db.prepare(`
                    UPDATE tasks 
                    SET status = 'concluida', updated_at = ?
                    WHERE id = ?
                `).run(now, taskId);

                // Checar se todas as tarefas da funcionalidade estão concluídas
                const remainingTasks = db.prepare(`
                    SELECT COUNT(*) as cnt FROM tasks 
                    WHERE feature_id = ? AND status != 'concluida' AND id != ?
                `).get(feature.id, taskId);

                if (remainingTasks.cnt === 0) {
                    db.prepare(`
                        UPDATE features SET status = 'concluida', updated_at = ? WHERE id = ?
                    `).run(now, feature.id);
                }

                // Registrar Evento
                const eventId = this.db.getNextId('EVT');
                db.prepare(`
                    INSERT INTO events (id, project_id, type, author, created_at, links, details)
                    VALUES (?, ?, 'APROVACAO_HUMANA_CONCLUIDA', ?, ?, ?, ?)
                `).run(
                    eventId, project.id, userId, now,
                    JSON.stringify({ task_id: taskId, feature_id: feature.id }),
                    JSON.stringify({ feedback: feedback || 'Aprovado pelo usuário.' })
                );

                return { success: true, status: 'concluida' };
            } else {
                // Reprovação humana: retorna a Corrigir se defeito, ou a Definir se mudança de requisito
                const returnStage = isRequirementChange ? 'Definir' : 'Corrigir';
                
                // Se for defeito técnico retornado a Corrigir, incrementa o contador de reprovações
                let newCount = feature.failed_corrections_count;
                if (!isRequirementChange) {
                    newCount += 1;
                }

                const newStatus = (newCount >= 3) ? 'bloqueada' : 'pronta_para_iniciar';

                db.prepare(`
                    UPDATE tasks 
                    SET stage = ?, status = ?, updated_at = ?
                    WHERE id = ?
                `).run(returnStage, newStatus, now, taskId);

                db.prepare(`
                    UPDATE features 
                    SET stage = ?, status = ?, failed_corrections_count = ?, updated_at = ?
                    WHERE id = ?
                `).run(returnStage, newStatus, newCount, now, feature.id);

                // Se atingiu o limite de 3 reprovações, cadastra Decisão Pendente para nova estratégia
                if (newCount >= 3) {
                    const decId = this.db.getNextId('DEC');
                    db.prepare(`
                        INSERT INTO decisions (id, project_id, feature_id, task_id, title, description, alternatives, impact, status, human_response, created_at)
                        VALUES (?, ?, ?, ?, 'Funcionalidade Suspensa por Limite de Reprovações', ?, ?, 'Bloqueio total de novas execuções da funcionalidade', 'pendente', null, ?)
                    `).run(
                        decId, project.id, feature.id, taskId,
                        `A funcionalidade atingiu o limite de 3 rodadas de correção reprovadas. Motivo da última reprovação: ${feedback}`,
                        JSON.stringify(['Revisar arquitetura e escopo', 'Redefinir requisitos', 'Reiniciar ciclo com nova IA']),
                        now
                    );
                }

                // Registrar Erro ou Evento
                const eventId = this.db.getNextId('EVT');
                db.prepare(`
                    INSERT INTO events (id, project_id, type, author, created_at, links, details)
                    VALUES (?, ?, 'REPROVACAO_HUMANA', ?, ?, ?, ?)
                `).run(
                    eventId, project.id, userId, now,
                    JSON.stringify({ task_id: taskId, feature_id: feature.id, returnStage }),
                    JSON.stringify({ feedback, isRequirementChange, failedCorrectionsCount: newCount })
                );

                return { 
                    success: true, 
                    status: newStatus, 
                    returnedToStage: returnStage,
                    failedCorrectionsCount: newCount,
                    suspended: newCount >= 3
                };
            }
        });
    }

    /**
     * Resolução de decisão humana
     */
    resolveDecision(decisionId, humanResponse, status = 'aprovada', userId = 'USUARIO') {
        return this.db.transaction((db) => {
            const dec = db.prepare('SELECT * FROM decisions WHERE id = ?').get(decisionId);
            if (!dec) throw new Error(`Decisão ${decisionId} não encontrada.`);

            const now = new Date().toISOString();
            db.prepare(`
                UPDATE decisions 
                SET status = ?, human_response = ?, resolved_at = ?
                WHERE id = ?
            `).run(status, humanResponse, now, decisionId);

            // Se for decisão de desbloqueio de funcionalidade suspensa, resetar contador para permitir novo ciclo
            if (dec.feature_id && dec.title.includes('Funcionalidade Suspensa')) {
                db.prepare(`
                    UPDATE features 
                    SET failed_corrections_count = 0, status = 'pronta_para_iniciar', updated_at = ?
                    WHERE id = ?
                `).run(now, dec.feature_id);

                if (dec.task_id) {
                    db.prepare(`
                        UPDATE tasks SET status = 'pronta_para_iniciar', updated_at = ? WHERE id = ?
                    `).run(now, dec.task_id);
                }
            }

            // Registrar evento
            const eventId = this.db.getNextId('EVT');
            db.prepare(`
                INSERT INTO events (id, project_id, type, author, created_at, links, details)
                VALUES (?, ?, 'DECISAO_RESOLVIDA', ?, ?, ?, ?)
            `).run(
                eventId, dec.project_id, userId, now,
                JSON.stringify({ decision_id: decisionId, feature_id: dec.feature_id, task_id: dec.task_id }),
                JSON.stringify({ status, humanResponse })
            );

            return { success: true, decisionId, status };
        });
    }
}
