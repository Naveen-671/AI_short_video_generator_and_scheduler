import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runPipeline } from '../modules/scheduler/pipeline.js';
import type { PipelineRunResult } from '../modules/scheduler/types.js';

const RUNS_DIR = path.resolve('data/runs');
const LOCK_PATH = path.resolve('data/locks/pipeline.lock');

afterAll(() => {
  // Clean up lock file if left behind
  if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
});

describe('Pipeline scheduler', () => {
  it('executes the full pipeline and creates run artifact', async () => {
    const result: PipelineRunResult = await runPipeline();

    expect(result.runId).toBeTruthy();
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(['success', 'partial', 'failed']).toContain(result.status);

    // Verify run artifact was saved
    const runFile = path.join(RUNS_DIR, `${result.runId}.json`);
    expect(fs.existsSync(runFile)).toBe(true);

    // Verify each step has expected shape
    for (const step of result.steps) {
      expect(step.step).toBeTruthy();
      expect(['success', 'skipped', 'failed']).toContain(step.status);
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);

  it('releases lock after pipeline completes', async () => {
    await runPipeline();
    expect(fs.existsSync(LOCK_PATH)).toBe(false);
  }, 30_000);

  it('records step durations', async () => {
    const result = await runPipeline();

    const totalDuration = result.steps.reduce((sum, s) => sum + s.durationMs, 0);
    expect(totalDuration).toBeGreaterThan(0);

    // Trends step should succeed with offline fixtures
    const trendsStep = result.steps.find((s) => s.step === 'trends');
    expect(trendsStep).toBeTruthy();
    if (trendsStep) {
      expect(trendsStep.status).toBe('success');
    }
  }, 30_000);
});
