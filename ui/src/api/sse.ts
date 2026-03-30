import type { SSERunsPayload } from '../types/index.js';
import { getBaseUrl } from './client.js';

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function subscribeToEvents(
  callback: (data: SSERunsPayload) => void,
  runId?: string,
): () => void {
  let eventSource: EventSource | null = null;
  let reconnectDelay = RECONNECT_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function connect(): void {
    if (disposed) return;

    const params = new URLSearchParams();
    if (runId) params.set('runId', runId);
    const qs = params.toString();
    const url = `${getBaseUrl()}/api/events${qs ? `?${qs}` : ''}`;

    eventSource = new EventSource(url);

    eventSource.addEventListener('runs', (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as SSERunsPayload;
        callback(payload);
        reconnectDelay = RECONNECT_DELAY_MS;
      } catch {
        // Ignore malformed events
      }
    });

    eventSource.addEventListener('open', () => {
      reconnectDelay = RECONNECT_DELAY_MS;
    });

    eventSource.addEventListener('error', () => {
      eventSource?.close();
      eventSource = null;
      scheduleReconnect();
    });
  }

  function scheduleReconnect(): void {
    if (disposed) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    eventSource?.close();
    eventSource = null;
  };
}
