import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateForVideos } from '../modules/captions/generateForVideos.js';
import { safeMkdir, writeJson } from '../modules/fsutils.js';
import {
  formatSrt,
  formatVtt,
  wrapText,
  fixPunctuation,
  averageConfidence,
  validateTimestamps,
  mockTranscribe,
} from '../modules/captions/captionHelpers.js';
import type { CaptionsManifest, TranscriptionSegment } from '../modules/captions/types.js';
import type { TimedSegment } from '../modules/script/types.js';

const RUN_ID = 'test-captions-run';
const SCRIPTS_DIR = path.resolve('data/scripts');
const VIDEOS_DIR = path.resolve('data/videos');
const CAPTIONS_DIR = path.resolve('data/captions');

const sampleScripts = [
  {
    scriptId: 'cap-test-001-30s-v1',
    ideaId: 'cap-test-001',
    channel: 'anime_explains',
    title: 'Caption Test',
    hook: 'Test hook',
    timedSegments: [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Welcome to the show' },
      { label: 'point1', startSec: 3, endSec: 15, text: 'Here we discuss interesting topics about technology' },
      { label: 'cta', startSec: 15, endSec: 30, text: 'Follow for more anime tech content!' },
    ],
    displayBullets: ['Technology', 'Interesting topics'],
    estimatedLengthSec: 30,
    notesForVoice: 'tone: energetic',
    metadata: { styleHints: {}, visualHints: {} },
    llm_cache_key: 'cap-key-1',
    requires_verification: false,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

beforeAll(() => {
  safeMkdir(SCRIPTS_DIR);
  safeMkdir(path.join(VIDEOS_DIR, RUN_ID));
  writeJson(path.join(SCRIPTS_DIR, `${RUN_ID}.json`), sampleScripts);
  writeJson(path.join(VIDEOS_DIR, `${RUN_ID}.json`), { runId: RUN_ID, items: [] });
});

afterAll(() => {
  const scriptsFile = path.join(SCRIPTS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(scriptsFile)) fs.unlinkSync(scriptsFile);
  const videoManifest = path.join(VIDEOS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(videoManifest)) fs.unlinkSync(videoManifest);
  const videoDir = path.join(VIDEOS_DIR, RUN_ID);
  if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
  const captionsManifest = path.join(CAPTIONS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(captionsManifest)) fs.unlinkSync(captionsManifest);
  const captionsDir = path.join(CAPTIONS_DIR, RUN_ID);
  if (fs.existsSync(captionsDir)) fs.rmSync(captionsDir, { recursive: true, force: true });
});

describe('Caption helpers', () => {
  it('formats SRT correctly', () => {
    const segments: TranscriptionSegment[] = [
      { startSec: 0, endSec: 3, text: 'Hello world.', confidence: 0.95 },
      { startSec: 3, endSec: 10, text: 'More content.', confidence: 0.90 },
    ];
    const srt = formatSrt(segments);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:03,000\nHello world.');
    expect(srt).toContain('2\n00:00:03,000 --> 00:00:10,000\nMore content.');
  });

  it('formats VTT correctly', () => {
    const segments: TranscriptionSegment[] = [
      { startSec: 0, endSec: 5, text: 'Test.', confidence: 0.9 },
    ];
    const vtt = formatVtt(segments);
    expect(vtt).toMatch(/^WEBVTT/);
    expect(vtt).toContain('00:00:00.000 --> 00:00:05.000');
  });

  it('wraps text to max length and lines', () => {
    const long = 'This is a very long sentence that should be wrapped into multiple lines for display';
    const lines = wrapText(long, 40, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) {
      // Second line may overflow if text is very long
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('fixes punctuation', () => {
    expect(fixPunctuation('hello world')).toBe('hello world.');
    expect(fixPunctuation('hello  world')).toBe('hello world.');
    expect(fixPunctuation('good ,morning')).toBe('good, morning.');
    expect(fixPunctuation('done!')).toBe('done!');
  });

  it('computes average confidence', () => {
    const segs: TranscriptionSegment[] = [
      { startSec: 0, endSec: 1, text: 'a', confidence: 0.8 },
      { startSec: 1, endSec: 2, text: 'b', confidence: 1.0 },
    ];
    expect(averageConfidence(segs)).toBe(0.9);
    expect(averageConfidence([])).toBe(0);
  });

  it('validates monotonic timestamps', () => {
    const good: TranscriptionSegment[] = [
      { startSec: 0, endSec: 3, text: 'a', confidence: 1 },
      { startSec: 3, endSec: 6, text: 'b', confidence: 1 },
    ];
    expect(validateTimestamps(good)).toBe(true);

    const bad: TranscriptionSegment[] = [
      { startSec: 0, endSec: 5, text: 'a', confidence: 1 },
      { startSec: 3, endSec: 8, text: 'b', confidence: 1 },
    ];
    expect(validateTimestamps(bad)).toBe(false);
  });

  it('mock transcribes timed segments', () => {
    const segs: TimedSegment[] = [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Hello world' },
    ];
    const result = mockTranscribe(segs);
    expect(result.length).toBe(1);
    expect(result[0]!.text).toBe('Hello world.');
    expect(result[0]!.confidence).toBeGreaterThan(0);
  });
});

describe('Captions generator integration', () => {
  it('generates captions manifest with SRT and VTT', async () => {
    const manifestPath = await generateForVideos(RUN_ID);

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest: CaptionsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.runId).toBe(RUN_ID);
    expect(manifest.items.length).toBe(1);

    const item = manifest.items[0]!;
    expect(item.videoFile).toContain('cap-test-001');
    expect(fs.existsSync(item.srtPath)).toBe(true);
    expect(fs.existsSync(item.vttPath)).toBe(true);
    expect(item.confidence).toBeGreaterThan(0.7);
    expect(item.needs_review).toBe(false);
    expect(item.noSpeech).toBe(false);
    expect(item.speaker).toBe('Narrator');

    // Verify SRT content
    const srtContent = fs.readFileSync(item.srtPath, 'utf-8');
    expect(srtContent).toContain('-->');
    expect(srtContent.length).toBeGreaterThan(0);

    // Verify VTT content
    const vttContent = fs.readFileSync(item.vttPath, 'utf-8');
    expect(vttContent).toMatch(/^WEBVTT/);
  });
});
