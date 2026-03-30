import { describe, it, expect } from 'vitest';
import { RunControl } from './runControl.js';

describe('RunControl', () => {
  it('starts in unpaused state', () => {
    const ctrl = new RunControl();
    expect(ctrl.isPaused()).toBe(false);
  });

  it('can pause', () => {
    const ctrl = new RunControl();
    ctrl.pause();
    expect(ctrl.isPaused()).toBe(true);
  });

  it('resume unblocks waiters', async () => {
    const ctrl = new RunControl();
    ctrl.pause();

    let resolved = false;
    const waiter = ctrl.waitWhilePaused().then(() => {
      resolved = true;
    });

    // not yet resolved
    await Promise.resolve();
    expect(resolved).toBe(false);

    ctrl.resume();
    await waiter;
    expect(resolved).toBe(true);
    expect(ctrl.isPaused()).toBe(false);
  });

  it('resume is a no-op when not paused', () => {
    const ctrl = new RunControl();
    ctrl.resume(); // should not throw
    expect(ctrl.isPaused()).toBe(false);
  });

  it('waitWhilePaused resolves immediately when not paused', async () => {
    const ctrl = new RunControl();
    await ctrl.waitWhilePaused(); // should resolve instantly
  });
});
