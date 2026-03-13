import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runTrendDetection } from '../modules/trend/runTrendDetection.js';

const FIXTURE_DIR = path.resolve('tests/fixtures/trend');
const TRENDS_DIR = path.resolve('data/trends');

describe('Trend detection integration (offline fixtures)', () => {
  afterAll(() => {
    // Clean up generated trend files
    if (fs.existsSync(TRENDS_DIR)) {
      const files = fs.readdirSync(TRENDS_DIR);
      for (const f of files) {
        if (f !== 'history.json') {
          fs.unlinkSync(path.join(TRENDS_DIR, f));
        }
      }
      const historyPath = path.join(TRENDS_DIR, 'history.json');
      if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
    }
  });

  it('produces mergedTopics from fixture data', async () => {
    const result = await runTrendDetection({
      offlineFixtures: FIXTURE_DIR,
      top: 10,
    });

    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    expect(result.sourceScores.length).toBeGreaterThan(0);
    expect(result.mergedTopics.length).toBeGreaterThan(0);

    // Verify merged topics have required shape
    const first = result.mergedTopics[0]!;
    expect(first.topic).toBeTruthy();
    expect(typeof first.score).toBe('number');
    expect(Array.isArray(first.sources)).toBe(true);
  });

  it('writes artifact JSON file', async () => {
    await runTrendDetection({
      offlineFixtures: FIXTURE_DIR,
    });

    // Check that at least one trend file was written
    expect(fs.existsSync(TRENDS_DIR)).toBe(true);
    const files = fs.readdirSync(TRENDS_DIR).filter((f) => f.endsWith('.json') && f !== 'history.json');
    expect(files.length).toBeGreaterThan(0);

    // Read one and verify structure
    const content = JSON.parse(fs.readFileSync(path.join(TRENDS_DIR, files[0]!), 'utf-8'));
    expect(content.runId).toBeTruthy();
    expect(Array.isArray(content.mergedTopics)).toBe(true);
  });

  it('gracefully handles empty fixture directory', async () => {
    const emptyDir = path.resolve('tests/fixtures/trend-empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    const result = await runTrendDetection({
      offlineFixtures: emptyDir,
    });

    expect(result.sourceScores).toHaveLength(0);
    expect(result.mergedTopics).toHaveLength(0);

    // Cleanup
    fs.rmSync(emptyDir, { recursive: true });
  });
});
