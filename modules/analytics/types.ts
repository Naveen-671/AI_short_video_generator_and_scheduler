export interface VideoMetrics {
  videoId: string;
  platform: string;
  scriptId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime: number;
  engagementScore: number;
  collectedAt: string;
}

export interface MetricsManifest {
  date: string;
  items: VideoMetrics[];
}

export interface MetricsOptions {
  runId?: string;
}
