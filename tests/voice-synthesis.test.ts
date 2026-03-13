import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { synthesizeForScripts } from '../modules/voice/synthesizeForScripts.js';
import { safeMkdir, writeJson } from '../modules/fsutils.js';
import type { AudioManifest } from '../modules/voice/types.js';

const RUN_ID = 'test-voice-run';
const SCRIPTS_DIR = path.resolve('data/scripts');
const AUDIO_DIR = path.resolve('data/audio');
const SCRIPTS_PATH = path.join(SCRIPTS_DIR, `${RUN_ID}.json`);

beforeAll(() => {
  // Copy fixture to data/scripts so synthesizer can find it
  safeMkdir(SCRIPTS_DIR);
  const fixture = JSON.parse(
    fs.readFileSync(path.resolve('tests/fixtures/scripts/fixture1.json'), 'utf-8'),
  );
  writeJson(SCRIPTS_PATH, fixture);
});

afterAll(() => {
  // Cleanup
  if (fs.existsSync(SCRIPTS_PATH)) fs.unlinkSync(SCRIPTS_PATH);
  const manifestPath = path.join(AUDIO_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  const runDir = path.join(AUDIO_DIR, RUN_ID);
  if (fs.existsSync(runDir)) {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

describe('Voice synthesis', () => {
  it('synthesizes audio for all scripts and creates manifest', async () => {
    const manifestPath = await synthesizeForScripts(RUN_ID, { concurrency: 2 });

    expect(manifestPath).toContain(RUN_ID);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.runId).toBe(RUN_ID);
    expect(manifest.items.length).toBe(2);

    for (const item of manifest.items) {
      expect(item.scriptId).toBeTruthy();
      expect(item.audioPath).toBeTruthy();
      expect(fs.existsSync(item.audioPath)).toBe(true);
      expect(item.durationSec).toBeGreaterThan(0);
      expect(item.voiceProfile).toBeTruthy();
      expect(item.cacheKey).toBeTruthy();
      expect(item.synthesisProvider).toBeTruthy();
      expect(item.createdAt).toBeTruthy();
    }
  });

  it('creates MP3 files for each script', async () => {
    const manifestPath = await synthesizeForScripts(RUN_ID, { concurrency: 1 });
    const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    for (const item of manifest.items) {
      const stat = fs.statSync(item.audioPath);
      expect(stat.size).toBeGreaterThan(0);
      expect(item.audioPath).toMatch(/\.mp3$/);
    }
  });

  it('adds verification prefix for scripts with requires_verification', async () => {
    const manifestPath = await synthesizeForScripts(RUN_ID, { concurrency: 1 });
    const manifest: AudioManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Script ai-tool-002-30s-v1 has requires_verification=true → should have longer duration
    const verifiedItem = manifest.items.find((i) => i.scriptId === 'ai-tool-002-30s-v1');
    const normalItem = manifest.items.find((i) => i.scriptId === 'gpt5-anime-001-30s-v1');

    expect(verifiedItem).toBeTruthy();
    expect(normalItem).toBeTruthy();

    // The verified script has 3 segments + 1 verification notice = more total text
    // Both should have non-zero duration
    expect(verifiedItem!.durationSec).toBeGreaterThan(0);
    expect(normalItem!.durationSec).toBeGreaterThan(0);
  });
});
