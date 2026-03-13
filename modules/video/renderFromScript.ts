import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { getTemplateForChannel } from './templates.js';
import { generateSrt, buildFfmpegCommand, calculateDuration } from './renderHelpers.js';
import type { OverlayInfo } from './renderHelpers.js';
import type { ScriptArtifact } from '../script/types.js';
import type { AudioManifest } from '../voice/types.js';
import type { RenderOptions, VideoManifest, VideoManifestItem } from './types.js';

const logger = createLogger('video');

/**
 * Check if ffmpeg is available on the system.
 */
function findFfmpeg(): string | null {
  const envPath = process.env['FFMPEG_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    logger.info(`ffmpeg found via FFMPEG_PATH: ${envPath}`);
    return envPath;
  }

  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    logger.info('ffmpeg found in PATH');
    return 'ffmpeg';
  } catch (err) {
    logger.error(`ffmpeg not found: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Generate a thumbnail for a video (placeholder when ffmpeg unavailable).
 */
function generateThumbnail(
  outputPath: string,
  _scriptId: string,
  ffmpegPath: string | null,
  videoPath?: string,
): void {
  safeMkdir(path.dirname(outputPath));

  if (ffmpegPath && videoPath && fs.existsSync(videoPath)) {
    try {
      execFileSync(ffmpegPath, [
        '-y', '-i', videoPath,
        '-ss', '0.5',
        '-vframes', '1',
        outputPath,
      ], { stdio: 'pipe' });
      return;
    } catch {
      logger.info('ffmpeg thumbnail extraction failed, using placeholder');
    }
  }

  // Write a minimal placeholder PNG (1x1 pixel)
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // compressed
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND
    0xae, 0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(outputPath, pngHeader);
}

/**
 * Render a single script into a video.
 */
async function renderSingleVideo(
  script: ScriptArtifact,
  audioManifest: AudioManifest,
  runDir: string,
  ffmpegPath: string | null,
  options: RenderOptions,
): Promise<VideoManifestItem> {
  const template = getTemplateForChannel(script.channel, options.template);

  const videoPath = path.join(runDir, `${script.scriptId}.mp4`);
  const srtPath = path.join(runDir, `${script.scriptId}.srt`);
  const thumbDir = path.join(runDir, 'thumbs');
  const thumbPath = path.join(thumbDir, `${script.scriptId}.png`);

  // Find the audio file for this script
  const audioItem = audioManifest.items.find((i) => i.scriptId === script.scriptId);
  const audioPath = audioItem?.audioPath;

  // Recompute segment timings from actual audio durations (if available)
  // This ensures captions sync with the concatenated audio rather than the script's ideal timeline
  let segments = script.timedSegments;
  if (audioItem?.segmentDurations && audioItem.segmentDurations.length === segments.length) {
    let cursor = 0;
    segments = segments.map((seg, i) => {
      const dur = audioItem.segmentDurations![i]!;
      const adjusted = { ...seg, startSec: Math.round(cursor * 100) / 100, endSec: Math.round((cursor + dur) * 100) / 100 };
      cursor += dur;
      return adjusted;
    });
    logger.info(`Adjusted segment timings from audio durations for ${script.scriptId} (${Math.round(cursor * 10) / 10}s actual vs ${calculateDuration(script.timedSegments)}s scripted)`);
  }

  const durationSec = calculateDuration(segments);

  // Generate SRT file with actual timings
  safeMkdir(runDir);
  const srtContent = generateSrt(segments);
  fs.writeFileSync(srtPath, srtContent, 'utf-8');

  if (ffmpegPath && audioPath && fs.existsSync(audioPath) && !options.dryRun) {
    // Build overlay info from script metadata
    const overlayInfo: OverlayInfo = {
      title: script.title,
      sourceLine: script.sourceLine ?? '',
      displayBullets: script.displayBullets ?? [],
      totalDuration: durationSec,
    };

    // Real ffmpeg rendering
    const cmdArgs = buildFfmpegCommand(
      audioPath,
      videoPath,
      durationSec,
      segments,
      template,
      script.channel,
      options.watermark,
      overlayInfo,
    );

    logger.info(`Rendering ${script.scriptId}: ${cmdArgs[0]} [${cmdArgs.length} args]`);
    logger.info(`Filter complex: ${cmdArgs[cmdArgs.indexOf('-filter_complex') + 1]?.slice(0, 200)}...`);

    try {
      const tmpDir = path.join(runDir, 'tmp');
      safeMkdir(tmpDir);

      execFileSync(cmdArgs[0]!, cmdArgs.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300_000,
      });

      // Cleanup temp
      if (!options.keepTemp && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const stderr = (err as any)?.stderr?.toString?.() ?? '';
      logger.error(
        `ffmpeg render failed for ${script.scriptId}: ${errMsg}`,
        err instanceof Error ? err : new Error(String(err)),
      );
      if (stderr) logger.error(`ffmpeg stderr: ${stderr}`);
      // Fall through to mock rendering
      writeMockVideo(videoPath, durationSec);
    }
  } else {
    // Mock rendering (no ffmpeg or dry-run)
    if (options.dryRun) {
      const dryOverlay: OverlayInfo = {
        title: script.title,
        sourceLine: script.sourceLine ?? '',
        displayBullets: script.displayBullets ?? [],
        totalDuration: durationSec,
      };
      const cmdArgs = buildFfmpegCommand(
        audioPath ?? 'audio.mp3',
        videoPath,
        durationSec,
        segments,
        template,
        script.channel,
        options.watermark,
        dryOverlay,
      );
      logger.info(`[DRY-RUN] Would execute: ${cmdArgs.join(' ')}`);
    }
    writeMockVideo(videoPath, durationSec);
  }

  // Generate thumbnail
  generateThumbnail(thumbPath, script.scriptId, ffmpegPath, videoPath);

  return {
    scriptId: script.scriptId,
    videoPath,
    thumbnailPath: thumbPath,
    srtPath,
    durationSec,
    templateUsed: template.name,
    resolution: '1080x1920',
    codec: 'h264',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Write a mock video file (minimal MP4-like header for testing).
 */
function writeMockVideo(outputPath: string, durationSec: number): void {
  safeMkdir(path.dirname(outputPath));
  // Write a minimal placeholder (not a valid MP4 but sufficient for tests)
  const size = Math.max(200, durationSec * 100);
  const buf = Buffer.alloc(size, 0);
  // ftyp box header
  buf.write('ftypisom', 4, 'ascii');
  fs.writeFileSync(outputPath, buf);
}

/**
 * Main entry: render videos for all scripts in a run.
 * Returns path to the video manifest JSON.
 */
export async function renderFromScript(
  runId: string,
  options: RenderOptions = {},
): Promise<string> {
  const concurrency = options.concurrency ?? 1;
  const sanitizedRunId = runId.replace(/[:.]/g, '-');

  // Load scripts
  const scriptsPath = path.resolve('data/scripts', `${sanitizedRunId}.json`);
  const scripts = readJson<ScriptArtifact[]>(scriptsPath);
  if (!scripts) throw new Error(`Scripts artifact not found: ${scriptsPath}`);

  // Load audio manifest
  const audioManifestPath = path.resolve('data/audio', `${sanitizedRunId}.json`);
  const audioManifest = readJson<AudioManifest>(audioManifestPath) ?? {
    runId,
    items: [],
  };

  const runDir = path.resolve('data/videos', sanitizedRunId);
  safeMkdir(runDir);

  const manifestPath = path.resolve('data/videos', `${sanitizedRunId}.json`);

  // Idempotency
  if (fs.existsSync(manifestPath) && !options.template) {
    const existing = readJson<VideoManifest>(manifestPath);
    if (existing && existing.items.length === scripts.length) {
      logger.info(`Video manifest exists: ${manifestPath}`);
      return manifestPath;
    }
  }

  const ffmpegPath = findFfmpeg();
  if (!ffmpegPath) {
    logger.info('ffmpeg not found — using mock rendering');
  }

  logger.info(
    `Video rendering starting: ${scripts.length} scripts, concurrency=${concurrency}`,
  );

  const items: VideoManifestItem[] = [];
  let successes = 0;
  let failures = 0;

  // Process in batches
  for (let i = 0; i < scripts.length; i += concurrency) {
    const batch = scripts.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((script) =>
        renderSingleVideo(script, audioManifest, runDir, ffmpegPath, options),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        items.push(result.value);
        successes++;
      } else {
        failures++;
        logger.error(
          'Video render failed',
          result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        );
      }
    }
  }

  const manifest: VideoManifest = { runId, items };
  writeJson(manifestPath, manifest);
  logger.info(
    `Video rendering complete: ${successes} successes, ${failures} failures → ${manifestPath}`,
  );

  return manifestPath;
}
