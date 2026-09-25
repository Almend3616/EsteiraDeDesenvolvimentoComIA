import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.js';

test('Renomear projeto pela API preserva vínculos e sincroniza documentos', async () => {
    const root = mkdtempSync(join(tmpdir(), 'esteira-rename-'));
    const { server, app } = startServer(0, '127.0.0.1', join(root, 'test.db'));
    try {
        if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
        const project = app.projectService.createProject({ title: 'Original', description: 'Escopo', root_path: root });
        const feature = app.projectService.addFeature(project.id, 'Funcionalidade', 'Descrição', true);
        const before = app.projectService.getProjectDetails(project.id);
        const url = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}`;
        const rename = (title, target = url) => fetch(target, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title })
        });
        const response = await rename('  Novo nome  ');
        assert.equal(response.status, 200);
        const updated = await response.json();
        assert.equal(updated.title, 'Novo nome');
        assert.equal(updated.id, project.id);
        assert.equal(updated.root_path, project.root_path);
        assert.equal(updated.description, project.description);
        assert.equal(updated.revision, before.project.revision + 1);
        const details = app.projectService.getProjectDetails(project.id);
        assert.deepEqual(details.ais, before.ais);
        assert.equal(details.features[0].id, feature.id);
        assert.equal(details.divergences.length, 0);
        assert.ok(details.events.some(event => event.type === 'PROJETO_RENOMEADO'));
        const document = join(root, 'gestao-ia', 'Projeto.md');
        assert.ok(readFileSync(document, 'utf8').includes('Novo nome'));
        for (const title of ['', '   ', null, 123, {}]) {
            assert.equal((await rename(title)).status, 400);
        }
        assert.equal((await rename('Nome', url.replace(project.id, 'PRJ-inexistente'))).status, 404);
        assert.equal((await rename('Novo nome')).status, 200);
        assert.equal(app.projectService.getProjectDetails(project.id).project.revision, updated.revision);
        writeFileSync(document, 'Edição externa que deve ser preservada');
        assert.equal((await rename('Outro nome')).status, 400);
        assert.equal(app.projectService.getProjectDetails(project.id).project.title, 'Novo nome');
        assert.equal(readFileSync(document, 'utf8'), 'Edição externa que deve ser preservada');
    } finally {
        app.watcherService.stop();
        await new Promise(resolve => server.close(resolve));
        app.db.close();
        rmSync(root, { recursive: true, force: true });
    }
});
