import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeMkdir, writeJson, readJson } from '../modules/fsutils.js';
import { createLogger } from '../modules/logger.js';
import { runTrendDetection } from '../modules/trend/runTrendDetection.js';
import { generateFromTrends } from '../modules/topic/generateFromTrends.js';
import { generateScriptsFromTopics } from '../modules/script/generateScripts.js';
import { synthesizeForScripts } from '../modules/voice/synthesizeForScripts.js';
import { renderFromScript } from '../modules/video/renderFromScript.js';
import { generateForVideos } from '../modules/captions/generateForVideos.js';
import { uploadVideos } from '../modules/uploader/uploadVideos.js';
import { runPipeline } from '../modules/scheduler/pipeline.js';

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
} else if (command === 'topics') {
  const runIdArg = args.find((a) => a.startsWith('--runId='));
  const variantsArg = args.find((a) => a.startsWith('--variants='));
  const trendPathArg = args.find((a) => a.startsWith('--trendPath='));
  const force = args.includes('--force');

  const runId = runIdArg ? runIdArg.split('=')[1]! : undefined;
  const variants = variantsArg ? parseInt(variantsArg.split('=')[1]!, 10) : undefined;

  // Find the trend artifact
  let trendPath = trendPathArg ? trendPathArg.split('=')[1]! : undefined;
  if (!trendPath) {
    // Try to find latest trend artifact
    const trendsDir = path.resolve('data/trends');
    if (fs.existsSync(trendsDir)) {
      const files = fs.readdirSync(trendsDir)
        .filter((f) => f.endsWith('.json') && f !== 'history.json')
        .sort()
        .reverse();
      if (files.length > 0) trendPath = path.join(trendsDir, files[0]!);
    }
  }

  if (!trendPath) {
    // eslint-disable-next-line no-console
    console.error('No trend artifact found. Run "trend" command first or provide --trendPath=...');
    process.exit(1);
  }

  generateFromTrends(trendPath, { runId, variants, force })
    .then((ideas) => {
      // eslint-disable-next-line no-console
      console.log(`Topic engine generated ${ideas.length} ideas`);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(ideas.slice(0, 3), null, 2));
    })
    .catch((err) => {
      logger.error('Topic engine failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'scripts') {
  const runIdArg = args.find((a) => a.startsWith('--runId='));
  const variantsArg = args.find((a) => a.startsWith('--variants='));
  const lengthsArg = args.find((a) => a.startsWith('--lengths='));
  const force = args.includes('--force');

  const runId = runIdArg ? runIdArg.split('=')[1]! : undefined;
  if (!runId) {
    // eslint-disable-next-line no-console
    console.error('--runId is required for scripts command');
    process.exit(1);
  }

  const variants = variantsArg ? parseInt(variantsArg.split('=')[1]!, 10) : undefined;
  const lengths = lengthsArg ? lengthsArg.split('=')[1]!.split(',').map(Number) : undefined;

  generateScriptsFromTopics(runId, { variants, lengths, force })
    .then((outputPath) => {
      // eslint-disable-next-line no-console
      console.log(`Scripts generated: ${outputPath}`);
    })
    .catch((err) => {
      logger.error('Script gen failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'voice') {
  const runIdArg = args.find((a) => a.startsWith('--runId='));
  const voiceArg = args.find((a) => a.startsWith('--voice='));
  const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));

  const runId = runIdArg ? runIdArg.split('=')[1]! : undefined;
  if (!runId) {
    // eslint-disable-next-line no-console
    console.error('--runId is required for voice command');
    process.exit(1);
  }

  const voice = voiceArg ? voiceArg.split('=')[1]! : undefined;
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]!, 10) : undefined;

  synthesizeForScripts(runId, { voice, concurrency })
    .then((manifestPath) => {
      // eslint-disable-next-line no-console
      console.log(`Voice synthesis complete: ${manifestPath}`);
    })
    .catch((err) => {
      logger.error('Voice synthesis failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'render') {
  const runIdArg = args.find((a) => a.startsWith('--runId='));
  const templateArg = args.find((a) => a.startsWith('--template='));
  const watermarkArg = args.find((a) => a.startsWith('--watermark='));
  const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));
  const dryRun = args.includes('--dry-run');
  const keepTemp = args.includes('--keep-temp');

  const runId = runIdArg ? runIdArg.split('=')[1]! : undefined;
  if (!runId) {
    // eslint-disable-next-line no-console
    console.error('--runId is required for render command');
    process.exit(1);
  }

  const template = templateArg ? templateArg.split('=')[1]! : undefined;
  const watermark = watermarkArg ? watermarkArg.split('=')[1]! : undefined;
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]!, 10) : undefined;

  renderFromScript(runId, { template, watermark, concurrency, dryRun, keepTemp })
    .then((manifestPath) => {
      // eslint-disable-next-line no-console
      console.log(`Video rendering complete: ${manifestPath}`);
    })
    .catch((err) => {
      logger.error('Video rendering failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'captions') {
  const runIdArg = args.find((a) => a.startsWith('--runId='));
  const burnIn = args.includes('--burnIn');
  const languageArg = args.find((a) => a.startsWith('--language='));

  const runId = runIdArg ? runIdArg.split('=')[1]! : undefined;
  if (!runId) {
    // eslint-disable-next-line no-console
    console.error('--runId is required for captions command');
    process.exit(1);
  }

  const language = languageArg ? languageArg.split('=')[1]! : undefined;

  generateForVideos(runId, { language, burnIn })
    .then((manifestPath) => {
      // eslint-disable-next-line no-console
      console.log(`Captions generated: ${manifestPath}`);
    })
    .catch((err) => {
      logger.error('Captions failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'upload') {
  const runIdArg = args.find((a) => a.startsWith('--runId='));
  const dryRun = args.includes('--dry-run');
  const platformsArg = args.find((a) => a.startsWith('--platforms='));

  const runId = runIdArg ? runIdArg.split('=')[1]! : undefined;
  if (!runId) {
    // eslint-disable-next-line no-console
    console.error('--runId is required for upload command');
    process.exit(1);
  }

  const platforms = platformsArg
    ? (platformsArg.split('=')[1]!.split(',') as ('youtube' | 'instagram')[])
    : undefined;

  uploadVideos(runId, { platforms, dryRun })
    .then((manifestPath) => {
      // eslint-disable-next-line no-console
      console.log(`Upload complete: ${manifestPath}`);
    })
    .catch((err) => {
      logger.error('Upload failed', err instanceof Error ? err : new Error(String(err)));
      // eslint-disable-next-line no-console
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
} else if (command === 'run') {
  runPipeline()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`Pipeline ${result.status}: ${result.steps.length} steps, runId=${result.runId}`);
    })
    .catch((err) => {
      logger.error('Pipeline failed', err instanceof Error ? err : new Error(String(err)));
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
