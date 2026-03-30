import type {
  AppConfig,
  HandoffChecklistItem,
  RunDetails,
  RunManifest,
  RunSummary,
  SelectorDebugSnapshot,
  SelectorDiffRow,
  StageName,
  StartRunRequest,
} from '../types/index.js';

let baseUrl = '';

export function getBaseUrl(): string {
  return baseUrl;
}

export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}

class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${status}`;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {};
  let bodyStr: string | undefined;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: bodyStr });

  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, parsed);
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ── Config ──────────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  return request<AppConfig>('GET', '/api/config');
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await request<unknown>('PUT', '/api/config', config);
}

// ── Quota ───────────────────────────────────────────────────────────────

export interface QuotaStatus {
  dailyRunLimit: number;
  todayRunCount: number;
  remaining: number;
}

export async function getQuota(): Promise<QuotaStatus> {
  return request<QuotaStatus>('GET', '/api/quota');
}

// ── Prompts ─────────────────────────────────────────────────────────────

export async function getPrompts(): Promise<Record<string, string>> {
  return request<Record<string, string>>('GET', '/api/prompts');
}

export async function savePrompt(
  name: string,
  content: string,
): Promise<void> {
  await request<unknown>('PUT', `/api/prompts/${encodeURIComponent(name)}`, {
    content,
  });
}

// ── Runs ────────────────────────────────────────────────────────────────

export async function getRuns(): Promise<RunSummary[]> {
  const data = await request<{ runs: RunSummary[] }>('GET', '/api/runs');
  return data.runs;
}

export async function getRun(runId: string): Promise<RunManifest> {
  return request<RunManifest>('GET', `/api/runs/${encodeURIComponent(runId)}`);
}

export async function getRunDetails(runId: string): Promise<RunDetails> {
  return request<RunDetails>('GET', `/api/runs/${encodeURIComponent(runId)}/details`);
}

export async function startRun(
  req: StartRunRequest,
): Promise<{ runId: string }> {
  return request<{ runId: string }>('POST', '/api/runs/start', req);
}

export async function pauseRun(): Promise<void> {
  await request<unknown>('POST', '/api/runs/pause');
}

export async function resumeRun(): Promise<void> {
  await request<unknown>('POST', '/api/runs/resume');
}

export async function continueHuman(params: {
  runId: string;
  profileId?: string;
  confirmationNote?: string;
  checklist?: HandoffChecklistItem[];
  useMock?: boolean;
}): Promise<void> {
  await request<unknown>('POST', '/api/runs/continue-human', params);
}

export async function retryRun(
  runId: string,
  fromStage: StageName,
): Promise<{ runId: string }> {
  return request<{ runId: string }>('POST', '/api/runs/retry', {
    runId,
    stage: fromStage,
  });
}

export async function saveHandoff(
  runId: string,
  handoff: {
    confirmationNote: string;
    checklist: HandoffChecklistItem[];
  },
): Promise<void> {
  await request<unknown>(
    'PUT',
    `/api/runs/${encodeURIComponent(runId)}/handoff`,
    handoff,
  );
}

// ── Selectors ───────────────────────────────────────────────────────────

export async function debugSelectors(
  profileId: string,
  customName?: string,
  customSelector?: string,
): Promise<SelectorDebugSnapshot> {
  return request<SelectorDebugSnapshot>('POST', '/api/selectors/debug', {
    profileId,
    customName,
    customSelector,
  });
}

export async function getSelectorHistory(
  profileId?: string,
  limit?: number,
): Promise<SelectorDebugSnapshot[]> {
  const params = new URLSearchParams();
  if (profileId) params.set('profileId', profileId);
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  const data = await request<{ snapshots: SelectorDebugSnapshot[] }>(
    'GET',
    `/api/selectors/history${qs ? `?${qs}` : ''}`,
  );
  return data.snapshots;
}

export async function compareSelectors(
  leftId: string,
  rightId: string,
): Promise<SelectorDiffRow[]> {
  const data = await request<{ diff: SelectorDiffRow[] }>(
    'POST',
    '/api/selectors/compare',
    { leftId, rightId },
  );
  return data.diff;
}
