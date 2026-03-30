import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { countTodayRuns, listRuns } from './runs.js';
import { createRunContext, finalizeRun } from './runStore.js';
import { writeJson } from '../utils/fs.js';

const RUNS_DIR = path.join(process.cwd(), 'runs');

async function cleanTestRuns(ids: string[]) {
  for (const id of ids) {
    await fs.rm(path.join(RUNS_DIR, id), { recursive: true, force: true });
  }
}

describe('countTodayRuns', () => {
  const testRunIds = [
    '_test_quota_1',
    '_test_quota_2',
    '_test_quota_3',
    '_test_quota_4',
    '_test_quota_5',
  ];

  beforeEach(async () => {
    await fs.mkdir(RUNS_DIR, { recursive: true });
    await cleanTestRuns(testRunIds);
  });

  afterEach(async () => {
    await cleanTestRuns(testRunIds);
  });

  it('counts completed runs created today', async () => {
    const ctx = await createRunContext(RUNS_DIR, {
      topic: 'test',
      provider: 'mock',
      runId: '_test_quota_1',
    });
    await finalizeRun(ctx, 'completed');

    const count = await countTodayRuns();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('counts running runs created today', async () => {
    await createRunContext(RUNS_DIR, {
      topic: 'test',
      provider: 'mock',
      runId: '_test_quota_2',
    });

    const count = await countTodayRuns();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('does not count failed runs', async () => {
    const ctx = await createRunContext(RUNS_DIR, {
      topic: 'test',
      provider: 'mock',
      runId: '_test_quota_3',
    });

    // Before finalizing as failed, this running run should be counted
    const countBefore = await countTodayRuns();

    await finalizeRun(ctx, 'failed');

    // After finalizing as failed, the count should decrease by 1
    const countAfter = await countTodayRuns();
    expect(countAfter).toBe(countBefore - 1);
  });

  it('does not count runs from yesterday', async () => {
    const ctx = await createRunContext(RUNS_DIR, {
      topic: 'test',
      provider: 'mock',
      runId: '_test_quota_4',
    });

    // Count before backdating
    const countBefore = await countTodayRuns();

    // Backdate the run to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    ctx.manifest.createdAt = yesterday.toISOString();
    await writeJson(ctx.manifestPath, ctx.manifest);

    // Count after backdating — should decrease by 1
    const countAfter = await countTodayRuns();
    expect(countAfter).toBe(countBefore - 1);
  });

  it('lists test runs correctly', async () => {
    await createRunContext(RUNS_DIR, {
      topic: 'first',
      provider: 'mock',
      runId: '_test_quota_5',
    });

    const runs = await listRuns();
    const testRun = runs.find((m) => m.id === '_test_quota_5');
    expect(testRun).toBeDefined();
    expect(testRun!.topic).toBe('first');
  });
});
