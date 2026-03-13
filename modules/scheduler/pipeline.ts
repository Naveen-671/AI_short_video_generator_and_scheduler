import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { runTrendDetection } from '../trend/runTrendDetection.js';
import { generateFromTrends } from '../topic/generateFromTrends.js';
import { generateScriptsFromTopics } from '../script/generateScripts.js';
import { synthesizeForScripts } from '../voice/synthesizeForScripts.js';
import { renderFromScript } from '../video/renderFromScript.js';
import { generateForVideos } from '../captions/generateForVideos.js';
import { uploadVideos } from '../uploader/uploadVideos.js';
import type { SchedulerConfig, PipelineRunResult, PipelineStepResult } from './types.js';

const logger = createLogger('scheduler');
const LOCK_PATH = path.resolve('data/locks/pipeline.lock');
const CONFIG_PATH = path.resolve('config/scheduler.json');

function acquireLock(): boolean {
  const lockDir = path.dirname(LOCK_PATH);
  safeMkdir(lockDir);

  if (fs.existsSync(LOCK_PATH)) {
    const lockContent = fs.readFileSync(LOCK_PATH, 'utf-8');
    const lockTime = new Date(lockContent).getTime();
    const now = Date.now();
    // Stale lock after 2 hours
    if (now - lockTime < 2 * 60 * 60 * 1000) {
      return false;
    }
    logger.info('Stale lock detected, removing');
  }

  fs.writeFileSync(LOCK_PATH, new Date().toISOString(), 'utf-8');
  return true;
}

function releaseLock(): void {
  if (fs.existsSync(LOCK_PATH)) {
    fs.unlinkSync(LOCK_PATH);
  }
}

function loadConfig(): SchedulerConfig {
  const config = readJson<SchedulerConfig>(CONFIG_PATH);
  if (!config) {
    return {
      intervalHours: 6,
      channels: ['anime_explains', 'ai_tools', 'tech_facts'],
      pipeline: {
        trends: true, topics: true, scripts: true,
        voice: true, video: true, captions: true, upload: true,
      },
      defaults: { variants: 3, lengths: [30], concurrency: 2 },
    };
  }
  return config;
}

async function runStep(
  name: string,
  fn: () => Promise<string | void>,
): Promise<PipelineStepResult> {
  const start = Date.now();
  try {
    const artifactPath = await fn();
    return {
      step: name,
      status: 'success',
      artifactPath: artifactPath ?? undefined,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Step ${name} failed`, err instanceof Error ? err : new Error(error));
    return {
      step: name,
      status: 'failed',
      error,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute the full pipeline once.
 */
export async function runPipeline(): Promise<PipelineRunResult> {
  const config = loadConfig();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = new Date().toISOString();

  if (!acquireLock()) {
    throw new Error('Pipeline lock is active — another run may be in progress');
  }

  logger.info(`Pipeline started: ${runId}`);
  const steps: PipelineStepResult[] = [];

  try {
    // 1. Trend detection
    if (config.pipeline.trends) {
      const trendStep = await runStep('trends', async () => {
        const result = await runTrendDetection({
          offlineFixtures: path.resolve('tests/fixtures/trend'),
          force: true,
        });
        const outputPath = path.resolve(
          'data/trends',
          `${result.runId.replace(/[:.]/g, '-')}.json`,
        );
        return outputPath;
      });
      steps.push(trendStep);

      if (trendStep.status === 'failed') {
        return finalize(runId, startedAt, steps, 'failed');
      }

      // 2. Topic generation
      if (config.pipeline.topics && trendStep.artifactPath) {
        const topicStep = await runStep('topics', async () => {
          await generateFromTrends(trendStep.artifactPath!, {
            runId,
            variants: config.defaults.variants,
            force: true,
          });
          return path.resolve('data/topics', `${runId}.json`);
        });
        steps.push(topicStep);
      }
    }

    // 3. Script generation
    if (config.pipeline.scripts) {
      const scriptStep = await runStep('scripts', () =>
        generateScriptsFromTopics(runId, {
          variants: config.defaults.variants,
          lengths: config.defaults.lengths,
          force: true,
        }),
      );
      steps.push(scriptStep);
    }

    // 4. Voice synthesis
    if (config.pipeline.voice) {
      const voiceStep = await runStep('voice', () =>
        synthesizeForScripts(runId, {
          concurrency: config.defaults.concurrency,
        }),
      );
      steps.push(voiceStep);
    }

    // 5. Video rendering
    if (config.pipeline.video) {
      const videoStep = await runStep('video', () =>
        renderFromScript(runId, {
          concurrency: config.defaults.concurrency,
        }),
      );
      steps.push(videoStep);
    }

    // 6. Captions
    if (config.pipeline.captions) {
      const captionStep = await runStep('captions', () =>
        generateForVideos(runId),
      );
      steps.push(captionStep);
    }

    // 7. Upload
    if (config.pipeline.upload) {
      const uploadStep = await runStep('upload', () => uploadVideos(runId));
      steps.push(uploadStep);
    }

    const hasFailures = steps.some((s) => s.status === 'failed');
    const status = hasFailures ? 'partial' : 'success';
    return finalize(runId, startedAt, steps, status);
  } finally {
    releaseLock();
  }
}

function finalize(
  runId: string,
  startedAt: string,
  steps: PipelineStepResult[],
  status: 'success' | 'partial' | 'failed',
): PipelineRunResult {
  const result: PipelineRunResult = {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    status,
  };

  const historyDir = path.resolve('data/runs');
  safeMkdir(historyDir);
  writeJson(path.join(historyDir, `${runId}.json`), result);

  logger.info(
    `Pipeline ${status}: ${steps.filter((s) => s.status === 'success').length}/${steps.length} steps succeeded`,
  );

  return result;
}

/**
 * Start the scheduler with periodic execution.
 * Uses setInterval (in production, use node-cron for cron expressions).
 */
export function startScheduler(): { stop: () => void } {
  const config = loadConfig();
  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  logger.info(`Scheduler started: interval=${config.intervalHours}h`);

  // Run immediately
  runPipeline().catch((err) => {
    logger.error('Pipeline run failed', err instanceof Error ? err : new Error(String(err)));
  });

  // Schedule periodic runs
  const timer = setInterval(() => {
    runPipeline().catch((err) => {
      logger.error('Scheduled pipeline run failed', err instanceof Error ? err : new Error(String(err)));
    });
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
      logger.info('Scheduler stopped');
    },
  };
}
