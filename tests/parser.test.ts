import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { run } from '../cli/index.js';

const FIXTURE_PATH = path.resolve('tests/fixtures/simple-sample');
const OUTPUT_PATH = path.resolve('data/results/scan-simple-sample.json');

describe('CLI scanner', () => {
  beforeAll(() => {
    // Clean up any previous output
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.unlinkSync(OUTPUT_PATH);
    }
  });

  afterAll(() => {
    // Clean up
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.unlinkSync(OUTPUT_PATH);
    }
  });

  it('should scan simple-sample and produce JSON with 3 files', () => {
    const result = run(FIXTURE_PATH, true);

    expect(result).toBeDefined();
    expect(result.files).toHaveLength(3);
    expect(result.files).toContain('src/app.js');
    expect(result.files).toContain('src/api.js');
    expect(result.files).toContain('src/service.js');
    expect(result.scannedAt).toBeTruthy();

    // Verify file was written
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true);
    const written = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    expect(written.files).toHaveLength(3);
  });

  it('should skip re-scan when artifact exists and --force is not set', () => {
    // First run creates the artifact
    run(FIXTURE_PATH, true);
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true);

    // Second run without force should return existing result
    const result = run(FIXTURE_PATH, false);
    expect(result).toBeDefined();
    expect(result.files).toHaveLength(3);
  });
});
