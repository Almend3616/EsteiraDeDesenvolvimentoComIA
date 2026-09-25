import { normalize, isAbsolute } from 'node:path';

export const VALID_STAGES = ['Definir', 'Desenvolver', 'Verificar', 'Corrigir', 'Validar'];
export const VALID_FILE_OPERATIONS = ['created', 'modified', 'deleted', 'renamed'];
export const VALID_TEST_STATUSES = ['passed', 'failed', 'not_run', 'error'];

/**
 * Validação rigorosa do Contrato de Entrega JSON v1.0
 * Garante campos obrigatórios, tipos, enums e impede path traversal.
 */
export function validateDeliveryPayload(data) {
    const errors = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { valid: false, errors: ['O payload deve ser um objeto JSON válido.'] };
    }

    // 1. Campos obrigatórios de raiz
    if (data.schema_version !== '1.0') {
        errors.push("Campo 'schema_version' deve ser estritamente '1.0'.");
    }
    if (!data.submission_id || typeof data.submission_id !== 'string' || !data.submission_id.trim()) {
        errors.push("Campo 'submission_id' é obrigatório e deve ser uma string não vazia.");
    }
    if (!data.project_id || typeof data.project_id !== 'string') {
        errors.push("Campo 'project_id' é obrigatório.");
    }
    if (!data.feature_id || typeof data.feature_id !== 'string') {
        errors.push("Campo 'feature_id' é obrigatório.");
    }
    if (!data.task_id || typeof data.task_id !== 'string') {
        errors.push("Campo 'task_id' é obrigatório.");
    }
    if (!data.execution_id || typeof data.execution_id !== 'string') {
        errors.push("Campo 'execution_id' é obrigatório.");
    }
    if (!VALID_STAGES.includes(data.stage)) {
        errors.push(`Campo 'stage' inválido ('${data.stage}'). Deve ser um de: ${VALID_STAGES.join(', ')}.`);
    }
    if (!data.actor_id || typeof data.actor_id !== 'string') {
        errors.push("Campo 'actor_id' é obrigatório.");
    }
    // previous_delivery_ref pode ser null na primeira entrega
    if (data.previous_delivery_ref !== null && typeof data.previous_delivery_ref !== 'string') {
        errors.push("Campo 'previous_delivery_ref' deve ser string ou null.");
    }
    if (typeof data.base_revision !== 'number' || data.base_revision < 0) {
        errors.push("Campo 'base_revision' deve ser um número inteiro >= 0.");
    }
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
        errors.push("Campo 'title' é obrigatório.");
    }
    if (!data.description || typeof data.description !== 'string' || !data.description.trim()) {
        errors.push("Campo 'description' é obrigatório.");
    }

    // Context Read
    if (!Array.isArray(data.context_read)) {
        errors.push("Campo 'context_read' deve ser um array de referências/caminhos lidos.");
    }

    // Code Version
    if (!data.code_version || typeof data.code_version !== 'object') {
        errors.push("Campo 'code_version' deve ser um objeto com commit/manifest_ref e dirty.");
    }

    // Files e verificação estrita de Path Traversal
    if (!Array.isArray(data.files)) {
        errors.push("Campo 'files' deve ser um array de modificações.");
    } else {
        data.files.forEach((file, idx) => {
            if (!file.path || typeof file.path !== 'string') {
                errors.push(`Arquivo em files[${idx}] deve ter 'path' string.`);
            } else {
                // Checagem de segurança contra path traversal
                const rawPath = file.path.trim();
                if (isAbsolute(rawPath) || rawPath.startsWith('\\\\') || rawPath.startsWith('//')) {
                    errors.push(`Segurança: files[${idx}].path não pode ser absoluto ('${rawPath}').`);
                }
                const normalized = normalize(rawPath).replace(/^[/\\]+/, '');
                if (normalized.startsWith('..') || normalized.includes('../') || normalized.includes('..\\')) {
                    errors.push(`Segurança: files[${idx}].path viola limites da raiz ('${rawPath}').`);
                }
            }
            if (!VALID_FILE_OPERATIONS.includes(file.operation)) {
                errors.push(`Operação inválida em files[${idx}]. Deve ser: ${VALID_FILE_OPERATIONS.join(', ')}.`);
            }
        });
    }

    // Logic changes
    if (!Array.isArray(data.logic_changes)) {
        errors.push("Campo 'logic_changes' deve ser um array.");
    }

    // Tests
    if (!Array.isArray(data.tests)) {
        errors.push("Campo 'tests' deve ser um array.");
    } else {
        data.tests.forEach((t, idx) => {
            if (!t.test_id || typeof t.test_id !== 'string') {
                errors.push(`tests[${idx}].test_id é obrigatório.`);
            }
            if (!VALID_TEST_STATUSES.includes(t.status)) {
                errors.push(`tests[${idx}].status inválido ('${t.status}'). Deve ser: ${VALID_TEST_STATUSES.join(', ')}.`);
            }
            if (t.status === 'not_run' && !t.reason) {
                errors.push(`tests[${idx}]: Se o teste não foi executado (not_run), informe o campo 'reason'.`);
            }
        });
    }

    // Recommended next stage
    if (data.recommended_next_stage && !VALID_STAGES.includes(data.recommended_next_stage)) {
        errors.push(`Campo 'recommended_next_stage' inválido ('${data.recommended_next_stage}').`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}
