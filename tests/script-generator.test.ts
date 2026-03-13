import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateScriptsFromTopics } from '../modules/script/generateScripts.js';
import { writeJson, safeMkdir } from '../modules/fsutils.js';
import type { VideoIdea } from '../modules/topic/types.js';

const RUN_ID = 'test-scripts-run';
const TOPICS_DIR = path.resolve('data/topics');
const SCRIPTS_DIR = path.resolve('data/scripts');
const TOPICS_PATH = path.join(TOPICS_DIR, `${RUN_ID}.json`);

const sampleIdeas: VideoIdea[] = [
  {
    ideaId: 'gpt5-anime-001',
    channel: 'anime_explains',
    topic: 'OpenAI GPT-5 release',
    title: 'Gojo explains GPT-5 in 30s',
    priority: 0.9,
    brief: 'Cover: GPT-5 release highlights',
    scriptOutline: {
      hook: "3s: 'GPT-5 just dropped.'",
      seg1: '10s: What is new',
      seg2: '12s: Benchmarks',
      cta: '5s: Follow!',
    },
    visualHints: {
      character: 'gojo.png',
      overlay: 'benchmark-chart',
      bgMusic: 'energetic-loop-01',
      style: 'anime, energetic',
    },
    hashtags: ['#GPT5', '#AI', '#Shorts'],
    estimatedLengthSec: 30,
  },
  {
    ideaId: 'ai-tool-002',
    channel: 'ai_tools',
    topic: 'New AI coding assistant',
    title: 'AI coding tool spotlight',
    priority: 0.75,
    brief: 'Cover: New AI coding tool',
    scriptOutline: {
      hook: "3s: 'This tool writes code for you.'",
      seg1: '10s: Features',
      seg2: '12s: Demo',
      cta: '5s: Try it!',
    },
    visualHints: {
      overlay: 'screen-capture',
      bgMusic: 'chill-tech-01',
      style: 'professional',
    },
    hashtags: ['#AITools', '#Coding', '#Shorts'],
    estimatedLengthSec: 30,
  },
];

describe('Script generator', () => {
  beforeEach(() => {
    safeMkdir(TOPICS_DIR);
    writeJson(TOPICS_PATH, sampleIdeas);
  });

  afterAll(() => {
    if (fs.existsSync(TOPICS_PATH)) fs.unlinkSync(TOPICS_PATH);
    const scriptsFile = path.join(SCRIPTS_DIR, `${RUN_ID}.json`);
    if (fs.existsSync(scriptsFile)) fs.unlinkSync(scriptsFile);
  });

  it('generates scripts from topic ideas', async () => {
    const outputPath = await generateScriptsFromTopics(RUN_ID, {
      variants: 2,
      lengths: [30],
      force: true,
    });

    expect(outputPath).toContain(RUN_ID);
    expect(fs.existsSync(outputPath)).toBe(true);

    const scripts = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(Array.isArray(scripts)).toBe(true);
    // 2 ideas × 2 variants × 1 length = 4 scripts
    expect(scripts.length).toBe(4);

    for (const script of scripts) {
      expect(script.scriptId).toBeTruthy();
      expect(script.ideaId).toBeTruthy();
      expect(script.channel).toBeTruthy();
      expect(script.title).toBeTruthy();
      expect(script.hook).toBeTruthy();
      expect(Array.isArray(script.timedSegments)).toBe(true);
      expect(script.timedSegments.length).toBeGreaterThan(0);
      expect(Array.isArray(script.displayBullets)).toBe(true);
      expect(script.estimatedLengthSec).toBe(30);
      expect(script.llm_cache_key).toBeTruthy();
      expect(script.createdAt).toBeTruthy();
    }
  });

  it('timed segments sum to approximately estimatedLengthSec', async () => {
    const outputPath = await generateScriptsFromTopics(RUN_ID, {
      variants: 1,
      lengths: [30],
      force: true,
    });

    const scripts = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    for (const script of scripts) {
      const lastSeg = script.timedSegments[script.timedSegments.length - 1];
      expect(lastSeg.endSec).toBeGreaterThanOrEqual(script.estimatedLengthSec - 1);
      expect(lastSeg.endSec).toBeLessThanOrEqual(script.estimatedLengthSec + 1);
    }
  });

  it('supports multiple lengths', async () => {
    const outputPath = await generateScriptsFromTopics(RUN_ID, {
      variants: 1,
      lengths: [15, 30, 45],
      force: true,
    });

    const scripts = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const lengths = new Set(scripts.map((s: { estimatedLengthSec: number }) => s.estimatedLengthSec));
    expect(lengths.has(15)).toBe(true);
    expect(lengths.has(30)).toBe(true);
    expect(lengths.has(45)).toBe(true);
  });
});
