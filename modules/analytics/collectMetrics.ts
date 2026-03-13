import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import type { UploadManifest, UploadRecord } from '../uploader/types.js';
import type { VideoMetrics, MetricsManifest, MetricsOptions } from './types.js';

const logger = createLogger('analytics');

/**
 * Compute engagement score from raw metrics.
 * Formula: views*0.4 + likes*0.3 + comments*0.3
 */
export function computeEngagement(views: number, likes: number, comments: number): number {
  return Math.round(views * 0.4 + likes * 0.3 + comments * 0.3);
}

/**
 * Mock metrics provider: generates simulated metrics for testing.
 * In production would call YouTube Data API / Instagram Insights API.
 */
function mockFetchMetrics(upload: UploadRecord): VideoMetrics {
  // Simulate different engagement levels based on hash of videoId
  const hash = upload.videoId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const views = 1000 + (hash % 50000);
  const likes = Math.floor(views * (0.05 + (hash % 10) / 100));
  const comments = Math.floor(views * (0.01 + (hash % 5) / 200));
  const shares = Math.floor(views * 0.005);
  const watchTime = views * 25; // avg 25s per view

  return {
    videoId: upload.videoId,
    platform: upload.platform,
    scriptId: upload.scriptId,
    views,
    likes,
    comments,
    shares,
    watchTime,
    engagementScore: computeEngagement(views, likes, comments),
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Collect metrics for all uploaded videos.
 * Returns path to the metrics manifest.
 */
export async function collectMetrics(options: MetricsOptions = {}): Promise<string> {
  const metricsDir = path.resolve('data/metrics');
  safeMkdir(metricsDir);

  const date = new Date().toISOString().split('T')[0]!;
  const manifestPath = path.join(metricsDir, `${date}.json`);

  // Find upload manifests
  const uploadsDir = path.resolve('data/uploads');
  if (!fs.existsSync(uploadsDir)) {
    logger.info('No uploads directory found');
    const manifest: MetricsManifest = { date, items: [] };
    writeJson(manifestPath, manifest);
    return manifestPath;
  }

  const uploadFiles = fs.readdirSync(uploadsDir).filter((f) => f.endsWith('.json'));

  // If runId specified, only process that run
  const targetFiles = options.runId
    ? uploadFiles.filter((f) => f.includes(options.runId!.replace(/[:.]/g, '-')))
    : uploadFiles;

  const allMetrics: VideoMetrics[] = [];

  for (const file of targetFiles) {
    const uploadManifest = readJson<UploadManifest>(path.join(uploadsDir, file));
    if (!uploadManifest) continue;

    for (const upload of uploadManifest.uploads) {
      if (upload.status !== 'success') continue;

      try {
        const metrics = mockFetchMetrics(upload);
        allMetrics.push(metrics);
        logger.info(
          `Collected metrics for ${upload.videoId}: views=${metrics.views}, engagement=${metrics.engagementScore}`,
        );
      } catch (err) {
        logger.error(
          `Failed to collect metrics for ${upload.videoId}`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  const manifest: MetricsManifest = { date, items: allMetrics };
  writeJson(manifestPath, manifest);

  logger.info(`Analytics collected: ${allMetrics.length} videos → ${manifestPath}`);
  return manifestPath;
}
