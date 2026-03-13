export interface RenderOptions {
  template?: string;
  watermark?: string;
  concurrency?: number;
  dryRun?: boolean;
  keepTemp?: boolean;
}

export interface VideoManifestItem {
  scriptId: string;
  videoPath: string;
  thumbnailPath: string;
  srtPath: string;
  durationSec: number;
  templateUsed: string;
  resolution: string;
  codec: string;
  createdAt: string;
}

export interface VideoManifest {
  runId: string;
  items: VideoManifestItem[];
}

export interface TemplateConfig {
  name: string;
  description: string;
  channels: string[];
  bgColor: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  accentColor: string;
  overlayStyle: string;
}
