import type { Account, ProviderId, TaskItem, WorkbenchState } from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => request<WorkbenchState>('/state'),

  addTasks: (questions: string[]) =>
    request<TaskItem[]>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ questions }),
    }),

  removeTask: (taskId: string) =>
    request<{ ok: boolean }>(`/tasks/${taskId}`, { method: 'DELETE' }),

  clearTasks: () =>
    request<{ ok: boolean }>('/tasks/clear', { method: 'POST' }),

  addAccount: (provider: ProviderId, label: string, profileDir: string) =>
    request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify({ provider, label, profileDir }),
    }),

  removeAccount: (accountId: string) =>
    request<{ ok: boolean }>(`/accounts/${accountId}`, { method: 'DELETE' }),

  resetQuotas: () =>
    request<{ ok: boolean }>('/accounts/reset-quotas', { method: 'POST' }),

  start: () => request<{ ok: boolean }>('/start', { method: 'POST' }),

  stop: () => request<{ ok: boolean }>('/stop', { method: 'POST' }),

  getProviders: () =>
    request<Array<{ id: ProviderId; selectors: Record<string, string> }>>('/providers'),
};
