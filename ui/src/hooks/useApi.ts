import { useCallback, useEffect, useState } from 'react';
import type {
  AppConfig,
  RunDetails,
  RunManifest,
  RunSummary,
  SelectorDebugSnapshot,
  SSERunsPayload,
} from '../types/index.js';
import * as api from '../api/client.js';
import { subscribeToEvents } from '../api/sse.js';

// ── Generic fetch state ─────────────────────────────────────────────────

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[]): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, refetch };
}

// ── Config ──────────────────────────────────────────────────────────────

export function useConfig(): FetchState<AppConfig> {
  return useFetch(() => api.getConfig(), []);
}

// ── Prompts ─────────────────────────────────────────────────────────────

export function usePrompts(): FetchState<Record<string, string>> {
  return useFetch(() => api.getPrompts(), []);
}

// ── SSE-based runs ──────────────────────────────────────────────────────

interface RunsState {
  runs: RunSummary[];
  activeRunId: string | null;
  activeRunPaused: boolean;
  activePreviewUrl: string | null;
}

export function useRuns(): RunsState {
  const [state, setState] = useState<RunsState>({
    runs: [],
    activeRunId: null,
    activeRunPaused: false,
    activePreviewUrl: null,
  });

  useEffect(() => {
    const cleanup = subscribeToEvents((payload: SSERunsPayload) => {
      if (payload.mode === 'all') {
        setState({
          runs: payload.runs,
          activeRunId: payload.activeRunId,
          activeRunPaused: payload.activeRunPaused,
          activePreviewUrl: payload.activePreviewUrl,
        });
      }
    });
    return cleanup;
  }, []);

  return state;
}

// ── Single run detail ───────────────────────────────────────────────────

export function useRun(runId: string | null): FetchState<RunManifest> {
  return useFetch(
    () => {
      if (!runId) return Promise.reject(new Error('No run selected'));
      return api.getRun(runId);
    },
    [runId],
  );
}

export function useRunDetails(runId: string | null): FetchState<RunDetails> {
  return useFetch(
    () => {
      if (!runId) return Promise.reject(new Error('No run selected'));
      return api.getRunDetails(runId);
    },
    [runId],
  );
}

// ── Selector history ────────────────────────────────────────────────────

export function useSelectorHistory(
  profileId?: string,
): FetchState<SelectorDebugSnapshot[]> {
  return useFetch(() => api.getSelectorHistory(profileId), [profileId]);
}

// ── Quota ────────────────────────────────────────────────────────────────

export function useQuota(): FetchState<api.QuotaStatus> {
  return useFetch(() => api.getQuota(), []);
}
