import type { Account, ProviderId } from './types.js';

let counter = 0;

function uid(): string {
  return `acc_${Date.now()}_${++counter}`;
}

/**
 * Manages browser-profile accounts and round-robin rotation.
 *
 * When an account's free quota is exhausted the manager marks it and
 * picks the next available account for the same (or fallback) provider.
 */
export class AccountManager {
  private accounts: Account[] = [];

  all(): Account[] {
    return [...this.accounts];
  }

  /** Register a new account. */
  addAccount(provider: ProviderId, label: string, profileDir: string): Account {
    const account: Account = {
      id: uid(),
      provider,
      label,
      profileDir,
      quotaExhausted: false,
    };
    this.accounts.push(account);
    return account;
  }

  /** Remove an account by id. */
  removeAccount(accountId: string): boolean {
    const idx = this.accounts.findIndex((a) => a.id === accountId);
    if (idx === -1) return false;
    this.accounts.splice(idx, 1);
    return true;
  }

  /** Get an account by id. */
  get(accountId: string): Account | undefined {
    return this.accounts.find((a) => a.id === accountId);
  }

  /**
   * Pick the best available account.
   *
   * Strategy:
   * 1. Prefer `preferredProvider` if specified and has available account.
   * 2. Fall back to any provider with available quota.
   * 3. Return undefined if all accounts exhausted.
   */
  pickAccount(preferredProvider?: ProviderId): Account | undefined {
    const available = this.accounts.filter((a) => !a.quotaExhausted);
    if (available.length === 0) return undefined;

    if (preferredProvider) {
      const preferred = available.find((a) => a.provider === preferredProvider);
      if (preferred) return preferred;
    }

    // Round-robin: return the first available
    return available[0];
  }

  /** Mark an account as quota-exhausted. */
  markQuotaExhausted(accountId: string): void {
    const account = this.get(accountId);
    if (!account) return;
    account.quotaExhausted = true;
    account.quotaResetAt = undefined;
  }

  /** Reset quota for an account (e.g. after cooldown). */
  resetQuota(accountId: string): void {
    const account = this.get(accountId);
    if (!account) return;
    account.quotaExhausted = false;
    account.quotaResetAt = new Date().toISOString();
  }

  /** Reset quota on all accounts. */
  resetAllQuotas(): void {
    for (const a of this.accounts) {
      a.quotaExhausted = false;
      a.quotaResetAt = new Date().toISOString();
    }
  }

  /** How many accounts still have quota remaining. */
  availableCount(): number {
    return this.accounts.filter((a) => !a.quotaExhausted).length;
  }
}
