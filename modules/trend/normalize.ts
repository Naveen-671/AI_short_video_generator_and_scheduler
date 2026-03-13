import type { SourceScore, MergedTopic, TrendSourceConfig } from './types.js';

/**
 * Normalize a topic string for comparison:
 * - lowercase
 * - strip punctuation
 * - collapse whitespace
 */
export function normalizeTopic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute n-gram overlap similarity between two strings.
 * Returns a value in [0, 1].
 */
export function ngramSimilarity(a: string, b: string, n = 2): number {
  const ngramsOf = (s: string): Set<string> => {
    const ng = new Set<string>();
    const words = s.split(' ');
    if (words.length < n) {
      ng.add(s);
      return ng;
    }
    for (let i = 0; i <= words.length - n; i++) {
      ng.add(words.slice(i, i + n).join(' '));
    }
    return ng;
  };

  const aNg = ngramsOf(normalizeTopic(a));
  const bNg = ngramsOf(normalizeTopic(b));

  if (aNg.size === 0 && bNg.size === 0) return 1;
  if (aNg.size === 0 || bNg.size === 0) return 0;

  let intersection = 0;
  for (const ng of aNg) {
    if (bNg.has(ng)) intersection++;
  }

  const union = new Set([...aNg, ...bNg]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check relevance against keyword lists.
 */
export function isRelevant(
  topic: string,
  relevanceKeywords: string[],
  blacklistKeywords: string[],
): boolean {
  const lower = topic.toLowerCase();

  // First check blacklist
  for (const bw of blacklistKeywords) {
    if (lower.includes(bw.toLowerCase())) return false;
  }

  // Then check relevance (if no relevance keywords, accept all)
  if (relevanceKeywords.length === 0) return true;

  for (const kw of relevanceKeywords) {
    if (lower.includes(kw.toLowerCase())) return true;
  }

  return false;
}

/**
 * Merge source scores into deduplicated, aggregated merged topics.
 */
export function mergeTopics(
  sourceScores: SourceScore[],
  config: TrendSourceConfig,
): MergedTopic[] {
  const weights: Record<string, number> = {
    hackernews: config.sources.hackerNews.weight,
    reddit: config.sources.reddit.weight,
    google_trends: config.sources.googleTrends.weight,
    rss: config.sources.rss.weight,
  };

  // Filter by relevance
  const relevant = sourceScores.filter((s) =>
    isRelevant(s.topic, config.relevanceKeywords, config.blacklistKeywords),
  );

  // Groups of merged topics
  const groups: {
    canonical: string;
    scores: SourceScore[];
  }[] = [];

  for (const item of relevant) {
    let merged = false;
    for (const group of groups) {
      // Check similarity with canonical topic
      const sim = ngramSimilarity(item.topic, group.canonical);
      if (sim >= 0.85) {
        group.scores.push(item);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push({ canonical: item.topic, scores: [item] });
    }
  }

  // Compute aggregated scores
  const merged: MergedTopic[] = groups.map((group) => {
    const sources = [...new Set(group.scores.map((s) => s.source))];
    const weightedSum = group.scores.reduce(
      (sum, s) => sum + s.score * (weights[s.source] ?? 0.1),
      0,
    );
    const totalWeight = group.scores.reduce(
      (sum, s) => sum + (weights[s.source] ?? 0.1),
      0,
    );

    const examples = group.scores
      .filter((s) => {
        const link =
          (s.metadata['link'] as string) ??
          (s.metadata['url'] as string) ??
          '';
        return link.length > 0;
      })
      .slice(0, 3)
      .map((s) => ({
        source: s.source,
        link:
          (s.metadata['link'] as string) ??
          (s.metadata['url'] as string) ??
          '',
      }));

    return {
      topic: group.canonical,
      score: totalWeight > 0 ? weightedSum / totalWeight : 0,
      sources,
      examples,
    };
  });

  // Sort by score descending and return top N
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, config.topN);
}
