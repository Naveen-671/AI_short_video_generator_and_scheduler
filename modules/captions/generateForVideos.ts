import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import {
  formatSrt,
  formatVtt,
  mockTranscribe,
  averageConfidence,
  validateTimestamps,
} from './captionHelpers.js';
import type { ScriptArtifact } from '../script/types.js';
import type { VideoManifest } from '../video/types.js';
import type {
  CaptionOptions,
  CaptionsManifest,
  CaptionResult,
  WordHighlight,
} from './types.js';

const logger = createLogger('captions');

/**
 * Extract word highlights from script display bullets and timed segments.
 */
function extractHighlights(script: ScriptArtifact): WordHighlight[] {
  const keywords = new Set<string>();

  for (const bullet of script.displayBullets) {
    for (const word of bullet.split(/\s+/)) {
      if (word.length > 3) keywords.add(word.toLowerCase());
    }
  }

  const highlights: WordHighlight[] = [];
  for (const seg of script.timedSegments) {
    const words = seg.text.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (keywords.has(clean)) {
        // Estimate word position within segment
        const idx = words.indexOf(word);
        const segDuration = seg.endSec - seg.startSec;
        const wordStart = seg.startSec + (idx / words.length) * segDuration;
        const wordEnd = wordStart + segDuration / words.length;
        highlights.push({ word: clean, startSec: wordStart, endSec: wordEnd });
      }
    }
  }

  return highlights;
}

/**
 * Process captions for a single video/script pair.
 */
async function processCaption(
  script: ScriptArtifact,
  videoDir: string,
  captionsDir: string,
  _options: CaptionOptions,
): Promise<CaptionResult> {
  const videoFile = `${script.scriptId}.mp4`;

  // Use mock transcription (in production would use whisper)
  const segments = mockTranscribe(script.timedSegments);

  if (segments.length === 0) {
    logger.info(`No speech detected for ${script.scriptId}`);
    return {
      videoFile,
      srtPath: '',
      vttPath: '',
      burnedPath: null,
      highlightsPath: null,
      confidence: 0,
      needs_review: false,
      noSpeech: true,
      speaker: 'Narrator',
    };
  }

  // Validate timestamps
  if (!validateTimestamps(segments)) {
    logger.info(`Overlapping timestamps in ${script.scriptId}, re-sorting`);
    segments.sort((a, b) => a.startSec - b.startSec);
  }

  // Generate SRT
  const srtContent = formatSrt(segments);
  const srtPath = path.join(videoDir, `${script.scriptId}.srt`);
  fs.writeFileSync(srtPath, srtContent, 'utf-8');

  // Generate VTT
  const vttContent = formatVtt(segments);
  const vttPath = path.join(videoDir, `${script.scriptId}.vtt`);
  fs.writeFileSync(vttPath, vttContent, 'utf-8');

  // Extract highlights
  const highlights = extractHighlights(script);
  let highlightsPath: string | null = null;
  if (highlights.length > 0) {
    highlightsPath = path.join(captionsDir, `${script.scriptId}.highlights.json`);
    writeJson(highlightsPath, highlights);
  }

  // Compute confidence
  const confidence = averageConfidence(segments);
  const needsReview = confidence < 0.7;

  // Burn-in (would use ffmpeg in production)
  let burnedPath: string | null = null;
  if (_options.burnIn) {
    burnedPath = path.join(videoDir, `${script.scriptId}.burned.mp4`);
    // Mock: just copy the original video
    const originalVideo = path.join(videoDir, videoFile);
    if (fs.existsSync(originalVideo)) {
      fs.copyFileSync(originalVideo, burnedPath);
    } else {
      // Create placeholder
      safeMkdir(path.dirname(burnedPath));
      fs.writeFileSync(burnedPath, Buffer.alloc(100, 0));
    }
    logger.info(`Burned subtitles into ${burnedPath}`);
  }

  return {
    videoFile,
    srtPath,
    vttPath,
    burnedPath,
    highlightsPath,
    confidence,
    needs_review: needsReview,
    noSpeech: false,
    speaker: 'Narrator',
  };
}

/**
 * Main entry: generate captions for all videos in a run.
 * Returns path to the captions manifest JSON.
 */
export async function generateForVideos(
  runId: string,
  options: CaptionOptions = {},
): Promise<string> {
  const sanitizedRunId = runId.replace(/[:.]/g, '-');

  // Load scripts
  const scriptsPath = path.resolve('data/scripts', `${sanitizedRunId}.json`);
  const scripts = readJson<ScriptArtifact[]>(scriptsPath);
  if (!scripts) throw new Error(`Scripts artifact not found: ${scriptsPath}`);

  // Load video manifest (optional — we mainly need scripts for text)
  const videoManifestPath = path.resolve('data/videos', `${sanitizedRunId}.json`);
  readJson<VideoManifest>(videoManifestPath); // just verify it exists or is available

  const videoDir = path.resolve('data/videos', sanitizedRunId);
  safeMkdir(videoDir);

  const captionsDir = path.resolve('data/captions', sanitizedRunId);
  safeMkdir(captionsDir);

  const manifestPath = path.resolve('data/captions', `${sanitizedRunId}.json`);

  // Idempotency
  if (fs.existsSync(manifestPath)) {
    const existing = readJson<CaptionsManifest>(manifestPath);
    if (existing && existing.items.length === scripts.length) {
      logger.info(`Captions manifest exists: ${manifestPath}`);
      return manifestPath;
    }
  }

  logger.info(`Captions generation starting: ${scripts.length} scripts`);

  const items: CaptionResult[] = [];
  let successes = 0;
  let failures = 0;

  for (const script of scripts) {
    try {
      const result = await processCaption(script, videoDir, captionsDir, options);
      items.push(result);
      successes++;
    } catch (err) {
      failures++;
      logger.error(
        `Caption generation failed for ${script.scriptId}`,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  const manifest: CaptionsManifest = { runId, items };
  writeJson(manifestPath, manifest);
  logger.info(
    `Captions generation complete: ${successes} successes, ${failures} failures → ${manifestPath}`,
  );

  return manifestPath;
}
