export interface SourceScore {
  topic: string;
  source: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface MergedTopic {
  topic: string;
  score: number;
  sources: string[];
  examples: { source: string; link: string }[];
}

export interface TrendRunResult {
  runId: string;
  sourceScores: SourceScore[];
  mergedTopics: MergedTopic[];
}

export interface TrendSourceConfig {
  sources: {
    hackerNews: { enabled: boolean; weight: number };
    reddit: { enabled: boolean; weight: number };
    googleTrends: { enabled: boolean; weight: number };
    rss: { enabled: boolean; weight: number };
  };
  topN: number;
  defaultHoursWindow: number;
  relevanceKeywords: string[];
  blacklistKeywords: string[];
  rssFeeds: string[];
  cache: { ttlHours: number };
}

export interface TrendAdapter {
  name: string;
  fetch(hoursWindow: number): Promise<SourceScore[]>;
}
