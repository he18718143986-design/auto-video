import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Workbench } from './workbench.js';
import type { ProviderId, WorkbenchEvent } from './types.js';

const PORT = Number(process.env.PORT ?? 3220);
const workbench = new Workbench();

/* ------------------------------------------------------------------ */
/*  SSE client management                                             */
/* ------------------------------------------------------------------ */

interface SSEClient {
  id: number;
  res: ServerResponse;
}

let clientIdCounter = 0;
const sseClients: SSEClient[] = [];

function broadcastEvent(event: WorkbenchEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.res.write(data);
  }
}

// Subscribe workbench events → SSE broadcast
workbench.onEvent(broadcastEvent);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

function parsePath(url: string): { path: string; query: URLSearchParams } {
  const u = new URL(url, 'http://localhost');
  return { path: u.pathname, query: u.searchParams };
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const { path } = parsePath(req.url ?? '/');

  // CORS headers for dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- SSE stream ----
  if (method === 'GET' && path === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const client: SSEClient = { id: ++clientIdCounter, res };
    sseClients.push(client);
    // Send current state immediately
    res.write(`data: ${JSON.stringify({ type: 'state', payload: workbench.getState() })}\n\n`);
    req.on('close', () => {
      const idx = sseClients.findIndex((c) => c.id === client.id);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // ---- State ----
  if (method === 'GET' && path === '/api/state') {
    return json(res, 200, workbench.getState());
  }

  // ---- Tasks ----
  if (method === 'POST' && path === '/api/tasks') {
    const body = JSON.parse(await readBody(req)) as { questions: string[] };
    const tasks = workbench.tasks.add(body.questions);
    return json(res, 201, tasks);
  }

  if (method === 'DELETE' && path.startsWith('/api/tasks/')) {
    const taskId = path.split('/').pop()!;
    const ok = workbench.tasks.remove(taskId);
    return json(res, ok ? 200 : 404, { ok });
  }

  if (method === 'POST' && path === '/api/tasks/clear') {
    workbench.tasks.clear();
    return json(res, 200, { ok: true });
  }

  // ---- Accounts ----
  if (method === 'POST' && path === '/api/accounts') {
    const body = JSON.parse(await readBody(req)) as {
      provider: ProviderId;
      label: string;
      profileDir: string;
    };
    const acc = workbench.accounts.addAccount(body.provider, body.label, body.profileDir);
    return json(res, 201, acc);
  }

  if (method === 'DELETE' && path.startsWith('/api/accounts/')) {
    const accountId = path.split('/').pop()!;
    const ok = workbench.accounts.removeAccount(accountId);
    return json(res, ok ? 200 : 404, { ok });
  }

  if (method === 'POST' && path === '/api/accounts/reset-quotas') {
    workbench.accounts.resetAllQuotas();
    return json(res, 200, { ok: true });
  }

  // ---- Control ----
  if (method === 'POST' && path === '/api/start') {
    // Fire-and-forget: start returns immediately, progress via SSE
    workbench.start().catch((err) => {
      console.error('[workbench] loop error:', err);
    });
    return json(res, 200, { ok: true });
  }

  if (method === 'POST' && path === '/api/stop') {
    workbench.stop();
    return json(res, 200, { ok: true });
  }

  // ---- Provider selectors ----
  if (method === 'GET' && path === '/api/providers') {
    const providers = (['chatgpt', 'gemini', 'deepseek', 'kimi'] as ProviderId[]).map((id) => ({
      id,
      selectors: workbench.getSelectors(id),
    }));
    return json(res, 200, providers);
  }

  // ---- Fallback ----
  json(res, 404, { error: 'Not found' });
}

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[server] unhandled:', err);
    if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
  });
});

server.listen(PORT, () => {
  console.log(`🤖 AI Chat Workbench server running at http://localhost:${PORT}`);
  console.log(`   SSE events: http://localhost:${PORT}/api/events`);
  console.log(`   State:      http://localhost:${PORT}/api/state`);
});
