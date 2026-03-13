import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import { readJson, writeJson, safeMkdir } from '../fsutils.js';
import { getProvider } from '../ai/providers.js';
import { getCached, setCache } from '../trend/cache.js';
import type { TrendRunResult } from '../trend/types.js';
import type { VideoIdea, ChannelsConfig, ChannelConfig, ScriptOutline, VisualHints } from './types.js';

const logger = createLogger('topic');
const CACHE_MODULE = 'topic';

export interface TopicEngineOptions {
  runId?: string;
  trendArtifactPath?: string;
  variants?: number;
  force?: boolean;
}

function loadChannelsConfig(): ChannelsConfig {
  const configPath = path.resolve('config/channels.json');
  const config = readJson<ChannelsConfig>(configPath);
  if (!config) throw new Error(`Channel config not found at ${configPath}`);
  return config;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function makeIdeaId(topic: string, channel: string): string {
  const hash = crypto.createHash('sha256').update(`${topic}:${channel}`).digest('hex').slice(0, 6);
  return `${slugify(topic)}-${channel}-${hash}`;
}

function computeChannelFit(topic: string, channelConfig: ChannelConfig): number {
  const lower = topic.toLowerCase();
  let matches = 0;
  for (const kw of channelConfig.keywords) {
    if (lower.includes(kw.toLowerCase())) matches++;
  }
  return Math.min(1, matches / Math.max(channelConfig.keywords.length * 0.3, 1));
}

function computePriority(
  trendScore: number,
  channelFit: number,
  recencyBoost: number,
  diversityPenalty: number,
): number {
  const raw = 0.5 * trendScore + 0.2 * recencyBoost + 0.2 * channelFit + 0.1 * (1 - diversityPenalty);
  return Math.max(0, Math.min(1, raw));
}

function generateVisualHints(channel: string, channelConfig: ChannelConfig): VisualHints {
  if (channel === 'anime_explains') {
    return {
      character: channelConfig.character ?? 'gojo.png',
      overlay: 'benchmark-bar-chart',
      bgMusic: channelConfig.bgMusic,
      style: 'anime, energetic',
    };
  }
  if (channel === 'ai_tools') {
    return {
      overlay: 'animated-bullet-points',
      bgMusic: channelConfig.bgMusic,
      style: 'screen-capture, utility',
    };
  }
  // tech_facts
  return {
    overlay: 'infographic-numbers',
    bgMusic: channelConfig.bgMusic,
    style: 'infographic, fast-cuts',
  };
}

function generateHashtags(topic: string, channel: string): string[] {
  const words = topic.split(/\s+/).filter((w) => w.length > 2);
  const tags = words.slice(0, 3).map((w) => `#${w.replace(/[^a-zA-Z0-9]/g, '')}`);
  tags.push(`#${channel.replace(/_/g, '')}`);
  tags.push('#Shorts');
  return [...new Set(tags)];
}

async function generateScriptOutline(
  topic: string,
  channel: string,
  styleHints: string,
): Promise<{ title: string; scriptOutline: ScriptOutline }> {
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${topic}:${channel}:${styleHints}`)
    .digest('hex')
    .slice(0, 16);

  const cached = getCached<{ title: string; scriptOutline: ScriptOutline }>(CACHE_MODULE, cacheKey);
  if (cached) return cached;

  const provider = getProvider();
  const prompt = `You are a concise short-video copywriter. Given a topic and channel style, produce a 30-second script outline divided into segments. Keep the hook under 4 seconds. Provide a catchy title.
IMPORTANT: Output ONLY valid JSON. No markdown, no code fences, no explanation.

Input:
topic: ${topic}
channel: ${channel}
styleHints: ${styleHints}

Output JSON:
{
  "title": "...",
  "scriptOutline": {
    "hook": "3s: ...",
    "seg1": "10s: ...",
    "seg2": "12s: ...",
    "cta": "5s: ..."
  }
}`;

  const result = await provider.generate({ prompt, maxTokens: 300, jsonMode: true });

  // Try to parse LLM response as JSON; fall back to template
  try {
    let jsonText = result.text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) jsonText = fenceMatch[1]!.trim();
    if (!jsonText.startsWith('{')) {
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      if (start !== -1 && end > start) jsonText = jsonText.slice(start, end + 1);
    }
    const parsed = JSON.parse(jsonText);
    const output = {
      title: parsed.title ?? `${topic} in 30 seconds`,
      scriptOutline: {
        hook: parsed.scriptOutline?.hook ?? `3s: '${topic} — here's what you need to know.'`,
        seg1: parsed.scriptOutline?.seg1 ?? '10s: Key point 1',
        seg2: parsed.scriptOutline?.seg2 ?? '12s: Key point 2',
        cta: parsed.scriptOutline?.cta ?? '5s: Follow for more!',
      },
    };
    setCache(CACHE_MODULE, cacheKey, output, 24);
    return output;
  } catch {
    // Mock provider returns non-JSON; use template
    const channelPrefix: Record<string, string> = {
      anime_explains: 'Gojo explains',
      ai_tools: 'Tool spotlight:',
      tech_facts: 'Did you know?',
    };
    const prefix = channelPrefix[channel] ?? '';
    const output = {
      title: `${prefix} ${topic} in 30s`.trim(),
      scriptOutline: {
        hook: `3s: '${topic} — here's what you need to know.'`,
        seg1: `10s: What's new and why it matters`,
        seg2: `12s: Key highlights and numbers`,
        cta: `5s: Follow for more ${channel.replace(/_/g, ' ')}!`,
      },
    };
    setCache(CACHE_MODULE, cacheKey, output, 24);
    return output;
  }
}

export async function generateFromTrends(
  trendArtifactPath: string,
  options: TopicEngineOptions = {},
): Promise<VideoIdea[]> {
  const channelsConfig = loadChannelsConfig();
  const variants = options.variants ?? channelsConfig.variantsPerTopic;

  const trendData = readJson<TrendRunResult>(trendArtifactPath);
  if (!trendData) throw new Error(`Trend artifact not found: ${trendArtifactPath}`);

  const runId = options.runId ?? new Date().toISOString();
  logger.info(`Topic generation run ${runId} from ${trendArtifactPath}`);

  const outputPath = path.resolve('data/topics', `${runId.replace(/[:.]/g, '-')}.json`);

  // Idempotency
  if (fs.existsSync(outputPath) && !options.force) {
    logger.info(`Topic artifact exists: ${outputPath}`);
    const existing = readJson<VideoIdea[]>(outputPath);
    if (existing) return existing;
  }

  const ideas: VideoIdea[] = [];
  const seenIds = new Set<string>();
  const channelNames = Object.keys(channelsConfig.channels);

  for (const mt of trendData.mergedTopics) {
    for (const channelName of channelNames) {
      const channelConfig = channelsConfig.channels[channelName]!;
      const channelFit = computeChannelFit(mt.topic, channelConfig);

      // Only generate if there's some relevance
      if (channelFit < 0.05 && variants <= 1) continue;

      const ideaId = makeIdeaId(mt.topic, channelName);

      // Duplicate check
      if (seenIds.has(ideaId)) {
        continue;
      }
      seenIds.add(ideaId);

      const priority = computePriority(mt.score, channelFit, 0.8, 0);

      const { title, scriptOutline } = await generateScriptOutline(
        mt.topic,
        channelName,
        channelConfig.style,
      );

      const visualHints = generateVisualHints(channelName, channelConfig);
      const hashtags = generateHashtags(mt.topic, channelName);

      ideas.push({
        ideaId,
        channel: channelName,
        topic: mt.topic,
        title,
        priority,
        brief: `Cover: ${mt.topic}. Sources: ${mt.sources.join(', ')}.`,
        scriptOutline,
        visualHints,
        hashtags,
        estimatedLengthSec: channelConfig.defaultLengthSec,
      });
    }
  }

  // Sort by priority
  ideas.sort((a, b) => b.priority - a.priority);

  // Trim to max
  const finalIdeas = ideas.slice(0, channelsConfig.maxIdeasPerRun);

  // Save
  safeMkdir(path.dirname(outputPath));
  writeJson(outputPath, finalIdeas);
  logger.info(`Generated ${finalIdeas.length} ideas → ${outputPath}`);

  // Log top 3
  for (const idea of finalIdeas.slice(0, 3)) {
    logger.info(`Top idea: [${idea.channel}] ${idea.title} (priority: ${idea.priority.toFixed(2)})`);
  }

  return finalIdeas;
}
