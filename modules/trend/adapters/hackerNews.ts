import type { TrendAdapter, SourceScore } from '../types.js';
import { getCached, setCache } from '../cache.js';
import { withRetry } from '../../retry.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('trend-hackernews');
const CACHE_MODULE = 'trend-hackernews';
const HN_ALGOLIA_API = 'https://hn.algolia.com/api/v1';

interface HNHit {
  objectID: string;
  title: string;
  url?: string;
  points: number;
  num_comments: number;
  created_at: string;
}

interface HNSearchResponse {
  hits: HNHit[];
}

export const hackerNewsAdapter: TrendAdapter = {
  name: 'hackernews',

  async fetch(hoursWindow: number): Promise<SourceScore[]> {
    const cacheKey = `hn-${hoursWindow}h`;
    const cached = getCached<SourceScore[]>(CACHE_MODULE, cacheKey);
    if (cached) {
      logger.info(`Using cached HN results (${cached.length} items)`);
      return cached;
    }

    const since = Math.floor(Date.now() / 1000) - hoursWindow * 3600;
    const url = `${HN_ALGOLIA_API}/search?tags=story&numericFilters=created_at_i>${since}&hitsPerPage=50`;

    logger.info(`Fetching HN stories since ${new Date(since * 1000).toISOString()}`);

    const data = await withRetry(
      async () => {
        const start = Date.now();
        const resp = await fetch(url);
        const latency = Date.now() - start;
        logger.info(`HN API responded ${resp.status} in ${latency}ms`);
        if (!resp.ok) throw new Error(`HN API ${resp.status}: ${resp.statusText}`);
        return (await resp.json()) as HNSearchResponse;
      },
      { label: 'HN Algolia search' },
    );

    // Normalize: max points in batch used for normalization
    const maxPoints = Math.max(...data.hits.map((h) => h.points || 1), 1);
    const maxComments = Math.max(...data.hits.map((h) => h.num_comments || 1), 1);

    const scores: SourceScore[] = data.hits.map((hit) => ({
      topic: hit.title,
      source: 'hackernews',
      score: Math.min(
        1,
        (((hit.points || 0) / maxPoints) * 0.6 + ((hit.num_comments || 0) / maxComments) * 0.4),
      ),
      metadata: {
        hn_item_id: parseInt(hit.objectID, 10),
        points: hit.points,
        num_comments: hit.num_comments,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      },
    }));

    setCache(CACHE_MODULE, cacheKey, scores, 6);
    logger.info(`HN adapter returned ${scores.length} items`);
    return scores;
  },
};
