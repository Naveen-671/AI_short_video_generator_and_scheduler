import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { safeMkdir, writeJson, readJson } from '../fsutils.js';
import type { TrendRunResult, TrendSourceConfig, SourceScore, TrendAdapter } from './types.js';
import { mergeTopics } from './normalize.js';
import { hackerNewsAdapter } from './adapters/hackerNews.js';
import { redditAdapter } from './adapters/reddit.js';
import { googleTrendsAdapter } from './adapters/googleTrends.js';
import { createRssAdapter } from './adapters/rssFetcher.js';

const logger = createLogger('trend');

export interface TrendDetectionOptions {
  hours?: number;
  top?: number;
  force?: boolean;
  offlineFixtures?: string; // Path to fixture dir for offline/testing mode
}

function loadConfig(): TrendSourceConfig {
  const configPath = path.resolve('config/trend_sources.json');
  const config = readJson<TrendSourceConfig>(configPath);
  if (!config) {
    throw new Error(`Trend config not found at ${configPath}`);
  }
  return config;
}

export async function runTrendDetection(
  options: TrendDetectionOptions = {},
): Promise<TrendRunResult> {
  const config = loadConfig();
  const hoursWindow = options.hours ?? config.defaultHoursWindow;
  const topN = options.top ?? config.topN;
  const runId = new Date().toISOString();

  logger.info(`Starting trend detection run ${runId} (window: ${hoursWindow}h, top: ${topN})`);

  // Check for existing artifact (idempotency)
  const outputDir = path.resolve('data/trends');
  const outputPath = path.join(outputDir, `${runId.replace(/[:.]/g, '-')}.json`);

  // If in offline/fixture mode, load from fixtures
  if (options.offlineFixtures) {
    return loadFromFixtures(options.offlineFixtures, runId, config, topN);
  }

  // Build list of enabled adapters
  const adapters: TrendAdapter[] = [];
  if (config.sources.hackerNews.enabled) adapters.push(hackerNewsAdapter);
  if (config.sources.reddit.enabled) adapters.push(redditAdapter);
  if (config.sources.googleTrends.enabled) adapters.push(googleTrendsAdapter);
  if (config.sources.rss.enabled) adapters.push(createRssAdapter(config.rssFeeds));

  // Fetch from all sources
  const allScores: SourceScore[] = [];

  for (const adapter of adapters) {
    try {
      logger.info(`Running adapter: ${adapter.name}`);
      const scores = await adapter.fetch(hoursWindow);
      allScores.push(...scores);
      logger.info(`${adapter.name} returned ${scores.length} items`);
    } catch (err) {
      logger.error(
        `Adapter ${adapter.name} failed, continuing with others`,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // Override topN in config for this run
  const runConfig = { ...config, topN };
  const mergedTopics = mergeTopics(allScores, runConfig);

  const result: TrendRunResult = {
    runId,
    sourceScores: allScores,
    mergedTopics,
  };

  // Save artifact
  safeMkdir(outputDir);
  writeJson(outputPath, result);
  logger.info(
    `Trend run complete: ${allScores.length} source scores, ${mergedTopics.length} merged topics → ${outputPath}`,
  );

  // Update history.json for dedup
  updateHistory(runId, outputPath);

  return result;
}

function loadFromFixtures(
  fixtureDir: string,
  runId: string,
  config: TrendSourceConfig,
  topN: number,
): TrendRunResult {
  const resolved = path.resolve(fixtureDir);
  logger.info(`Loading fixtures from ${resolved}`);

  const allScores: SourceScore[] = [];

  // Load each fixture file
  const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const data = readJson<SourceScore[]>(path.join(resolved, file));
    if (data && Array.isArray(data)) {
      allScores.push(...data);
    }
  }

  const runConfig = { ...config, topN };
  const mergedTopics = mergeTopics(allScores, runConfig);

  const result: TrendRunResult = {
    runId,
    sourceScores: allScores,
    mergedTopics,
  };

  // Save artifact
  const outputDir = path.resolve('data/trends');
  const outputPath = path.join(outputDir, `${runId.replace(/[:.]/g, '-')}.json`);
  safeMkdir(outputDir);
  writeJson(outputPath, result);
  logger.info(
    `Fixture run complete: ${allScores.length} source scores, ${mergedTopics.length} merged topics`,
  );

  return result;
}

function updateHistory(runId: string, artifactPath: string): void {
  const historyPath = path.resolve('data/trends/history.json');
  const history = readJson<Array<{ runId: string; path: string }>>(historyPath) ?? [];
  history.push({ runId, path: artifactPath });
  writeJson(historyPath, history);
}
