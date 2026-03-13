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

function buildDefaultSegments(lengthSec: number, topic: string, _channel: string): TimedSegment[] {
  if (lengthSec <= 30) {
    return [
      { label: 'hook', startSec: 0, endSec: 3, text: `This is HUGE — ${topic} just changed EVERYTHING`, speaker: 'narrator', emotion: 'excited' },
      { label: 'react1', startSec: 3, endSec: 6, text: `Wait, what happened? Break it down for me`, speaker: 'reactor', emotion: 'curious' },
      { label: 'context', startSec: 6, endSec: 12, text: `So here is the full story. ${topic} has been in development for over a year, and the details are finally out.`, speaker: 'narrator', emotion: 'serious' },
      { label: 'react2', startSec: 12, endSec: 15, text: `Okay that is interesting... but what makes it special?`, speaker: 'reactor', emotion: 'curious' },
      { label: 'detail1', startSec: 15, endSec: 22, text: `The key thing is the technical breakthrough. We are seeing performance numbers that were thought to be impossible just two years ago.`, speaker: 'narrator', emotion: 'dramatic' },
      { label: 'react3', startSec: 22, endSec: 25, text: `So who does this actually affect? Regular developers?`, speaker: 'reactor', emotion: 'curious' },
      { label: 'impact', startSec: 25, endSec: 32, text: `Everyone. From startups to enterprise teams. The pricing model alone makes it accessible to individual developers for the first time.`, speaker: 'narrator', emotion: 'serious' },
      { label: 'summary', startSec: 32, endSec: 38, text: `Bottom line — this is not just an upgrade, it is a fundamental shift in what is possible. Keep watching to stay ahead.`, speaker: 'narrator', emotion: 'dramatic' },
      { label: 'cta', startSec: 38, endSec: 42, text: `Follow for daily breakdowns on the tech that actually matters`, speaker: 'reactor', emotion: 'cheerful' },
    ];
  }

  // 60s+ (default target)
  return [
    { label: 'hook', startSec: 0, endSec: 4, text: `Stop scrolling — ${topic} just dropped and it changes EVERYTHING we know`, speaker: 'narrator', emotion: 'excited' },
    { label: 'react1', startSec: 4, endSec: 7, text: `Wait, I keep seeing this everywhere. What actually happened?`, speaker: 'reactor', emotion: 'curious' },
    { label: 'context', startSec: 7, endSec: 14, text: `Okay so here is the full context. ${topic} has been quietly in development, and today they released the complete technical details.`, speaker: 'narrator', emotion: 'serious' },
    { label: 'react2', startSec: 14, endSec: 17, text: `Interesting. But there is so much hype in tech. What makes this one real?`, speaker: 'reactor', emotion: 'curious' },
    { label: 'detail1', startSec: 17, endSec: 25, text: `Great question. The benchmarks speak for themselves. Independent tests are showing massive improvements across multiple categories, not just marketing claims.`, speaker: 'narrator', emotion: 'serious' },
    { label: 'react3', startSec: 25, endSec: 28, text: `Okay those numbers are actually significant. What is the catch though?`, speaker: 'reactor', emotion: 'surprised' },
    { label: 'detail2', startSec: 28, endSec: 36, text: `The pricing and availability are the real story. Unlike previous releases, this is designed to be accessible from day one. Individual developers and small teams can use it immediately.`, speaker: 'narrator', emotion: 'dramatic' },
    { label: 'react4', startSec: 36, endSec: 39, text: `That is a big deal. What about existing workflows? Do people need to rebuild everything?`, speaker: 'reactor', emotion: 'curious' },
    { label: 'detail3', startSec: 39, endSec: 47, text: `No, and that is the smart part. Full backward compatibility with existing tools. You can migrate gradually. The API is designed to be a drop-in replacement.`, speaker: 'narrator', emotion: 'serious' },
    { label: 'react5', startSec: 47, endSec: 50, text: `So what should people actually DO right now? Like today?`, speaker: 'reactor', emotion: 'curious' },
    { label: 'action', startSec: 50, endSec: 57, text: `Three things. First, read the official documentation. Second, try the free tier to understand the differences. Third, start planning your migration timeline. Do not rush, but do not wait either.`, speaker: 'narrator', emotion: 'serious' },
    { label: 'summary', startSec: 57, endSec: 63, text: `Bottom line — this is a genuine leap forward, not incremental. The companies that adopt early will have a real competitive advantage.`, speaker: 'narrator', emotion: 'dramatic' },
    { label: 'cta', startSec: 63, endSec: 67, text: `Follow for daily deep dives on the technology that is actually shaping the future`, speaker: 'reactor', emotion: 'cheerful' },
  ];
}

function buildDefaultBullets(topic: string): string[] {
  return [
    `What ${topic} actually does`,
    'Key technical benchmarks and real numbers',
    'How it compares to existing solutions',
    'Who benefits and who should wait',
    'Practical next steps to take today',
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

  const prompt = `You are an expert tech journalist writing a SHORT DOCUMENTARY script for a viral vertical video.
Two animated characters will narrate this — one explains and one asks questions the audience is thinking.

FORMAT: A ${lengthSec}-second dialogue between "narrator" (the expert) and "reactor" (the curious audience).

CONTENT RULES (most important):
1. ACTUALLY EXPLAIN the topic. Cover: what it is, why it matters, real numbers/benchmarks, who it affects, and what to do about it.
2. Include SPECIFIC facts: real company names, version numbers, performance metrics, dates, pricing, comparisons to competitors.
3. Every narrator segment must teach something NEW. No filler. No repeating "it's amazing" without saying WHY.
4. Reactor asks REAL questions: "How does that compare to X?", "What about pricing?", "Does this work with existing tools?"
5. Structure: Hook → Context → Technical Details → Real-World Impact → Practical Advice → Summary
6. Do NOT use empty hype phrases like "game changer", "next level", "INSANE" without backing them with facts.
7. The script should feel like a mini-documentary, not a hype trailer.

EMOTION (for voice synthesis — each segment needs one):
"excited" — energetic opening hooks
"serious" — factual explanations with data
"dramatic" — key reveals, important conclusions
"curious" — reactor questions
"surprised" — genuine reaction to impressive facts
"cheerful" — positive conclusions, CTAs
"calm" — measured analysis

SCRIPT STRUCTURE (${lengthSec}s target, 12-14 segments):
- HOOK (0-4s): Bold opening statement with the key news
- CONTEXT (4-12s): What happened, who announced it, when
- DEEP DIVE (12-35s): 3-4 segments alternating narrator facts and reactor questions. Cover technical specs, benchmarks, comparisons.
- IMPACT (35-50s): Who benefits, pricing/availability, ecosystem effects
- PRACTICAL (50-${lengthSec - 5}s): What viewers should actually do about it
- CTA (last 5s): Follow for more analysis

IMPORTANT: Output ONLY valid JSON. No markdown fences. No commentary.

Input:
{
  "topic": "${idea.topic}",
  "channel": "${idea.channel}",
  "targetLengthSec": ${lengthSec},
  "briefContext": "${idea.brief}"
}

Output JSON:
{
  "title": "Clear informative title, max 60 chars",
  "hook": "Opening line that states the key news",
  "sourceLine": "Source: [publication/site where this was reported]",
  "timedSegments": [
    {"label":"hook","startSec":0,"endSec":4,"text":"...","speaker":"narrator","emotion":"excited"},
    {"label":"react1","startSec":4,"endSec":7,"text":"...","speaker":"reactor","emotion":"curious"},
    {"label":"context","startSec":7,"endSec":14,"text":"...","speaker":"narrator","emotion":"serious"},
    {"label":"react2","startSec":14,"endSec":17,"text":"...","speaker":"reactor","emotion":"curious"},
    {"label":"detail1","startSec":17,"endSec":24,"text":"...","speaker":"narrator","emotion":"serious"},
    {"label":"react3","startSec":24,"endSec":27,"text":"...","speaker":"reactor","emotion":"surprised"},
    {"label":"detail2","startSec":27,"endSec":35,"text":"...","speaker":"narrator","emotion":"dramatic"},
    {"label":"react4","startSec":35,"endSec":38,"text":"...","speaker":"reactor","emotion":"curious"},
    {"label":"detail3","startSec":38,"endSec":45,"text":"...","speaker":"narrator","emotion":"serious"},
    {"label":"react5","startSec":45,"endSec":48,"text":"...","speaker":"reactor","emotion":"curious"},
    {"label":"action","startSec":48,"endSec":55,"text":"...","speaker":"narrator","emotion":"serious"},
    {"label":"summary","startSec":55,"endSec":${lengthSec - 5},"text":"...","speaker":"narrator","emotion":"dramatic"},
    {"label":"cta","startSec":${lengthSec - 5},"endSec":${lengthSec},"text":"Follow for more","speaker":"reactor","emotion":"cheerful"}
  ],
  "displayBullets": ["Key fact 1 with real data","Key fact 2 with comparison","Key fact 3 with impact","Key fact 4 practical advice","Key fact 5 future outlook"],
  "estimatedLengthSec": ${lengthSec},
  "notesForVoice": "narrator: knowledgeable, measured authority; reactor: genuinely curious, asks smart questions",
  "requires_verification": false
}`;

  let title: string;
  let hook: string;
  let sourceLine: string;
  let timedSegments: TimedSegment[];
  let displayBullets: string[];
  let notesForVoice: string;
  let requiresVerification = false;

  try {
    const result = await withRetry(
      () => provider.generate({ prompt, maxTokens: 1500, jsonMode: true }),
      { label: `script-gen-${scriptId}`, maxRetries: 2 },
    );

    // Attempt to parse LLM JSON (strip markdown fences if present)
    try {
      let jsonText = result.text.trim();
      // Strip markdown code fences: ```json ... ``` or ``` ... ```
      const fenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (fenceMatch) jsonText = fenceMatch[1]!.trim();
      // Fallback: find first { ... last }
      if (!jsonText.startsWith('{')) {
        const start = jsonText.indexOf('{');
        const end = jsonText.lastIndexOf('}');
        if (start !== -1 && end > start) jsonText = jsonText.slice(start, end + 1);
      }
      const parsed = JSON.parse(jsonText);
      title = parsed.title ?? `${idea.topic} in ${lengthSec}s`;
      hook = parsed.hook ?? `${idea.topic} — wow.`;
      sourceLine = parsed.sourceLine ?? `Source: ${idea.brief?.match(/Sources?:\s*(.+)/i)?.[1] ?? 'industry reports'}`;
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
      sourceLine = `Source: ${idea.brief?.match(/Sources?:\s*(.+)/i)?.[1] ?? 'tech news'}`;
      timedSegments = buildDefaultSegments(lengthSec, idea.topic, idea.channel);
      displayBullets = buildDefaultBullets(idea.topic);
      notesForVoice = 'tone: energetic, pacing: medium';
    }
  } catch (err) {
    logger.error(`Script generation failed for ${scriptId}`, err instanceof Error ? err : new Error(String(err)));
    title = `${idea.topic} in ${lengthSec}s`;
    hook = `${idea.topic} — here's what to know.`;
    sourceLine = `Source: ${idea.brief?.match(/Sources?:\s*(.+)/i)?.[1] ?? 'tech news'}`;
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
    sourceLine,
    timedSegments,
    displayBullets,
    estimatedLengthSec: lengthSec,
    notesForVoice,
    dialogueMode: true,
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
  const lengths = options.lengths ?? [60];

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
