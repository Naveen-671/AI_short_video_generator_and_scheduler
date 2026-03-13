import type { TrendAdapter, SourceScore } from '../types.js';
import { getCached, setCache } from '../cache.js';
import { withRetry } from '../../retry.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('trend-rss');
const CACHE_MODULE = 'trend-rss';

/**
 * Minimal RSS/Atom XML parser — extracts titles and links from <item> or <entry>.
 * We avoid heavy dependencies by parsing with regex for this minimal use case.
 */
function parseRssItems(xml: string): Array<{ title: string; link: string }> {
  const items: Array<{ title: string; link: string }> = [];

  // Match RSS <item> blocks
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  // Match Atom <entry> blocks
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;

  const blocks = [...xml.matchAll(itemRegex), ...xml.matchAll(entryRegex)];

  for (const match of blocks) {
    const block = match[1] ?? '';
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link[^>]*href="([^"]+)"/i) ||
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);

    const title = (titleMatch?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = (linkMatch?.[1] ?? '').trim();

    if (title) {
      items.push({ title, link });
    }
  }

  return items;
}

export function createRssAdapter(feeds: string[]): TrendAdapter {
  return {
    name: 'rss',

    async fetch(_hoursWindow: number): Promise<SourceScore[]> {
      const cacheKey = 'rss-latest';
      const cached = getCached<SourceScore[]>(CACHE_MODULE, cacheKey);
      if (cached) {
        logger.info(`Using cached RSS results (${cached.length} items)`);
        return cached;
      }

      const allItems: Array<{ title: string; link: string; feed: string }> = [];

      for (const feedUrl of feeds) {
        try {
          const xml = await withRetry(
            async () => {
              const start = Date.now();
              const resp = await fetch(feedUrl, {
                headers: { 'User-Agent': 'AutoShorts/0.1 (trend detection)' },
              });
              const latency = Date.now() - start;
              logger.info(`RSS ${feedUrl} responded ${resp.status} in ${latency}ms`);
              if (!resp.ok) throw new Error(`RSS ${resp.status}: ${resp.statusText}`);
              return resp.text();
            },
            { label: `RSS ${feedUrl}` },
          );

          const items = parseRssItems(xml);
          for (const item of items) {
            allItems.push({ ...item, feed: feedUrl });
          }
        } catch (err) {
          logger.error(
            `RSS feed ${feedUrl} failed, skipping`,
            err instanceof Error ? err : new Error(String(err)),
          );
        }

        // Rate limit between feeds
        await new Promise((r) => setTimeout(r, 500));
      }

      // Score: position-based (earlier = higher score in feed)
      const total = allItems.length || 1;
      const scores: SourceScore[] = allItems.map((item, i) => ({
        topic: item.title,
        source: 'rss',
        score: Math.max(0.1, 1 - i / total),
        metadata: { feed: item.feed, link: item.link },
      }));

      setCache(CACHE_MODULE, cacheKey, scores, 6);
      logger.info(`RSS adapter returned ${scores.length} items`);
      return scores;
    },
  };
}
