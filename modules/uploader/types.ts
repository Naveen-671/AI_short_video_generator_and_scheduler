export type PlatformName = 'youtube' | 'instagram';

export interface UploadRecord {
  platform: PlatformName;
  videoId: string;
  scriptId: string;
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  captionPath: string | null;
  uploadedAt: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface UploadManifest {
  runId: string;
  uploads: UploadRecord[];
}

export interface UploadOptions {
  platforms?: PlatformName[];
  dryRun?: boolean;
}

export interface PlatformUploader {
  name: PlatformName;
  isConfigured(): boolean;
  upload(
    videoPath: string,
    metadata: UploadMetadata,
  ): Promise<{ videoId: string }>;
}

export interface UploadMetadata {
  title: string;
  description: string;
  tags: string[];
  captionPath: string | null;
  durationSec: number;
}
