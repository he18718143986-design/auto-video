import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  createRunContext,
  markStage,
  pauseRun,
  resumeRun,
  setArtifact,
  finalizeRun,
  setHandoffState,
} from './runStore.js';
import type { RunContext, HandoffState } from './types.js';

const TEST_BASE_DIR = path.join(process.cwd(), '.test-runs');

beforeEach(async () => {
  await fs.mkdir(TEST_BASE_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
});

async function readManifestFromDisk(ctx: RunContext) {
  const raw = await fs.readFile(ctx.manifestPath, 'utf8');
  return JSON.parse(raw);
}

describe('createRunContext', () => {
  it('creates a run directory with run.json', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 'test topic',
      provider: 'mock-provider',
      runId: 'test-run-001',
    });

    expect(ctx.manifest.id).toBe('test-run-001');
    expect(ctx.manifest.status).toBe('running');
    expect(ctx.manifest.topic).toBe('test topic');
    expect(ctx.manifest.currentStage).toBeNull();
    expect(ctx.manifest.history).toEqual([]);

    const onDisk = await readManifestFromDisk(ctx);
    expect(onDisk.id).toBe('test-run-001');
  });

  it('generates a run id when none is provided', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 'auto id',
      provider: 'mock',
    });

    expect(ctx.manifest.id).toMatch(/^run_\d{14}$/);
  });
});

describe('markStage', () => {
  it('records stage start in history', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'mark-test',
    });

    await markStage(ctx, 'session_preparation', 'started', 'Checking session');

    expect(ctx.manifest.currentStage).toBe('session_preparation');
    expect(ctx.manifest.history).toHaveLength(1);
    expect(ctx.manifest.history[0].status).toBe('started');
  });

  it('transitions to needs_human on needs_human status', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'human-test',
    });

    await markStage(ctx, 'session_preparation', 'needs_human', 'Login required');

    expect(ctx.manifest.status).toBe('needs_human');
    expect(ctx.manifest.requiresHuman).toBe(true);
  });

  it('transitions to failed on failed status', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'fail-test',
    });

    await markStage(ctx, 'research', 'failed', 'Timeout');

    expect(ctx.manifest.status).toBe('failed');
  });

  it('transitions to paused on paused status', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'pause-mark-test',
    });

    await markStage(ctx, 'script', 'paused', 'Operator pause');

    expect(ctx.manifest.status).toBe('paused');
  });

  it('transitions back to running on resumed status', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'resume-mark-test',
    });

    await markStage(ctx, 'script', 'paused', 'Paused');
    await markStage(ctx, 'script', 'resumed', 'Resumed');

    expect(ctx.manifest.status).toBe('running');
    expect(ctx.manifest.requiresHuman).toBe(false);
  });

  it('persists history to disk', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'disk-test',
    });

    await markStage(ctx, 'research', 'started', 'start');
    await markStage(ctx, 'research', 'completed', 'done');

    const onDisk = await readManifestFromDisk(ctx);
    expect(onDisk.history).toHaveLength(2);
    expect(onDisk.history[1].status).toBe('completed');
  });
});

describe('pauseRun / resumeRun', () => {
  it('pauses and resumes correctly', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'pause-resume-test',
    });

    await pauseRun(ctx, 'qa');
    expect(ctx.manifest.status).toBe('paused');

    await resumeRun(ctx, 'qa');
    expect(ctx.manifest.status).toBe('running');
  });
});

describe('setArtifact', () => {
  it('sets an artifact path on the manifest', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'artifact-test',
    });

    await setArtifact(ctx, 'research', 'outputs/research.json');

    expect(ctx.manifest.artifacts.research).toBe('outputs/research.json');
    const onDisk = await readManifestFromDisk(ctx);
    expect(onDisk.artifacts.research).toBe('outputs/research.json');
  });
});

describe('finalizeRun', () => {
  it('sets final run status', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'finalize-test',
    });

    await finalizeRun(ctx, 'completed');

    expect(ctx.manifest.status).toBe('completed');
    const onDisk = await readManifestFromDisk(ctx);
    expect(onDisk.status).toBe('completed');
  });
});

describe('setHandoffState', () => {
  it('updates handoff state on the manifest', async () => {
    const ctx = await createRunContext(TEST_BASE_DIR, {
      topic: 't',
      provider: 'p',
      runId: 'handoff-test',
    });

    const handoff: HandoffState = {
      confirmationNote: 'Please login first',
      checklist: [
        { id: 'step_1', text: 'Login', done: true },
        { id: 'step_2', text: 'Verify CAPTCHA', done: false },
      ],
      updatedAt: new Date().toISOString(),
    };

    await setHandoffState(ctx, handoff);

    expect(ctx.manifest.handoff.confirmationNote).toBe('Please login first');
    expect(ctx.manifest.handoff.checklist).toHaveLength(2);
    expect(ctx.manifest.handoff.checklist[0].done).toBe(true);
  });
});
