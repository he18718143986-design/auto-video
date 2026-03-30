import { chromium, type BrowserContext, type Page } from 'playwright';
import { TaskQueue } from './taskQueue.js';
import { AccountManager } from './accountManager.js';
import { DEFAULT_PROVIDERS } from './providers.js';
import { openChat, sendPrompt, checkQuotaExhausted } from './chatAutomation.js';
import type { Account, WorkbenchEvent, WorkbenchState, ProviderSelectors, ProviderId } from './types.js';

export type EventListener = (event: WorkbenchEvent) => void;

/**
 * The core automation engine.
 *
 * Coordinates the task queue, account manager, and Playwright sessions
 * to process batch questions through free-tier AI chat websites.
 */
export class Workbench {
  readonly tasks = new TaskQueue();
  readonly accounts = new AccountManager();

  /** Custom selector overrides keyed by provider id. */
  private selectorOverrides: Partial<Record<ProviderId, Partial<ProviderSelectors>>> = {};

  private running = false;
  private abortController: AbortController | null = null;

  private activeContext: BrowserContext | null = null;
  private activePage: Page | null = null;
  private activeAccountId: string | null = null;

  private listeners: EventListener[] = [];

  /* -------------------------------------------------------------- */
  /*  Event helpers                                                  */
  /* -------------------------------------------------------------- */

  onEvent(fn: EventListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(event: WorkbenchEvent): void {
    for (const fn of this.listeners) fn(event);
  }

  private emitState(): void {
    this.emit({ type: 'state', payload: this.getState() });
  }

  /* -------------------------------------------------------------- */
  /*  State                                                         */
  /* -------------------------------------------------------------- */

  getState(): WorkbenchState {
    return {
      accounts: this.accounts.all(),
      tasks: this.tasks.all(),
      isRunning: this.running,
      currentTaskId: this.tasks.all().find((t) => t.status === 'running')?.id,
      activeAccountId: this.activeAccountId ?? undefined,
    };
  }

  /* -------------------------------------------------------------- */
  /*  Selector overrides                                            */
  /* -------------------------------------------------------------- */

  setProviderSelectors(provider: ProviderId, overrides: Partial<ProviderSelectors>): void {
    this.selectorOverrides[provider] = overrides;
  }

  getSelectors(provider: ProviderId): ProviderSelectors {
    return { ...DEFAULT_PROVIDERS[provider], ...this.selectorOverrides[provider] };
  }

  /* -------------------------------------------------------------- */
  /*  Browser lifecycle                                             */
  /* -------------------------------------------------------------- */

  private async ensureBrowser(account: Account): Promise<Page> {
    // If we're already using this account, reuse context
    if (this.activeAccountId === account.id && this.activePage && this.activeContext) {
      return this.activePage;
    }

    // Close previous context if switching accounts
    await this.closeBrowser();

    const selectors = this.getSelectors(account.provider);
    const context = await chromium.launchPersistentContext(account.profileDir, {
      headless: false,
      viewport: { width: 1440, height: 900 },
    });

    const page = await openChat(context, selectors);
    this.activeContext = context;
    this.activePage = page;
    this.activeAccountId = account.id;
    return page;
  }

  private async closeBrowser(): Promise<void> {
    if (this.activeContext) {
      await this.activeContext.close().catch(() => {});
      this.activeContext = null;
      this.activePage = null;
      this.activeAccountId = null;
    }
  }

  /* -------------------------------------------------------------- */
  /*  Main loop                                                     */
  /* -------------------------------------------------------------- */

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    this.emitState();

    try {
      await this.processLoop();
    } finally {
      this.running = false;
      await this.closeBrowser();
      this.emit({ type: 'stopped', payload: {} });
      this.emitState();
    }
  }

  stop(): void {
    this.abortController?.abort();
  }

  private async processLoop(): Promise<void> {
    while (!this.abortController?.signal.aborted) {
      const task = this.tasks.next();
      if (!task) break; // No more pending tasks

      const account = this.accounts.pickAccount(task.preferredProvider);
      if (!account) {
        this.tasks.markFailed(task.id, 'No accounts available with remaining quota');
        this.emit({ type: 'task_failed', payload: { taskId: task.id, error: 'No accounts available' } });
        this.emitState();
        break;
      }

      this.tasks.markRunning(task.id, account.id);
      this.emit({ type: 'task_started', payload: { taskId: task.id, accountId: account.id } });
      this.emitState();

      try {
        const page = await this.ensureBrowser(account);

        // Check quota before sending
        const selectors = this.getSelectors(account.provider);
        if (await checkQuotaExhausted(page, selectors)) {
          await this.handleQuotaExhausted(account, task.id);
          continue; // retry with new account
        }

        const result = await sendPrompt(page, task.question, selectors);

        if (result.quotaExhausted) {
          // Save partial answer if any, then switch account
          if (result.answer) {
            this.tasks.markDone(task.id, result.answer);
            this.emit({ type: 'task_done', payload: { taskId: task.id, answer: result.answer } });
          } else {
            this.tasks.markFailed(task.id, 'Quota exhausted before response');
            this.emit({ type: 'task_failed', payload: { taskId: task.id, error: 'Quota exhausted' } });
          }
          await this.handleQuotaExhausted(account, task.id);
        } else {
          this.tasks.markDone(task.id, result.answer);
          this.emit({ type: 'task_done', payload: { taskId: task.id, answer: result.answer } });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.tasks.markFailed(task.id, message);
        this.emit({ type: 'task_failed', payload: { taskId: task.id, error: message } });
      }

      this.emitState();
    }
  }

  private async handleQuotaExhausted(account: Account, _taskId: string): Promise<void> {
    this.accounts.markQuotaExhausted(account.id);
    this.emit({ type: 'quota_exhausted', payload: { accountId: account.id } });

    // Try to switch to another account
    const next = this.accounts.pickAccount();
    if (next) {
      this.emit({
        type: 'account_switched',
        payload: { fromAccountId: account.id, toAccountId: next.id },
      });
      await this.closeBrowser();
    }
    this.emitState();
  }
}
