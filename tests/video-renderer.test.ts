import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderFromScript } from '../modules/video/renderFromScript.js';
import { safeMkdir, writeJson } from '../modules/fsutils.js';
import { generateSrt, calculateDuration, buildDialogueFilter } from '../modules/video/renderHelpers.js';
import { getTemplateForChannel } from '../modules/video/templates.js';
import type { VideoManifest } from '../modules/video/types.js';
import type { TimedSegment } from '../modules/script/types.js';

const RUN_ID = 'test-video-run';
const SCRIPTS_DIR = path.resolve('data/scripts');
const AUDIO_DIR = path.resolve('data/audio');
const VIDEOS_DIR = path.resolve('data/videos');

const sampleScripts = [
  {
    scriptId: 'vid-test-001-30s-v1',
    ideaId: 'vid-test-001',
    channel: 'anime_explains',
    title: 'Test Video 1',
    hook: 'Test hook',
    timedSegments: [
      { label: 'hook', startSec: 0, endSec: 3, text: 'This is a test hook.' },
      { label: 'point1', startSec: 3, endSec: 15, text: 'Main content segment.' },
      { label: 'cta', startSec: 15, endSec: 30, text: 'Follow for more!' },
    ],
    displayBullets: ['Bullet 1', 'Bullet 2'],
    estimatedLengthSec: 30,
    notesForVoice: 'tone: energetic',
    metadata: { styleHints: {}, visualHints: {} },
    llm_cache_key: 'test-key-1',
    requires_verification: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    scriptId: 'vid-test-002-30s-v1',
    ideaId: 'vid-test-002',
    channel: 'tech_facts',
    title: 'Test Video 2',
    hook: 'Quick fact',
    timedSegments: [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Quick fact time.' },
      { label: 'point1', startSec: 3, endSec: 20, text: 'Here is the fact.' },
      { label: 'cta', startSec: 20, endSec: 30, text: 'Follow!' },
    ],
    displayBullets: ['Fact 1'],
    estimatedLengthSec: 30,
    notesForVoice: 'tone: neutral',
    metadata: { styleHints: {}, visualHints: {} },
    llm_cache_key: 'test-key-2',
    requires_verification: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const sampleAudioManifest = {
  runId: RUN_ID,
  items: [
    {
      scriptId: 'vid-test-001-30s-v1',
      audioPath: path.join(AUDIO_DIR, RUN_ID, 'vid-test-001-30s-v1.mp3'),
      durationSec: 30,
      voiceProfile: 'anime_energetic_v1',
      cacheKey: 'audio-key-1',
      synthesisProvider: 'mock' as const,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
};

beforeAll(() => {
  safeMkdir(SCRIPTS_DIR);
  safeMkdir(AUDIO_DIR);
  writeJson(path.join(SCRIPTS_DIR, `${RUN_ID}.json`), sampleScripts);
  writeJson(path.join(AUDIO_DIR, `${RUN_ID}.json`), sampleAudioManifest);
});

afterAll(() => {
  const scriptsFile = path.join(SCRIPTS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(scriptsFile)) fs.unlinkSync(scriptsFile);
  const audioFile = path.join(AUDIO_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);
  const manifestFile = path.join(VIDEOS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(manifestFile)) fs.unlinkSync(manifestFile);
  const runDir = path.join(VIDEOS_DIR, RUN_ID);
  if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true, force: true });
});

describe('Video render helpers', () => {
  it('generates valid SRT content', () => {
    const segments: TimedSegment[] = [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Hello world!' },
      { label: 'point1', startSec: 3, endSec: 15, text: 'Main content here.' },
    ];
    const srt = generateSrt(segments);

    expect(srt).toContain('1\n00:00:00,000 --> 00:00:03,000\nHello world!');
    expect(srt).toContain('2\n00:00:03,000 --> 00:00:15,000\nMain content here.');
  });

  it('calculates duration from segments', () => {
    const segments: TimedSegment[] = [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Hook' },
      { label: 'point1', startSec: 3, endSec: 25, text: 'Point' },
      { label: 'cta', startSec: 25, endSec: 30, text: 'CTA' },
    ];
    expect(calculateDuration(segments)).toBe(30);
    expect(calculateDuration([])).toBe(0);
  });

  it('builds dialogue filter with drawtext captions', () => {
    const segments: TimedSegment[] = [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Hello', speaker: 'narrator' },
    ];
    const template = getTemplateForChannel('anime_explains');
    const { filterComplex, inputCount } = buildDialogueFilter(segments, template, 'anime_explains', false, false, false);
    expect(filterComplex).toContain('drawtext=');
    expect(filterComplex).toContain('text=Hello');
    expect(filterComplex).toContain('enable=');
    expect(inputCount).toBe(2);
  });
});

describe('Video templates', () => {
  it('returns correct template for channel', () => {
    const anime = getTemplateForChannel('anime_explains');
    expect(anime.name).toBe('anime_template');

    const ai = getTemplateForChannel('ai_tools');
    expect(ai.name).toBe('tech_template');

    const facts = getTemplateForChannel('tech_facts');
    expect(facts.name).toBe('fact_template');

    // Unknown channel falls back to tech
    const unknown = getTemplateForChannel('unknown_channel');
    expect(unknown.name).toBe('tech_template');
  });

  it('allows template override', () => {
    const tpl = getTemplateForChannel('anime_explains', 'fact_template');
    expect(tpl.name).toBe('fact_template');
  });
});

describe('Video renderer integration', () => {
  it('renders videos and creates manifest', async () => {
    const manifestPath = await renderFromScript(RUN_ID, { concurrency: 1 });

    expect(manifestPath).toContain(RUN_ID);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest: VideoManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.runId).toBe(RUN_ID);
    expect(manifest.items.length).toBe(2);

    for (const item of manifest.items) {
      expect(item.scriptId).toBeTruthy();
      expect(fs.existsSync(item.videoPath)).toBe(true);
      expect(fs.existsSync(item.srtPath)).toBe(true);
      expect(fs.existsSync(item.thumbnailPath)).toBe(true);
      expect(item.durationSec).toBe(30);
      expect(item.templateUsed).toBeTruthy();
      expect(item.resolution).toBe('1080x1920');
      expect(item.codec).toBe('h264');
    }
  });

  it('generates SRT sidecar files', async () => {
    const manifestPath = await renderFromScript(RUN_ID, { concurrency: 1 });
    const manifest: VideoManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    for (const item of manifest.items) {
      const srtContent = fs.readFileSync(item.srtPath, 'utf-8');
      expect(srtContent).toContain('-->');
      expect(srtContent.length).toBeGreaterThan(0);
    }
  });
});
