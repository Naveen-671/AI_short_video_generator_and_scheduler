import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { withRetry } from '../retry.js';
import { getPlatformUploaders } from './platforms.js';
import type { ScriptArtifact } from '../script/types.js';
import type { VideoManifest } from '../video/types.js';
import type {
  UploadOptions,
  UploadManifest,
  UploadRecord,
  UploadMetadata,
  PlatformName,
} from './types.js';

const logger = createLogger('uploader');

/**
 * Build upload metadata from script artifact.
 */
function buildMetadata(script: ScriptArtifact, srtPath: string | null, durationSec: number): UploadMetadata {
  return {
    title: script.title,
    description: script.displayBullets.join('\n'),
    tags: (script as unknown as { hashtags?: string[] }).hashtags ?? [],
    captionPath: srtPath,
    durationSec,
  };
}

/**
 * Main entry: upload all videos in a run to configured platforms.
 * Returns path to the upload manifest JSON.
 */
export async function uploadVideos(
  runId: string,
  options: UploadOptions = {},
): Promise<string> {
  const sanitizedRunId = runId.replace(/[:.]/g, '-');

  // Load scripts
  const scriptsPath = path.resolve('data/scripts', `${sanitizedRunId}.json`);
  const scripts = readJson<ScriptArtifact[]>(scriptsPath);
  if (!scripts) throw new Error(`Scripts artifact not found: ${scriptsPath}`);

  // Load video manifest
  const videoManifestPath = path.resolve('data/videos', `${sanitizedRunId}.json`);
  const videoManifest = readJson<VideoManifest>(videoManifestPath);
  if (!videoManifest) throw new Error(`Video manifest not found: ${videoManifestPath}`);

  const outputDir = path.resolve('data/uploads');
  safeMkdir(outputDir);
  const manifestPath = path.join(outputDir, `${sanitizedRunId}.json`);

  // Idempotency
  if (fs.existsSync(manifestPath) && !options.dryRun) {
    const existing = readJson<UploadManifest>(manifestPath);
    if (existing && existing.uploads.length > 0) {
      logger.info(`Upload manifest exists: ${manifestPath}`);
      return manifestPath;
    }
  }

  const allUploaders = getPlatformUploaders();
  const targetPlatforms: PlatformName[] = options.platforms ?? ['youtube', 'instagram'];
  const uploaders = allUploaders.filter((u) => targetPlatforms.includes(u.name));

  logger.info(
    `Upload starting: ${videoManifest.items.length} videos × ${uploaders.length} platforms`,
  );

  const uploads: UploadRecord[] = [];

  for (const videoItem of videoManifest.items) {
    const script = scripts.find((s) => s.scriptId === videoItem.scriptId);
    if (!script) {
      logger.info(`No script found for ${videoItem.scriptId}, skipping`);
      continue;
    }

    const srtPath = videoItem.srtPath && fs.existsSync(videoItem.srtPath) ? videoItem.srtPath : null;
    const metadata = buildMetadata(script, srtPath, videoItem.durationSec);

    for (const uploader of uploaders) {
      if (options.dryRun) {
        logger.info(`[DRY-RUN] Would upload ${videoItem.scriptId} to ${uploader.name}`);
        uploads.push({
          platform: uploader.name,
          videoId: 'dry-run',
          scriptId: videoItem.scriptId,
          videoPath: videoItem.videoPath,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          captionPath: srtPath,
          uploadedAt: new Date().toISOString(),
          status: 'skipped',
        });
        continue;
      }

      try {
        const result = await withRetry(
          () => uploader.upload(videoItem.videoPath, metadata),
          { label: `upload-${uploader.name}-${videoItem.scriptId}`, maxRetries: 3 },
        );

        uploads.push({
          platform: uploader.name,
          videoId: result.videoId,
          scriptId: videoItem.scriptId,
          videoPath: videoItem.videoPath,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          captionPath: srtPath,
          uploadedAt: new Date().toISOString(),
          status: 'success',
        });

        logger.info(`Uploaded ${videoItem.scriptId} to ${uploader.name}: ${result.videoId}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        uploads.push({
          platform: uploader.name,
          videoId: '',
          scriptId: videoItem.scriptId,
          videoPath: videoItem.videoPath,
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          captionPath: srtPath,
          uploadedAt: new Date().toISOString(),
          status: 'failed',
          error,
        });

        logger.error(
          `Upload failed for ${videoItem.scriptId} to ${uploader.name}`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  const manifest: UploadManifest = { runId, uploads };
  writeJson(manifestPath, manifest);

  const successes = uploads.filter((u) => u.status === 'success').length;
  const failures = uploads.filter((u) => u.status === 'failed').length;
  logger.info(
    `Upload complete: ${successes} successes, ${failures} failures → ${manifestPath}`,
  );

  return manifestPath;
}
