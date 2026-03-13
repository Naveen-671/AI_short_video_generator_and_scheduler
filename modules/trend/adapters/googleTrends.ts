import { execFile } from 'node:child_process';
import type { TrendAdapter, SourceScore } from '../types.js';
import { getCached, setCache } from '../cache.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('trend-google');
const CACHE_MODULE = 'trend-google';

interface PyTrendsResult {
  keyword: string;
  interest: number;
  region: string;
}

/**
 * Calls a lightweight Python script that uses pytrends to fetch
 * Google Trends data. Falls back gracefully if python or pytrends
 * is unavailable.
 */
function runPyTrends(keywords: string[]): Promise<PyTrendsResult[]> {
  return new Promise((resolve, reject) => {
    const script = `
import json, sys
try:
    from pytrends.request import TrendReq
    pytrends = TrendReq(hl='en-US', tz=360)
    kw_list = json.loads(sys.argv[1])
    # Take max 5 at a time (pytrends limit)
    batches = [kw_list[i:i+5] for i in range(0, len(kw_list), 5)]
    results = []
    for batch in batches:
        pytrends.build_payload(batch, timeframe='now 7-d')
        df = pytrends.interest_over_time()
        if df.empty:
            continue
        for kw in batch:
            if kw in df.columns:
                interest = int(df[kw].mean())
                results.append({"keyword": kw, "interest": interest, "region": "global"})
    print(json.dumps(results))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

    execFile(
      'python',
      ['-c', script, JSON.stringify(keywords)],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) {
          logger.warn(`pytrends subprocess failed: ${stderr || err.message}`);
          reject(new Error(`pytrends failed: ${err.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as PyTrendsResult[];
          resolve(parsed);
        } catch {
          reject(new Error(`Failed to parse pytrends output: ${stdout}`));
        }
      },
    );
  });
}

const DEFAULT_KEYWORDS = [
  'AI release', 'GPT', 'LLM benchmark', 'open source AI',
  'machine learning', 'neural network', 'tech startup',
];

export const googleTrendsAdapter: TrendAdapter = {
  name: 'google_trends',

  async fetch(_hoursWindow: number): Promise<SourceScore[]> {
    const cacheKey = 'google-trends-latest';
    const cached = getCached<SourceScore[]>(CACHE_MODULE, cacheKey);
    if (cached) {
      logger.info(`Using cached Google Trends results (${cached.length} items)`);
      return cached;
    }

    try {
      const results = await runPyTrends(DEFAULT_KEYWORDS);
      const maxInterest = Math.max(...results.map((r) => r.interest || 1), 1);

      const scores: SourceScore[] = results.map((r) => ({
        topic: r.keyword,
        source: 'google_trends',
        score: Math.min(1, (r.interest || 0) / maxInterest),
        metadata: { query: r.keyword, region: r.region, interest: r.interest },
      }));

      setCache(CACHE_MODULE, cacheKey, scores, 6);
      logger.info(`Google Trends adapter returned ${scores.length} items`);
      return scores;
    } catch (err) {
      logger.warn(
        `Google Trends adapter failed (pytrends may not be installed), returning empty: ${(err as Error).message}`,
      );
      return [];
    }
  },
};
