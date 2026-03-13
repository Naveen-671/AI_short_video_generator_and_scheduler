export interface ScriptOutline {
  hook: string;
  seg1: string;
  seg2: string;
  cta: string;
}

export interface VisualHints {
  character?: string;
  overlay?: string;
  bgMusic?: string;
  style?: string;
}

export interface VideoIdea {
  ideaId: string;
  channel: string;
  topic: string;
  title: string;
  priority: number;
  brief: string;
  scriptOutline: ScriptOutline;
  visualHints: VisualHints;
  hashtags: string[];
  estimatedLengthSec: number;
  duplicateOf?: string;
}

export interface ChannelConfig {
  style: string;
  keywords: string[];
  defaultLengthSec: number;
  character: string | null;
  bgMusic: string;
}

export interface ChannelsConfig {
  channels: Record<string, ChannelConfig>;
  variantsPerTopic: number;
  maxIdeasPerRun: number;
}
