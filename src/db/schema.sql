-- Schema da Esteira de Desenvolvimento com IA (SQLite)
-- Fonte de verdade local e transacional

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    root_path TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_participants (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    allowed_stages TEXT NOT NULL, -- JSON array: ["Definir", "Desenvolver", "Verificar", "Corrigir", "Validar"]
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'Definir',
    status TEXT NOT NULL DEFAULT 'planejada',
    failed_corrections_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    acceptance_criteria TEXT NOT NULL, -- JSON array de critérios
    version INTEGER NOT NULL DEFAULT 1,
    human_approved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    dependencies TEXT NOT NULL DEFAULT '[]', -- JSON array de TSK-xxx
    priority TEXT NOT NULL DEFAULT 'media', -- 'baixa', 'media', 'alta', 'critica'
    assignee_id TEXT,
    stage TEXT NOT NULL DEFAULT 'Definir',
    status TEXT NOT NULL DEFAULT 'planejada',
    last_delivery_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
    FOREIGN KEY(assignee_id) REFERENCES ai_participants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    human_authorized INTEGER NOT NULL DEFAULT 1,
    authorized_at TEXT NOT NULL,
    source_revision INTEGER NOT NULL,
    reserved_resources TEXT NOT NULL DEFAULT '[]', -- JSON array de arquivos ou recursos
    scope TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativa', -- 'ativa', 'finalizada', 'cancelada'
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_id) REFERENCES ai_participants(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    previous_delivery_ref TEXT,
    code_version TEXT NOT NULL, -- JSON
    result TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'aceita', 'rejeitada'
    payload TEXT NOT NULL, -- JSON bruto da entrega
    payload_hash TEXT NOT NULL, -- SHA-256 do arquivo original
    evidence TEXT NOT NULL DEFAULT '[]', -- JSON array
    review_notes TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(execution_id) REFERENCES executions(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    feature_id TEXT,
    task_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    alternatives TEXT NOT NULL DEFAULT '[]', -- JSON array
    impact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'aprovada', 'rejeitada'
    human_response TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE SET NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS errors (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL,
    task_id TEXT,
    delivery_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reproduction_steps TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'media', -- 'baixa', 'media', 'alta', 'critica'
    expected_behavior TEXT NOT NULL,
    actual_behavior TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '[]', -- JSON array
    known_cause TEXT,
    attempts_count INTEGER NOT NULL DEFAULT 1,
    regression_test_ref TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL,
    delivery_id TEXT,
    criterion_id TEXT,
    title TEXT NOT NULL,
    command TEXT,
    environment TEXT,
    status TEXT NOT NULL DEFAULT 'not_run', -- 'passed', 'failed', 'not_run', 'error'
    evidence TEXT NOT NULL DEFAULT '[]', -- JSON array
    reason_not_run TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
    FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    links TEXT NOT NULL DEFAULT '{}', -- JSON com vínculos (task_id, delivery_id, etc.)
    details TEXT NOT NULL DEFAULT '{}', -- JSON com detalhes
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_sync (
    project_id TEXT NOT NULL,
    file_name TEXT NOT NULL, -- 'Projeto.md', 'Tarefas.md', 'Decisões.md', 'Validação.md'
    sha256 TEXT NOT NULL,
    last_exported_at TEXT NOT NULL,
    divergent INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(project_id, file_name),
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tutorial_state (
    project_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    current_step INTEGER NOT NULL DEFAULT 1,
    completed_steps TEXT NOT NULL DEFAULT '[]', -- JSON array: [1, 2, ...]
    communication_mode TEXT NOT NULL DEFAULT 'local', -- 'local', 'manual'
    connection_token TEXT,
    connection_token_created_at TEXT,
    connection_verified INTEGER NOT NULL DEFAULT 0,
    shown_tips TEXT NOT NULL DEFAULT '[]', -- JSON array de dicas exibidas
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_task ON deliveries(task_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_submission ON deliveries(submission_id);
CREATE INDEX IF NOT EXISTS idx_executions_task ON executions(task_id);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);

