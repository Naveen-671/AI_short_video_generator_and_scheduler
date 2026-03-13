export interface ChannelPerformance {
  channel: string;
  avgEngagement: number;
  avgWatchTime: number;
  videoCount: number;
}

export interface TopicPerformance {
  topic: string;
  avgEngagement: number;
  videoCount: number;
}

export interface Strategy {
  bestChannel: string;
  topTopics: string[];
  recommendedFrequency: number;
  channelPerformance: ChannelPerformance[];
  topicPerformance: TopicPerformance[];
  updatedAt: string;
}

export interface OptimizerOptions {
  metricsDir?: string;
  topicsDir?: string;
  scriptsDir?: string;
}
