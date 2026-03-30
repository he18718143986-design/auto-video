import { describe, it, expect } from 'vitest';
import { nowIso, createRunId, sleep } from './time.js';

describe('nowIso', () => {
  it('returns an ISO-8601 string', () => {
    const result = nowIso();
    expect(() => new Date(result)).not.toThrow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('createRunId', () => {
  it('produces a run_ prefixed id from the current date', () => {
    const id = createRunId();
    expect(id).toMatch(/^run_\d{14}$/);
  });

  it('uses a supplied date deterministically', () => {
    const date = new Date('2025-06-15T10:30:45.123Z');
    expect(createRunId(date)).toBe('run_20250615103045');
  });

  it('returns different ids for different dates', () => {
    const a = createRunId(new Date('2025-01-01T00:00:00Z'));
    const b = createRunId(new Date('2025-12-31T23:59:59Z'));
    expect(a).not.toBe(b);
  });
});

describe('sleep', () => {
  it('resolves after the given duration', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
