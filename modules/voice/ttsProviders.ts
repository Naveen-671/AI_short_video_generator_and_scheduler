import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { safeMkdir } from '../fsutils.js';
import { createLogger } from '../logger.js';
import type { TTSProvider, TTSResult, VoiceProfile, TTSProviderName } from './types.js';

const logger = createLogger('tts');

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
 * Edge-TTS provider — calls the edge-tts Python package via subprocess.
 * edge-tts is free and uses Microsoft Edge's online TTS service.
 */
export class EdgeTTSProvider implements TTSProvider {
  name: TTSProviderName = 'edge';
  private pythonPath: string;

  constructor() {
    // Try venv first, then system python
    const venvPython = process.platform === 'win32'
      ? '.venv/Scripts/python.exe'
      : '.venv/bin/python';
    this.pythonPath = fs.existsSync(venvPython) ? venvPython : 'python';
  }

  isAvailable(): boolean {
    try {
      execFileSync(this.pythonPath, ['-c', 'import edge_tts'], {
        stdio: 'pipe',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async synthesize(text: string, voiceProfile: VoiceProfile, outputPath: string): Promise<TTSResult> {
    safeMkdir(outputPath.replace(/[/\\][^/\\]+$/, ''));

    const voice = voiceProfile.ttsVoiceName ?? 'en-US-AriaNeural';

    // Use edge-tts via Python subprocess
    const script = `
import asyncio, sys, json, edge_tts

async def main():
    voice = sys.argv[1]
    text = sys.argv[2]
    output = sys.argv[3]
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output)
    # Estimate duration from saved audio file size (~16kbps for edge-tts mp3)
    import os
    file_size = os.path.getsize(output)
    duration_sec = max(1, round(file_size / 2000))  # rough estimate
    print(json.dumps({"duration": duration_sec}))

asyncio.run(main())
`;

    try {
      const result = execFileSync(this.pythonPath, ['-c', script, voice, text, outputPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });

      const output = result.toString().trim();
      let durationSec = Math.max(1, Math.round(text.length / 12.5));
      try {
        const parsed = JSON.parse(output);
        if (parsed.duration) durationSec = parsed.duration;
      } catch { /* use estimate */ }

      const cacheKey = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

      logger.info(`Edge-TTS synthesized ${text.length} chars → ${outputPath} (${durationSec}s)`);

      return {
        audioPath: outputPath,
        durationSec,
        provider: 'edge',
        cacheKey,
      };
    } catch (err) {
      logger.error('Edge-TTS synthesis failed', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
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
 * Set TTS_PROVIDER=mock to force mock (useful for tests).
 * Preferred → fallbacks → mock (always available).
 */
export function getTTSProviders(): TTSProvider[] {
  if (process.env['TTS_PROVIDER'] === 'mock') {
    return [new MockTTSProvider()];
  }

  return [
    new EdgeTTSProvider(),
    new PiperTTSProvider(),
    new CoquiTTSProvider(),
    new MockTTSProvider(),
  ];
}
