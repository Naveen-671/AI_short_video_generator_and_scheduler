import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateFromTrends } from '../modules/topic/generateFromTrends.js';
import { writeJson, safeMkdir } from '../modules/fsutils.js';
import type { TrendRunResult } from '../modules/trend/types.js';

const TOPICS_DIR = path.resolve('data/topics');
const TEST_TREND_PATH = path.resolve('data/test-trend-for-topics.json');

// Create a synthetic trend artifact for testing
const syntheticTrend: TrendRunResult = {
  runId: 'test-topics-run',
  sourceScores: [
    {
      topic: 'OpenAI GPT-5.4 release',
      source: 'hackernews',
      score: 0.92,
      metadata: { url: 'https://example.com/gpt54' },
    },
    {
      topic: 'New AI benchmark tool released',
      source: 'reddit',
      score: 0.75,
      metadata: { link: 'https://reddit.com/r/ai/123' },
    },
  ],
  mergedTopics: [
    {
      topic: 'OpenAI GPT-5.4 release',
      score: 0.88,
      sources: ['hackernews', 'reddit', 'google_trends'],
      examples: [{ source: 'hackernews', link: 'https://example.com/gpt54' }],
    },
    {
      topic: 'New AI benchmark tool released',
      score: 0.72,
      sources: ['reddit'],
      examples: [{ source: 'reddit', link: 'https://reddit.com/r/ai/123' }],
    },
  ],
};

describe('Topic engine', () => {
  beforeAll(() => {
    safeMkdir(path.dirname(TEST_TREND_PATH));
    writeJson(TEST_TREND_PATH, syntheticTrend);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_TREND_PATH)) fs.unlinkSync(TEST_TREND_PATH);
    if (fs.existsSync(TOPICS_DIR)) {
      const files = fs.readdirSync(TOPICS_DIR);
      for (const f of files) fs.unlinkSync(path.join(TOPICS_DIR, f));
    }
  });

  it('generates ideas from synthetic trend data', async () => {
    const ideas = await generateFromTrends(TEST_TREND_PATH, {
      runId: 'test-topic-run',
      variants: 3,
      force: true,
    });

    expect(ideas.length).toBeGreaterThan(0);

    // Each idea should have required fields
    for (const idea of ideas) {
      expect(idea.ideaId).toBeTruthy();
      expect(idea.channel).toBeTruthy();
      expect(idea.topic).toBeTruthy();
      expect(idea.title).toBeTruthy();
      expect(typeof idea.priority).toBe('number');
      expect(idea.priority).toBeGreaterThanOrEqual(0);
      expect(idea.priority).toBeLessThanOrEqual(1);
      expect(idea.brief).toBeTruthy();
      expect(idea.scriptOutline).toBeDefined();
      expect(idea.scriptOutline.hook).toBeTruthy();
      expect(idea.visualHints).toBeDefined();
      expect(Array.isArray(idea.hashtags)).toBe(true);
      expect(idea.estimatedLengthSec).toBeGreaterThan(0);
    }
  });

  it('produces ideas for multiple channels', async () => {
    const ideas = await generateFromTrends(TEST_TREND_PATH, {
      runId: 'test-topic-channels',
      force: true,
    });

    const channels = new Set(ideas.map((i) => i.channel));
    // Should have at least 2 channels represented
    expect(channels.size).toBeGreaterThanOrEqual(2);
  });

  it('writes output JSON artifact', async () => {
    const runId = 'test-topic-artifact';
    await generateFromTrends(TEST_TREND_PATH, { runId, force: true });

    const outputPath = path.join(TOPICS_DIR, `${runId}.json`);
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
  });
});
