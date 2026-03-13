import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeMkdir, writeJson, readJson } from '../modules/fsutils.js';
import { createLogger } from '../modules/logger.js';

const logger = createLogger('cli');

interface ScanResult {
  inputPath: string;
  scannedAt: string;
  files: string[];
}

function scanDirectory(dirPath: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectory(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

export function run(inputPath: string, force = false): ScanResult {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input path does not exist: ${resolved}`);
  }

  // Determine output path based on the input directory name
  const dirName = path.basename(resolved);
  const outputPath = path.resolve('data', 'results', `scan-${dirName}.json`);

  // Idempotency check
  if (fs.existsSync(outputPath) && !force) {
    const msg = `artifact exists — use --force to re-run (${outputPath})`;
    logger.info(msg);
    // eslint-disable-next-line no-console
    console.log(msg);
    const existing = readJson<ScanResult>(outputPath);
    if (existing) return existing;
  }

  logger.info(`Scanning ${resolved}`);
  const files = scanDirectory(resolved).map((f) =>
    path.relative(resolved, f).replace(/\\/g, '/'),
  );

  const result: ScanResult = {
    inputPath: resolved,
    scannedAt: new Date().toISOString(),
    files,
  };

  safeMkdir(path.dirname(outputPath));
  writeJson(outputPath, result);
  logger.info(`Wrote scan result to ${outputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Scan complete: ${outputPath}`);
  return result;
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length > 0) {
  const inputPath = args[0]!;
  const force = args.includes('--force');
  try {
    run(inputPath, force);
  } catch (err) {
    logger.error('CLI failed', err instanceof Error ? err : new Error(String(err)));
    // eslint-disable-next-line no-console
    console.error('Error:', (err as Error).message);
    process.exit(1);
  }
}
