import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Database {
    constructor(dbPath) {
        this.dbPath = dbPath || join(process.cwd(), 'esteira.db');
        const dir = dirname(this.dbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        this.db = new DatabaseSync(this.dbPath);
        this.inTransaction = false;
        this.initSchema();
    }

    initSchema() {
        const schemaPath = join(__dirname, 'schema.sql');
        const schemaSql = readFileSync(schemaPath, 'utf8');
        this.db.exec('PRAGMA foreign_keys = ON;');
        this.db.exec(schemaSql);

        // Tabela interna para garantir IDs sequenciais imutáveis e sem reutilização
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS id_sequences (
                prefix TEXT PRIMARY KEY,
                current_val INTEGER NOT NULL DEFAULT 0
            );
        `);
    }

    getNextId(prefix) {
        const needTx = !this.inTransaction;
        if (needTx) {
            this.db.exec('BEGIN TRANSACTION;');
            this.inTransaction = true;
        }

        try {
            const stmtGet = this.db.prepare('SELECT current_val FROM id_sequences WHERE prefix = ?');
            const row = stmtGet.get(prefix);
            let nextVal = 1;
            if (row) {
                nextVal = row.current_val + 1;
                const stmtUpd = this.db.prepare('UPDATE id_sequences SET current_val = ? WHERE prefix = ?');
                stmtUpd.run(nextVal, prefix);
            } else {
                const maxFromTable = this.findMaxIdFromExistingTables(prefix);
                nextVal = Math.max(nextVal, maxFromTable + 1);
                const stmtIns = this.db.prepare('INSERT INTO id_sequences (prefix, current_val) VALUES (?, ?)');
                stmtIns.run(prefix, nextVal);
            }

            if (needTx) {
                this.db.exec('COMMIT;');
                this.inTransaction = false;
            }

            return `${prefix}-${String(nextVal).padStart(3, '0')}`;
        } catch (err) {
            if (needTx) {
                try { this.db.exec('ROLLBACK;'); } catch {}
                this.inTransaction = false;
            }
            throw err;
        }
    }

    findMaxIdFromExistingTables(prefix) {
        const tableMap = {
            'PRJ': 'projects',
            'FUN': 'features',
            'REQ': 'requirements',
            'IA': 'ai_participants',
            'TSK': 'tasks',
            'EXE': 'executions',
            'ENT': 'deliveries',
            'DEC': 'decisions',
            'ERR': 'errors',
            'TST': 'tests',
            'EVT': 'events'
        };
        const table = tableMap[prefix];
        if (!table) return 0;
        try {
            const rows = this.db.prepare(`SELECT id FROM ${table}`).all();
            let maxNum = 0;
            for (const r of rows) {
                if (typeof r.id === 'string' && r.id.startsWith(prefix + '-')) {
                    const num = parseInt(r.id.split('-')[1], 10);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            }
            return maxNum;
        } catch {
            return 0;
        }
    }

    transaction(fn) {
        if (this.inTransaction) {
            // Já dentro de transação, apenas executa
            return fn(this.db);
        }

        this.db.exec('BEGIN TRANSACTION;');
        this.inTransaction = true;
        try {
            const res = fn(this.db);
            this.db.exec('COMMIT;');
            this.inTransaction = false;
            return res;
        } catch (err) {
            try { this.db.exec('ROLLBACK;'); } catch {}
            this.inTransaction = false;
            throw err;
        }
    }

    close() {
        this.db.close();
    }
}
