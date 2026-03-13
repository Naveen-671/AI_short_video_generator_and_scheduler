import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { uploadVideos } from '../modules/uploader/uploadVideos.js';
import { safeMkdir, writeJson } from '../modules/fsutils.js';
import type { UploadManifest } from '../modules/uploader/types.js';

const RUN_ID = 'test-upload-run';
const SCRIPTS_DIR = path.resolve('data/scripts');
const VIDEOS_DIR = path.resolve('data/videos');
const UPLOADS_DIR = path.resolve('data/uploads');

const sampleScripts = [
  {
    scriptId: 'upload-test-001-30s-v1',
    ideaId: 'upload-test-001',
    channel: 'anime_explains',
    title: 'Upload Test Video',
    hook: 'Test hook',
    timedSegments: [
      { label: 'hook', startSec: 0, endSec: 3, text: 'Hook text.' },
      { label: 'cta', startSec: 3, endSec: 30, text: 'Follow!' },
    ],
    displayBullets: ['Bullet 1', 'Bullet 2'],
    estimatedLengthSec: 30,
    notesForVoice: 'tone: energetic',
    metadata: { styleHints: {}, visualHints: {} },
    llm_cache_key: 'upload-key-1',
    requires_verification: false,
    hashtags: ['#test', '#shorts'],
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const sampleVideoManifest = {
  runId: RUN_ID,
  items: [
    {
      scriptId: 'upload-test-001-30s-v1',
      videoPath: path.join(VIDEOS_DIR, RUN_ID, 'upload-test-001-30s-v1.mp4'),
      thumbnailPath: path.join(VIDEOS_DIR, RUN_ID, 'thumbs', 'upload-test-001-30s-v1.png'),
      srtPath: path.join(VIDEOS_DIR, RUN_ID, 'upload-test-001-30s-v1.srt'),
      durationSec: 30,
      templateUsed: 'anime_template',
      resolution: '1080x1920',
      codec: 'h264',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
};

beforeAll(() => {
  safeMkdir(SCRIPTS_DIR);
  safeMkdir(path.join(VIDEOS_DIR, RUN_ID));
  writeJson(path.join(SCRIPTS_DIR, `${RUN_ID}.json`), sampleScripts);
  writeJson(path.join(VIDEOS_DIR, `${RUN_ID}.json`), sampleVideoManifest);
  // Create mock video file
  fs.writeFileSync(
    path.join(VIDEOS_DIR, RUN_ID, 'upload-test-001-30s-v1.mp4'),
    Buffer.alloc(100, 0),
  );
});

afterAll(() => {
  const scriptsFile = path.join(SCRIPTS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(scriptsFile)) fs.unlinkSync(scriptsFile);
  const videoManifest = path.join(VIDEOS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(videoManifest)) fs.unlinkSync(videoManifest);
  const videoDir = path.join(VIDEOS_DIR, RUN_ID);
  if (fs.existsSync(videoDir)) fs.rmSync(videoDir, { recursive: true, force: true });
  const uploadManifest = path.join(UPLOADS_DIR, `${RUN_ID}.json`);
  if (fs.existsSync(uploadManifest)) fs.unlinkSync(uploadManifest);
});

describe('Video uploader', () => {
  it('uploads videos and creates manifest', async () => {
    const manifestPath = await uploadVideos(RUN_ID);

    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest: UploadManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.runId).toBe(RUN_ID);
    expect(manifest.uploads.length).toBeGreaterThan(0);

    for (const upload of manifest.uploads) {
      expect(upload.scriptId).toBeTruthy();
      expect(upload.videoId).toBeTruthy();
      expect(upload.title).toBeTruthy();
      expect(upload.status).toBe('success');
      expect(upload.uploadedAt).toBeTruthy();
      expect(upload.platform).toMatch(/youtube|instagram/);
    }
  });

  it('generates correct metadata from scripts', async () => {
    const manifestPath = await uploadVideos(RUN_ID);
    const manifest: UploadManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const upload = manifest.uploads[0]!;
    expect(upload.title).toBe('Upload Test Video');
    expect(upload.description).toContain('Bullet 1');
    expect(upload.tags).toContain('#test');
  });

  it('supports dry-run mode', async () => {
    // Delete existing manifest first
    const existingManifest = path.join(UPLOADS_DIR, `${RUN_ID}.json`);
    if (fs.existsSync(existingManifest)) fs.unlinkSync(existingManifest);

    const manifestPath = await uploadVideos(RUN_ID, { dryRun: true });
    const manifest: UploadManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    for (const upload of manifest.uploads) {
      expect(upload.status).toBe('skipped');
      expect(upload.videoId).toBe('dry-run');
    }
  });
});
