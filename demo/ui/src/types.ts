export type ProviderId = 'chatgpt' | 'gemini' | 'deepseek' | 'kimi';

export interface Account {
  id: string;
  provider: ProviderId;
  label: string;
  profileDir: string;
  quotaExhausted: boolean;
  quotaResetAt?: string;
}

export interface TaskItem {
  id: string;
  question: string;
  preferredProvider?: ProviderId;
  status: 'pending' | 'running' | 'done' | 'failed';
  answer?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  accountId?: string;
}

export interface WorkbenchState {
  accounts: Account[];
  tasks: TaskItem[];
  isRunning: boolean;
  currentTaskId?: string;
  activeAccountId?: string;
}

export type WorkbenchEvent =
  | { type: 'state'; payload: WorkbenchState }
  | { type: 'task_started'; payload: { taskId: string; accountId: string } }
  | { type: 'task_done'; payload: { taskId: string; answer: string } }
  | { type: 'task_failed'; payload: { taskId: string; error: string } }
  | { type: 'quota_exhausted'; payload: { accountId: string } }
  | { type: 'account_switched'; payload: { fromAccountId: string; toAccountId: string } }
  | { type: 'stopped'; payload: Record<string, never> };
