import type { TrendAdapter, SourceScore } from '../types.js';
import { getCached, setCache } from '../cache.js';
import { withRetry } from '../../retry.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('trend-reddit');
const CACHE_MODULE = 'trend-reddit';

interface RedditPost {
  data: {
    title: string;
    subreddit: string;
    ups: number;
    num_comments: number;
    permalink: string;
    created_utc: number;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
  };
}

const SUBREDDITS = ['technology', 'programming', 'MachineLearning', 'artificial'];

export const redditAdapter: TrendAdapter = {
  name: 'reddit',

  async fetch(hoursWindow: number): Promise<SourceScore[]> {
    const cacheKey = `reddit-${hoursWindow}h`;
    const cached = getCached<SourceScore[]>(CACHE_MODULE, cacheKey);
    if (cached) {
      logger.info(`Using cached Reddit results (${cached.length} items)`);
      return cached;
    }

    const allScores: SourceScore[] = [];
    const cutoff = Date.now() / 1000 - hoursWindow * 3600;

    for (const sub of SUBREDDITS) {
      try {
        const url = `https://www.reddit.com/r/${sub}/hot.json?limit=25&raw_json=1`;
        logger.info(`Fetching Reddit /r/${sub}`);

        const listing = await withRetry(
          async () => {
            const start = Date.now();
            const resp = await fetch(url, {
              headers: { 'User-Agent': 'AutoShorts/0.1 (trend detection)' },
            });
            const latency = Date.now() - start;
            logger.info(`Reddit /r/${sub} responded ${resp.status} in ${latency}ms`);
            if (!resp.ok) throw new Error(`Reddit ${resp.status}: ${resp.statusText}`);
            return (await resp.json()) as RedditListing;
          },
          { label: `Reddit /r/${sub}` },
        );

        const posts = listing.data.children.filter((p) => p.data.created_utc >= cutoff);

        const maxUps = Math.max(...posts.map((p) => p.data.ups || 1), 1);
        const maxComments = Math.max(...posts.map((p) => p.data.num_comments || 1), 1);

        for (const post of posts) {
          const d = post.data;
          allScores.push({
            topic: d.title,
            source: 'reddit',
            score: Math.min(
              1,
              ((d.ups || 0) / maxUps) * 0.5 + ((d.num_comments || 0) / maxComments) * 0.5,
            ),
            metadata: {
              subreddit: d.subreddit,
              ups: d.ups,
              num_comments: d.num_comments,
              link: `https://reddit.com${d.permalink}`,
            },
          });
        }

        // Rate-limit between subreddits (1 second pause)
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        logger.error(
          `Reddit /r/${sub} failed, continuing with other sources`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    setCache(CACHE_MODULE, cacheKey, allScores, 6);
    logger.info(`Reddit adapter returned ${allScores.length} items`);
    return allScores;
  },
};
