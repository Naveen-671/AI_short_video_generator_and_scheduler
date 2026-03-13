import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeMkdir } from '../fsutils.js';

const CACHE_DIR = process.env['CACHE_DIR'] || './data/cache';

interface CacheEntry<T> {
  data: T;
  expiresAt: string;
}

function getCachePath(module: string, key: string): string {
  return path.join(CACHE_DIR, module, `${key}.json`);
}

export function getCached<T>(module: string, key: string): T | undefined {
  const cachePath = getCachePath(module, key);
  if (!fs.existsSync(cachePath)) return undefined;

  const raw = fs.readFileSync(cachePath, 'utf-8');
  const entry = JSON.parse(raw) as CacheEntry<T>;

  if (new Date(entry.expiresAt) < new Date()) {
    // Expired — remove
    fs.unlinkSync(cachePath);
    return undefined;
  }

  return entry.data;
}

export function setCache<T>(module: string, key: string, data: T, ttlHours: number): void {
  const cachePath = getCachePath(module, key);
  safeMkdir(path.dirname(cachePath));

  const entry: CacheEntry<T> = {
    data,
    expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
  };

  fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
}
