import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { getCached, setCache } from '../trend/cache.js';
import { getTTSProviders, getVoiceProfile } from './ttsProviders.js';
import { getCharacterForSpeaker } from '../video/characters.js';
import type { ScriptArtifact, TimedSegment, EmotionHint } from '../script/types.js';
import type {
  SynthesizeOptions,
  AudioManifest,
  AudioManifestItem,
  TTSProvider,
  TTSResult,
  VoiceProfile,
  Prosody,
} from './types.js';

const logger = createLogger('voice');
const CACHE_MODULE = 'tts';

/**
 * Maps emotion hints to prosody adjustments for expressive speech.
 * These values shift rate/pitch/volume to convey the target emotion.
 */
const EMOTION_PROSODY: Record<EmotionHint, Prosody> = {
  excited:   { rate: '+18%', pitch: '+8Hz', volume: '+12%' },
  surprised: { rate: '+10%', pitch: '+15Hz', volume: '+15%' },
  dramatic:  { rate: '-15%', pitch: '-5Hz', volume: '+5%' },
  calm:      { rate: '-5%', pitch: '+0Hz', volume: '+0%' },
  cheerful:  { rate: '+12%', pitch: '+6Hz', volume: '+8%' },
  serious:   { rate: '-8%', pitch: '-3Hz', volume: '+0%' },
  curious:   { rate: '+5%', pitch: '+10Hz', volume: '+5%' },
  sarcastic: { rate: '-5%', pitch: '+12Hz', volume: '+3%' },
};

/**
 * Infer emotion from segment label when no explicit emotion is set.
 */
function inferEmotion(label: string, speaker?: string): EmotionHint {
  if (label === 'hook') return 'excited';
  if (label.startsWith('react')) return speaker === 'reactor' ? 'surprised' : 'curious';
  if (label === 'cta') return 'cheerful';
  if (label.startsWith('explain')) return 'serious';
  if (label === 'reveal') return 'dramatic';
  return 'calm';
}

/**
 * Merge character default prosody with emotion-based prosody.
 * Emotion prosody takes priority, character defaults are the baseline.
 */
function mergeProsody(charDefault: Prosody, emotion: Prosody): Prosody {
  const parseVal = (s: string | undefined): number => {
    if (!s) return 0;
    return parseInt(s.replace(/[^-+\d]/g, ''), 10) || 0;
  };
  const suffix = (s: string | undefined): string => {
    if (!s) return '%';
    return s.replace(/[^a-zA-Z%]/g, '') || '%';
  };

  return {
    rate: `${parseVal(charDefault.rate) + parseVal(emotion.rate) > 0 ? '+' : ''}${parseVal(charDefault.rate) + parseVal(emotion.rate)}${suffix(emotion.rate)}`,
    pitch: `${parseVal(charDefault.pitch) + parseVal(emotion.pitch) > 0 ? '+' : ''}${parseVal(charDefault.pitch) + parseVal(emotion.pitch)}${suffix(emotion.pitch)}`,
    volume: `${parseVal(charDefault.volume) + parseVal(emotion.volume) > 0 ? '+' : ''}${parseVal(charDefault.volume) + parseVal(emotion.volume)}${suffix(emotion.volume)}`,
  };
}

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
  voiceProfile: VoiceProfile,
  outputPath: string,
  providers: TTSProvider[],
): Promise<TTSResult> {
  const cacheKey = makeCacheKey(text, voiceProfile.name);

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
 * In dialogue mode, uses different voices per speaker.
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
  const segmentDurations: number[] = [];
  let totalDuration = 0;
  const channel = script.channel;

  // Build voice profiles for dialogue
  const narratorChar = getCharacterForSpeaker(channel, 'narrator');
  const reactorChar = getCharacterForSpeaker(channel, 'reactor');
  const narratorVoice: VoiceProfile = {
    name: `${narratorChar.id}_voice`,
    description: `${narratorChar.name} voice`,
    ttsVoiceName: narratorChar.ttsVoice,
  };
  const reactorVoice: VoiceProfile = {
    name: `${reactorChar.id}_voice`,
    description: `${reactorChar.name} voice`,
    ttsVoiceName: reactorChar.ttsVoice,
  };
  // Fallback for non-dialogue scripts
  const defaultVoice = getVoiceProfile(channel);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const segPath = path.join(segDir, `seg-${i.toString().padStart(3, '0')}.mp3`);

    // Pick voice based on speaker in dialogue mode
    let voice: VoiceProfile;
    if (script.dialogueMode && seg.speaker) {
      const charConfig = seg.speaker === 'narrator' ? narratorChar : reactorChar;
      const baseVoice = seg.speaker === 'narrator' ? narratorVoice : reactorVoice;

      // Resolve emotion: explicit → inferred from label
      const emotion = seg.emotion ?? inferEmotion(seg.label, seg.speaker);
      const emotionProsody = EMOTION_PROSODY[emotion];
      const mergedProsody = mergeProsody(charConfig.defaultProsody, emotionProsody);

      voice = { ...baseVoice, prosody: mergedProsody };
    } else {
      voice = defaultVoice;
    }

    const result = await synthesizeSegment(seg.text, voice, segPath, providers);
    segmentPaths.push(result.audioPath);
    segmentDurations.push(result.durationSec);
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

  return {
    scriptId: script.scriptId,
    audioPath: finalPath,
    durationSec: totalDuration,
    segmentDurations,
    voiceProfile: `${narratorChar.id}+${reactorChar.id}`,
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
