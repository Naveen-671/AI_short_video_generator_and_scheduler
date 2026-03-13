import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { safeMkdir } from '../fsutils.js';
import type { TTSProvider, TTSResult, VoiceProfile, TTSProviderName } from './types.js';

/** Voice profiles per channel */
export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  anime_explains: {
    name: 'anime_energetic_v1',
    description: 'youthful, energetic, slightly playful',
    ttsVoiceName: 'en-US-AriaNeural',
  },
  ai_tools: {
    name: 'professional_clear_v1',
    description: 'clear, professional',
    ttsVoiceName: 'en-US-GuyNeural',
  },
  tech_facts: {
    name: 'neutral_authority_v1',
    description: 'neutral, authoritative',
    ttsVoiceName: 'en-US-JennyNeural',
  },
};

export function getVoiceProfile(channel: string): VoiceProfile {
  return VOICE_PROFILES[channel] ?? {
    name: 'default_v1',
    description: 'neutral',
    ttsVoiceName: 'en-US-JennyNeural',
  };
}

/**
 * Mock TTS provider: generates a small valid-header MP3-like file for testing.
 * Computes duration from text length (approx 150 words/min, 5 chars/word).
 */
export class MockTTSProvider implements TTSProvider {
  name: TTSProviderName = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async synthesize(text: string, _voiceProfile: VoiceProfile, outputPath: string): Promise<TTSResult> {
    safeMkdir(outputPath.replace(/[/\\][^/\\]+$/, ''));

    // Estimate duration: ~150 wpm, ~5 chars/word → ~750 chars/min → 12.5 chars/sec
    const estimatedDurationSec = Math.max(1, Math.round(text.length / 12.5));

    // Write a minimal placeholder file (not a real MP3, but sufficient for testing)
    const header = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, // MP3 sync word + header
    ]);
    const paddingSize = Math.max(100, estimatedDurationSec * 50);
    const payload = Buffer.alloc(paddingSize, 0);
    fs.writeFileSync(outputPath, Buffer.concat([header, payload]));

    const cacheKey = crypto
      .createHash('sha256')
      .update(text)
      .digest('hex')
      .slice(0, 16);

    return {
      audioPath: outputPath,
      durationSec: estimatedDurationSec,
      provider: 'mock',
      cacheKey,
    };
  }
}

/**
 * Edge-TTS stub — in production would call edge-tts binary/library.
 * Falls through to mock for now.
 */
export class EdgeTTSProvider implements TTSProvider {
  name: TTSProviderName = 'edge';

  isAvailable(): boolean {
    // Would check for edge-tts binary availability
    return false;
  }

  async synthesize(_text: string, _voiceProfile: VoiceProfile, _outputPath: string): Promise<TTSResult> {
    throw new Error('Edge-TTS not available in this environment');
  }
}

/**
 * Piper stub — in production would call local piper binary.
 */
export class PiperTTSProvider implements TTSProvider {
  name: TTSProviderName = 'piper';

  isAvailable(): boolean {
    return false;
  }

  async synthesize(_text: string, _voiceProfile: VoiceProfile, _outputPath: string): Promise<TTSResult> {
    throw new Error('Piper not available in this environment');
  }
}

/**
 * Coqui stub — in production would call Coqui TTS.
 */
export class CoquiTTSProvider implements TTSProvider {
  name: TTSProviderName = 'coqui';

  isAvailable(): boolean {
    return false;
  }

  async synthesize(_text: string, _voiceProfile: VoiceProfile, _outputPath: string): Promise<TTSResult> {
    throw new Error('Coqui not available in this environment');
  }
}

/**
 * Get ordered list of TTS providers with fallback chain.
 * Preferred → fallbacks → mock (always available).
 */
export function getTTSProviders(): TTSProvider[] {
  return [
    new EdgeTTSProvider(),
    new PiperTTSProvider(),
    new CoquiTTSProvider(),
    new MockTTSProvider(),
  ];
}
