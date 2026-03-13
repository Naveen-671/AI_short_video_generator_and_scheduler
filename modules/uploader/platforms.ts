import * as crypto from 'node:crypto';
import { createLogger } from '../logger.js';
import type { PlatformUploader, PlatformName, UploadMetadata } from './types.js';

const logger = createLogger('uploader');

/**
 * Mock YouTube uploader for testing.
 * In production would use YouTube Data API v3.
 */
export class YouTubeUploader implements PlatformUploader {
  name = 'youtube' as const;

  isConfigured(): boolean {
    // Would check for YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
    return false;
  }

  async upload(
    _videoPath: string,
    metadata: UploadMetadata,
  ): Promise<{ videoId: string }> {
    logger.info(`YouTube upload: ${metadata.title}`);
    // Mock: return a fake video ID
    const videoId = 'yt-' + crypto.randomBytes(6).toString('hex');
    return { videoId };
  }
}

/**
 * Mock Instagram uploader for testing.
 * In production would use Instagram Graph API.
 */
export class InstagramUploader implements PlatformUploader {
  name = 'instagram' as const;

  isConfigured(): boolean {
    // Would check for IG_BUSINESS_ACCOUNT_ID, FB_PAGE_ACCESS_TOKEN
    return false;
  }

  async upload(
    _videoPath: string,
    metadata: UploadMetadata,
  ): Promise<{ videoId: string }> {
    logger.info(`Instagram upload: ${metadata.title}`);
    const videoId = 'ig-' + crypto.randomBytes(6).toString('hex');
    return { videoId };
  }
}

/**
 * Mock uploader that always succeeds (for testing without API keys).
 */
export class MockUploader implements PlatformUploader {
  name: PlatformName;

  constructor(private platformName: PlatformName = 'youtube') {
    this.name = platformName;
  }

  isConfigured(): boolean {
    return true;
  }

  async upload(
    _videoPath: string,
    metadata: UploadMetadata,
  ): Promise<{ videoId: string }> {
    logger.info(`Mock ${this.name} upload: ${metadata.title}`);
    const videoId = `mock-${this.name}-` + crypto.randomBytes(4).toString('hex');
    return { videoId };
  }
}

/**
 * Get platform uploaders. Uses mock uploaders when real APIs are not configured.
 */
export function getPlatformUploaders(): PlatformUploader[] {
  const yt = new YouTubeUploader();
  const ig = new InstagramUploader();

  const uploaders: PlatformUploader[] = [];

  if (yt.isConfigured()) {
    uploaders.push(yt);
  } else {
    uploaders.push(new MockUploader('youtube'));
  }

  if (ig.isConfigured()) {
    uploaders.push(ig);
  } else {
    uploaders.push(new MockUploader('instagram'));
  }

  return uploaders;
}
