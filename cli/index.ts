import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeMkdir, writeJson, readJson } from '../modules/fsutils.js';
import { createLogger } from '../modules/logger.js';
import { runTrendDetection } from '../modules/trend/runTrendDetection.js';

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
const command = args[0];

if (command === 'trend') {
  // Parse trend options
  const hoursArg = args.find((a) => a.startsWith('--hours='));
  const topArg = args.find((a) => a.startsWith('--top='));
  const fixturesArg = args.find((a) => a.startsWith('--fixtures='));
  const force = args.includes('--force');

  const hours = hoursArg ? parseInt(hoursArg.split('=')[1]!, 10) : undefined;
  const top = topArg ? parseInt(topArg.split('=')[1]!, 10) : undefined;
  const offlineFixtures = fixturesArg ? fixturesArg.split('=')[1]! : undefined;

  runTrendDetection({ hours, top, force, offlineFixtures })
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`Trend detection complete: ${result.mergedTopics.length} merged topics`);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result.mergedTopics.slice(0, 5), null, 2));
    })
    .catch((err) => {
      logger.error('Trend detection failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (args.length > 0 && command) {
  // Legacy scan command
  const inputPath = command;
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
