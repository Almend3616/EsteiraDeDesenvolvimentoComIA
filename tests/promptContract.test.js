import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PromptGeneratorService } from '../src/services/promptGeneratorService.js';
import { VALID_STAGES, validateDeliveryPayload } from '../src/contracts/deliverySchema.js';

for (const stage of VALID_STAGES) {
    test(`Modelo de entrega de ${stage} respeita contrato e exige justificativa de testes`, () => {
        const rows = {
            executions: { id: 'EXE-001', task_id: 'TSK-001', actor_id: 'IA-001', stage, scope: 'Escopo', reserved_resources: '[]' },
            tasks: { id: 'TSK-001', feature_id: 'FUN-001', title: 'Tarefa', last_delivery_ref: null },
            features: { id: 'FUN-001', project_id: 'PRJ-001', title: 'Funcionalidade' },
            projects: { id: 'PRJ-001', title: 'Projeto', revision: 1, root_path: 'prompt-test-nonexistent-root' }
        };
        const db = { db: { prepare: sql => ({ get: () => rows[sql.match(/FROM (\w+)/)[1]] }) } };
        const { promptText } = new PromptGeneratorService(db).generateTaskPrompt('EXE-001');
        const template = JSON.parse(promptText.slice(promptText.indexOf('\n{\n') + 1, promptText.indexOf('\n\n================================================================================\nVERIFICAÇÃO FINAL:')));
        assert.equal(validateDeliveryPayload(template).valid, true);
        assert.equal(template.tests[0].status, 'not_run');
        assert.ok(template.tests[0].reason);
        assert.ok(promptText.includes('NÃO substitui tests[i].reason'));
        delete template.tests[0].reason;
        const result = validateDeliveryPayload(template);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(error => error.includes('reason')));
    });
}
