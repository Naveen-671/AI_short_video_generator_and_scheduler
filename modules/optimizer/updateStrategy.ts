import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson } from '../fsutils.js';
import type { MetricsManifest, VideoMetrics } from '../analytics/types.js';
import type { ScriptArtifact } from '../script/types.js';
import type { Strategy, ChannelPerformance, TopicPerformance, OptimizerOptions } from './types.js';

const logger = createLogger('optimizer');

const STRATEGY_PATH = path.resolve('data/strategy.json');

/**
 * Gather all metrics from data/metrics/*.json
 */
function loadAllMetrics(metricsDir: string): VideoMetrics[] {
  if (!fs.existsSync(metricsDir)) return [];

  const files = fs.readdirSync(metricsDir).filter((f) => f.endsWith('.json'));
  const all: VideoMetrics[] = [];

  for (const file of files) {
    const manifest = readJson<MetricsManifest>(path.join(metricsDir, file));
    if (manifest?.items) {
      all.push(...manifest.items);
    }
  }

  return all;
}

/**
 * Load all script artifacts to map scriptId → channel/topic
 */
function loadScriptMap(scriptsDir: string): Map<string, { channel: string; topic: string }> {
  const map = new Map<string, { channel: string; topic: string }>();
  if (!fs.existsSync(scriptsDir)) return map;

  const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const scripts = readJson<ScriptArtifact[]>(path.join(scriptsDir, file));
    if (!scripts || !Array.isArray(scripts)) continue;

    for (const script of scripts) {
      map.set(script.scriptId, {
        channel: script.channel,
        topic: script.title,
      });
    }
  }

  return map;
}

/**
 * Compute per-channel performance aggregates.
 */
function computeChannelPerformance(
  metrics: VideoMetrics[],
  scriptMap: Map<string, { channel: string; topic: string }>,
): ChannelPerformance[] {
  const channelStats = new Map<string, { totalEngagement: number; totalWatchTime: number; count: number }>();

  for (const m of metrics) {
    const info = scriptMap.get(m.scriptId);
    const channel = info?.channel ?? 'unknown';

    const existing = channelStats.get(channel) ?? { totalEngagement: 0, totalWatchTime: 0, count: 0 };
    existing.totalEngagement += m.engagementScore;
    existing.totalWatchTime += m.watchTime;
    existing.count += 1;
    channelStats.set(channel, existing);
  }

  return Array.from(channelStats.entries())
    .map(([channel, stats]) => ({
      channel,
      avgEngagement: Math.round(stats.totalEngagement / stats.count),
      avgWatchTime: Math.round(stats.totalWatchTime / stats.count),
      videoCount: stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}

/**
 * Compute per-topic performance aggregates.
 */
function computeTopicPerformance(
  metrics: VideoMetrics[],
  scriptMap: Map<string, { channel: string; topic: string }>,
): TopicPerformance[] {
  const topicStats = new Map<string, { totalEngagement: number; count: number }>();

  for (const m of metrics) {
    const info = scriptMap.get(m.scriptId);
    const topic = info?.topic ?? 'unknown';

    const existing = topicStats.get(topic) ?? { totalEngagement: 0, count: 0 };
    existing.totalEngagement += m.engagementScore;
    existing.count += 1;
    topicStats.set(topic, existing);
  }

  return Array.from(topicStats.entries())
    .map(([topic, stats]) => ({
      topic,
      avgEngagement: Math.round(stats.totalEngagement / stats.count),
      videoCount: stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
}

/**
 * Determine recommended frequency based on performance data.
 * Higher engagement → more frequent posting.
 */
function computeFrequency(channelPerf: ChannelPerformance[]): number {
  if (channelPerf.length === 0) return 1;

  const avgEngagement =
    channelPerf.reduce((sum, c) => sum + c.avgEngagement, 0) / channelPerf.length;

  if (avgEngagement > 5000) return 6;
  if (avgEngagement > 2000) return 4;
  if (avgEngagement > 500) return 3;
  return 2;
}

/**
 * Update the content strategy based on historical metrics.
 * Reads data/metrics/, data/scripts/ and produces data/strategy.json.
 */
export async function updateStrategy(options: OptimizerOptions = {}): Promise<string> {
  const metricsDir = options.metricsDir ?? path.resolve('data/metrics');
  const scriptsDir = options.scriptsDir ?? path.resolve('data/scripts');

  const metrics = loadAllMetrics(metricsDir);
  const scriptMap = loadScriptMap(scriptsDir);

  if (metrics.length === 0) {
    logger.info('No metrics data found — writing default strategy');
    const defaultStrategy: Strategy = {
      bestChannel: 'anime_explains',
      topTopics: [],
      recommendedFrequency: 2,
      channelPerformance: [],
      topicPerformance: [],
      updatedAt: new Date().toISOString(),
    };
    writeJson(STRATEGY_PATH, defaultStrategy);
    return STRATEGY_PATH;
  }

  const channelPerformance = computeChannelPerformance(metrics, scriptMap);
  const topicPerformance = computeTopicPerformance(metrics, scriptMap);

  const bestChannel = channelPerformance[0]?.channel ?? 'anime_explains';
  const topTopics = topicPerformance.slice(0, 5).map((t) => t.topic);
  const recommendedFrequency = computeFrequency(channelPerformance);

  const strategy: Strategy = {
    bestChannel,
    topTopics,
    recommendedFrequency,
    channelPerformance,
    topicPerformance,
    updatedAt: new Date().toISOString(),
  };

  writeJson(STRATEGY_PATH, strategy);
  logger.info(
    `Strategy updated: best=${bestChannel}, frequency=${recommendedFrequency}, topTopics=${topTopics.length}`,
  );

  return STRATEGY_PATH;
}
