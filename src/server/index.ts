import express, { type Express } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../../modules/logger.js';

const app: Express = express();
const PORT = parseInt(process.env['PORT'] || '3000', 10);
const logger = createLogger('server');

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/progress', (_req, res) => {
  const progressPath = path.resolve('progress.md');
  if (fs.existsSync(progressPath)) {
    const content = fs.readFileSync(progressPath, 'utf-8');
    res.type('text/markdown').send(content);
  } else {
    res.status(404).json({ error: 'progress.md not found' });
  }
});

export { app };

// Only start listening when run directly (not imported for tests)
const isDirectRun = process.argv[1]?.endsWith('server/index.ts') ||
  process.argv[1]?.endsWith('server/index.js');

if (isDirectRun) {
  app.listen(PORT, () => {
    logger.info(`Server listening on http://localhost:${PORT}`);
  });
}
