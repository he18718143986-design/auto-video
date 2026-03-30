/* ------------------------------------------------------------------ */
/*  AI Chat Automation Workbench – shared type definitions             */
/* ------------------------------------------------------------------ */

/** Supported chat provider identifiers. */
export type ProviderId = 'chatgpt' | 'gemini' | 'deepseek' | 'kimi';

/** One login credential for a chat provider. */
export interface Account {
  id: string;
  provider: ProviderId;
  label: string;
  /** Browser user-data directory (persistent cookies / session). */
  profileDir: string;
  /** Whether the account is currently known to have exhausted its quota. */
  quotaExhausted: boolean;
  /** ISO timestamp of last known quota reset, if any. */
  quotaResetAt?: string;
}

/** CSS / aria selectors that describe how to interact with a provider page. */
export interface ProviderSelectors {
  /** URL to open for a new chat session. */
  chatUrl: string;
  /** Selector for the prompt input (textarea / contenteditable). */
  promptInput: string;
  /** Selector for the send button (if Enter alone is insufficient). */
  sendButton?: string;
  /** Selector for the most-recent assistant response block. */
  responseBlock: string;
  /** Selector whose presence means "ready to accept a prompt". */
  readyIndicator: string;
  /** Selector or text pattern that indicates the free quota is used up. */
  quotaExhaustedIndicator?: string;
}

/** A single question to be sent to the AI chat. */
export interface TaskItem {
  id: string;
  question: string;
  /** Which provider to prefer (optional – falls back to any available). */
  preferredProvider?: ProviderId;
  status: 'pending' | 'running' | 'done' | 'failed';
  answer?: string;
  error?: string;
  /** ISO timestamp when processing started. */
  startedAt?: string;
  /** ISO timestamp when processing completed. */
  completedAt?: string;
  /** Which account was used. */
  accountId?: string;
}

/** Overall workbench state exposed to the UI. */
export interface WorkbenchState {
  accounts: Account[];
  tasks: TaskItem[];
  isRunning: boolean;
  currentTaskId?: string;
  activeAccountId?: string;
}

/** Events pushed to the UI via SSE. */
export type WorkbenchEvent =
  | { type: 'state'; payload: WorkbenchState }
  | { type: 'task_started'; payload: { taskId: string; accountId: string } }
  | { type: 'task_done'; payload: { taskId: string; answer: string } }
  | { type: 'task_failed'; payload: { taskId: string; error: string } }
  | { type: 'quota_exhausted'; payload: { accountId: string } }
  | { type: 'account_switched'; payload: { fromAccountId: string; toAccountId: string } }
  | { type: 'stopped'; payload: Record<string, never> };
