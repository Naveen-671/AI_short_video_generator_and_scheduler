import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeEngagement, collectMetrics } from '../modules/analytics/collectMetrics.js';

describe('analytics', () => {
  const uploadsDir = path.resolve('data/uploads');
  const metricsDir = path.resolve('data/metrics');

  beforeEach(() => {
    // Create a mock upload manifest
    fs.mkdirSync(uploadsDir, { recursive: true });
    const manifest = {
      runId: 'test-analytics-run',
      uploads: [
        {
          platform: 'youtube',
          videoId: 'yt-test-001',
          scriptId: 'script-001',
          videoPath: 'data/videos/test.mp4',
          title: 'Test Video',
          description: 'A test video',
          tags: ['test'],
          captionPath: null,
          uploadedAt: new Date().toISOString(),
          status: 'success',
        },
        {
          platform: 'instagram',
          videoId: 'ig-test-002',
          scriptId: 'script-002',
          videoPath: 'data/videos/test2.mp4',
          title: 'Test Video 2',
          description: 'Another test',
          tags: ['test'],
          captionPath: null,
          uploadedAt: new Date().toISOString(),
          status: 'success',
        },
        {
          platform: 'youtube',
          videoId: 'yt-test-003',
          scriptId: 'script-003',
          videoPath: 'data/videos/test3.mp4',
          title: 'Failed Upload',
          description: 'Should be skipped',
          tags: [],
          captionPath: null,
          uploadedAt: new Date().toISOString(),
          status: 'failed',
          error: 'Network error',
        },
      ],
    };
    fs.writeFileSync(path.join(uploadsDir, 'test-analytics-run.json'), JSON.stringify(manifest));
  });

  afterEach(() => {
    // Clean up test artifacts
    const testUpload = path.join(uploadsDir, 'test-analytics-run.json');
    if (fs.existsSync(testUpload)) fs.unlinkSync(testUpload);

    if (fs.existsSync(metricsDir)) {
      for (const f of fs.readdirSync(metricsDir)) {
        fs.unlinkSync(path.join(metricsDir, f));
      }
    }
  });

  it('computes engagement score correctly', () => {
    // views*0.4 + likes*0.3 + comments*0.3
    expect(computeEngagement(1000, 100, 50)).toBe(445);
    expect(computeEngagement(0, 0, 0)).toBe(0);
    expect(computeEngagement(10000, 500, 200)).toBe(4210);
  });

  it('collects metrics for successful uploads only', async () => {
    const manifestPath = await collectMetrics({ runId: 'test-analytics-run' });
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    // Should only have 2 items (the failed one is skipped)
    expect(manifest.items).toHaveLength(2);
    expect(manifest.items[0].videoId).toBe('yt-test-001');
    expect(manifest.items[1].videoId).toBe('ig-test-002');

    // Check engagement score is computed
    for (const item of manifest.items) {
      expect(item.engagementScore).toBeGreaterThan(0);
      expect(item.views).toBeGreaterThan(0);
      expect(item.collectedAt).toBeDefined();
    }
  });

  it('returns empty metrics when no uploads exist', async () => {
    // Remove the upload manifest
    fs.unlinkSync(path.join(uploadsDir, 'test-analytics-run.json'));

    const manifestPath = await collectMetrics({ runId: 'nonexistent-run' });
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.items).toHaveLength(0);
  });
});
