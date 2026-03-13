import { describe, it, expect } from 'vitest';
import { getCached, setCache } from '../modules/trend/cache.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TEST_MODULE = 'test-cache';
const CACHE_DIR = process.env['CACHE_DIR'] || './data/cache';

describe('Trend cache', () => {
  afterEach(() => {
    // Cleanup test cache
    const testDir = path.join(CACHE_DIR, TEST_MODULE);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('stores and retrieves cached data', () => {
    const data = { foo: 'bar', count: 42 };
    setCache(TEST_MODULE, 'test-key', data, 1);

    const retrieved = getCached<typeof data>(TEST_MODULE, 'test-key');
    expect(retrieved).toEqual(data);
  });

  it('returns undefined for expired cache', () => {
    setCache(TEST_MODULE, 'expired-key', { x: 1 }, 0); // 0 hours = already expired

    const result = getCached(TEST_MODULE, 'expired-key');
    expect(result).toBeUndefined();
  });

  it('returns undefined for non-existent cache', () => {
    const result = getCached(TEST_MODULE, 'nonexistent');
    expect(result).toBeUndefined();
  });
});
