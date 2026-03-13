import { describe, it, expect } from 'vitest';
import {
  normalizeTopic,
  ngramSimilarity,
  isRelevant,
  mergeTopics,
} from '../modules/trend/normalize.js';
import type { SourceScore, TrendSourceConfig } from '../modules/trend/types.js';

describe('normalizeTopic', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTopic('OpenAI GPT-5!')).toBe('openai gpt5');
  });

  it('collapses whitespace', () => {
    expect(normalizeTopic('  hello   world  ')).toBe('hello world');
  });
});

describe('ngramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(ngramSimilarity('openai gpt release', 'openai gpt release')).toBe(1);
  });

  it('returns high similarity for near-duplicates', () => {
    const sim = ngramSimilarity(
      'OpenAI GPT-5 Release Date Announced',
      'OpenAI GPT-5 officially released',
    );
    expect(sim).toBeGreaterThan(0.1);
  });

  it('returns low similarity for unrelated strings', () => {
    const sim = ngramSimilarity('rust programming language', 'cloud computing costs');
    expect(sim).toBe(0);
  });
});

describe('isRelevant', () => {
  const keywords = ['ai', 'tech', 'software', 'programming'];
  const blacklist = ['celebrity', 'gossip'];

  it('accepts topics matching relevance keywords', () => {
    expect(isRelevant('New AI model released', keywords, blacklist)).toBe(true);
  });

  it('rejects blacklisted topics', () => {
    expect(isRelevant('Celebrity gossip roundup', keywords, blacklist)).toBe(false);
  });

  it('rejects topics matching no relevance keywords', () => {
    expect(isRelevant('New cooking recipe', keywords, blacklist)).toBe(false);
  });
});

describe('mergeTopics', () => {
  const config: TrendSourceConfig = {
    sources: {
      hackerNews: { enabled: true, weight: 0.3 },
      reddit: { enabled: true, weight: 0.25 },
      googleTrends: { enabled: true, weight: 0.3 },
      rss: { enabled: true, weight: 0.15 },
    },
    topN: 10,
    defaultHoursWindow: 6,
    relevanceKeywords: ['ai', 'tech', 'software', 'release', 'machine learning', 'programming'],
    blacklistKeywords: ['celebrity', 'gossip'],
    rssFeeds: [],
    cache: { ttlHours: 6 },
  };

  it('merges and returns sorted topics', () => {
    const scores: SourceScore[] = [
      { topic: 'AI model released', source: 'hackernews', score: 0.9, metadata: { url: 'https://example.com' } },
      { topic: 'New tech startup raises funds', source: 'reddit', score: 0.7, metadata: { link: 'https://reddit.com/r/tech/123' } },
    ];

    const result = mergeTopics(scores, config);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[result.length - 1]!.score);
  });

  it('filters out blacklisted topics', () => {
    const scores: SourceScore[] = [
      { topic: 'Celebrity gossip update', source: 'rss', score: 0.9, metadata: {} },
      { topic: 'AI release notes', source: 'hackernews', score: 0.8, metadata: {} },
    ];

    const result = mergeTopics(scores, config);
    expect(result.every((t) => !t.topic.toLowerCase().includes('gossip'))).toBe(true);
  });

  it('respects topN limit', () => {
    const scores: SourceScore[] = Array.from({ length: 30 }, (_, i) => ({
      topic: `AI topic ${i} release`,
      source: 'hackernews',
      score: Math.random(),
      metadata: {},
    }));

    const result = mergeTopics(scores, config);
    expect(result.length).toBeLessThanOrEqual(config.topN);
  });
});
