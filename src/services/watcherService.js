import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class WatcherService {
    constructor(db, ingestionService) {
        this.db = db;
        this.ingestionService = ingestionService;
        this.intervalHandle = null;
        this.isProcessing = false;
    }

    start(intervalMs = 3000) {
        if (this.intervalHandle) return;
        this.intervalHandle = setInterval(() => {
            this.scanActiveProjectFolders();
        }, intervalMs);
    }

    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    scanActiveProjectFolders() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const projects = this.db.db.prepare('SELECT id, root_path FROM projects').all();
            for (const proj of projects) {
                const entradaDir = join(proj.root_path, 'gestao-ia', 'entrada');
                if (!existsSync(entradaDir)) continue;

                let files = [];
                try {
                    files = readdirSync(entradaDir);
                } catch {
                    continue;
                }

                for (const fileName of files) {
                    // Ignora arquivos temporários .tmp ou ocultos
                    if (!fileName.endsWith('.json') || fileName.endsWith('.tmp')) {
                        continue;
                    }

                    const fullPath = join(entradaDir, fileName);
                    try {
                        const content = readFileSync(fullPath, 'utf8');
                        // Tentar processar
                        this.ingestionService.processDeliveryFile(fullPath, content);
                    } catch (err) {
                        // Arquivo pode estar sendo travado temporariamente pelo SO
                    }
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }
}
