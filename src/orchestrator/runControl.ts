import type { RunControl as RunControlContract } from './types.js';

export class RunControl implements RunControlContract {
  private paused = false;
  private waiters: Array<() => void> = [];

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const pending = this.waiters.slice();
    this.waiters = [];
    pending.forEach((resolve) => resolve());
  }

  async waitWhilePaused(): Promise<void> {
    while (this.paused) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }
}
