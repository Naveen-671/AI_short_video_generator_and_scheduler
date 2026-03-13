import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { getCached, setCache } from '../trend/cache.js';
import { getTTSProviders, getVoiceProfile } from './ttsProviders.js';
import type { ScriptArtifact, TimedSegment } from '../script/types.js';
import type {
  SynthesizeOptions,
  AudioManifest,
  AudioManifestItem,
  TTSProvider,
  TTSResult,
} from './types.js';

const logger = createLogger('voice');
const CACHE_MODULE = 'tts';

function makeCacheKey(text: string, voiceProfileName: string): string {
  return crypto
    .createHash('sha256')
    .update(`${text}:${voiceProfileName}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Synthesize a single text segment using the TTS provider chain with fallback.
 */
async function synthesizeSegment(
  text: string,
  voiceProfileName: string,
  outputPath: string,
  providers: TTSProvider[],
): Promise<TTSResult> {
  const cacheKey = makeCacheKey(text, voiceProfileName);

  // Check cache
  const cached = getCached<TTSResult>(CACHE_MODULE, cacheKey);
  if (cached && fs.existsSync(cached.audioPath)) {
    // Copy cached file to desired output location
    if (cached.audioPath !== outputPath) {
      safeMkdir(path.dirname(outputPath));
      fs.copyFileSync(cached.audioPath, outputPath);
    }
    logger.info(`TTS cache hit: ${cacheKey}`);
    return { ...cached, audioPath: outputPath };
  }

  const voiceProfile = getVoiceProfile(voiceProfileName);
  let lastError: Error | undefined;

  for (const provider of providers) {
    if (!provider.isAvailable()) continue;

    try {
      const result = await provider.synthesize(text, voiceProfile, outputPath);
      result.cacheKey = cacheKey;

      // Cache the result
      setCache(CACHE_MODULE, cacheKey, result, 48);
      logger.info(`TTS synthesized with ${provider.name}: ${cacheKey}`);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.error(`TTS provider ${provider.name} failed`, lastError);
    }
  }

  throw lastError ?? new Error('All TTS providers failed');
}

/**
 * Concatenate per-segment audio files into a final output.
 * Without ffmpeg, simply concatenates the raw bytes (good enough for mock provider).
 * In production, would use ffmpeg for proper concatenation and normalization.
 */
function concatenateAudioFiles(segmentPaths: string[], outputPath: string): void {
  safeMkdir(path.dirname(outputPath));
  const chunks = segmentPaths
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p));

  if (chunks.length === 0) {
    throw new Error('No audio segments to concatenate');
  }

  fs.writeFileSync(outputPath, Buffer.concat(chunks));
}

/**
 * Prepend verification notice for scripts that require it.
 */
function maybeAddVerificationPrefix(segments: TimedSegment[], requiresVerification: boolean): TimedSegment[] {
  if (!requiresVerification) return segments;

  const prefix: TimedSegment = {
    label: 'verification_notice',
    startSec: 0,
    endSec: 2,
    text: 'Note: this report is based on early reports.',
  };

  // Shift all other segments by 2 seconds
  const shifted = segments.map((seg) => ({
    ...seg,
    startSec: seg.startSec + 2,
    endSec: seg.endSec + 2,
  }));

  return [prefix, ...shifted];
}

/**
 * Process a single script: synthesize each segment, concatenate, return manifest item.
 */
async function processScript(
  script: ScriptArtifact,
  runDir: string,
  providers: TTSProvider[],
): Promise<AudioManifestItem> {
  const segments = maybeAddVerificationPrefix(
    script.timedSegments,
    script.requires_verification,
  );

  const segDir = path.join(runDir, 'segments', script.scriptId);
  safeMkdir(segDir);

  const segmentPaths: string[] = [];
  let totalDuration = 0;
  const channel = script.channel;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const segPath = path.join(segDir, `seg-${i.toString().padStart(3, '0')}.mp3`);

    const result = await synthesizeSegment(seg.text, channel, segPath, providers);
    segmentPaths.push(result.audioPath);
    totalDuration += result.durationSec;
  }

  // Concatenate all segments into final audio file
  const finalPath = path.join(runDir, `${script.scriptId}.mp3`);
  concatenateAudioFiles(segmentPaths, finalPath);

  // Check timing
  const expectedDuration = script.estimatedLengthSec;
  if (Math.abs(totalDuration - expectedDuration) > 1) {
    logger.info(
      `Timing mismatch for ${script.scriptId}: expected ${expectedDuration}s, got ${totalDuration}s`,
    );
  }

  const voiceProfile = getVoiceProfile(channel);

  return {
    scriptId: script.scriptId,
    audioPath: finalPath,
    durationSec: totalDuration,
    voiceProfile: voiceProfile.name,
    cacheKey: makeCacheKey(script.scriptId, channel),
    synthesisProvider: providers.find((p) => p.isAvailable())?.name ?? 'mock',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Main entry: synthesize audio for all scripts in a run.
 * Returns path to the audio manifest JSON.
 */
export async function synthesizeForScripts(
  runId: string,
  options: SynthesizeOptions = {},
): Promise<string> {
  const concurrency = options.concurrency ?? 2;
  const sanitizedRunId = runId.replace(/[:.]/g, '-');

  const scriptsPath = path.resolve('data/scripts', `${sanitizedRunId}.json`);
  const scripts = readJson<ScriptArtifact[]>(scriptsPath);
  if (!scripts) throw new Error(`Scripts artifact not found: ${scriptsPath}`);

  const runDir = path.resolve('data/audio', sanitizedRunId);
  safeMkdir(runDir);

  const manifestPath = path.resolve('data/audio', `${sanitizedRunId}.json`);

  // Idempotency
  if (fs.existsSync(manifestPath) && !options.voice) {
    const existing = readJson<AudioManifest>(manifestPath);
    if (existing && existing.items.length === scripts.length) {
      logger.info(`Audio manifest exists: ${manifestPath}`);
      return manifestPath;
    }
  }

  const providers = getTTSProviders();
  logger.info(
    `Voice synthesis starting: ${scripts.length} scripts, concurrency=${concurrency}`,
  );

  const items: AudioManifestItem[] = [];
  let successes = 0;
  let failures = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < scripts.length; i += concurrency) {
    const batch = scripts.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((script) => processScript(script, runDir, providers)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        items.push(result.value);
        successes++;
      } else {
        failures++;
        logger.error(
          'Script synthesis failed',
          result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        );
      }
    }
  }

  const manifest: AudioManifest = { runId, items };
  writeJson(manifestPath, manifest);
  logger.info(
    `Voice synthesis complete: ${successes} successes, ${failures} failures → ${manifestPath}`,
  );

  return manifestPath;
}
