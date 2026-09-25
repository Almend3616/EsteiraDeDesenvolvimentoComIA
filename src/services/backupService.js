import { writeFileSync, readFileSync, existsSync } from 'node:fs';

export class BackupService {
    constructor(db) {
        this.db = db;
    }

    exportFullBackup() {
        const tables = [
            'projects',
            'ai_participants',
            'features',
            'requirements',
            'tasks',
            'executions',
            'deliveries',
            'decisions',
            'errors',
            'tests',
            'events',
            'document_sync',
            'id_sequences'
        ];

        const backupData = {
            version: '1.0',
            exported_at: new Date().toISOString(),
            tables: {}
        };

        for (const tbl of tables) {
            try {
                const rows = this.db.db.prepare(`SELECT * FROM ${tbl}`).all();
                backupData.tables[tbl] = rows;
            } catch {
                backupData.tables[tbl] = [];
            }
        }

        return backupData;
    }

    restoreFullBackup(backupData) {
        if (!backupData || !backupData.tables) {
            throw new Error('Arquivo de backup inválido ou estrutura corrompida.');
        }

        return this.db.transaction((db) => {
            // Desativar foreign keys durante a restauração estruturada
            db.exec('PRAGMA foreign_keys = OFF;');

            const tableOrder = [
                'document_sync',
                'events',
                'tests',
                'errors',
                'decisions',
                'deliveries',
                'executions',
                'tasks',
                'requirements',
                'features',
                'ai_participants',
                'projects',
                'id_sequences'
            ];

            // Limpar tabelas existentes
            for (const tbl of tableOrder) {
                try {
                    db.exec(`DELETE FROM ${tbl};`);
                } catch {}
            }

            // Restaurar na ordem correta
            const restoreOrder = tableOrder.slice().reverse();
            for (const tbl of restoreOrder) {
                const rows = backupData.tables[tbl];
                if (Array.isArray(rows) && rows.length > 0) {
                    const columns = Object.keys(rows[0]);
                    const placeholders = columns.map(() => '?').join(', ');
                    const insertSql = `INSERT INTO ${tbl} (${columns.join(', ')}) VALUES (${placeholders})`;
                    const stmt = db.prepare(insertSql);

                    for (const row of rows) {
                        const vals = columns.map(c => row[c]);
                        stmt.run(...vals);
                    }
                }
            }

            db.exec('PRAGMA foreign_keys = ON;');
            return { success: true, restoredAt: new Date().toISOString() };
        });
    }
}
