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
  if (lengthSec <= 15) {
    return [
      { label: 'hook', startSec: 0, endSec: 3, text: `Yo, have you SEEN this? ${topic} just dropped!`, speaker: 'narrator', emotion: 'excited' },
      { label: 'react1', startSec: 3, endSec: 8, text: `Wait, for REAL? That sounds huge... tell me everything!`, speaker: 'reactor', emotion: 'surprised' },
      { label: 'explain1', startSec: 8, endSec: 13, text: `It's a complete game changer — you HAVE to see the details.`, speaker: 'narrator', emotion: 'dramatic' },
      { label: 'cta', startSec: 13, endSec: 15, text: `Yo FOLLOW for more tech breakdowns like this!`, speaker: 'reactor', emotion: 'cheerful' },
    ];
  }

  if (lengthSec <= 30) {
    return [
      { label: 'hook', startSec: 0, endSec: 3, text: `Dude, ${topic} is BLOWING UP right now!`, speaker: 'narrator', emotion: 'excited' },
      { label: 'react1', startSec: 3, endSec: 7, text: `No WAY... what happened?`, speaker: 'reactor', emotion: 'surprised' },
      { label: 'explain1', startSec: 7, endSec: 14, text: `So basically, ${topic} has been making MASSIVE waves across the entire tech community. Everyone's talking about it.`, speaker: 'narrator', emotion: 'serious' },
      { label: 'react2', startSec: 14, endSec: 18, text: `That's actually INSANE! But hold on... what does it mean for US?`, speaker: 'reactor', emotion: 'curious' },
      { label: 'explain2', startSec: 18, endSec: 26, text: `And here's the craziest part... this could completely change how we work. The numbers are BACKING it up.`, speaker: 'narrator', emotion: 'dramatic' },
      { label: 'cta', startSec: 26, endSec: 30, text: `Bro FOLLOW right now, we're breaking down more of this!`, speaker: 'reactor', emotion: 'cheerful' },
    ];
  }

  // 45s+
  return [
    { label: 'hook', startSec: 0, endSec: 3, text: `Okay you NEED to hear this — ${topic} just dropped!`, speaker: 'narrator', emotion: 'excited' },
    { label: 'react1', startSec: 3, endSec: 6, text: `Wait WHAT? Give me the details right now!`, speaker: 'reactor', emotion: 'surprised' },
    { label: 'explain1', startSec: 6, endSec: 15, text: `So here's the deal. ${topic} introduces several HUGE changes that nobody saw coming...`, speaker: 'narrator', emotion: 'dramatic' },
    { label: 'react2', startSec: 15, endSec: 19, text: `Okay I'm listening... how big are we talking here?`, speaker: 'reactor', emotion: 'curious' },
    { label: 'explain2', startSec: 19, endSec: 30, text: `The benchmarks are WILD. Early tests show massive improvements across the board — we're talking next level stuff.`, speaker: 'narrator', emotion: 'serious' },
    { label: 'react3', startSec: 30, endSec: 34, text: `Bro that's actually insane... should I switch to this RIGHT NOW?`, speaker: 'reactor', emotion: 'surprised' },
    { label: 'explain3', startSec: 34, endSec: 41, text: `Honestly? If you're in this space, you ABSOLUTELY should try it. It could change your entire workflow.`, speaker: 'narrator', emotion: 'excited' },
    { label: 'cta', startSec: 41, endSec: 45, text: `Yo FOLLOW us right now for more breakdowns like this!`, speaker: 'reactor', emotion: 'cheerful' },
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

  const prompt = `You are a viral short-form video scriptwriter. Write a DIALOGUE between two animated characters reacting to a trending tech topic — the kind that gets millions of views on TikTok/Reels/Shorts.

CHARACTERS:
- "narrator" — The one who KNOWS. Drops bombs, reveals facts, builds hype. Speaks with confident energy.
- "reactor" — The audience stand-in. Reacts with genuine shock, curiosity, skepticism. Asks the questions viewers are thinking.

VOICE & EMOTION RULES (this is critical for quality):
Each segment MUST include an "emotion" field. Valid emotions:
  "excited" — high energy, fast, hyped up (use for hooks, big reveals)
  "surprised" — genuine shock, disbelief (use for reactor hearing news)
  "dramatic" — slow, deliberate, building tension (use for key facts)
  "curious" — questioning, leaning in (use for reactor asking questions)
  "cheerful" — warm, positive energy (use for CTA, good news)
  "serious" — authoritative, factual (use for stats, technical details)
  "sarcastic" — playful, ironic (use sparingly for humor)

WRITING STYLE:
- HOOK HARD in the first 3 seconds. Make them stop scrolling.
- Write like real people talk — contractions, slang, emphasis with CAPS on key words.
- Reactor should have GENUINE emotional reactions: "Wait WHAT?!", "Bro, no way!", "That's actually INSANE", "Hold on hold on..."
- Include SPECIFIC numbers, names, dates — vague content = boring content.
- Use dramatic pauses with "..." for tension: "And the craziest part is..."
- Each segment = 2-5 seconds of speech (5-15 words).
- Build to a climax — save the most shocking fact for the end.
- End with reactor hyping the follow: "Yo, FOLLOW for more of this!"

IMPORTANT: Output ONLY valid JSON. No markdown, no code fences, no explanation.

Input:
{
  "topic": "${idea.topic}",
  "channel": "${idea.channel}",
  "targetLengthSec": ${lengthSec},
  "briefContext": "${idea.brief}"
}

Output JSON:
{
  "title": "Clickbait-worthy title, max 60 chars",
  "hook": "Narrator's opening line, <= 10 words",
  "timedSegments": [
    {"label":"hook","startSec":0,"endSec":3,"text":"...","speaker":"narrator","emotion":"excited"},
    {"label":"react1","startSec":3,"endSec":6,"text":"...","speaker":"reactor","emotion":"surprised"},
    {"label":"explain1","startSec":6,"endSec":12,"text":"...","speaker":"narrator","emotion":"serious"},
    {"label":"react2","startSec":12,"endSec":15,"text":"...","speaker":"reactor","emotion":"curious"},
    {"label":"explain2","startSec":15,"endSec":22,"text":"...","speaker":"narrator","emotion":"dramatic"},
    {"label":"react3","startSec":22,"endSec":25,"text":"...","speaker":"reactor","emotion":"surprised"},
    {"label":"explain3","startSec":25,"endSec":${lengthSec - 4},"text":"...","speaker":"narrator","emotion":"excited"},
    {"label":"cta","startSec":${lengthSec - 4},"endSec":${lengthSec},"text":"Follow for more!","speaker":"reactor","emotion":"cheerful"}
  ],
  "displayBullets": ["specific fact 1","specific fact 2","specific fact 3"],
  "estimatedLengthSec": ${lengthSec},
  "notesForVoice": "narrator: confident dramatic authority, reactor: expressive shocked energy",
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
      () => provider.generate({ prompt, maxTokens: 700, jsonMode: true }),
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
