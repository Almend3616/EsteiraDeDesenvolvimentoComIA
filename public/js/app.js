/**
 * Esteira de Desenvolvimento com IA — Lógica Frontend Reativa
 * Versão 1.0 — 24/09/2026
 */

class EsteiraApp {
    constructor() {
        this.currentProjectId = null;
        this.projectData = null;
        this.activeModal = null;
        this.draggedTaskId = null;
        this.tutorialState = null;
        this.activeSpotlightElement = null;

        this.initElements();
        this.initTutorialElements();
        this.bindEvents();
        this.bindTutorialEvents();
        this.initTheme();
        this.loadProjects();

        // Polling de sincronização automática com backend e pasta de entrada
        setInterval(() => {
            if (this.currentProjectId && !this.activeModal) {
                this.refreshProjectDetails(false);
            }
        }, 4000);
    }

    initElements() {
        // Seletores e botões principais
        this.projectSelect = document.getElementById('projectSelect');
        this.btnNewProject = document.getElementById('btnNewProject');
        this.btnRenameProject = document.getElementById('btnRenameProject');
        this.btnImportDelivery = document.getElementById('btnImportDelivery');
        this.btnBackup = document.getElementById('btnBackup');
        this.btnReconcileDocs = document.getElementById('btnReconcileDocs');
        this.btnAddAi = document.getElementById('btnAddAi');
        this.btnNewFeature = document.getElementById('btnNewFeature');
        this.btnManageFeatures = document.getElementById('btnManageFeatures');
        this.btnNewTask = document.getElementById('btnNewTask');

        // Botões do Tutorial
        this.btnToggleTutorial = document.getElementById('btnToggleTutorial');
        this.btnTutorialSettings = document.getElementById('btnTutorialSettings');
        this.tutorialNavLabel = document.getElementById('tutorialNavLabel');

        // Banner de Dica Contextual
        this.tutorialContextualTipBanner = document.getElementById('tutorialContextualTipBanner');
        this.tipTitle = document.getElementById('tipTitle');
        this.tipMessage = document.getElementById('tipMessage');
        this.btnTipAction = document.getElementById('btnTipAction');
        this.btnDismissTip = document.getElementById('btnDismissTip');

        // Indicadores do topo
        this.docIntegrityBadge = document.getElementById('docIntegrityBadge');
        this.projectRootPath = document.getElementById('projectRootPath');
        this.projectRevision = document.getElementById('projectRevision');
        this.projectAiTags = document.getElementById('projectAiTags');
        this.alertsContainer = document.getElementById('alertsContainer');

        // Contadores das métricas
        this.countProntas = document.getElementById('countProntas');
        this.countExec = document.getElementById('countExec');
        this.countRecebidas = document.getElementById('countRecebidas');
        this.countDecisao = document.getElementById('countDecisao');
        this.countHumano = document.getElementById('countHumano');
        this.countBloqueadas = document.getElementById('countBloqueadas');

        // Filtros
        this.filterFeature = document.getElementById('filterFeature');
        this.filterStage = document.getElementById('filterStage');
        this.filterAi = document.getElementById('filterAi');
        this.filterStatus = document.getElementById('filterStatus');
        this.filterSearch = document.getElementById('filterSearch');

        // Colunas Kanban e Zonas
        this.backlogColumn = document.getElementById('backlogColumn');
        this.humanValidationColumn = document.getElementById('humanValidationColumn');
        this.completedColumn = document.getElementById('completedColumn');
        this.colDefinir = document.getElementById('col-Definir');
        this.colDesenvolver = document.getElementById('col-Desenvolver');
        this.colVerificar = document.getElementById('col-Verificar');
        this.colCorrigir = document.getElementById('col-Corrigir');
        this.colValidar = document.getElementById('col-Validar');

        // Badges das colunas
        this.backlogCountBadge = document.getElementById('backlogCountBadge');
        this.humanCountBadge = document.getElementById('humanCountBadge');
        this.completedCountBadge = document.getElementById('completedCountBadge');
        this.badgeDefinir = document.getElementById('badge-Definir');
        this.badgeDesenvolver = document.getElementById('badge-Desenvolver');
        this.badgeVerificar = document.getElementById('badge-Verificar');
        this.badgeCorrigir = document.getElementById('badge-Corrigir');
        this.badgeValidar = document.getElementById('badge-Validar');

        // Dock dos Agentes
        this.btnToggleAgents = document.getElementById('btnToggleAgents');
        this.agentsDockContent = document.getElementById('agentsDockContent');
        this.dockArrow = document.getElementById('dockArrow');
    }

    bindEvents() {
        // Troca de Projeto
        this.projectSelect.addEventListener('change', (e) => {
            this.currentProjectId = e.target.value;
            this.refreshProjectDetails(true);
        });

        // Filtros
        [this.filterFeature, this.filterStage, this.filterAi, this.filterStatus].forEach(el => {
            el.addEventListener('change', () => this.renderBoard());
        });
        this.filterSearch.addEventListener('input', () => this.renderBoard());

        // Toggle Dock de Agentes
        this.btnToggleAgents.addEventListener('click', () => {
            const isCollapsed = this.agentsDockContent.classList.toggle('collapsed');
            this.btnToggleAgents.setAttribute('aria-expanded', !isCollapsed);
            this.dockArrow.textContent = isCollapsed ? '▲' : '▼';
        });
        // Iniciar recolhido no MVP conforme Seção 5
        this.agentsDockContent.classList.add('collapsed');

        // Ações Rápidas
        this.btnNewProject.addEventListener('click', () => this.openModal('modalNewProject'));
        this.btnRenameProject.addEventListener('click', () => {
            if (!this.projectData || this.projectData.project.id !== this.currentProjectId) return;
            this.renameProjectId = this.currentProjectId;
            const input = document.getElementById('renameProjectTitle');
            input.value = this.projectData.project.title;
            this.openModal('modalRenameProject');
            input.focus();
            input.select();
        });
        document.getElementById('formRenameProject').addEventListener('submit', (e) => this.handleRenameProject(e));
        this.btnNewFeature.addEventListener('click', () => this.openModal('modalNewFeature'));
        if (this.btnManageFeatures) {
            this.btnManageFeatures.addEventListener('click', () => this.openManageFeaturesModal());
        }
        this.btnNewTask.addEventListener('click', () => this.prepareNewTaskModal());
        this.btnAddAi.addEventListener('click', () => this.openModal('modalAddAi'));
        this.btnImportDelivery.addEventListener('click', () => this.openModal('modalImportDelivery'));
        this.btnBackup.addEventListener('click', () => this.openModal('modalBackup'));

        // Sincronizar / Conciliar Documentação
        this.btnReconcileDocs.addEventListener('click', () => this.handleReconcileDocs());

        // Submissão de Formulários
        document.getElementById('formNewProject').addEventListener('submit', (e) => this.handleCreateProject(e));
        document.getElementById('formNewFeature').addEventListener('submit', (e) => this.handleCreateFeature(e));
        document.getElementById('formNewTask').addEventListener('submit', (e) => this.handleCreateTask(e));
        document.getElementById('formAddAi').addEventListener('submit', (e) => this.handleAddAi(e));
        document.getElementById('formEditAi').addEventListener('submit', (e) => this.handleEditAi(e));
        document.getElementById('formStartExecution').addEventListener('submit', (e) => this.handleStartExecution(e));

        // Botões de Entrega e Validação
        document.getElementById('btnSubmitImport').addEventListener('click', () => this.handleImportDelivery());
        document.getElementById('btnAcceptDelivery').addEventListener('click', () => this.handleAcceptDelivery());
        document.getElementById('btnRejectDelivery').addEventListener('click', () => this.handleRejectDelivery());
        document.getElementById('btnConfirmDispense').addEventListener('click', () => this.handleDispenseCorrection());
        document.getElementById('btnApproveHuman').addEventListener('click', () => this.handleHumanValidation(true));
        document.getElementById('btnRejectHuman').addEventListener('click', () => this.handleHumanValidation(false));

        // Decisões
        document.getElementById('btnApproveDecision').addEventListener('click', () => this.handleResolveDecision('aprovada'));
        document.getElementById('btnRejectDecision').addEventListener('click', () => this.handleResolveDecision('rejeitada'));

        // Backup
        document.getElementById('btnDownloadBackup').addEventListener('click', () => this.handleDownloadBackup());
        document.getElementById('btnExecuteRestore').addEventListener('click', () => this.handleExecuteRestore());

        // Copiar Prompt
        document.getElementById('btnCopyPrompt').addEventListener('click', () => this.copyPromptToClipboard());

        // Botões de Exclusão do Modal de Detalhes
        const btnModalDelTask = document.getElementById('btnModalDeleteTask');
        if (btnModalDelTask) {
            btnModalDelTask.addEventListener('click', () => {
                if (this.activeDetailTaskId) this.handleDeleteTask(this.activeDetailTaskId);
            });
        }
        const btnModalDelFeat = document.getElementById('btnModalDeleteFeature');
        if (btnModalDelFeat) {
            btnModalDelFeat.addEventListener('click', () => {
                if (this.activeDetailFeatureId) this.handleDeleteFeature(this.activeDetailFeatureId);
            });
        }

        // Fechar modais
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.closeActiveModal());
        });

        // Fechar ao clicar fora ou pressionar ESC
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeActiveModal();
                if (this.tutorialDrawer && this.tutorialDrawer.style.display !== 'none') {
                    this.tutorialDrawer.style.display = 'none';
                    this.clearSpotlight();
                }
            }
        });

        // Abas do Modal de Detalhes
        document.querySelectorAll('.modal-nav-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.modal-nav-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.modal-body .tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const targetPane = document.getElementById(btn.dataset.tab);
                if (targetPane) targetPane.classList.add('active');
            });
        });

        // Configurar Drag and Drop nas colunas e zonas
        this.setupDragAndDrop();
    }

    // ================= MÉTODOS DE API =================

    async api(path, options = {}) {
        options.headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        const response = await fetch(path, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Erro na requisição.');
        }
        return data;
    }

    async loadProjects() {
        try {
            const projects = await this.api('/api/projects');
            this.projectSelect.innerHTML = '';
            this.btnRenameProject.disabled = projects.length === 0;

            if (projects.length === 0) {
                this.projectSelect.innerHTML = '<option value="" disabled selected>Nenhum projeto cadastrado</option>';
                // Verificar se boas-vindas do tutorial foram dispensadas
                try {
                    const pref = await this.api('/api/preferences/tutorial_welcome_dismissed');
                    if (pref.value !== 'true') {
                        this.openModal('modalWelcomeTutorial');
                    } else {
                        this.openModal('modalNewProject');
                    }
                } catch {
                    this.openModal('modalWelcomeTutorial');
                }
                return;
            }

            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.title} (${p.id})`;
                this.projectSelect.appendChild(opt);
            });

            this.currentProjectId = projects[0].id;
            this.projectSelect.value = this.currentProjectId;
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async refreshProjectDetails(fullRender = false) {
        if (!this.currentProjectId) return;
        try {
            this.projectData = await this.api(`/api/projects/${this.currentProjectId}`);
            this.updateHeaderContext();
            this.updateMetrics();
            this.updateAlerts();
            this.updateFilterDropdowns();
            this.renderBoard();
            await this.loadTutorialState();
            await this.checkContextualTips();
        } catch (err) {
            console.error('Erro ao atualizar detalhes do projeto:', err);
        }
    }

    // ================= ATUALIZAÇÃO DA UI =================

    updateHeaderContext() {
        const { project, ais, divergences } = this.projectData;
        this.projectRootPath.textContent = project.root_path;
        this.projectRevision.textContent = `rev. ${project.revision}`;

        // IAs tags
        this.projectAiTags.innerHTML = '';
        ais.forEach(ai => {
            const span = document.createElement('span');
            span.className = 'ai-chip';
            span.textContent = `⚙️ ${ai.name}`;
            span.title = `Clique para configurar o nome e as etapas desta IA (Atualmente: ${JSON.parse(ai.allowed_stages).join(', ')})`;
            span.onclick = () => this.openEditAiModal(ai.id);
            this.projectAiTags.appendChild(span);
        });

        // Indicador de Integridade da Documentação
        if (divergences && divergences.length > 0) {
            this.docIntegrityBadge.className = 'status-badge badge-warning';
            this.docIntegrityBadge.innerHTML = `
                <svg class="badge-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <span class="badge-text">Docs Divergentes (${divergences.length})</span>
            `;
            this.docIntegrityBadge.title = `Edições externas detectadas no disco: ${divergences.map(d => d.fileName).join(', ')}. Clique em 'Sincronizar Docs' para conciliar.`;
        } else {
            this.docIntegrityBadge.className = 'status-badge badge-success';
            this.docIntegrityBadge.innerHTML = `
                <svg class="badge-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span class="badge-text">Docs Sincronizados</span>
            `;
            this.docIntegrityBadge.title = 'Os 4 markdowns em /gestao-ia estão 100% íntegros e consistentes com o banco.';
        }
    }

    updateMetrics() {
        const { tasks, decisions } = this.projectData;
        const prontas = tasks.filter(t => t.status === 'pronta_para_iniciar').length;
        const emExec = tasks.filter(t => t.status === 'em_execucao').length;
        const recebidas = tasks.filter(t => t.status === 'entrega_recebida' || t.status === 'aguardando_conferencia').length;
        const decPending = decisions.filter(d => d.status === 'pendente').length;
        const humano = tasks.filter(t => t.status === 'aguardando_teste_humano').length;
        const bloqueadas = tasks.filter(t => t.status === 'bloqueada').length;

        this.countProntas.textContent = prontas;
        this.countExec.textContent = emExec;
        this.countRecebidas.textContent = recebidas;
        this.countDecisao.textContent = decPending;
        this.countHumano.textContent = humano;
        this.countBloqueadas.textContent = bloqueadas;
    }

    updateAlerts() {
        this.alertsContainer.innerHTML = '';
        const { features, decisions, divergences } = this.projectData;

        // 1. Alerta de Divergência Documental
        if (divergences && divergences.length > 0) {
            const names = divergences.map(d => d.fileName).join(', ');
            this.addAlert('warning', `⚠️ Documentação Divergente: Os arquivos [${names}] foram alterados fora da esteira. Concilie antes de avançar.`);
        }

        // 2. Alerta de Decisões Pendentes
        const pendingDecisions = decisions.filter(d => d.status === 'pendente');
        if (pendingDecisions.length > 0) {
            this.addAlert('warning', `❓ Existem ${pendingDecisions.length} decisão(ões) pendente(s) aguardando deliberação humana.`);
        }

        // 3. Alerta de Funcionalidades Suspensas (Limite de 3 Reprovações)
        const suspendedFeatures = features.filter(f => f.failed_corrections_count >= 3);
        if (suspendedFeatures.length > 0) {
            const list = suspendedFeatures.map(f => `${f.id} (${f.title})`).join(', ');
            this.addAlert('danger', `🚫 Limite de Tentativas Atingido: A(s) funcionalidade(s) [${list}] atingiram 3 rodadas de correção reprovadas e estão suspensas.`);
        }
    }

    addAlert(type, message) {
        const div = document.createElement('div');
        div.className = `persistent-alert alert-${type}`;
        div.innerHTML = `
            <div class="alert-content">
                <span class="alert-text">${this.escapeHtml(message)}</span>
            </div>
        `;
        this.alertsContainer.appendChild(div);
    }

    updateFilterDropdowns() {
        const { features, ais } = this.projectData;

        // Features
        const curFeat = this.filterFeature.value;
        this.filterFeature.innerHTML = '<option value="">Todas as Funcionalidades</option>';
        features.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.id} — ${f.title}`;
            this.filterFeature.appendChild(opt);
        });
        this.filterFeature.value = curFeat;

        // AIs
        const curAi = this.filterAi.value;
        this.filterAi.innerHTML = '<option value="">Todas as IAs</option>';
        ais.forEach(ai => {
            const opt = document.createElement('option');
            opt.value = ai.id;
            opt.textContent = `${ai.name}`;
            this.filterAi.appendChild(opt);
        });
        this.filterAi.value = curAi;
    }

    // ================= RENDERIZAÇÃO DO QUADRO KANBAN =================

    renderBoard() {
        if (!this.projectData) return;

        const { tasks } = this.projectData;
        const featFilter = this.filterFeature.value;
        const stageFilter = this.filterStage.value;
        const aiFilter = this.filterAi.value;
        const statusFilter = this.filterStatus.value;
        const searchFilter = this.filterSearch.value.trim().toLowerCase();

        // Limpar colunas
        this.backlogColumn.innerHTML = '';
        this.colDefinir.innerHTML = '';
        this.colDesenvolver.innerHTML = '';
        this.colVerificar.innerHTML = '';
        this.colCorrigir.innerHTML = '';
        this.colValidar.innerHTML = '';
        this.humanValidationColumn.innerHTML = '';
        this.completedColumn.innerHTML = '';

        // Contadores
        const counts = {
            backlog: 0,
            Definir: 0,
            Desenvolver: 0,
            Verificar: 0,
            Corrigir: 0,
            Validar: 0,
            human: 0,
            completed: 0
        };

        const filteredTasks = tasks.filter(t => {
            if (featFilter && t.feature_id !== featFilter) return false;
            if (stageFilter && t.stage !== stageFilter) return false;
            if (aiFilter && t.assignee_id !== aiFilter) return false;
            if (statusFilter && t.status !== statusFilter) return false;
            if (searchFilter) {
                const text = `${t.id} ${t.title} ${t.description} ${t.feature_title}`.toLowerCase();
                if (!text.includes(searchFilter)) return false;
            }
            return true;
        });

        filteredTasks.forEach(task => {
            const card = this.createTaskCard(task);

            if (task.status === 'concluida') {
                this.completedColumn.appendChild(card);
                counts.completed++;
            } else if (task.status === 'aguardando_teste_humano') {
                this.humanValidationColumn.appendChild(card);
                counts.human++;
            } else if (task.status === 'planejada' && task.stage === 'Definir') {
                this.backlogColumn.appendChild(card);
                counts.backlog++;
            } else {
                // Colunas centrais do Rito
                switch (task.stage) {
                    case 'Definir':
                        this.colDefinir.appendChild(card);
                        counts.Definir++;
                        break;
                    case 'Desenvolver':
                        this.colDesenvolver.appendChild(card);
                        counts.Desenvolver++;
                        break;
                    case 'Verificar':
                        this.colVerificar.appendChild(card);
                        counts.Verificar++;
                        break;
                    case 'Corrigir':
                        this.colCorrigir.appendChild(card);
                        counts.Corrigir++;
                        break;
                    case 'Validar':
                        this.colValidar.appendChild(card);
                        counts.Validar++;
                        break;
                }
            }
        });

        // Atualizar Badges de Contagem
        this.backlogCountBadge.textContent = counts.backlog;
        this.humanCountBadge.textContent = counts.human;
        this.completedCountBadge.textContent = counts.completed;
        this.badgeDefinir.textContent = counts.Definir;
        this.badgeDesenvolver.textContent = counts.Desenvolver;
        this.badgeVerificar.textContent = counts.Verificar;
        this.badgeCorrigir.textContent = counts.Corrigir;
        this.badgeValidar.textContent = counts.Validar;
    }

    createTaskCard(task) {
        const card = document.createElement('article');
        card.className = `task-card card-status-${task.status}`;
        card.draggable = task.status !== 'concluida';
        card.dataset.taskId = task.id;

        // Drag events
        card.addEventListener('dragstart', (e) => {
            this.draggedTaskId = task.id;
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', task.id);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            this.draggedTaskId = null;
        });

        card.addEventListener('click', () => {
            this.openTaskDetails(task.id);
        });

        const statusLabels = {
            planejada: 'Planejada',
            pronta_para_iniciar: 'Pronta p/ Iniciar',
            em_execucao: 'Em Execução',
            entrega_recebida: 'Entrega Recebida',
            aguardando_conferencia: 'Aguard. Conferência',
            aguardando_decisao: 'Aguard. Decisão',
            bloqueada: 'Bloqueada',
            etapa_aceita: 'Etapa Aceita',
            aguardando_teste_humano: 'Aguard. Teste Humano',
            concluida: 'Concluída'
        };

        const feature = this.projectData.features.find(f => f.id === task.feature_id);
        const failedCount = feature ? feature.failed_corrections_count : 0;
        const failedBadgeHtml = failedCount > 0 ? `<span class="card-failed-badge" title="Rodadas de correção reprovadas nesta funcionalidade">${failedCount}x reprovada</span>` : '';

        // Informativo de Próxima Ação Disponível
        let nextActionNoticeHtml = '';
        if (task.status === 'etapa_aceita') {
            const order = ['Definir', 'Desenvolver', 'Verificar', 'Corrigir', 'Validar'];
            const idx = order.indexOf(task.stage);
            const nextStage = (idx >= 0 && idx < order.length - 1) ? order[idx + 1] : task.stage;
            nextActionNoticeHtml = `
                <div class="card-action-notice action-ready">
                    <span class="action-notice-icon">⚡</span>
                    <span class="action-notice-text">Aguarda próxima ação: <strong>Iniciar ${nextStage}</strong></span>
                </div>
            `;
        } else if (task.status === 'entrega_recebida' || task.status === 'aguardando_conferencia') {
            nextActionNoticeHtml = `
                <div class="card-action-notice action-review">
                    <span class="action-notice-icon">📋</span>
                    <span class="action-notice-text">Aguarda próxima ação: <strong>Conferir Entrega</strong></span>
                </div>
            `;
        } else if (task.status === 'aguardando_teste_humano') {
            nextActionNoticeHtml = `
                <div class="card-action-notice action-human">
                    <span class="action-notice-icon">👤</span>
                    <span class="action-notice-text">Aguarda próxima ação: <strong>Teste Humano</strong></span>
                </div>
            `;
        } else if (task.status === 'pronta_para_iniciar' || task.status === 'planejada') {
            nextActionNoticeHtml = `
                <div class="card-action-notice action-start">
                    <span class="action-notice-icon">▶️</span>
                    <span class="action-notice-text">Aguarda próxima ação: <strong>Iniciar ${task.stage}</strong></span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-header-row">
                <span class="card-id">${task.id}</span>
                <div class="card-header-actions">
                    <span class="card-priority prio-${task.priority}">${task.priority}</span>
                    <button type="button" class="btn-card-delete" title="Apagar do quadro" aria-label="Apagar">
                        ✕ Apagar
                    </button>
                </div>
            </div>
            <h3 class="card-title">${this.escapeHtml(task.title)}</h3>
            <div class="card-feature">
                <span>📁</span>
                <span>${task.feature_id} — ${this.escapeHtml(task.feature_title || '')}</span>
            </div>
            <div class="card-meta-row">
                <span class="card-status-pill status-${task.status}">
                    ${statusLabels[task.status] || task.status}
                </span>
                <span class="card-assignee" title="IA Responsável">
                    🤖 ${task.assignee_name || 'Nenhum'}
                </span>
            </div>
            ${nextActionNoticeHtml}
            <div class="card-footer-info">
                <span>Ref: ${task.last_delivery_ref || 'Nenhuma'}</span>
                ${failedBadgeHtml}
            </div>
        `;

        const btnDel = card.querySelector('.btn-card-delete');
        if (btnDel) {
            btnDel.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDeleteCard(task);
            });
        }

        return card;
    }

    // ================= DRAG AND DROP HANDLERS =================

    setupDragAndDrop() {
        const dropzones = document.querySelectorAll('.kanban-dropzone');

        dropzones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const taskId = e.dataTransfer.getData('text/plain') || this.draggedTaskId;
                if (!taskId) return;

                const targetStage = zone.dataset.stage;
                const targetZone = zone.dataset.zone;
                this.handleCardDrop(taskId, targetStage, targetZone);
            });
        });
    }

    handleCardDrop(taskId, targetStage, targetZone) {
        const task = this.projectData.tasks.find(t => t.id === taskId);
        if (!task) return;

        // Não permitir salto direto para concluída
        if (targetZone === 'completed') {
            this.showToast('Transição Proibida: Não é permitido mover diretamente para Concluída sem aprovação explícita no teste humano.', 'danger');
            return;
        }

        // Se soltou na zona de teste humano
        if (targetZone === 'human_validation') {
            if (task.status === 'aguardando_teste_humano') {
                this.openHumanValidationModal(taskId);
            } else {
                this.showToast('A tarefa precisa ter a etapa Validar aprovada tecnicamente antes do teste humano.', 'warning');
            }
            return;
        }

        // Se soltou em uma das 5 colunas do rito
        if (targetStage) {
            // Se já está na mesma etapa, abre ação conforme status
            if (task.stage === targetStage) {
                if (task.status === 'entrega_recebida' || task.status === 'aguardando_conferencia') {
                    this.openReviewDeliveryModal(task.last_delivery_ref);
                } else if (task.status === 'pronta_para_iniciar' || task.status === 'planejada' || task.status === 'etapa_aceita') {
                    this.openStartStageModal(taskId, targetStage);
                } else {
                    this.openTaskDetails(taskId);
                }
                return;
            }

            // Solicitação de mudança de etapa
            this.openStartStageModal(taskId, targetStage);
        }
    }

    // ================= MODAIS E AÇÕES ESPECÍFICAS =================

    openModal(modalId) {
        this.closeActiveModal();
        const modal = document.getElementById(modalId);
        if (modal) {
            if (modalId === 'modalNewFeature') {
                document.getElementById('formNewFeature').reset();
                document.getElementById('featDesc').scrollTop = 0;
            }
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
            this.activeModal = modal;
        }
    }

    closeActiveModal() {
        if (this.activeModal) {
            this.activeModal.classList.remove('open');
            this.activeModal.setAttribute('aria-hidden', 'true');
            this.activeModal = null;
        }
    }

    openTaskDetails(taskId) {
        const task = this.projectData.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.activeDetailTaskId = task.id;
        this.activeDetailFeatureId = task.feature_id;

        const feature = this.projectData.features.find(f => f.id === task.feature_id);

        document.getElementById('detailTaskId').textContent = task.id;
        document.getElementById('detailTaskTitle').textContent = task.title;
        document.getElementById('detailFeatureName').textContent = `${task.feature_id} — ${task.feature_title || ''}`;
        document.getElementById('detailStage').textContent = task.stage;
        document.getElementById('detailStatus').textContent = task.status;
        document.getElementById('detailAssignee').textContent = task.assignee_name || 'Não atribuído';
        document.getElementById('detailLastDelivery').textContent = task.last_delivery_ref || 'Nenhuma';
        document.getElementById('detailFailedCount').textContent = feature ? `${feature.failed_corrections_count} rodada(s)` : '0';
        document.getElementById('detailDescription').textContent = task.description;

        // Próxima Ação e Botões de Ação
        this.renderTaskActionBanner(task);

        // Aba Requisitos
        this.renderTaskRequirements(task);

        // Aba Arquivos Alterados
        this.renderTaskFiles(task);

        // Aba Decisões
        this.renderTaskDecisions(task);

        // Aba Testes e Erros
        this.renderTaskTestsAndErrors(task);

        // Aba Linha do Tempo
        this.renderTaskTimeline(task);

        this.openModal('modalTaskDetails');
    }

    renderTaskActionBanner(task) {
        const bannerText = document.getElementById('detailNextActionText');
        const bannerBtns = document.getElementById('detailActionButtons');
        bannerBtns.innerHTML = '';

        if (task.status === 'concluida') {
            bannerText.textContent = 'Tarefa concluída e aprovada com sucesso.';
            return;
        }

        if (task.status === 'aguardando_teste_humano') {
            bannerText.textContent = 'Validação técnica aceita. Aguardando aprovação explícita do usuário.';
            const btn = document.createElement('button');
            btn.className = 'btn btn-success btn-sm';
            btn.textContent = 'Aprovar / Reprovar Teste Humano';
            btn.onclick = () => this.openHumanValidationModal(task.id);
            bannerBtns.appendChild(btn);
            return;
        }

        if (task.status === 'entrega_recebida' || task.status === 'aguardando_conferencia') {
            bannerText.textContent = `Entrega ${task.last_delivery_ref || ''} recebida. Conferência pendente.`;
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary btn-sm';
            btn.textContent = 'Conferir Entrega';
            btn.onclick = () => this.openReviewDeliveryModal(task.last_delivery_ref);
            bannerBtns.appendChild(btn);
            return;
        }

        if (task.status === 'em_execucao') {
            bannerText.textContent = `Etapa ${task.stage} autorizada em andamento. Copie a instrução se necessário.`;
            const btnPrompt = document.createElement('button');
            btnPrompt.className = 'btn btn-secondary btn-sm';
            btnPrompt.textContent = 'Ver Prompt de Retomada';
            btnPrompt.onclick = () => this.viewTaskPrompt(task.id);
            bannerBtns.appendChild(btnPrompt);
            return;
        }

        if (task.status === 'pronta_para_iniciar' || task.status === 'planejada' || task.status === 'etapa_aceita') {
            let nextStage = task.stage;
            if (task.status === 'etapa_aceita') {
                const order = ['Definir', 'Desenvolver', 'Verificar', 'Corrigir', 'Validar'];
                const idx = order.indexOf(task.stage);
                if (idx >= 0 && idx < order.length - 1) nextStage = order[idx + 1];
            }

            bannerText.textContent = `Próxima ação: Iniciar ${nextStage} manualmente com a IA escolhida.`;

            const btnStart = document.createElement('button');
            btnStart.className = 'btn btn-primary btn-sm';
            btnStart.textContent = `Iniciar ${nextStage}`;
            btnStart.onclick = () => this.openStartStageModal(task.id, nextStage);
            bannerBtns.appendChild(btnStart);

            // Se estiver em Verificar ou Corrigir, permitir dispensar correção
            if (task.stage === 'Verificar' || (task.stage === 'Desenvolver' && task.status === 'etapa_aceita')) {
                const btnDisp = document.createElement('button');
                btnDisp.className = 'btn btn-secondary btn-sm';
                btnDisp.textContent = 'Dispensar Correção';
                btnDisp.onclick = () => this.openDispenseModal(task.id);
                bannerBtns.appendChild(btnDisp);
            }
            return;
        }

        bannerText.textContent = `Situação: ${task.status}. Aguarde liberação ou deliberação humana.`;
    }

    renderTaskRequirements(task) {
        const container = document.getElementById('detailRequirementsList');
        container.innerHTML = '';

        const allReqs = this.projectData.requirements || [];
        const featureReqs = allReqs.filter(r => r.feature_id === task.feature_id);

        const wrapper = document.createElement('div');
        wrapper.className = 'requirements-list-container';

        // Cabeçalho da aba com contador e botão de adicionar
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;';
        headerRow.innerHTML = `
            <div>
                <strong style="font-size: 0.92rem; color: var(--text-primary);">Requisitos da Funcionalidade (${task.feature_id})</strong>
                <p class="form-hint" style="margin: 2px 0 0 0;">Critérios formais de aceitação. Requisitos aprovados liberam o avanço para Desenvolvimento.</p>
            </div>
            <button id="btnToggleNewReqForm" class="btn btn-secondary btn-xs">+ Novo Requisito</button>
        `;
        wrapper.appendChild(headerRow);

        // Formulário colapsável para criar novo requisito
        const formBox = document.createElement('div');
        formBox.id = 'newReqFormContainer';
        formBox.className = 'requirement-new-form';
        formBox.style.display = 'none';
        formBox.innerHTML = `
            <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.6rem; color: var(--text-primary);">Cadastrar Requisito para ${task.feature_id}</div>
            <div class="form-group" style="margin-bottom: 0.5rem;">
                <label style="font-size: 0.78rem;">Título do Requisito:</label>
                <input type="text" id="inputNewReqTitle" class="form-input" placeholder="Ex: Sincronização incremental com banco de dados">
            </div>
            <div class="form-group" style="margin-bottom: 0.5rem;">
                <label style="font-size: 0.78rem;">Descrição:</label>
                <textarea id="inputNewReqDesc" class="form-textarea" rows="2" placeholder="Descreva o comportamento técnico esperado..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0.5rem;">
                <label style="font-size: 0.78rem;">Critérios de Aceite (um por linha):</label>
                <textarea id="inputNewReqCriteria" class="form-textarea" rows="2" placeholder="Ex: Persistir registros novos&#10;Atualizar existentes"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label class="checkbox-label" style="font-size: 0.8rem;">
                    <input type="checkbox" id="checkNewReqApprove" checked>
                    <span>Aprovar imediatamente pelo usuário (libera desenvolvimento)</span>
                </label>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button id="btnSaveNewReq" class="btn btn-primary btn-sm">Salvar Requisito</button>
                <button id="btnCancelNewReq" class="btn btn-secondary btn-sm">Cancelar</button>
            </div>
        `;
        wrapper.appendChild(formBox);

        // Se houver requisitos cadastrados
        if (featureReqs.length > 0) {
            featureReqs.forEach(req => {
                let criteria = [];
                try { criteria = JSON.parse(req.acceptance_criteria); } catch {}

                const card = document.createElement('div');
                card.className = 'requirement-card';
                card.innerHTML = `
                    <div class="requirement-card-header">
                        <div class="requirement-id-group">
                            <span class="requirement-id-badge">${req.id}</span>
                            <span class="requirement-title">${this.escapeHtml(req.title)}</span>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">(v${req.version})</span>
                        </div>
                        <div>
                            ${req.human_approved === 1 
                                ? '<span class="requirement-status-badge requirement-status-approved">✅ Aprovado pelo Usuário</span>' 
                                : `
                                    <span class="requirement-status-badge requirement-status-pending">⏳ Aguardando Aprovação</span>
                                    <button class="btn btn-primary btn-xs btn-approve-req" data-req-id="${req.id}" style="margin-left: 0.4rem;">Aprovar Agora</button>
                                `
                            }
                        </div>
                    </div>
                    <div class="requirement-desc">${this.escapeHtml(req.description || 'Sem descrição cadastrada.')}</div>
                    ${criteria.length > 0 ? `
                        <div class="requirement-criteria-box">
                            <div class="requirement-criteria-title">Critérios de Aceitação:</div>
                            <ul class="requirement-criteria-list">
                                ${criteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                `;
                wrapper.appendChild(card);
            });
        } else {
            // Se NÃO houver requisitos ainda
            const emptyBox = document.createElement('div');
            emptyBox.className = 'requirement-empty-box';

            // Verificar se há entregas da tarefa
            const taskDeliveries = (this.projectData.deliveries || []).filter(d => d.task_id === task.id);
            const pendingDelivery = taskDeliveries.find(d => d.result === 'pendente');

            emptyBox.innerHTML = `
                <div class="requirement-empty-title">Nenhum requisito formal cadastrado para ${task.feature_id}</div>
                <div class="requirement-empty-desc">
                    A etapa <strong>Definir</strong> tem como missão oficial levantar os requisitos técnicos e critérios de aceite.
                    ${pendingDelivery ? `
                        <br><br>
                        <strong>Existe uma entrega pendente de conferência (${pendingDelivery.id})</strong> realizada para esta tarefa!
                        Ao aprovar a entrega na Conferência Humana, os requisitos podem ser consolidados para liberar a etapa de Desenvolvimento.
                    ` : 'Você pode cadastrar requisitos manualmente pelo botão acima ou solicitar à IA que levante as especificações na etapa Definir.'}
                </div>
                ${pendingDelivery ? `
                    <button class="btn btn-primary btn-sm btn-open-review-from-req" data-deliv-id="${pendingDelivery.id}">
                        Conferir Entrega ${pendingDelivery.id} Agora
                    </button>
                ` : `
                    <button class="btn btn-secondary btn-sm" id="btnEmptyCreateReq">
                        + Cadastrar Primeiro Requisito
                    </button>
                `}
            `;
            wrapper.appendChild(emptyBox);

            const btnEmptyCreate = emptyBox.querySelector('#btnEmptyCreateReq');
            if (btnEmptyCreate) {
                btnEmptyCreate.onclick = () => {
                    const btnT = wrapper.querySelector('#btnToggleNewReqForm');
                    if (btnT) btnT.click();
                };
            }
        }

        container.appendChild(wrapper);

        // Bind eventos do formulário
        const btnToggle = wrapper.querySelector('#btnToggleNewReqForm');
        const btnCancel = wrapper.querySelector('#btnCancelNewReq');
        const btnSave = wrapper.querySelector('#btnSaveNewReq');

        if (btnToggle) {
            btnToggle.onclick = () => {
                const isHidden = formBox.style.display === 'none';
                formBox.style.display = isHidden ? 'block' : 'none';
                btnToggle.textContent = isHidden ? 'Ocultar Formulário' : '+ Novo Requisito';
            };
        }
        if (btnCancel) {
            btnCancel.onclick = () => {
                formBox.style.display = 'none';
                if (btnToggle) btnToggle.textContent = '+ Novo Requisito';
            };
        }
        if (btnSave) {
            btnSave.onclick = () => this.handleSaveRequirement(task);
        }

        // Binds de botões de aprovar requisito
        wrapper.querySelectorAll('.btn-approve-req').forEach(btn => {
            btn.onclick = () => this.handleApproveRequirement(btn.dataset.reqId, task);
        });

        // Bind de abrir conferência a partir da aba de requisitos
        const btnRev = wrapper.querySelector('.btn-open-review-from-req');
        if (btnRev) {
            btnRev.onclick = () => {
                this.closeActiveModal();
                this.openReviewDeliveryModal(btnRev.dataset.delivId);
            };
        }
    }

    async handleSaveRequirement(task) {
        const title = document.getElementById('inputNewReqTitle').value.trim();
        const desc = document.getElementById('inputNewReqDesc').value.trim();
        const critText = document.getElementById('inputNewReqCriteria').value.trim();
        const approved = document.getElementById('checkNewReqApprove').checked;

        if (!title) {
            this.showToast('Informe o título do requisito.', 'warning');
            return;
        }

        const criteria = critText ? critText.split('\n').map(s => s.trim()).filter(Boolean) : [];

        try {
            await this.api(`/api/features/${task.feature_id}/requirements`, {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    description: desc,
                    acceptance_criteria: criteria,
                    human_approved: approved ? 1 : 0
                })
            });

            this.showToast('Requisito cadastrado com sucesso!', 'success');
            await this.refreshProjectDetails(false);
            const updatedTask = (this.projectData.tasks || []).find(t => t.id === task.id) || task;
            this.renderTaskRequirements(updatedTask);
        } catch (err) {
            this.showToast(`Erro ao salvar requisito: ${err.message}`, 'danger');
        }
    }

    async handleApproveRequirement(reqId, task) {
        try {
            await this.api(`/api/requirements/${reqId}/approve`, { method: 'POST' });
            this.showToast(`Requisito ${reqId} aprovado pelo usuário com sucesso!`, 'success');
            await this.refreshProjectDetails(false);
            const updatedTask = (this.projectData.tasks || []).find(t => t.id === task.id) || task;
            this.renderTaskRequirements(updatedTask);
        } catch (err) {
            this.showToast(`Erro ao aprovar requisito: ${err.message}`, 'danger');
        }
    }

    renderTaskFiles(task) {
        const container = document.getElementById('detailFilesList');
        container.innerHTML = '';

        const deliveries = (this.projectData.deliveries || []).filter(d => d.task_id === task.id);
        if (deliveries.length === 0) {
            container.innerHTML = '<p class="form-hint">Nenhuma entrega realizada até o momento.</p>';
            return;
        }

        deliveries.forEach(deliv => {
            let payload = {};
            try { payload = JSON.parse(deliv.payload); } catch {}
            const files = payload.files || [];

            const card = document.createElement('div');
            card.className = 'prompt-box';
            card.style.marginBottom = '0.75rem';
            card.innerHTML = `
                <div class="prompt-box-header">
                    <span>${deliv.id} — Etapa: ${payload.stage || 'N/A'} (Situação: ${deliv.result})</span>
                    <span>${new Date(deliv.created_at).toLocaleString()}</span>
                </div>
                <div>
                    ${files.length === 0 ? '<small>Nenhum arquivo modificado declarado.</small>' : ''}
                    ${files.map(f => `
                        <div style="font-family: var(--font-mono); font-size: 0.78rem; padding: 2px 0;">
                            <strong>[${f.operation.toUpperCase()}]</strong> ${this.escapeHtml(f.path)} — <em>${this.escapeHtml(f.description || '')}</em>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(card);
        });
    }

    renderTaskDecisions(task) {
        const container = document.getElementById('detailDecisionsList');
        container.innerHTML = '';

        const decisions = (this.projectData.decisions || []).filter(d => d.task_id === task.id || d.feature_id === task.feature_id);
        if (decisions.length === 0) {
            container.innerHTML = '<p class="form-hint">Nenhuma decisão registrada vinculada a esta tarefa/funcionalidade.</p>';
            return;
        }

        decisions.forEach(dec => {
            const div = document.createElement('div');
            div.className = 'prompt-box';
            div.style.marginBottom = '0.75rem';
            div.innerHTML = `
                <div class="prompt-box-header">
                    <span>${dec.id} — ${this.escapeHtml(dec.title)}</span>
                    <span class="status-chip status-${dec.status}">${dec.status.toUpperCase()}</span>
                </div>
                <p style="font-size: 0.8rem; margin: 0.4rem 0;">${this.escapeHtml(dec.description)}</p>
                <small style="color: var(--text-muted);">Impacto: ${this.escapeHtml(dec.impact)}</small>
                ${dec.human_response ? `<div style="margin-top: 0.4rem; padding: 0.4rem; background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); font-size: 0.75rem;"><strong>Resposta Humana:</strong> ${this.escapeHtml(dec.human_response)}</div>` : ''}
                ${dec.status === 'pendente' ? `<button class="btn btn-primary btn-xs" style="margin-top: 0.5rem;" onclick="window.esteiraApp.openResolveDecisionModal('${dec.id}')">Deliberar Decisão</button>` : ''}
            `;
            container.appendChild(div);
        });
    }

    renderTaskTestsAndErrors(task) {
        const testsContainer = document.getElementById('detailTestsList');
        const errorsContainer = document.getElementById('detailErrorsList');
        testsContainer.innerHTML = '';
        errorsContainer.innerHTML = '';

        const errors = (this.projectData.errors || []).filter(e => e.task_id === task.id || e.feature_id === task.feature_id);
        if (errors.length === 0) {
            errorsContainer.innerHTML = '<p class="form-hint">Nenhum erro registrado.</p>';
        } else {
            errors.forEach(err => {
                const div = document.createElement('div');
                div.className = 'persistent-alert alert-danger';
                div.style.marginBottom = '0.5rem';
                div.innerHTML = `
                    <div>
                        <strong>${err.id} — ${this.escapeHtml(err.title)}</strong> (Gravidade: ${err.severity})
                        <p style="font-size: 0.78rem; margin-top: 0.2rem;">${this.escapeHtml(err.description)}</p>
                        <small style="color: var(--text-muted);">Passos: ${this.escapeHtml(err.reproduction_steps)}</small>
                    </div>
                `;
                errorsContainer.appendChild(div);
            });
        }

        testsContainer.innerHTML = '<p class="form-hint">Testes registrados em Validação.md e entregas da esteira.</p>';
    }

    renderTaskTimeline(task) {
        const container = document.getElementById('detailTimelineList');
        container.innerHTML = '';

        const events = (this.projectData.events || []).filter(ev => {
            let links = {};
            try { links = JSON.parse(ev.links); } catch {}
            return links.task_id === task.id;
        });

        if (events.length === 0) {
            container.innerHTML = '<p class="form-hint">Nenhum evento registrado especificamente para esta tarefa.</p>';
            return;
        }

        events.forEach(ev => {
            const div = document.createElement('div');
            div.style.padding = '0.5rem 0';
            div.style.borderBottom = '1px solid var(--border-color)';
            div.style.fontSize = '0.78rem';
            div.innerHTML = `
                <div><strong>[${ev.type}]</strong> por <em>${ev.author}</em> em ${new Date(ev.created_at).toLocaleString()}</div>
                <div style="color: var(--text-secondary);">${this.escapeHtml(ev.details || '')}</div>
            `;
            container.appendChild(div);
        });
    }

    // ================= MODAL INICIAR ETAPA =================

    openStartStageModal(taskId, suggestedStage) {
        const task = this.projectData.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('startTaskId').value = taskId;
        const stageSelect = document.getElementById('startStageSelect');
        const currentStage = suggestedStage || task.stage;
        stageSelect.value = currentStage;

        this.populateStageActors(currentStage);

        // Atualizar escopo padrão
        document.getElementById('startScopeInput').value = `Execução autorizada da etapa ${currentStage} para a tarefa ${task.title}`;
        document.getElementById('startResourcesInput').value = '';
        document.getElementById('generatedPromptBox').style.display = 'none';

        // Listeners para sincronizar quando o usuário trocar a etapa ou a IA
        stageSelect.onchange = () => {
            const st = stageSelect.value;
            this.populateStageActors(st);
            document.getElementById('startScopeInput').value = `Execução autorizada da etapa ${st} para a tarefa ${task.title}`;
        };

        const actorSelect = document.getElementById('startActorSelect');
        actorSelect.onchange = () => {
            this.checkActorStagePermission(stageSelect.value, actorSelect.value);
        };

        this.openModal('modalStartStage');
    }

    populateStageActors(stage) {
        const actorSelect = document.getElementById('startActorSelect');
        actorSelect.innerHTML = '';

        let compatibleActorId = null;

        (this.projectData.ais || []).forEach(ai => {
            let stages = [];
            try { stages = JSON.parse(ai.allowed_stages); } catch {}
            const isAllowed = stages.includes(stage);

            const opt = document.createElement('option');
            opt.value = ai.id;
            opt.textContent = isAllowed 
                ? `✅ ${ai.name} (${ai.id}) — [Autorizada para ${stage}]`
                : `⚠️ ${ai.name} (${ai.id}) — [Permitida apenas: ${stages.join(', ')}]`;
            
            if (isAllowed && !compatibleActorId) {
                compatibleActorId = ai.id;
            }
            actorSelect.appendChild(opt);
        });

        if (compatibleActorId) {
            actorSelect.value = compatibleActorId;
        }

        this.checkActorStagePermission(stage, actorSelect.value);
    }

    checkActorStagePermission(stage, actorId) {
        const banner = document.getElementById('actorPermissionBanner');
        const text = document.getElementById('actorPermissionText');
        const btnAuth = document.getElementById('btnAuthorizeActorStage');

        if (!banner || !actorId) return;

        const ai = (this.projectData.ais || []).find(a => a.id === actorId);
        if (!ai) {
            banner.style.display = 'none';
            return;
        }

        let stages = [];
        try { stages = JSON.parse(ai.allowed_stages); } catch {}

        if (stages.includes(stage)) {
            banner.style.display = 'none';
        } else {
            banner.style.display = 'block';
            text.innerHTML = `⚠️ <strong>${this.escapeHtml(ai.name)}</strong> está autorizada no momento apenas para: <em>${stages.join(', ')}</em>.`;
            btnAuth.textContent = `Habilitar ${ai.name} para a etapa ${stage} também`;
            btnAuth.onclick = async () => {
                try {
                    const newStages = Array.from(new Set([...stages, stage]));
                    await this.api(`/api/ais/${ai.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ allowed_stages: newStages })
                    });
                    this.showToast(`IA ${ai.name} autorizada para a etapa ${stage}!`, 'success');
                    await this.refreshProjectDetails(false);
                    this.populateStageActors(stage);
                    const sel = document.getElementById('startActorSelect');
                    if (sel) sel.value = ai.id;
                    this.checkActorStagePermission(stage, ai.id);
                } catch (err) {
                    this.showToast(`Erro ao atualizar permissão: ${err.message}`, 'danger');
                }
            };
        }
    }

    async handleStartExecution(e) {
        e.preventDefault();
        const taskId = document.getElementById('startTaskId').value;
        const stage = document.getElementById('startStageSelect').value;
        const actorId = document.getElementById('startActorSelect').value;
        const scope = document.getElementById('startScopeInput').value;
        const rawRes = document.getElementById('startResourcesInput').value;

        const reservedResources = rawRes ? rawRes.split(',').map(r => r.trim()).filter(Boolean) : [];

        try {
            const exec = await this.api(`/api/tasks/${taskId}/start`, {
                method: 'POST',
                body: JSON.stringify({
                    actor_id: actorId,
                    stage,
                    scope,
                    reserved_resources: reservedResources
                })
            });

            // Gerar Prompt Oficial para Cópia
            const promptData = await this.api(`/api/executions/${exec.executionId}/prompt`);
            document.getElementById('promptTextContent').textContent = promptData.promptText;
            document.getElementById('generatedPromptBox').style.display = 'block';

            this.showToast(`Execução ${exec.executionId} iniciada com sucesso. Copie o prompt abaixo!`, 'success');
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async viewTaskPrompt(taskId) {
        const exec = (this.projectData.executions || []).find(ex => ex.task_id === taskId && ex.status === 'ativa');
        if (!exec) {
            this.showToast('Nenhuma execução ativa encontrada para gerar o prompt.', 'warning');
            return;
        }

        try {
            const promptData = await this.api(`/api/executions/${exec.id}/prompt`);
            document.getElementById('promptTextContent').textContent = promptData.promptText;
            document.getElementById('generatedPromptBox').style.display = 'block';
            this.openModal('modalStartStage');
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    copyPromptToClipboard() {
        const text = document.getElementById('promptTextContent').textContent;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Prompt copiado para a área de transferência!', 'success');
        }).catch(() => {
            this.showToast('Erro ao copiar prompt.', 'danger');
        });
    }

    // ================= CONFERÊNCIA E ACEITE DE ENTREGA =================

    formatInlineMarkdown(text) {
        if (!text) return '';
        let str = '';
        if (typeof text === 'object') {
            str = text.description || text.title || text.name || text.summary || text.path || JSON.stringify(text);
        } else {
            str = String(text);
        }
        let safe = this.escapeHtml(str);
        safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
        safe = safe.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        return safe;
    }

    formatMarkdownContent(raw) {
        if (!raw) return '<p class="delivery-doc-p" style="color: var(--text-muted); font-style: italic;">Nenhum detalhe informado.</p>';
        
        let text = '';
        if (typeof raw === 'string') {
            text = raw;
        } else if (Array.isArray(raw)) {
            text = raw.map(item => {
                if (typeof item === 'object' && item !== null) {
                    return item.description || item.title || item.name || JSON.stringify(item);
                }
                return String(item);
            }).map(i => `- ${i}`).join('\n');
        } else if (typeof raw === 'object' && raw !== null) {
            const parts = [];
            if (raw.summary) parts.push(`### Resumo\n${raw.summary}`);
            if (raw.user_decisions && Array.isArray(raw.user_decisions)) {
                parts.push(`### Decisões do Usuário\n` + raw.user_decisions.map(d => `- ${d}`).join('\n'));
            }
            if (raw.pending && Array.isArray(raw.pending)) {
                parts.push(`### Itens Pendentes\n` + raw.pending.map(p => `- ${p}`).join('\n'));
            }
            if (raw.prior_attempts && Array.isArray(raw.prior_attempts)) {
                parts.push(`### Tentativas Anteriores\n` + raw.prior_attempts.map(a => `- ${a}`).join('\n'));
            }
            for (const [k, v] of Object.entries(raw)) {
                if (!['summary', 'user_decisions', 'pending', 'prior_attempts'].includes(k)) {
                    if (typeof v === 'string') {
                        parts.push(`- **${k}**: ${v}`);
                    } else if (typeof v === 'boolean') {
                        parts.push(`- **${k}**: ${v ? 'Sim' : 'Não'}`);
                    } else if (Array.isArray(v)) {
                        parts.push(`### ${k}\n` + v.map(vi => `- ${typeof vi === 'object' ? JSON.stringify(vi) : vi}`).join('\n'));
                    }
                }
            }
            text = parts.length > 0 ? parts.join('\n\n') : JSON.stringify(raw, null, 2);
        } else {
            text = String(raw);
        }

        const lines = text.replace(/\r\n/g, '\n').split('\n');
        let html = '';
        let inList = false;
        let listType = ''; // 'ul' | 'ol'
        let inCodeBlock = false;
        let codeBuffer = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Bloco de código ```
            if (line.trim().startsWith('```')) {
                if (inCodeBlock) {
                    html += `<pre class="code-block"><code>${this.escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
                    codeBuffer = [];
                    inCodeBlock = false;
                } else {
                    if (inList) {
                        html += `</${listType}>`;
                        inList = false;
                    }
                    inCodeBlock = true;
                }
                continue;
            }

            if (inCodeBlock) {
                codeBuffer.push(line);
                continue;
            }

            const trimmed = line.trim();

            if (!trimmed) {
                if (inList) {
                    html += `</${listType}>`;
                    inList = false;
                }
                continue;
            }

            // Cabeçalhos Markdown
            if (trimmed.startsWith('### ')) {
                if (inList) { html += `</${listType}>`; inList = false; }
                html += `<h5 class="delivery-doc-h3">${this.formatInlineMarkdown(trimmed.substring(4))}</h5>`;
                continue;
            }
            if (trimmed.startsWith('## ')) {
                if (inList) { html += `</${listType}>`; inList = false; }
                html += `<h4 class="delivery-doc-h2">${this.formatInlineMarkdown(trimmed.substring(3))}</h4>`;
                continue;
            }
            if (trimmed.startsWith('# ')) {
                if (inList) { html += `</${listType}>`; inList = false; }
                html += `<h3 class="delivery-doc-h1">${this.formatInlineMarkdown(trimmed.substring(2))}</h3>`;
                continue;
            }

            // Listas não ordenadas (- ou * ou •)
            const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
            if (ulMatch) {
                if (!inList || listType !== 'ul') {
                    if (inList) html += `</${listType}>`;
                    html += '<ul class="delivery-doc-list">';
                    inList = true;
                    listType = 'ul';
                }
                html += `<li>${this.formatInlineMarkdown(ulMatch[1])}</li>`;
                continue;
            }

            // Listas ordenadas (1. ou 1))
            const olMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
            if (olMatch) {
                if (!inList || listType !== 'ol') {
                    if (inList) html += `</${listType}>`;
                    html += '<ol class="delivery-doc-list">';
                    inList = true;
                    listType = 'ol';
                }
                html += `<li>${this.formatInlineMarkdown(olMatch[2])}</li>`;
                continue;
            }

            // Parágrafo comum
            if (inList) {
                html += `</${listType}>`;
                inList = false;
            }
            html += `<p class="delivery-doc-p">${this.formatInlineMarkdown(trimmed)}</p>`;
        }

        if (inList) html += `</${listType}>`;
        if (inCodeBlock && codeBuffer.length > 0) {
            html += `<pre class="code-block"><code>${this.escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
        }

        return html;
    }

    openReviewDeliveryModal(deliveryId) {
        try {
            const deliv = (this.projectData.deliveries || []).find(d => d.id === deliveryId);
            if (!deliv) {
                this.showToast(`Entrega ${deliveryId} não encontrada.`, 'warning');
                return;
            }

            let payload = {};
            try { payload = JSON.parse(deliv.payload); } catch {}

            const box = document.getElementById('reviewDeliverySummary');
            box.innerHTML = `
                <div class="delivery-meta-card">
                    <div class="delivery-meta-item">
                        <span class="delivery-meta-label">ID da Entrega</span>
                        <span class="delivery-meta-val"><strong>${deliv.id}</strong></span>
                    </div>
                    <div class="delivery-meta-item">
                        <span class="delivery-meta-label">Submissão</span>
                        <span class="delivery-meta-val"><code>${deliv.submission_id}</code></span>
                    </div>
                    <div class="delivery-meta-item">
                        <span class="delivery-meta-label">Etapa do Rito</span>
                        <span class="delivery-meta-val"><span class="badge stage-${(payload.stage || 'definir').toLowerCase()}">${payload.stage || 'N/A'}</span></span>
                    </div>
                    <div class="delivery-meta-item">
                        <span class="delivery-meta-label">IA Responsável</span>
                        <span class="delivery-meta-val">${payload.actor_id || 'N/A'}</span>
                    </div>
                    <div class="delivery-meta-item">
                        <span class="delivery-meta-label">Revisão Base</span>
                        <span class="delivery-meta-val">Rev. ${payload.base_revision || 1}</span>
                    </div>
                </div>

                <div class="delivery-section-box">
                    <div class="delivery-section-header">
                        <span class="delivery-section-title">📌 Título da Entrega</span>
                    </div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">
                        ${this.escapeHtml(payload.title || 'Sem título declarado')}
                    </div>
                </div>

                <div class="delivery-section-box">
                    <div class="delivery-section-header">
                        <span class="delivery-section-title">📝 Descrição e Especificação da IA</span>
                    </div>
                    <div class="delivery-doc-view">
                        ${this.formatMarkdownContent(payload.description)}
                    </div>
                </div>

                ${(payload.logic_changes && payload.logic_changes.length > 0) ? `
                    <div class="delivery-section-box">
                        <div class="delivery-section-header">
                            <span class="delivery-section-title">🧠 Decisões de Lógica e Implementação (${payload.logic_changes.length})</span>
                        </div>
                        <ul class="delivery-doc-list" style="margin: 0; padding-left: 1.25rem;">
                            ${payload.logic_changes.map(ch => {
                                const typeBadge = (typeof ch === 'object' && ch.type) ? `<code>[${this.escapeHtml(ch.type)}]</code> ` : '';
                                const desc = (typeof ch === 'object' && ch !== null) ? (ch.description || JSON.stringify(ch)) : String(ch);
                                return `<li>${typeBadge}${this.formatInlineMarkdown(desc)}</li>`;
                            }).join('')}
                        </ul>
                    </div>
                ` : ''}

                <div class="delivery-section-box">
                    <div class="delivery-section-header">
                        <span class="delivery-section-title">📂 Arquivos Declarados (${(payload.files || []).length})</span>
                    </div>
                    ${(payload.files || []).length === 0 
                        ? '<p class="form-hint" style="margin: 0;">Nenhum arquivo modificado ou criado declarado nesta entrega.</p>' 
                        : `
                            <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                                ${(payload.files || []).map(f => `
                                    <div style="display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.82rem; font-family: var(--font-mono); background: var(--bg-surface); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                        <span style="font-weight: 700; color: var(--text-primary); text-transform: uppercase;">[${this.escapeHtml(f.operation || 'MOD')}]</span>
                                        <span style="color: var(--text-primary); font-weight: 600;">${this.escapeHtml(f.path)}</span>
                                        ${f.description ? `<span style="color: var(--text-muted); font-family: var(--font-sans); font-size: 0.78rem;">— ${this.escapeHtml(f.description)}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        `
                    }
                </div>

                ${(payload.tests && payload.tests.length > 0) ? `
                    <div class="delivery-section-box">
                        <div class="delivery-section-header">
                            <span class="delivery-section-title">🧪 Testes e Validações (${payload.tests.length})</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                            ${payload.tests.map(t => {
                                const testId = t.test_id || 'TST';
                                const testName = t.title || t.name || '';
                                const detail = t.command || t.evidence || t.reason || '';
                                const isPassed = (t.status === 'passed');
                                return `
                                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; background: var(--bg-surface); padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                        <div>
                                            <strong>${this.escapeHtml(testId)}</strong>: ${this.escapeHtml(testName)}
                                            ${detail ? `<br><small style="font-family: var(--font-mono); color: var(--text-muted);">${this.escapeHtml(detail)}</small>` : ''}
                                        </div>
                                        <span class="badge ${isPassed ? 'badge-success' : 'badge-secondary'}">${this.escapeHtml((t.status || 'unknown').toUpperCase())}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${(payload.errors && payload.errors.length > 0) ? `
                    <div class="delivery-section-box">
                        <div class="delivery-section-header">
                            <span class="delivery-section-title">⚠️ Erros e Inconformidades (${payload.errors.length})</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                            ${payload.errors.map(err => `
                                <div style="font-size: 0.82rem; background: var(--bg-surface); padding: 0.45rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                    <div style="display: flex; align-items: center; justify-content: space-between;">
                                        <strong>${this.escapeHtml(err.error_id || 'ERR')}</strong>
                                        <span class="badge ${err.status === 'corrected' ? 'badge-success' : 'badge-warning'}">${this.escapeHtml((err.status || 'pendente').toUpperCase())}</span>
                                    </div>
                                    <p style="margin: 0.25rem 0 0 0; color: var(--text-primary);">${this.escapeHtml(err.description || '')}</p>
                                    ${err.resolution ? `<small style="color: var(--text-muted);">Resolução: ${this.escapeHtml(err.resolution)}</small>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${payload.handoff_notes ? `
                    <div class="delivery-section-box">
                        <div class="delivery-section-header">
                            <span class="delivery-section-title">🤝 Orientações de Handoff (Próxima Ação)</span>
                        </div>
                        <div class="delivery-doc-view">
                            ${this.formatMarkdownContent(payload.handoff_notes)}
                        </div>
                    </div>
                ` : ''}
            `;

            box.dataset.deliveryId = deliv.id;
            document.getElementById('reviewNotesInput').value = '';
            this.openModal('modalReviewDelivery');
        } catch (err) {
            console.error('Erro ao abrir conferência da entrega:', err);
            this.showToast(`Erro ao carregar entrega: ${err.message}`, 'danger');
        }
    }

    async handleAcceptDelivery() {
        const delivId = document.getElementById('reviewDeliverySummary').dataset.deliveryId;
        const notes = document.getElementById('reviewNotesInput').value;

        try {
            const res = await this.api(`/api/deliveries/${delivId}/accept`, {
                method: 'POST',
                body: JSON.stringify({ review_notes: notes })
            });

            this.showToast(`Entrega ${delivId} aceita! Documentação atualizada para revisão ${res.newRevision}.`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async handleRejectDelivery() {
        const delivId = document.getElementById('reviewDeliverySummary').dataset.deliveryId;
        const notes = document.getElementById('reviewNotesInput').value;

        if (!notes || notes.trim().length < 5) {
            this.showToast('Informe o motivo da rejeição da entrega.', 'warning');
            return;
        }

        try {
            const res = await this.api(`/api/deliveries/${delivId}/reject`, {
                method: 'POST',
                body: JSON.stringify({ reason: notes })
            });

            this.showToast(`Entrega ${delivId} rejeitada. Rodadas reprovadas: ${res.failedCorrectionsCount}.`, 'warning');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= DISPENSA DE CORREÇÃO =================

    openDispenseModal(taskId) {
        document.getElementById('modalDispenseCorrection').dataset.taskId = taskId;
        document.getElementById('dispenseJustification').value = '';
        this.openModal('modalDispenseCorrection');
    }

    async handleDispenseCorrection() {
        const taskId = document.getElementById('modalDispenseCorrection').dataset.taskId;
        const justification = document.getElementById('dispenseJustification').value;

        if (!justification || justification.trim().length < 10) {
            this.showToast('A justificativa deve conter no mínimo 10 caracteres.', 'warning');
            return;
        }

        try {
            await this.api(`/api/tasks/${taskId}/dispense-correction`, {
                method: 'POST',
                body: JSON.stringify({ justification })
            });

            this.showToast(`Correção dispensada formalmente. Tarefa avançou para Validar.`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= VALIDAÇÃO HUMANA FINAL =================

    openHumanValidationModal(taskId) {
        document.getElementById('modalHumanValidation').dataset.taskId = taskId;
        document.getElementById('humanFeedback').value = '';
        document.getElementById('chkRequirementChange').checked = false;
        this.openModal('modalHumanValidation');
    }

    async handleHumanValidation(approved) {
        const taskId = document.getElementById('modalHumanValidation').dataset.taskId;
        const feedback = document.getElementById('humanFeedback').value;
        const isReqChange = document.getElementById('chkRequirementChange').checked;

        try {
            const res = await this.api(`/api/tasks/${taskId}/human-validation`, {
                method: 'POST',
                body: JSON.stringify({
                    approved,
                    feedback,
                    is_requirement_change: isReqChange
                })
            });

            if (approved) {
                this.showToast(`Tarefa ${taskId} aprovada e concluída com sucesso!`, 'success');
            } else {
                this.showToast(`Tarefa reprovada e retornada para ${res.returnedToStage}.`, 'warning');
            }

            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= DECISÕES HUMANAS =================

    openResolveDecisionModal(decisionId) {
        const dec = (this.projectData.decisions || []).find(d => d.id === decisionId);
        if (!dec) return;

        const box = document.getElementById('decisionDetailsBox');
        let alts = [];
        try { alts = JSON.parse(dec.alternatives); } catch {}

        box.innerHTML = `
            <strong>Decisão:</strong> ${dec.id} — ${this.escapeHtml(dec.title)}
            <p style="font-size: 0.82rem; margin: 0.4rem 0;">${this.escapeHtml(dec.description)}</p>
            <small style="color: var(--text-muted);">Impacto: ${this.escapeHtml(dec.impact)}</small>
            ${alts.length > 0 ? `<ul style="padding-left: 1.25rem; font-size: 0.78rem; margin-top: 0.4rem;">${alts.map(a => `<li>${this.escapeHtml(a)}</li>`).join('')}</ul>` : ''}
        `;

        box.dataset.decisionId = dec.id;
        document.getElementById('decisionResponseInput').value = '';
        this.openModal('modalResolveDecision');
    }

    async handleResolveDecision(status) {
        const decId = document.getElementById('decisionDetailsBox').dataset.decisionId;
        const responseText = document.getElementById('decisionResponseInput').value;

        if (!responseText || responseText.trim().length < 5) {
            this.showToast('Informe a deliberação e a justificativa da decisão.', 'warning');
            return;
        }

        try {
            await this.api(`/api/decisions/${decId}/resolve`, {
                method: 'POST',
                body: JSON.stringify({ response: responseText, status })
            });

            this.showToast(`Decisão ${decId} ${status} com sucesso!`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= IMPORTAÇÃO MANUAL DE ENTREGA =================

    async handleImportDelivery() {
        const fileInput = document.getElementById('importJsonFile');
        const textInput = document.getElementById('importJsonText');

        let jsonPayload = null;

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const text = await file.text();
            jsonPayload = text;
        } else if (textInput.value.trim()) {
            jsonPayload = textInput.value.trim();
        } else {
            this.showToast('Selecione um arquivo .json ou cole o JSON no campo de texto.', 'warning');
            return;
        }

        try {
            const res = await this.api('/api/deliveries/import', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: jsonPayload
            });

            this.showToast(res.message || `Entrega importada com sucesso: ${res.deliveryId}`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(`Falha na importação: ${err.message}`, 'danger');
        }
    }

    // ================= CONCILIAÇÃO DE DOCUMENTAÇÃO =================

    async handleReconcileDocs() {
        if (!this.currentProjectId) return;
        try {
            await this.api(`/api/projects/${this.currentProjectId}/reconcile`, { method: 'POST' });
            this.showToast('Documentos em /gestao-ia regenerados e sincronizados com sucesso!', 'success');
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= BACKUP E RESTAURAÇÃO =================

    async handleDownloadBackup() {
        try {
            const backup = await this.api('/api/backup');
            const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute('href', dataStr);
            downloadAnchor.setAttribute('download', `backup_esteira_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            this.showToast('Backup exportado com sucesso!', 'success');
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async handleExecuteRestore() {
        const input = document.getElementById('inputRestoreBackup');
        if (input.files.length === 0) {
            this.showToast('Selecione um arquivo de backup (.json).', 'warning');
            return;
        }

        const proceed = await this.confirmInFooter({
            title: 'Restaurar Banco de Dados',
            message: 'A restauração substituirá todos os dados locais atuais pelos dados do arquivo de backup selecionado. Deseja prosseguir com a restauração?',
            confirmLabel: 'Restaurar Dados',
            cancelLabel: 'Cancelar'
        });
        if (!proceed) return;

        try {
            const file = input.files[0];
            const text = await file.text();
            const backupData = JSON.parse(text);

            await this.api('/api/backup/restore', {
                method: 'POST',
                body: JSON.stringify(backupData)
            });

            this.showToast('Banco de dados restaurado com sucesso!', 'success');
            this.closeActiveModal();
            await this.loadProjects();
        } catch (err) {
            this.showToast(`Falha na restauração: ${err.message}`, 'danger');
        }
    }

    // ================= CRIAÇÃO DE PROJETOS, REQUISITOS E TAREFAS =================

    async handleRenameProject(e) {
        e.preventDefault();
        const title = document.getElementById('renameProjectTitle').value.trim();
        if (!title) {
            this.showToast('O nome do projeto é obrigatório.', 'danger');
            return;
        }
        const button = e.target.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            const project = await this.api(`/api/projects/${this.renameProjectId}`, {
                method: 'PATCH',
                body: JSON.stringify({ title })
            });
            const option = Array.from(this.projectSelect.options).find(opt => opt.value === project.id);
            if (option) option.textContent = `${project.title} (${project.id})`;
            this.closeActiveModal();
            await this.refreshProjectDetails(true);
            this.showToast('Nome do projeto atualizado com sucesso!', 'success');
        } catch (err) {
            this.showToast(err.message, 'danger');
        } finally {
            button.disabled = false;
        }
    }

    async handleCreateProject(e) {
        e.preventDefault();
        const title = document.getElementById('projTitle').value;
        const description = document.getElementById('projDesc').value;
        const rootPath = document.getElementById('projRoot').value;

        try {
            const proj = await this.api('/api/projects', {
                method: 'POST',
                body: JSON.stringify({ title, description, root_path: rootPath })
            });

            this.showToast(`Projeto ${proj.id} criado com sucesso!`, 'success');
            this.closeActiveModal();
            await this.loadProjects();
            this.projectSelect.value = proj.id;
            this.currentProjectId = proj.id;
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async handleCreateFeature(e) {
        e.preventDefault();
        const title = document.getElementById('featTitle').value;
        const description = document.getElementById('featDesc').value;

        try {
            const feat = await this.api(`/api/projects/${this.currentProjectId}/features`, {
                method: 'POST',
                body: JSON.stringify({ title, description })
            });

            this.showToast(`Funcionalidade ${feat.id} adicionada!`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    prepareNewTaskModal() {
        if (!this.projectData || !this.projectData.features || this.projectData.features.length === 0) {
            this.showToast('Crie ao menos uma funcionalidade antes de adicionar tarefas.', 'warning');
            this.openModal('modalNewFeature');
            return;
        }

        const sel = document.getElementById('taskFeatureSelect');
        sel.innerHTML = '';
        this.projectData.features.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.id} — ${f.title}`;
            sel.appendChild(opt);
        });

        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDesc').value = '';
        document.getElementById('taskDeps').value = '';
        this.openModal('modalNewTask');
    }

    async handleCreateTask(e) {
        e.preventDefault();
        const featureId = document.getElementById('taskFeatureSelect').value;
        const title = document.getElementById('taskTitle').value;
        const description = document.getElementById('taskDesc').value;
        const rawDeps = document.getElementById('taskDeps').value;
        const priority = document.getElementById('taskPriority').value;

        const deps = rawDeps ? rawDeps.split(',').map(d => d.trim()).filter(Boolean) : [];

        try {
            const task = await this.api(`/api/features/${featureId}/tasks`, {
                method: 'POST',
                body: JSON.stringify({ title, description, dependencies: deps, priority, stage: 'Definir' })
            });

            this.showToast(`Tarefa ${task.id} criada com sucesso!`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    openManageFeaturesModal() {
        if (!this.projectData || !this.projectData.features) return;
        const listEl = document.getElementById('manageFeaturesList');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (this.projectData.features.length === 0) {
            listEl.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">Nenhuma funcionalidade cadastrada no momento.</p>';
            this.openModal('modalManageFeatures');
            return;
        }

        this.projectData.features.forEach(feat => {
            const taskCount = this.projectData.tasks.filter(t => t.feature_id === feat.id).length;
            const item = document.createElement('div');
            item.className = 'feature-manage-item';
            item.innerHTML = `
                <div class="feature-manage-info">
                    <span class="feature-manage-title">${feat.id} — ${this.escapeHtml(feat.title)}</span>
                    <span class="feature-manage-meta">${taskCount} tarefa(s) vinculada(s) • Etapa: ${feat.stage}</span>
                </div>
                <div class="feature-manage-actions">
                    <button type="button" class="btn btn-secondary btn-xs btn-delete-feat-item" data-feat-id="${feat.id}">Apagar</button>
                </div>
            `;

            const btnDel = item.querySelector('.btn-delete-feat-item');
            if (btnDel) {
                btnDel.addEventListener('click', () => {
                    this.handleDeleteFeature(feat.id, feat.title);
                });
            }

            listEl.appendChild(item);
        });

        this.openModal('modalManageFeatures');
    }

    async handleDeleteCard(task) {
        const feat = (this.projectData.features || []).find(f => f.id === task.feature_id);
        const featTitle = feat ? feat.title : (task.feature_title || task.title);
        const tasksOfFeature = (this.projectData.tasks || []).filter(t => t.feature_id === task.feature_id);

        if (tasksOfFeature.length <= 1) {
            const confirmed = await this.confirmInFooter({
                title: 'Excluir Funcionalidade',
                message: `Deseja realmente apagar a funcionalidade "${featTitle.trim()}" (${task.feature_id}) e remover este cartão do quadro?`,
                confirmLabel: 'Sim, Apagar Funcionalidade',
                cancelLabel: 'Cancelar'
            });
            if (confirmed) {
                await this.handleDeleteFeature(task.feature_id, featTitle);
            }
        } else {
            const confirmed = await this.confirmInFooter({
                title: 'Excluir Tarefa',
                message: `Deseja apagar a tarefa "${task.title.trim()}" (${task.id})?`,
                confirmLabel: 'Sim, Apagar Tarefa',
                cancelLabel: 'Cancelar'
            });
            if (confirmed) {
                await this.handleDeleteTask(task.id, task.title);
            }
        }
    }

    async handleDeleteTask(taskId, taskTitle = '') {
        const name = taskTitle ? `"${taskTitle}" (${taskId})` : taskId;
        const confirmed = await this.confirmInFooter({
            title: 'Excluir Tarefa',
            message: `Deseja realmente apagar a tarefa ${name}? Esta ação não pode ser desfeita.`,
            confirmLabel: 'Sim, Apagar Tarefa',
            cancelLabel: 'Cancelar'
        });
        if (!confirmed) return;

        try {
            await this.api(`/api/tasks/${taskId}`, { method: 'DELETE' });
            this.showToast(`Tarefa ${taskId} apagada com sucesso.`, 'info');
            this.closeActiveModal();
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(`Erro ao apagar tarefa: ${err.message}`, 'danger');
        }
    }

    async handleDeleteFeature(featureId, featureTitle = '') {
        const name = featureTitle ? `"${featureTitle}" (${featureId})` : featureId;
        const confirmed = await this.confirmInFooter({
            title: 'Excluir Funcionalidade',
            message: `Deseja realmente apagar a funcionalidade ${name} e todas as suas tarefas vinculadas? Todos os registros associados serão removidos definitivamente.`,
            confirmLabel: 'Sim, Apagar Funcionalidade',
            cancelLabel: 'Cancelar'
        });
        if (!confirmed) return;

        try {
            await this.api(`/api/features/${featureId}`, { method: 'DELETE' });
            this.showToast(`Funcionalidade ${featureId} apagada com sucesso.`, 'info');
            this.closeActiveModal();
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(`Erro ao apagar funcionalidade: ${err.message}`, 'danger');
        }
    }

    async handleAddAi(e) {
        e.preventDefault();
        const name = document.getElementById('aiNameInput').value;
        const checkedStages = Array.from(document.querySelectorAll("input[name='aiStage']:checked")).map(cb => cb.value);

        if (checkedStages.length === 0) {
            this.showToast('Selecione pelo menos uma etapa para esta IA.', 'warning');
            return;
        }

        try {
            const ai = await this.api(`/api/projects/${this.currentProjectId}/ais`, {
                method: 'POST',
                body: JSON.stringify({ name, allowed_stages: checkedStages })
            });

            this.showToast(`IA ${ai.name} cadastrada com sucesso!`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(true);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    openEditAiModal(aiId) {
        const ai = (this.projectData.ais || []).find(a => a.id === aiId);
        if (!ai) return;

        document.getElementById('editAiId').value = ai.id;
        document.getElementById('editAiNameInput').value = ai.name;

        let stages = [];
        try { stages = JSON.parse(ai.allowed_stages); } catch {}

        document.querySelectorAll("input[name='editAiStage']").forEach(cb => {
            cb.checked = stages.includes(cb.value);
        });

        const btnDelete = document.getElementById('btnDeleteAi');
        if (btnDelete) {
            btnDelete.onclick = () => this.handleDeleteAi(ai.id);
        }

        this.openModal('modalEditAi');
    }

    async handleEditAi(e) {
        e.preventDefault();
        const aiId = document.getElementById('editAiId').value;
        const name = document.getElementById('editAiNameInput').value.trim();
        const checkedStages = Array.from(document.querySelectorAll("input[name='editAiStage']:checked")).map(cb => cb.value);

        if (!name) {
            this.showToast('Informe o nome da IA.', 'warning');
            return;
        }

        if (checkedStages.length === 0) {
            this.showToast('Selecione pelo menos uma etapa autorizada para esta IA.', 'warning');
            return;
        }

        try {
            await this.api(`/api/ais/${aiId}`, {
                method: 'PATCH',
                body: JSON.stringify({ name, allowed_stages: checkedStages })
            });

            this.showToast(`Participante IA '${name}' atualizado com sucesso!`, 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async handleDeleteAi(aiId) {
        const ai = (this.projectData.ais || []).find(a => a.id === aiId);
        if (!ai) return;

        this.showFooterConfirm(
            `Excluir o participante IA '${ai.name}'?`,
            async () => {
                try {
                    await this.api(`/api/ais/${aiId}`, { method: 'DELETE' });
                    this.showToast(`IA '${ai.name}' removida com sucesso!`, 'success');
                    this.closeActiveModal();
                    await this.refreshProjectDetails(false);
                } catch (err) {
                    this.showToast(err.message, 'danger');
                }
            }
        );
    }

    // ================= MÉTODOS DO TUTORIAL INTERATIVO =================

    initTutorialElements() {
        this.tutorialDrawer = document.getElementById('tutorialDrawer');
        this.tutStepCounter = document.getElementById('tutStepCounter');
        this.tutProgressFill = document.getElementById('tutProgressFill');
        this.tutProgressPercent = document.getElementById('tutProgressPercent');
        this.tutStepsNavList = document.getElementById('tutStepsNavList');

        this.tutStepNumberBadge = document.getElementById('tutStepNumberBadge');
        this.tutStepTitle = document.getElementById('tutStepTitle');
        this.tutObjectiveText = document.getElementById('tutObjectiveText');
        this.tutWhyText = document.getElementById('tutWhyText');
        this.tutActionText = document.getElementById('tutActionText');
        this.btnTutPrimaryAction = document.getElementById('btnTutPrimaryAction');

        this.tutConfirmText = document.getElementById('tutConfirmText');
        this.tutConfirmStatus = document.getElementById('tutConfirmStatus');
        this.tutConfirmStatusText = document.getElementById('tutConfirmStatusText');

        this.btnTutPrev = document.getElementById('btnTutPrev');
        this.btnTutNext = document.getElementById('btnTutNext');
        this.btnTutPause = document.getElementById('btnTutPause');
        this.btnCloseTutorialDrawer = document.getElementById('btnCloseTutorialDrawer');

        // Modal de Boas-Vindas
        this.btnStartTutorialNow = document.getElementById('btnStartTutorialNow');
        this.btnDismissTutorialWelcome = document.getElementById('btnDismissTutorialWelcome');

        // Modal Configurações
        this.chkTutorialEnabled = document.getElementById('chkTutorialEnabled');
        this.btnResumeTutorialModal = document.getElementById('btnResumeTutorialModal');
        this.btnRestartTutorialModal = document.getElementById('btnRestartTutorialModal');

        // Modal Conexão IA
        this.btnChooseLocalAi = document.getElementById('btnChooseLocalAi');
        this.btnChooseManualAi = document.getElementById('btnChooseManualAi');
        this.btnChooseTestAi = document.getElementById('btnChooseTestAi');
        this.connTestPanel = document.getElementById('connTestPanel');
        this.connPromptContent = document.getElementById('connPromptContent');
        this.btnCopyConnPrompt = document.getElementById('btnCopyConnPrompt');
        this.btnVerifyConnToken = document.getElementById('btnVerifyConnToken');
        this.connVerifyFeedback = document.getElementById('connVerifyFeedback');

        // Modal Preparação de Documentação
        this.prepDocsPromptContent = document.getElementById('prepDocsPromptContent');
        this.btnCopyPrepDocsPrompt = document.getElementById('btnCopyPrepDocsPrompt');
        this.btnCheckPrepDocs = document.getElementById('btnCheckPrepDocs');
    }

    bindTutorialEvents() {
        // Toggle Drawer
        this.btnToggleTutorial.addEventListener('click', () => {
            if (this.tutorialDrawer.style.display === 'none') {
                this.tutorialDrawer.style.display = 'flex';
                this.loadTutorialState();
            } else {
                this.tutorialDrawer.style.display = 'none';
                this.clearSpotlight();
            }
        });

        this.btnCloseTutorialDrawer.addEventListener('click', () => {
            this.tutorialDrawer.style.display = 'none';
            this.clearSpotlight();
        });

        this.btnTutPause.addEventListener('click', () => {
            this.tutorialDrawer.style.display = 'none';
            this.clearSpotlight();
            this.showToast('Tutorial pausado. Você pode retomá-lo a qualquer momento clicando em 🎯 Tutorial.', 'info');
        });

        // Navegação de Passos
        this.btnTutPrev.addEventListener('click', () => {
            if (this.tutorialState && this.tutorialState.current_step > 1) {
                this.goToTutorialStep(this.tutorialState.current_step - 1);
            }
        });

        this.btnTutNext.addEventListener('click', () => {
            if (this.tutorialState && this.tutorialState.current_step < 9) {
                this.goToTutorialStep(this.tutorialState.current_step + 1);
            }
        });

        // Ação Principal da Etapa Ativa
        this.btnTutPrimaryAction.addEventListener('click', () => {
            if (this.tutorialState) {
                this.handleTutorialPrimaryAction(this.tutorialState.current_step);
            }
        });

        // Boas-Vindas
        this.btnStartTutorialNow.addEventListener('click', () => {
            this.closeActiveModal();
            this.tutorialDrawer.style.display = 'flex';
            this.openModal('modalNewProject');
        });

        this.btnDismissTutorialWelcome.addEventListener('click', async () => {
            this.closeActiveModal();
            try {
                await this.api('/api/preferences/tutorial_welcome_dismissed', {
                    method: 'POST',
                    body: JSON.stringify({ value: 'true' })
                });
            } catch {}
            this.openModal('modalNewProject');
        });

        // Configurações do Tutorial
        this.btnTutorialSettings.addEventListener('click', () => {
            if (this.tutorialState) {
                this.chkTutorialEnabled.checked = this.tutorialState.enabled === 1;
            }
            this.openModal('modalTutorialSettings');
        });

        this.chkTutorialEnabled.addEventListener('change', async (e) => {
            if (!this.currentProjectId) return;
            const enabled = e.target.checked;
            try {
                await this.api(`/api/tutorial/${this.currentProjectId}/enable`, {
                    method: 'POST',
                    body: JSON.stringify({ enabled })
                });
                this.showToast(`Tutorial ${enabled ? 'ativado' : 'desativado'} com sucesso.`, 'info');
                if (!enabled) {
                    this.tutorialDrawer.style.display = 'none';
                    this.clearSpotlight();
                } else {
                    this.tutorialDrawer.style.display = 'flex';
                    await this.loadTutorialState();
                }
            } catch (err) {
                this.showToast(err.message, 'danger');
            }
        });

        this.btnResumeTutorialModal.addEventListener('click', () => {
            this.closeActiveModal();
            this.tutorialDrawer.style.display = 'flex';
            this.loadTutorialState();
        });

        this.btnRestartTutorialModal.addEventListener('click', async () => {
            if (!this.currentProjectId) return;
            try {
                await this.api(`/api/tutorial/${this.currentProjectId}/reset`, { method: 'POST' });
                this.closeActiveModal();
                this.tutorialDrawer.style.display = 'flex';
                this.showToast('Tutorial reiniciado no Passo 1. Seus dados foram preservados.', 'info');
                await this.loadTutorialState();
            } catch (err) {
                this.showToast(err.message, 'danger');
            }
        });

        // Etapa 2: Conexão IA
        this.btnChooseLocalAi.addEventListener('click', () => this.handleGenerateConnectionToken());
        this.btnChooseTestAi.addEventListener('click', () => this.handleGenerateConnectionToken());
        this.btnChooseManualAi.addEventListener('click', () => this.handleChooseCommunicationMode('manual'));
        this.btnCopyConnPrompt.addEventListener('click', () => {
            navigator.clipboard.writeText(this.connPromptContent.textContent).then(() => {
                this.showToast('Prompt de verificação copiado para a área de transferência!', 'success');
            });
        });
        this.btnVerifyConnToken.addEventListener('click', () => this.handleVerifyConnectionToken());

        // Etapa 3: Preparação Documental
        this.btnCopyPrepDocsPrompt.addEventListener('click', () => {
            navigator.clipboard.writeText(this.prepDocsPromptContent.textContent).then(() => {
                this.showToast('Prompt de preparação copiado!', 'success');
            });
        });
        this.btnCheckPrepDocs.addEventListener('click', () => this.handleCheckPrepDocs());

        // Dica Contextual
        this.btnDismissTip.addEventListener('click', () => {
            const tipId = this.tutorialContextualTipBanner.dataset.activeTipId;
            if (tipId && this.currentProjectId) {
                this.dismissContextualTip(tipId);
            }
            this.tutorialContextualTipBanner.style.display = 'none';
        });

        // Validação da pasta em tempo real no modal de novo projeto
        const projRootInput = document.getElementById('projRoot');
        if (projRootInput) {
            let debounceTimer = null;
            projRootInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => this.validateFolderInput(projRootInput.value), 400);
            });
        }
    }

    async validateFolderInput(folderPath) {
        const hintEl = document.querySelector('#formNewProject .form-hint');
        if (!hintEl || !folderPath.trim()) return;

        try {
            const res = await this.api('/api/tutorial/validate-folder', {
                method: 'POST',
                body: JSON.stringify({ folderPath })
            });

            if (!res.valid) {
                hintEl.style.color = '#f87171';
                hintEl.textContent = `❌ ${res.reason}`;
            } else if (res.alreadyRegistered) {
                hintEl.style.color = '#fbbf24';
                hintEl.textContent = `⚠️ Esta pasta já está vinculada ao projeto '${res.existingProjectTitle}' (${res.existingProjectId}).`;
            } else if (res.hasExistingGestao) {
                hintEl.style.color = '#34d399';
                hintEl.textContent = `✅ Pasta válida! Estrutura /gestao-ia existente detectada. A configuração será preservada e reutilizada.`;
            } else {
                hintEl.style.color = '#34d399';
                hintEl.textContent = `✅ Pasta válida com permissão de escrita. A estrutura /gestao-ia será inicializada nela.`;
            }
        } catch {
            hintEl.style.color = 'var(--text-muted)';
            hintEl.textContent = 'A pasta /gestao-ia será inicializada nesta raiz.';
        }
    }

    async loadTutorialState() {
        if (!this.currentProjectId) return;
        try {
            this.tutorialState = await this.api(`/api/tutorial/${this.currentProjectId}`);

            // Atualizar Label do botão topbar
            if (this.tutorialNavLabel) {
                this.tutorialNavLabel.textContent = `Tutorial (${this.tutorialState.current_step}/9)`;
            }

            if (this.tutorialState.enabled === 1) {
                // Se estiver ativo mas fechado, não forçar abertura se foi fechado manualmente
                this.renderTutorialStep(this.tutorialState.current_step);
            } else {
                this.tutorialDrawer.style.display = 'none';
                this.clearSpotlight();
            }
        } catch (err) {
            console.error('Erro ao carregar estado do tutorial:', err);
        }
    }

    async goToTutorialStep(stepNumber) {
        if (!this.currentProjectId) return;
        try {
            const res = await this.api(`/api/tutorial/${this.currentProjectId}/step`, {
                method: 'POST',
                body: JSON.stringify({ step: stepNumber })
            });
            this.tutorialState.current_step = res.currentStep;
            this.renderTutorialStep(res.currentStep);
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    renderTutorialStep(stepNumber) {
        const stepsDef = [
            {
                number: 1,
                title: 'Escolher a pasta do projeto',
                objective: 'Identificar a pasta do sistema que será desenvolvido pela sua IA.',
                why: 'É nessa pasta que a IA trabalhará e onde ficará armazenada a documentação oficial da esteira (/gestao-ia).',
                action: 'Clique em "Cadastrar / Vincular Projeto", indique o caminho da pasta local e confirme.',
                primaryBtn: 'Cadastrar / Vincular Projeto',
                confirmCriteria: 'Pasta validada pelo backend e projeto cadastrado na esteira.',
                spotlight: '#btnNewProject'
            },
            {
                number: 2,
                title: 'Conectar a ferramenta de IA ao projeto',
                objective: 'Garantir que a IA trabalhe na pasta correta com permissões de leitura e escrita.',
                why: 'Evita extravio de entregas ou trabalho da IA fora do repositório autorizado.',
                action: 'Selecione se sua IA atua localmente na pasta ou via navegador. Se local, gere o teste temporário.',
                primaryBtn: 'Configurar Conexão da IA',
                confirmCriteria: 'Acesso local confirmado por token temporário ou modo manual selecionado.',
                spotlight: '#projectContextBar'
            },
            {
                number: 3,
                title: 'Preparar a arquitetura de documentação',
                objective: 'Criar e validar a pasta /gestao-ia com Projeto.md, Tarefas.md, Decisões.md e Validação.md.',
                why: 'Estes documentos são o espelho compartilhado oficial entre você e suas IAs, reduzindo perda de contexto.',
                action: 'Confira a estrutura de 4 Markdowns gerada na raiz. Se usar a IA para inspecionar, copie o prompt.',
                primaryBtn: 'Verificar Estrutura de Documentos',
                confirmCriteria: 'Estrutura /gestao-ia e 4 Markdowns criados e validados pelo backend.',
                spotlight: '#docIntegrityBadge'
            },
            {
                number: 4,
                title: 'Cadastrar as IAs participantes',
                objective: 'Definir quem atuará nas etapas: Definir, Desenvolver, Verificar, Corrigir e Validar.',
                why: 'A esteira aceita de 1 a 5 IAs com nomes livres. Cada etapa precisa de ao menos uma IA autorizada.',
                action: 'Clique em "+ IA", informe o nome e marque as etapas que cada IA terá permissão de executar.',
                primaryBtn: '+ Cadastrar Participante IA',
                confirmCriteria: 'Pelo menos uma IA cadastrada e todas as etapas com responsável possível.',
                spotlight: '#btnAddAi'
            },
            {
                number: 5,
                title: 'Descrever a primeira funcionalidade',
                objective: 'Começar com uma funcionalidade pequena e compreensível para orientar o fluxo.',
                why: 'Cada funcionalidade percorre sua própria esteira e gera uma tarefa inicial de Definir.',
                action: 'Clique em "+ Nova Funcionalidade", informe título e escopo. Em seguida crie a tarefa de Definir.',
                primaryBtn: '+ Nova Funcionalidade',
                confirmCriteria: 'Funcionalidade e tarefa de Definir (TSK-xxx) cadastradas no Kanban.',
                spotlight: '#btnNewFeature'
            },
            {
                number: 6,
                title: 'Iniciar a tarefa e copiar o prompt',
                objective: 'Ensinar como o usuário aciona uma IA de forma autorizada.',
                why: 'O organizador não chama APIs de IA sozinho; você autoriza a execução e fornece o prompt com o rito exato.',
                action: 'No cartão da tarefa em Definir, clique em "Iniciar Definir", confirme a IA e copie a instrução gerada.',
                primaryBtn: 'Iniciar Tarefa em Definir',
                confirmCriteria: 'Execução autorizada (EXE-xxx) registrada no backend.',
                spotlight: '#col-Definir'
            },
            {
                number: 7,
                title: 'Receber a primeira entrega',
                objective: 'Mostrar como o resultado da IA alimenta o painel da esteira.',
                why: 'A IA deposita a entrega JSON em gestao-ia/entrada/ ou você importa manualmente pelo painel.',
                action: 'Deposite a entrega na pasta de entrada ou clique em "Importar Entrega" para colar o JSON da IA.',
                primaryBtn: 'Importar Entrega JSON',
                confirmCriteria: 'Entrega válida (ENT-xxx) vinculada à execução detectada pelo backend.',
                spotlight: '#btnImportDelivery'
            },
            {
                number: 8,
                title: 'Conferir e aceitar a entrega',
                objective: 'Ensinar que receber uma entrega não equivale a aprová-la automaticamente.',
                why: 'O programador confere arquivos, aprova requisitos e aceita ou rejeita conscientemente.',
                action: 'Clique no cartão em "Aguardando Conferência", aprove os requisitos e clique em "✅ Aceitar Entrega".',
                primaryBtn: 'Conferir Entrega',
                confirmCriteria: 'Entrega aceita e documentação Markdown sincronizada com nova revisão.',
                spotlight: '#metricRecebidas'
            },
            {
                number: 9,
                title: 'Entender o próximo passo',
                objective: 'Concluir a iniciação e entender a passagem para Desenvolver e demais etapas.',
                why: 'A esteira segue com Desenvolver, Verificar, Corrigir e Validar, exigindo aprovação humana final.',
                action: 'Observe no Kanban que a próxima ação recomendada é iniciar Desenvolver usando a entrega anterior.',
                primaryBtn: 'Concluir Onboarding',
                confirmCriteria: 'Tutorial inicial concluído com sucesso.',
                spotlight: '#col-Desenvolver'
            }
        ];

        const step = stepsDef[stepNumber - 1] || stepsDef[0];
        const isCompleted = this.tutorialState && this.tutorialState.completed_steps.includes(stepNumber);

        // Header e barra de progresso
        this.tutStepCounter.textContent = `Etapa ${step.number} de 9`;
        this.tutStepNumberBadge.textContent = step.number;
        this.tutStepTitle.textContent = step.title;

        const completedCount = this.tutorialState ? this.tutorialState.completed_steps.length : 0;
        const percent = Math.round((completedCount / 9) * 100);
        this.tutProgressFill.style.width = `${Math.max(percent, 11)}%`;
        this.tutProgressPercent.textContent = `${percent}% concluído`;

        // Textos dos Blocos
        this.tutObjectiveText.textContent = step.objective;
        this.tutWhyText.textContent = step.why;
        this.tutActionText.textContent = step.action;
        this.btnTutPrimaryAction.textContent = step.primaryBtn;
        this.tutConfirmText.textContent = step.confirmCriteria;

        // Status de Confirmação
        if (isCompleted) {
            this.tutConfirmStatus.className = 'tut-confirm-status status-completed';
            this.tutConfirmStatus.innerHTML = '<span class="status-indicator">✅</span><span>Passo validado com sucesso!</span>';
        } else {
            this.tutConfirmStatus.className = 'tut-confirm-status status-pending';
            this.tutConfirmStatus.innerHTML = '<span class="status-indicator">⏳</span><span>Aguardando ação prática</span>';
        }

        // Renderizar Lista de Passos
        // Renderizar Sequência de Atividades (Número + Título na frente + Status)
        this.tutStepsNavList.innerHTML = '';
        stepsDef.forEach(s => {
            const li = document.createElement('li');
            li.className = 'tut-nav-item';
            const isStepCompleted = this.tutorialState && this.tutorialState.completed_steps.includes(s.number);
            const isActive = s.number === stepNumber;

            if (isActive) li.classList.add('active');
            if (isStepCompleted) li.classList.add('completed');

            const statusText = isStepCompleted ? 'Concluída' : (isActive ? 'Atividade Atual' : 'Pendente');
            const iconContent = isStepCompleted ? '✓' : s.number;

            li.innerHTML = `
                <span class="tut-item-num">${iconContent}</span>
                <div class="tut-item-body">
                    <span class="tut-item-title">${s.number}. ${this.escapeHtml(s.title)}</span>
                    <span class="tut-item-subtitle">${statusText}</span>
                </div>
                <span class="tut-item-indicator">${isActive ? '●' : '›'}</span>
            `;

            li.title = `Passo ${s.number}: ${s.title} (${statusText})`;
            li.addEventListener('click', () => this.goToTutorialStep(s.number));
            this.tutStepsNavList.appendChild(li);
        });

        // Controles de Navegação
        this.btnTutPrev.disabled = stepNumber <= 1;
        this.btnTutNext.disabled = stepNumber >= 9;

        // Aplicar Spotlight no elemento relevante da interface
        if (step.spotlight) {
            this.applySpotlight(step.spotlight);
        } else {
            this.clearSpotlight();
        }
    }

    handleTutorialPrimaryAction(stepNumber) {
        switch (stepNumber) {
            case 1:
                this.openModal('modalNewProject');
                break;
            case 2:
                this.openModal('modalConnectAi');
                break;
            case 3:
                this.openPrepDocsModal();
                break;
            case 4:
                this.openModal('modalAddAi');
                break;
            case 5:
                this.openModal('modalNewFeature');
                break;
            case 6:
                // Localizar tarefa em Definir
                const defTask = (this.projectData.tasks || []).find(t => t.stage === 'Definir');
                if (defTask) {
                    this.openStartStageModal(defTask.id, 'Definir');
                } else {
                    this.showToast('Crie a primeira tarefa no Passo 5 antes de iniciar.', 'warning');
                }
                break;
            case 7:
                this.openModal('modalImportDelivery');
                break;
            case 8:
                // Localizar entrega pendente de conferência
                const deliv = (this.projectData.deliveries || []).find(d => d.result === 'pendente');
                if (deliv) {
                    this.openReviewDeliveryModal(deliv.id);
                } else {
                    this.showToast('Nenhuma entrega pendente de conferência encontrada.', 'warning');
                }
                break;
            case 9:
                this.finishTutorialOnboarding();
                break;
        }
    }

    applySpotlight(selector) {
        this.clearSpotlight();
        try {
            const el = document.querySelector(selector);
            if (el) {
                el.classList.add('tutorial-spotlight');
                this.activeSpotlightElement = el;
                // Rolar suavemente para a visão se necessário
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } catch {}
    }

    clearSpotlight() {
        if (this.activeSpotlightElement) {
            this.activeSpotlightElement.classList.remove('tutorial-spotlight');
            this.activeSpotlightElement = null;
        }
        document.querySelectorAll('.tutorial-spotlight').forEach(el => {
            el.classList.remove('tutorial-spotlight');
        });
    }

    // ================= ETAPA 2: CONEXÃO IA =================

    async handleGenerateConnectionToken() {
        if (!this.currentProjectId) return;
        try {
            const data = await this.api(`/api/tutorial/${this.currentProjectId}/connection-token`, { method: 'POST' });
            this.connPromptContent.textContent = data.prompt;
            this.connTestPanel.style.display = 'block';
            this.connVerifyFeedback.innerHTML = `<span class="form-hint" style="color: var(--accent-cyan);">Token gerado: <code>${data.token}</code>. Cole na IA e solicite criar o arquivo indicado.</span>`;
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async handleVerifyConnectionToken() {
        if (!this.currentProjectId) return;
        try {
            const res = await this.api(`/api/tutorial/${this.currentProjectId}/verify-connection`, { method: 'POST' });
            if (res.verified) {
                this.connVerifyFeedback.innerHTML = `<span style="color: #34d399; font-weight: 600;">✅ ${res.message}</span>`;
                this.showToast(res.message, 'success');
                setTimeout(() => {
                    this.closeActiveModal();
                    this.loadTutorialState();
                }, 1500);
            } else {
                this.connVerifyFeedback.innerHTML = `<span style="color: #f87171;">❌ ${res.reason}</span>`;
            }
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    async handleChooseCommunicationMode(mode) {
        if (!this.currentProjectId) return;
        try {
            await this.api(`/api/tutorial/${this.currentProjectId}/communication-mode`, {
                method: 'POST',
                body: JSON.stringify({ mode })
            });
            this.showToast(`Modo de comunicação configurado: ${mode === 'manual' ? 'Importação Manual pelo Navegador' : 'Acesso Local na Pasta'}.`, 'success');
            this.closeActiveModal();
            this.loadTutorialState();
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= ETAPA 3: PREPARAÇÃO DOCUMENTAL =================

    async openPrepDocsModal() {
        if (!this.projectData) return;
        const root = this.projectData.project.root_path;
        try {
            const data = await this.api(`/api/projects/${this.currentProjectId}/prep-docs-prompt`);
            this.prepDocsPromptContent.textContent = data.promptText;
        } catch {
            this.prepDocsPromptContent.textContent = `Inspecione a pasta ${root}. Crie a estrutura em ${root}/gestao-ia/: Projeto.md, Tarefas.md, Decisões.md, Validação.md e subpastas entrada, processados, rejeitados, evidencias, contexto e prompts.`;
        }
        this.openModal('modalPrepDocs');
    }

    async handleCheckPrepDocs() {
        if (!this.currentProjectId) return;
        try {
            await this.api(`/api/projects/${this.currentProjectId}/reconcile`, { method: 'POST' });
            this.showToast('Estrutura documental verificada e sincronizada com sucesso!', 'success');
            this.closeActiveModal();
            await this.refreshProjectDetails(false);
            await this.loadTutorialState();
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= ETAPA 9: CONCLUSÃO ONBOARDING =================

    async finishTutorialOnboarding() {
        if (!this.currentProjectId) return;
        const keepTips = await this.confirmInFooter({
            title: 'Tutorial Concluído',
            message: 'Deseja manter as dicas contextuais ativas para orientar ocorrências futuras (decisões, testes, bloqueios)?',
            confirmLabel: 'Continuar com dicas contextuais',
            cancelLabel: 'Concluir e desativar tutorial'
        });

        try {
            await this.api(`/api/tutorial/${this.currentProjectId}/enable`, {
                method: 'POST',
                body: JSON.stringify({ enabled: keepTips })
            });

            this.showToast('Parabéns! Onboarding concluído. A esteira está pronta para o desenvolvimento.', 'success');
            this.tutorialDrawer.style.display = 'none';
            this.clearSpotlight();
            await this.loadTutorialState();
        } catch (err) {
            this.showToast(err.message, 'danger');
        }
    }

    // ================= DICAS CONTEXTUAIS =================

    async checkContextualTips() {
        if (!this.currentProjectId) return;
        try {
            const tips = await this.api(`/api/tutorial/${this.currentProjectId}/tips`);
            if (tips && tips.length > 0) {
                const tip = tips[0]; // Mostrar a primeira dica pendente
                this.tipTitle.textContent = tip.title;
                this.tipMessage.textContent = tip.message;
                this.btnTipAction.textContent = tip.actionLabel || 'Ver Detalhes';
                this.tutorialContextualTipBanner.dataset.activeTipId = tip.id;
                this.tutorialContextualTipBanner.dataset.highlight = tip.elementHighlight || '';

                this.btnTipAction.onclick = () => {
                    if (tip.elementHighlight) {
                        this.applySpotlight(tip.elementHighlight);
                    }
                    this.dismissContextualTip(tip.id);
                    this.tutorialContextualTipBanner.style.display = 'none';
                };

                this.tutorialContextualTipBanner.style.display = 'flex';
            } else {
                this.tutorialContextualTipBanner.style.display = 'none';
            }
        } catch {
            this.tutorialContextualTipBanner.style.display = 'none';
        }
    }

    async dismissContextualTip(tipId) {
        if (!this.currentProjectId || !tipId) return;
        try {
            await this.api(`/api/tutorial/${this.currentProjectId}/tip-seen`, {
                method: 'POST',
                body: JSON.stringify({ tipId })
            });
        } catch {}
    }

    // ================= TEMA CLARO / ESCURO =================
    initTheme() {
        this.btnToggleTheme = document.getElementById('btnToggleTheme');
        this.themeIcon = document.getElementById('themeIcon');
        this.themeLabel = document.getElementById('themeLabel');

        const savedTheme = localStorage.getItem('esteira_theme') || 'theme-light';
        this.setTheme(savedTheme);

        if (this.btnToggleTheme) {
            this.btnToggleTheme.addEventListener('click', () => {
                const isDark = document.body.classList.contains('theme-dark');
                const nextTheme = isDark ? 'theme-light' : 'theme-dark';
                this.setTheme(nextTheme);
            });
        }
    }

    setTheme(theme) {
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(theme);
        localStorage.setItem('esteira_theme', theme);

        if (this.themeIcon && this.themeLabel) {
            if (theme === 'theme-light') {
                this.themeIcon.textContent = '🌙';
                this.themeLabel.textContent = 'Escuro';
            } else {
                this.themeIcon.textContent = '☀️';
                this.themeLabel.textContent = 'Claro';
            }
        }
    }

    // ================= UTILITÁRIOS =================

    escapeHtml(str) {
        if (!str) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(str).replace(/[&<>"']/g, m => map[m]);
    }

    confirmInFooter({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
        return new Promise((resolve) => {
            const existing = document.getElementById('footerConfirmDialog');
            if (existing) existing.remove();

            const dialog = document.createElement('div');
            dialog.id = 'footerConfirmDialog';
            dialog.className = 'footer-notification-bar footer-confirm-mode';
            dialog.setAttribute('role', 'alertdialog');
            dialog.setAttribute('aria-live', 'assertive');

            dialog.innerHTML = `
                <div class="footer-notify-body">
                    <div class="footer-notify-header">
                        <span class="footer-notify-icon">⚠️</span>
                        <strong class="footer-notify-title">${this.escapeHtml(title || 'Confirmação')}</strong>
                    </div>
                    <p class="footer-notify-text">${this.escapeHtml(message)}</p>
                </div>
                <div class="footer-notify-actions">
                    <button type="button" class="btn btn-secondary btn-sm btn-footer-cancel">${this.escapeHtml(cancelLabel)}</button>
                    <button type="button" class="btn btn-primary btn-sm btn-footer-confirm">${this.escapeHtml(confirmLabel)}</button>
                </div>
            `;

            document.body.appendChild(dialog);

            requestAnimationFrame(() => {
                dialog.classList.add('visible');
            });

            const cleanup = (result) => {
                dialog.classList.remove('visible');
                setTimeout(() => dialog.remove(), 200);
                resolve(result);
            };

            dialog.querySelector('.btn-footer-cancel').addEventListener('click', () => cleanup(false));
            dialog.querySelector('.btn-footer-confirm').addEventListener('click', () => cleanup(true));
        });
    }

    showToast(message, type = 'info') {
        const existing = document.getElementById('footerToastNotification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'footerToastNotification';
        toast.className = `footer-notification-bar footer-toast-mode toast-${type}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        const icons = {
            success: '✓',
            warning: 'ℹ',
            danger: '✕',
            info: '●'
        };

        toast.innerHTML = `
            <div class="footer-notify-body">
                <span class="footer-toast-icon">${icons[type] || '●'}</span>
                <span class="footer-toast-text">${this.escapeHtml(message)}</span>
            </div>
            <button type="button" class="footer-toast-close" title="Fechar notificação" aria-label="Fechar">✕</button>
        `;

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        const closeBtn = toast.querySelector('.footer-toast-close');
        const dismiss = () => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 200);
        };

        if (closeBtn) closeBtn.addEventListener('click', dismiss);

        setTimeout(() => {
            if (document.body.contains(toast)) {
                dismiss();
            }
        }, 4000);
    }
}

// Inicialização da Aplicação
window.addEventListener('DOMContentLoaded', () => {
    window.esteiraApp = new EsteiraApp();
});
