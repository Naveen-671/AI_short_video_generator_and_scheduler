import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { updateStrategy } from '../modules/optimizer/updateStrategy.js';

describe('optimizer', () => {
  const metricsDir = path.resolve('data/test-metrics');
  const scriptsDir = path.resolve('data/test-scripts');
  const strategyPath = path.resolve('data/strategy.json');

  beforeEach(() => {
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });

    // Create mock scripts
    const scripts = [
      { scriptId: 'script-001', channel: 'anime_explains', title: 'AI models explained' },
      { scriptId: 'script-002', channel: 'ai_tools', title: 'Best coding tools' },
      { scriptId: 'script-003', channel: 'anime_explains', title: 'Neural networks intro' },
    ];
    fs.writeFileSync(path.join(scriptsDir, 'test-run.json'), JSON.stringify(scripts));

    // Create mock metrics
    const metrics = {
      date: '2026-03-13',
      items: [
        {
          videoId: 'v1', platform: 'youtube', scriptId: 'script-001',
          views: 10000, likes: 500, comments: 200, shares: 50,
          watchTime: 250000, engagementScore: 4210, collectedAt: '2026-03-13T00:00:00Z',
        },
        {
          videoId: 'v2', platform: 'youtube', scriptId: 'script-002',
          views: 3000, likes: 100, comments: 50, shares: 10,
          watchTime: 60000, engagementScore: 1245, collectedAt: '2026-03-13T00:00:00Z',
        },
        {
          videoId: 'v3', platform: 'instagram', scriptId: 'script-003',
          views: 15000, likes: 800, comments: 300, shares: 100,
          watchTime: 400000, engagementScore: 6330, collectedAt: '2026-03-13T00:00:00Z',
        },
      ],
    };
    fs.writeFileSync(path.join(metricsDir, '2026-03-13.json'), JSON.stringify(metrics));
  });

  afterEach(() => {
    if (fs.existsSync(metricsDir)) fs.rmSync(metricsDir, { recursive: true });
    if (fs.existsSync(scriptsDir)) fs.rmSync(scriptsDir, { recursive: true });
    if (fs.existsSync(strategyPath)) fs.unlinkSync(strategyPath);
  });

  it('generates strategy from metrics data', async () => {
    const result = await updateStrategy({ metricsDir, scriptsDir });
    expect(result).toBe(strategyPath);
    expect(fs.existsSync(strategyPath)).toBe(true);

    const strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf-8'));
    expect(strategy.bestChannel).toBe('anime_explains');
    expect(strategy.topTopics.length).toBeGreaterThan(0);
    expect(strategy.recommendedFrequency).toBeGreaterThanOrEqual(2);
    expect(strategy.channelPerformance.length).toBe(2);
    expect(strategy.updatedAt).toBeTruthy();
  });

  it('writes default strategy when no metrics exist', async () => {
    // Remove metrics
    fs.rmSync(metricsDir, { recursive: true });

    const result = await updateStrategy({ metricsDir, scriptsDir });
    expect(fs.existsSync(result)).toBe(true);

    const strategy = JSON.parse(fs.readFileSync(result, 'utf-8'));
    expect(strategy.bestChannel).toBe('anime_explains');
    expect(strategy.topTopics).toEqual([]);
    expect(strategy.recommendedFrequency).toBe(2);
  });

  it('ranks channels by engagement score', async () => {
    const result = await updateStrategy({ metricsDir, scriptsDir });
    const strategy = JSON.parse(fs.readFileSync(result, 'utf-8'));

    // anime_explains has 2 videos with avg engagement (4210+6330)/2 = 5270
    // ai_tools has 1 video with engagement 1245
    expect(strategy.channelPerformance[0].channel).toBe('anime_explains');
    expect(strategy.channelPerformance[1].channel).toBe('ai_tools');
    expect(strategy.channelPerformance[0].avgEngagement).toBeGreaterThan(
      strategy.channelPerformance[1].avgEngagement,
    );
  });
});
