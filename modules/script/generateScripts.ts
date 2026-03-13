import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { getProvider } from '../ai/providers.js';
import { getCached, setCache } from '../trend/cache.js';
import { withRetry } from '../retry.js';
import type { VideoIdea } from '../topic/types.js';
import type { ScriptArtifact, TimedSegment } from './types.js';

const logger = createLogger('script');
const CACHE_MODULE = 'script';

export interface ScriptGenOptions {
  variants?: number;
  lengths?: number[];
  force?: boolean;
}

function makeCacheKey(topic: string, channel: string, style: string, length: number, variant: number): string {
  return crypto
    .createHash('sha256')
    .update(`${topic}:${channel}:${style}:${length}:${variant}`)
    .digest('hex')
    .slice(0, 16);
}

function makeScriptId(ideaId: string, length: number, variant: number): string {
  return `${ideaId}-${length}s-v${variant}`;
}

function buildDefaultSegments(lengthSec: number, topic: string, channel: string): TimedSegment[] {
  const channelCta: Record<string, string> = {
    anime_explains: 'Follow for more anime-style tech explanations!',
    ai_tools: 'Follow for the latest AI tools and workflows!',
    tech_facts: 'Follow for daily tech facts!',
  };

  if (lengthSec <= 15) {
    return [
      { label: 'hook', startSec: 0, endSec: 3, text: `${topic} — here's the quick take.` },
      { label: 'point1', startSec: 3, endSec: 10, text: `The key highlight you need to know about ${topic}.` },
      { label: 'cta', startSec: 10, endSec: 15, text: channelCta[channel] ?? 'Follow for more!' },
    ];
  }

  if (lengthSec <= 30) {
    return [
      { label: 'hook', startSec: 0, endSec: 3, text: `${topic} — this changes everything.` },
      { label: 'point1', startSec: 3, endSec: 12, text: `Here's what happened: ${topic} has been making waves across the tech community.` },
      { label: 'point2', startSec: 12, endSec: 24, text: `The key takeaway? This could reshape how we think about this space. Numbers and benchmarks support the hype.` },
      { label: 'cta', startSec: 24, endSec: 30, text: channelCta[channel] ?? 'Follow for more!' },
    ];
  }

  // 45s
  return [
    { label: 'hook', startSec: 0, endSec: 3, text: `${topic} just dropped — and it's big.` },
    { label: 'point1', startSec: 3, endSec: 15, text: `First, let's talk about what's new. ${topic} introduces several significant changes.` },
    { label: 'point2', startSec: 15, endSec: 28, text: `The benchmarks are impressive. Early tests show notable improvements across the board.` },
    { label: 'point3', startSec: 28, endSec: 38, text: `What does this mean for you? It could change your workflow starting today.` },
    { label: 'cta', startSec: 38, endSec: 45, text: channelCta[channel] ?? 'Follow for more!' },
  ];
}

function buildDefaultBullets(topic: string): string[] {
  const words = topic.split(/\s+/);
  return [
    `${words.slice(0, 4).join(' ')} is here`,
    'Key benchmarks revealed',
    'What it means for you',
  ];
}

async function generateSingleScript(
  idea: VideoIdea,
  lengthSec: number,
  variantIndex: number,
): Promise<ScriptArtifact> {
  const styleHintsStr = JSON.stringify(idea.visualHints);
  const cacheKey = makeCacheKey(idea.topic, idea.channel, styleHintsStr, lengthSec, variantIndex);
  const scriptId = makeScriptId(idea.ideaId, lengthSec, variantIndex);

  // Check cache
  const cached = getCached<ScriptArtifact>(CACHE_MODULE, cacheKey);
  if (cached) {
    logger.info(`Cache hit for script ${scriptId}`);
    return cached;
  }

  const provider = getProvider();

  const prompt = `You are a professional short-form video copywriter specialized in 15–60 second educational content.

Given the compact input metadata, produce a JSON object with a single script variant tailored to the requested length.

Input:
{
  "topic": "${idea.topic}",
  "channel": "${idea.channel}",
  "styleHints": "${idea.visualHints.style ?? ''}",
  "targetLengthSec": ${lengthSec},
  "briefContext": "${idea.brief}"
}

Output JSON format:
{
  "title": "Short, clickable title (max 60 chars)",
  "hook": "1-line hook, <= 8 words, suitable for first 3 seconds",
  "timedSegments": [
    {"label":"hook","startSec":0,"endSec":3,"text":"..."},
    {"label":"point1","startSec":3,"endSec":12,"text":"..."},
    {"label":"point2","startSec":12,"endSec":22,"text":"..."},
    {"label":"cta","startSec":22,"endSec":${lengthSec},"text":"..."}
  ],
  "displayBullets": ["bullet 1","bullet 2","bullet 3"],
  "estimatedLengthSec": ${lengthSec},
  "notesForVoice": "tone: energetic, pacing: medium-slow",
  "requires_verification": false
}`;

  let title: string;
  let hook: string;
  let timedSegments: TimedSegment[];
  let displayBullets: string[];
  let notesForVoice: string;
  let requiresVerification = false;

  try {
    const result = await withRetry(
      () => provider.generate({ prompt, maxTokens: 500 }),
      { label: `script-gen-${scriptId}`, maxRetries: 2 },
    );

    // Attempt to parse LLM JSON
    try {
      const parsed = JSON.parse(result.text);
      title = parsed.title ?? `${idea.topic} in ${lengthSec}s`;
      hook = parsed.hook ?? `${idea.topic} — wow.`;
      timedSegments = Array.isArray(parsed.timedSegments) ? parsed.timedSegments : buildDefaultSegments(lengthSec, idea.topic, idea.channel);
      displayBullets = Array.isArray(parsed.displayBullets) ? parsed.displayBullets : buildDefaultBullets(idea.topic);
      notesForVoice = parsed.notesForVoice ?? 'tone: energetic, pacing: medium';
      requiresVerification = parsed.requires_verification ?? false;
    } catch {
      // Mock provider returns non-JSON; use template defaults
      const hookVariants = [
        `${idea.topic} — this changes everything.`,
        `What is ${idea.topic}? Let me explain.`,
        `You won't believe what ${idea.topic} just did.`,
      ];
      title = `${idea.topic} in ${lengthSec}s`;
      hook = hookVariants[variantIndex % hookVariants.length]!;
      timedSegments = buildDefaultSegments(lengthSec, idea.topic, idea.channel);
      displayBullets = buildDefaultBullets(idea.topic);
      notesForVoice = 'tone: energetic, pacing: medium';
    }
  } catch (err) {
    logger.error(`Script generation failed for ${scriptId}`, err instanceof Error ? err : new Error(String(err)));
    title = `${idea.topic} in ${lengthSec}s`;
    hook = `${idea.topic} — here's what to know.`;
    timedSegments = buildDefaultSegments(lengthSec, idea.topic, idea.channel);
    displayBullets = buildDefaultBullets(idea.topic);
    notesForVoice = 'tone: neutral';
    requiresVerification = true;
  }

  const artifact: ScriptArtifact = {
    scriptId,
    ideaId: idea.ideaId,
    channel: idea.channel,
    title,
    hook,
    timedSegments,
    displayBullets,
    estimatedLengthSec: lengthSec,
    notesForVoice,
    metadata: {
      styleHints: idea.visualHints as unknown as Record<string, unknown>,
      visualHints: idea.visualHints as unknown as Record<string, unknown>,
    },
    llm_cache_key: cacheKey,
    requires_verification: requiresVerification,
    createdAt: new Date().toISOString(),
  };

  setCache(CACHE_MODULE, cacheKey, artifact, 24);
  return artifact;
}

export async function generateScriptsFromTopics(
  runId: string,
  options: ScriptGenOptions = {},
): Promise<string> {
  const variants = options.variants ?? 3;
  const lengths = options.lengths ?? [30];

  const topicsPath = path.resolve('data/topics', `${runId.replace(/[:.]/g, '-')}.json`);
  const ideas = readJson<VideoIdea[]>(topicsPath);
  if (!ideas) throw new Error(`Topics artifact not found: ${topicsPath}`);

  const outputPath = path.resolve('data/scripts', `${runId.replace(/[:.]/g, '-')}.json`);

  // Idempotency
  if (fs.existsSync(outputPath) && !options.force) {
    logger.info(`Script artifact exists: ${outputPath}`);
    return outputPath;
  }

  logger.info(`Script generation starting: ${ideas.length} ideas × ${variants} variants × ${lengths.length} lengths`);

  const scripts: ScriptArtifact[] = [];
  let successes = 0;
  let failures = 0;

  for (const idea of ideas) {
    for (const length of lengths) {
      for (let v = 1; v <= variants; v++) {
        try {
          const script = await generateSingleScript(idea, length, v);
          scripts.push(script);
          successes++;
        } catch (err) {
          failures++;
          logger.error(
            `Failed to generate script for ${idea.ideaId} len=${length} v=${v}`,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    }
  }

  safeMkdir(path.dirname(outputPath));
  writeJson(outputPath, scripts);
  logger.info(`Script generation complete: ${successes} successes, ${failures} failures → ${outputPath}`);

  return outputPath;
}
