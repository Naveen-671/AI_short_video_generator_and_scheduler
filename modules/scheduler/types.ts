export interface SchedulerConfig {
  intervalHours: number;
  channels: string[];
  pipeline: {
    trends: boolean;
    topics: boolean;
    scripts: boolean;
    voice: boolean;
    video: boolean;
    captions: boolean;
    upload: boolean;
  };
  defaults: {
    variants: number;
    lengths: number[];
    concurrency: number;
  };
}

export interface PipelineRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  steps: PipelineStepResult[];
  status: 'success' | 'partial' | 'failed';
}

export interface PipelineStepResult {
  step: string;
  status: 'success' | 'skipped' | 'failed';
  artifactPath?: string;
  error?: string;
  durationMs: number;
}
