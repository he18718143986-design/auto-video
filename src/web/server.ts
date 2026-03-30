import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createRunId, nowIso } from '../utils/time.js';
import { loadConfig, saveConfig } from '../config/store.js';
import {
  TEXT_STAGE_PROFILE_KEYS,
  type AppConfig,
  type BrowserProfileConfig,
  type TextStageProfileIdMap,
} from '../config/types.js';
import { createPlaywrightAutomationSession } from '../browser/playwrightAutomation.js';
import { runPipeline } from '../orchestrator/pipeline.js';
import { RunControl } from '../orchestrator/runControl.js';
import { listRuns, loadRunDetails, loadRunManifest, countTodayRuns } from '../orchestrator/runs.js';
import {
  STAGE_SEQUENCE,
  type HandoffChecklistItem,
  type HandoffState,
  type RunManifest,
  type StageName,
  type SelectorProbeResult,
} from '../orchestrator/types.js';
import { ensureDir, fileExists, writeJson } from '../utils/fs.js';

const HOST = process.env.AUTO_VIDEO_UI_HOST?.trim() || '127.0.0.1';
const PORT = parsePort(process.env.AUTO_VIDEO_UI_PORT, 3210);
const UI_DIST_DIR = path.join(process.cwd(), 'ui', 'dist');
const RUNS_DIR = path.join(process.cwd(), 'runs');
const PROMPTS_DIR = path.join(process.cwd(), 'prompts');
const DEBUG_ROOT = path.join(RUNS_DIR, '_selector_debug');
const DEBUG_SNAPSHOTS_DIR = path.join(DEBUG_ROOT, 'snapshots');
const DEBUG_SCREENSHOTS_DIR = path.join(DEBUG_ROOT, 'screenshots');

const promptFiles = [
  'capability-assessment.md',
  'style-dna.md',
  'research.md',
  'narrative-map.md',
  'script.md',
  'qa.md',
  'storyboard.md',
] as const;

interface ActiveRunState {
  runId: string;
  control: RunControl;
}

interface SelectorDebugSnapshot {
  id: string;
  profileId: string;
  createdAt: string;
  webUrl: string;
  entries: SelectorProbeResult[];
  screenshotPath?: string;
}

interface SelectorDiffRow {
  name: string;
  left: {
    selector?: string;
    count?: number;
    visible?: boolean;
    error?: string;
    sampleText?: string;
  };
  right: {
    selector?: string;
    count?: number;
    visible?: boolean;
    error?: string;
    sampleText?: string;
  };
  changed: boolean;
  changes: string[];
}

interface EventClient {
  runId: string | null;
  res: http.ServerResponse;
}

interface RunSummary {
  id: string;
  status: string;
  currentStage: StageName | null;
  provider: string;
  referenceVideoPath: string;
  topic: string;
  artifacts: RunManifest['artifacts'];
  requiresHuman: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RunProfileRuntimeConfig {
  defaultBrowserProfileId: string;
  stageProfileIds: Partial<Record<StageName, string>>;
  availableProfileIds: string[];
  rotationMode: 'manual' | 'round-robin';
  applyBrowserProfileById: (profileId: string) => void;
}

let activeRun: ActiveRunState | null = null;
const eventClients = new Set<EventClient>();

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    const requestUrl = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (method === 'GET' && pathname === '/api/events') {
      return handleSseConnection(req, res);
    }

    if (method === 'GET' && pathname === '/api/config') {
      return json(res, 200, await loadConfig());
    }

    if (method === 'PUT' && pathname === '/api/config') {
      const body = await readJsonBody(req);
      if (!isRecord(body)) {
        return json(res, 400, { error: 'Config payload must be a JSON object.' });
      }
      await saveConfig(body as Partial<AppConfig>);
      await broadcastRunState();
      return json(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/api/prompts') {
      return json(res, 200, await loadPromptMap());
    }

    if (method === 'PUT' && pathname.startsWith('/api/prompts/')) {
      const name = pathname.replace('/api/prompts/', '');
      if (!promptFiles.includes(name as (typeof promptFiles)[number])) {
        return json(res, 404, { error: `Unknown prompt file: ${name}` });
      }
      const body = await readJsonBody(req) as { content?: string };
      await fs.writeFile(path.join(PROMPTS_DIR, name), body.content ?? '', 'utf8');
      return json(res, 200, { ok: true });
    }

    if (method === 'GET' && pathname === '/api/quota') {
      const config = await loadConfig();
      const todayCount = await countTodayRuns();
      return json(res, 200, {
        dailyRunLimit: config.dailyRunLimit,
        todayRunCount: todayCount,
        remaining: Math.max(0, config.dailyRunLimit - todayCount),
      });
    }

    if (method === 'GET' && pathname === '/api/runs') {
      const runs = (await listRuns()).map(toRunSummary);
      return json(res, 200, {
        runs,
        activeRunId: activeRun?.runId || null,
        activeRunPaused: activeRun?.control.isPaused() || false,
      });
    }

    if (method === 'GET' && pathname.startsWith('/api/runs/') && pathname.endsWith('/details')) {
      const runId = pathname.slice('/api/runs/'.length, -'/details'.length).trim();
      if (!runId || runId.includes('/')) {
        return json(res, 404, { error: 'Run not found' });
      }
      const details = await loadRunDetails(runId);
      return json(res, 200, details);
    }

    if (method === 'GET' && pathname.startsWith('/api/runs/')) {
      const runId = pathname.slice('/api/runs/'.length).trim();
      if (!runId || runId.includes('/')) {
        return json(res, 404, { error: 'Run not found' });
      }
      const manifest = await loadRunManifest(runId);
      if (!manifest) {
        return json(res, 404, { error: `Run not found: ${runId}` });
      }
      return json(res, 200, manifest);
    }

    if (method === 'PUT' && pathname.startsWith('/api/runs/') && pathname.endsWith('/handoff')) {
      const runId = pathname.replace('/api/runs/', '').replace('/handoff', '').trim();
      if (!runId) {
        return json(res, 400, { error: 'runId is required.' });
      }
      const body = await readJsonBody(req) as {
        confirmationNote?: string;
        checklist?: Array<{ id?: string; text?: string; done?: boolean }>;
      };
      const manifest = await loadRunManifest(runId);
      if (!manifest) {
        return json(res, 404, { error: `Run not found: ${runId}` });
      }

      const nextHandoff = mergeHandoff(manifest.handoff, body.confirmationNote, body.checklist);
      await updateRunHandoff(runId, nextHandoff);
      await broadcastRunState();
      return json(res, 200, { ok: true, runId, handoff: nextHandoff });
    }

    if (method === 'POST' && pathname === '/api/runs/start') {
      if (activeRun) {
        return json(res, 409, { error: `Run ${activeRun.runId} is still active.` });
      }

      const body = await readJsonBody(req) as {
        topic?: string;
        provider?: string;
        referencePath?: string;
        profileId?: string;
        stageProfileIds?: TextStageProfileIdMap;
        useMock?: boolean;
      };

      const config = await loadConfig();

      const todayCount = await countTodayRuns();
      if (todayCount >= config.dailyRunLimit) {
        return json(res, 429, {
          error: `Daily run limit reached (${config.dailyRunLimit}). Try again tomorrow or increase the limit in Settings.`,
          dailyRunLimit: config.dailyRunLimit,
          todayRunCount: todayCount,
        });
      }

      const launchProfile = resolveProfile(config, body.profileId);
      if (!launchProfile) {
        return json(res, 400, { error: 'Selected profile does not exist.' });
      }
      const useMock = typeof body.useMock === 'boolean' ? body.useMock : config.launchDefaults.useMock;
      const stageProfileIds = resolveTextStageProfileIds(config, body.stageProfileIds);
      const runtimeProfiles = buildRunProfileRuntime(config, launchProfile, stageProfileIds, useMock);

      const runId = createRunId();
      const control = new RunControl();

      startRun(
        {
          topic: body.topic?.trim() || config.launchDefaults.topic,
          provider: body.provider?.trim() || config.launchDefaults.provider,
          referencePath: body.referencePath?.trim() || config.launchDefaults.referencePath || undefined,
          runId,
          control,
        },
        runtimeProfiles,
        control
      );

      return json(res, 202, { ok: true, runId });
    }

    if (method === 'POST' && pathname === '/api/runs/pause') {
      if (!activeRun) {
        return json(res, 409, { error: 'No active run to pause.' });
      }
      activeRun.control.pause();
      await broadcastRunState();
      return json(res, 200, { ok: true, runId: activeRun.runId, paused: true });
    }

    if (method === 'POST' && pathname === '/api/runs/resume') {
      if (!activeRun) {
        return json(res, 409, { error: 'No active run to resume.' });
      }
      activeRun.control.resume();
      await broadcastRunState();
      return json(res, 200, { ok: true, runId: activeRun.runId, paused: false });
    }

    if (method === 'POST' && pathname === '/api/runs/continue-human') {
      if (activeRun) {
        return json(res, 409, { error: `Run ${activeRun.runId} is still active.` });
      }

      const body = await readJsonBody(req) as {
        runId?: string;
        profileId?: string;
        stageProfileIds?: TextStageProfileIdMap;
        useMock?: boolean;
        confirmationNote?: string;
        checklist?: Array<{ id?: string; text?: string; done?: boolean }>;
      };
      const runId = body.runId?.trim();
      if (!runId) {
        return json(res, 400, { error: 'runId is required.' });
      }

      const sourceManifest = await loadRunManifest(runId);
      if (!sourceManifest) {
        return json(res, 404, { error: `Run not found: ${runId}` });
      }
      if (sourceManifest.status !== 'needs_human') {
        return json(res, 409, { error: `Run ${runId} is not in needs_human state.` });
      }

      const mergedHandoff = mergeHandoff(sourceManifest.handoff, body.confirmationNote, body.checklist);
      const incomplete = mergedHandoff.checklist.filter((item) => !item.done);
      if (incomplete.length > 0) {
        return json(res, 409, {
          error: 'Please complete all checklist items before continuing.',
          incompleteItems: incomplete,
          handoff: mergedHandoff,
        });
      }
      mergedHandoff.confirmedAt = nowIso();
      await updateRunHandoff(sourceManifest.id, mergedHandoff);

      const config = await loadConfig();
      const launchProfile = resolveProfile(config, body.profileId);
      if (!launchProfile) {
        return json(res, 400, { error: 'Selected profile does not exist.' });
      }

      const stage = resolveRetryStage(undefined, sourceManifest.currentStage);
      const useMock = typeof body.useMock === 'boolean' ? body.useMock : config.launchDefaults.useMock;
      const stageProfileIds = resolveTextStageProfileIds(config, body.stageProfileIds);
      const runtimeProfiles = buildRunProfileRuntime(config, launchProfile, stageProfileIds, useMock);
      const control = new RunControl();

      startRun(
        {
          topic: sourceManifest.topic,
          provider: sourceManifest.provider,
          referencePath: sourceManifest.referenceVideoPath || undefined,
          runId: sourceManifest.id,
          startFromStage: stage,
          resumeExistingRun: true,
          control,
        },
        runtimeProfiles,
        control
      );

      return json(res, 202, { ok: true, runId: sourceManifest.id, stage, handoff: mergedHandoff });
    }

    if (method === 'POST' && pathname === '/api/runs/retry') {
      if (activeRun) {
        return json(res, 409, { error: `Run ${activeRun.runId} is still active.` });
      }

      const body = await readJsonBody(req) as {
        runId?: string;
        stage?: StageName;
        profileId?: string;
        stageProfileIds?: TextStageProfileIdMap;
        useMock?: boolean;
      };
      const sourceRunId = body.runId?.trim();
      if (!sourceRunId) {
        return json(res, 400, { error: 'runId is required for retry.' });
      }

      const sourceManifest = await loadRunManifest(sourceRunId);
      if (!sourceManifest) {
        return json(res, 404, { error: `Source run not found: ${sourceRunId}` });
      }

      const config = await loadConfig();

      const todayCount = await countTodayRuns();
      if (todayCount >= config.dailyRunLimit) {
        return json(res, 429, {
          error: `Daily run limit reached (${config.dailyRunLimit}). Try again tomorrow or increase the limit in Settings.`,
          dailyRunLimit: config.dailyRunLimit,
          todayRunCount: todayCount,
        });
      }

      const launchProfile = resolveProfile(config, body.profileId);
      if (!launchProfile) {
        return json(res, 400, { error: 'Selected profile does not exist.' });
      }

      const selectedStage = resolveRetryStage(body.stage, sourceManifest.currentStage);
      const runId = createRunId();
      const useMock = typeof body.useMock === 'boolean' ? body.useMock : config.launchDefaults.useMock;
      const stageProfileIds = resolveTextStageProfileIds(config, body.stageProfileIds);
      const runtimeProfiles = buildRunProfileRuntime(config, launchProfile, stageProfileIds, useMock);
      const control = new RunControl();

      startRun(
        {
          topic: sourceManifest.topic,
          provider: sourceManifest.provider,
          referencePath: sourceManifest.referenceVideoPath || undefined,
          runId,
          startFromStage: selectedStage,
          retryFromRunId: sourceManifest.id,
          control,
        },
        runtimeProfiles,
        control
      );

      return json(res, 202, {
        ok: true,
        runId,
        sourceRunId: sourceManifest.id,
        stage: selectedStage,
      });
    }

    if (method === 'POST' && pathname === '/api/selectors/debug') {
      if (activeRun) {
        return json(res, 409, { error: 'Pause or finish the active run before selector debugging.' });
      }

      const body = await readJsonBody(req) as {
        profileId?: string;
        customName?: string;
        customSelector?: string;
      };
      const config = await loadConfig();
      const profile = resolveProfile(config, body.profileId);
      if (!profile) {
        return json(res, 400, { error: 'Selected profile does not exist.' });
      }

      applyRuntimeEnv(profile, false);
      await Promise.all([ensureDir(DEBUG_ROOT), ensureDir(DEBUG_SCREENSHOTS_DIR), ensureDir(DEBUG_SNAPSHOTS_DIR)]);
      const debugId = `${sanitize(profile.id)}_${Date.now()}`;
      const session = await createPlaywrightAutomationSession({
        provider: profile.id,
        runDir: DEBUG_ROOT,
      });

      try {
        const selectors = [
          { name: 'prompt', selector: profile.promptSelector },
          { name: 'ready', selector: profile.readySelector },
          { name: 'upload', selector: profile.uploadSelector },
          { name: 'response', selector: profile.responseSelector },
          { name: 'send_button', selector: profile.sendButtonSelector },
        ].filter((item) => Boolean(item.selector?.trim()));

        if (body.customSelector?.trim()) {
          selectors.push({
            name: body.customName?.trim() || 'custom',
            selector: body.customSelector.trim(),
          });
        }

        const screenshotPath = path.join('screenshots', `${debugId}.jpg`);
        const result = await session.debugSelectors({ selectors, screenshotPath });
        const snapshot = await persistSelectorSnapshot(profile.id, debugId, result);
        const previousSnapshot = await findPreviousSnapshot(profile.id, snapshot.id);
        const diff = previousSnapshot ? buildSelectorDiff(previousSnapshot, snapshot) : [];

        return json(res, 200, {
          ...result,
          debugId: snapshot.id,
          screenshotUrl: snapshot.screenshotPath ? `/runs/${snapshot.screenshotPath}` : null,
          previousDebugId: previousSnapshot?.id || null,
          diff,
        });
      } finally {
        await session.close().catch(() => undefined);
      }
    }

    if (method === 'GET' && pathname === '/api/selectors/history') {
      const profileId = requestUrl.searchParams.get('profileId')?.trim() || undefined;
      const limit = parsePort(requestUrl.searchParams.get('limit') || undefined, 20);
      const snapshots = await listSelectorSnapshots(profileId, Math.min(limit, 100));
      return json(res, 200, { snapshots });
    }

    if (method === 'POST' && pathname === '/api/selectors/compare') {
      const body = await readJsonBody(req) as { leftId?: string; rightId?: string };
      const leftId = body.leftId?.trim();
      const rightId = body.rightId?.trim();
      if (!leftId || !rightId) {
        return json(res, 400, { error: 'leftId and rightId are required.' });
      }

      const [left, right] = await Promise.all([loadSelectorSnapshot(leftId), loadSelectorSnapshot(rightId)]);
      if (!left || !right) {
        return json(res, 404, { error: 'One or both selector snapshots were not found.' });
      }

      const diff = buildSelectorDiff(left, right);
      return json(res, 200, {
        left,
        right,
        diff,
      });
    }

    if (method === 'GET' && pathname.startsWith('/runs/')) {
      return serveFile(res, path.join(process.cwd(), pathname.slice(1)));
    }

    if (method === 'GET') {
      const candidate = path.join(UI_DIST_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
      const normalized = path.normalize(candidate);
      if (normalized.startsWith(UI_DIST_DIR) && await fileExists(normalized)) {
        return serveFile(res, normalized);
      }
      // SPA fallback: serve index.html for any unmatched GET so client-side routing works
      const indexPath = path.join(UI_DIST_DIR, 'index.html');
      if (await fileExists(indexPath)) {
        return serveFile(res, indexPath);
      }
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Auto Video UI running at http://${HOST}:${PORT}`);
});

const sseTicker = setInterval(() => {
  void broadcastRunState();
}, 1000);
sseTicker.unref();

function handleSseConnection(req: http.IncomingMessage, res: http.ServerResponse): void {
  const requestUrl = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const runIdParam = requestUrl.searchParams.get('runId')?.trim() || null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: connected\ndata: {"ok":true}\n\n');
  const client: EventClient = { runId: runIdParam, res };
  eventClients.add(client);
  void broadcastRunState();

  req.on('close', () => {
    eventClients.delete(client);
  });
}

async function broadcastRunState(): Promise<void> {
  if (eventClients.size === 0) return;
  const allRuns = (await listRuns()).map(toRunSummary);
  const activeRunId = activeRun?.runId || null;
  const activeRunPaused = activeRun?.control.isPaused() || false;
  const activePreviewUrl = activeRun ? await resolveLivePreviewUrl(activeRun.runId) : null;
  const selectedRunCache = new Map<string, RunSummary | null>();

  for (const client of eventClients) {
    try {
      if (client.runId) {
        if (!selectedRunCache.has(client.runId)) {
          const manifest = await loadRunManifest(client.runId);
          selectedRunCache.set(client.runId, manifest ? toRunSummary(manifest) : null);
        }
        const payload = {
          mode: 'selected',
          run: selectedRunCache.get(client.runId),
          activeRunId,
          activeRunPaused,
          activePreviewUrl: activeRunId === client.runId ? activePreviewUrl : null,
          emittedAt: Date.now(),
        };
        client.res.write(`event: runs\ndata: ${JSON.stringify(payload)}\n\n`);
      } else {
        const payload = {
          mode: 'all',
          runs: allRuns,
          activeRunId,
          activeRunPaused,
          activePreviewUrl,
          emittedAt: Date.now(),
        };
        client.res.write(`event: runs\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    } catch {
      eventClients.delete(client);
    }
  }
}

function toRunSummary(manifest: RunManifest): RunSummary {
  return {
    id: manifest.id,
    status: manifest.status,
    currentStage: manifest.currentStage,
    provider: manifest.provider,
    referenceVideoPath: manifest.referenceVideoPath,
    topic: manifest.topic,
    artifacts: manifest.artifacts,
    requiresHuman: manifest.requiresHuman,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}

async function updateRunHandoff(runId: string, handoff: HandoffState): Promise<void> {
  const manifestPath = path.join(RUNS_DIR, runId, 'run.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Run not found: ${runId}`);
  }
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as RunManifest;
  manifest.handoff = handoff;
  manifest.updatedAt = nowIso();
  await writeJson(manifestPath, manifest);
}

function mergeHandoff(
  existing: HandoffState | undefined,
  confirmationNote?: string,
  checklist?: Array<{ id?: string; text?: string; done?: boolean }>
): HandoffState {
  const normalizedChecklist = Array.isArray(checklist)
    ? checklist.map((item, index) => ({
      id: item.id?.trim() || `step_${index + 1}`,
      text: item.text?.trim() || `Step ${index + 1}`,
      done: Boolean(item.done),
    }))
    : existing?.checklist || [];

  return {
    confirmationNote: confirmationNote?.trim() || existing?.confirmationNote || '',
    checklist: normalizedChecklist,
    updatedAt: nowIso(),
    confirmedAt: existing?.confirmedAt,
  };
}

function createEmptyHandoff(): HandoffState {
  return {
    confirmationNote: '',
    checklist: [],
    updatedAt: nowIso(),
  };
}


async function resolveLivePreviewUrl(runId: string): Promise<string | null> {
  const jpgPath = path.join(RUNS_DIR, runId, 'screenshots', 'live', 'latest.jpg');
  if (await fileExists(jpgPath)) {
    return `/runs/${encodeURIComponent(runId)}/screenshots/live/latest.jpg?t=${Date.now()}`;
  }
  const pngPath = path.join(RUNS_DIR, runId, 'screenshots', 'live', 'latest.png');
  if (await fileExists(pngPath)) {
    return `/runs/${encodeURIComponent(runId)}/screenshots/live/latest.png?t=${Date.now()}`;
  }
  return null;
}

function startRun(
  options: Parameters<typeof runPipeline>[0],
  runtimeProfiles: RunProfileRuntimeConfig,
  control: RunControl
): void {
  if (activeRun) {
    throw new Error(`Run ${activeRun.runId} is still active.`);
  }

  const runId = options.runId || createRunId();
  runtimeProfiles.applyBrowserProfileById(runtimeProfiles.defaultBrowserProfileId);
  activeRun = { runId, control };
  void broadcastRunState();

  void runPipeline({
    ...options,
    runId,
    launchProfileId: runtimeProfiles.defaultBrowserProfileId,
    defaultBrowserProfileId: runtimeProfiles.defaultBrowserProfileId,
    stageProfileIds: runtimeProfiles.stageProfileIds,
    availableProfileIds: runtimeProfiles.availableProfileIds,
    rotationMode: runtimeProfiles.rotationMode,
    applyBrowserProfileById: runtimeProfiles.applyBrowserProfileById,
  })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[auto-video] run failed: ${message}`);
    })
    .finally(() => {
      if (activeRun?.runId === runId) {
        activeRun = null;
      }
      void broadcastRunState();
    });
}

function resolveProfile(
  config: Awaited<ReturnType<typeof loadConfig>>,
  profileId?: string
): Awaited<ReturnType<typeof loadConfig>>['profiles'][number] | undefined {
  const id = profileId?.trim() || config.defaultProfileId;
  return config.profiles.find((item) => item.id === id);
}

function resolveTextStageProfileIds(
  config: AppConfig,
  value: TextStageProfileIdMap | undefined
): TextStageProfileIdMap {
  const source = value || config.launchDefaults.stageProfileIds || {};
  const profileIds = new Set(config.profiles.map((profile) => profile.id));
  const output: TextStageProfileIdMap = {};

  for (const stage of TEXT_STAGE_PROFILE_KEYS) {
    const candidate = source[stage]?.trim();
    if (!candidate) continue;
    if (!profileIds.has(candidate)) continue;
    output[stage] = candidate;
  }

  return output;
}

function buildRunProfileRuntime(
  config: AppConfig,
  launchProfile: BrowserProfileConfig,
  textStageProfiles: TextStageProfileIdMap,
  useMock: boolean
): RunProfileRuntimeConfig {
  const profileById = new Map(config.profiles.map((profile) => [profile.id, profile]));
  const stageProfileIds: Partial<Record<StageName, string>> = {
    capability_assessment: textStageProfiles.capability_assessment,
    research: textStageProfiles.research,
    script: textStageProfiles.script,
    qa: textStageProfiles.qa,
    storyboard: textStageProfiles.storyboard,
  };

  return {
    defaultBrowserProfileId: launchProfile.id,
    stageProfileIds,
    availableProfileIds: config.profiles.map((p) => p.id),
    rotationMode: config.rotationMode,
    applyBrowserProfileById: (profileId: string) => {
      const profile = profileById.get(profileId);
      if (!profile) {
        throw new Error(`Profile not found: ${profileId}`);
      }
      applyRuntimeEnv(profile, useMock);
    },
  };
}

function resolveRetryStage(stage: StageName | undefined, fallbackStage: StageName | null): StageName {
  if (stage && STAGE_SEQUENCE.includes(stage)) {
    return stage;
  }
  if (fallbackStage && STAGE_SEQUENCE.includes(fallbackStage)) {
    return fallbackStage;
  }
  return 'session_preparation';
}

function applyRuntimeEnv(profile: Awaited<ReturnType<typeof loadConfig>>['profiles'][number], useMock: boolean): void {
  process.env.AUTO_VIDEO_WEB_URL = profile.webUrl;
  process.env.AUTO_VIDEO_PROMPT_SELECTOR = profile.promptSelector;
  process.env.AUTO_VIDEO_RESPONSE_SELECTOR = profile.responseSelector;
  process.env.AUTO_VIDEO_UPLOAD_SELECTOR = profile.uploadSelector;
  process.env.AUTO_VIDEO_SEND_BUTTON_SELECTOR = profile.sendButtonSelector;
  process.env.AUTO_VIDEO_READY_SELECTOR = profile.readySelector;
  process.env.AUTO_VIDEO_USER_DATA_DIR = profile.userDataDir;
  process.env.AUTO_VIDEO_HEADLESS = profile.headless ? '1' : '0';
  process.env.AUTO_VIDEO_ALLOW_MANUAL_LOGIN = profile.allowManualLogin ? '1' : '0';
  process.env.AUTO_VIDEO_NAV_TIMEOUT_MS = String(profile.navigationTimeoutMs);
  process.env.AUTO_VIDEO_READY_TIMEOUT_MS = String(profile.readyTimeoutMs);
  process.env.AUTO_VIDEO_RESPONSE_TIMEOUT_MS = String(profile.responseTimeoutMs);
  process.env.AUTO_VIDEO_MANUAL_LOGIN_TIMEOUT_MS = String(profile.manualLoginTimeoutMs);
  process.env.AUTO_VIDEO_USE_MOCK = useMock ? '1' : '0';
}

async function loadPromptMap(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    promptFiles.map(async (fileName) => [fileName, await fs.readFile(path.join(PROMPTS_DIR, fileName), 'utf8')] as const)
  );
  return Object.fromEntries(entries);
}

async function persistSelectorSnapshot(
  profileId: string,
  debugId: string,
  result: { webUrl: string; entries: SelectorProbeResult[]; screenshotPath?: string }
): Promise<SelectorDebugSnapshot> {
  const snapshot: SelectorDebugSnapshot = {
    id: debugId,
    profileId,
    createdAt: nowIso(),
    webUrl: result.webUrl,
    entries: result.entries,
    screenshotPath: result.screenshotPath
      ? path.join('_selector_debug', result.screenshotPath).replaceAll(path.sep, '/')
      : undefined,
  };
  await ensureDir(DEBUG_SNAPSHOTS_DIR);
  await writeJson(path.join(DEBUG_SNAPSHOTS_DIR, `${snapshot.id}.json`), snapshot);
  return snapshot;
}

async function listSelectorSnapshots(profileId?: string, limit = 20): Promise<SelectorDebugSnapshot[]> {
  if (!(await fileExists(DEBUG_SNAPSHOTS_DIR))) return [];
  const entries = await fs.readdir(DEBUG_SNAPSHOTS_DIR);
  const snapshots: SelectorDebugSnapshot[] = [];

  for (const fileName of entries) {
    if (!fileName.endsWith('.json')) continue;
    const snapshot = await loadSelectorSnapshot(fileName.replace(/\.json$/, ''));
    if (!snapshot) continue;
    if (profileId && snapshot.profileId !== profileId) continue;
    snapshots.push(snapshot);
  }

  snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return snapshots.slice(0, limit);
}

async function loadSelectorSnapshot(id: string): Promise<SelectorDebugSnapshot | null> {
  const filePath = path.join(DEBUG_SNAPSHOTS_DIR, `${id}.json`);
  if (!(await fileExists(filePath))) return null;
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as SelectorDebugSnapshot;
}

async function findPreviousSnapshot(profileId: string, currentId: string): Promise<SelectorDebugSnapshot | null> {
  const snapshots = await listSelectorSnapshots(profileId, 10);
  return snapshots.find((snapshot) => snapshot.id !== currentId) || null;
}

function buildSelectorDiff(left: SelectorDebugSnapshot, right: SelectorDebugSnapshot): SelectorDiffRow[] {
  const mapLeft = new Map(left.entries.map((entry) => [entry.name, entry]));
  const mapRight = new Map(right.entries.map((entry) => [entry.name, entry]));
  const names = [...new Set([...mapLeft.keys(), ...mapRight.keys()])].sort();

  return names.map((name) => {
    const leftEntry = mapLeft.get(name);
    const rightEntry = mapRight.get(name);
    const changes: string[] = [];

    if ((leftEntry?.selector || '') !== (rightEntry?.selector || '')) {
      changes.push('selector');
    }
    if ((leftEntry?.count ?? -1) !== (rightEntry?.count ?? -1)) {
      changes.push('count');
    }
    if ((leftEntry?.visible ?? false) !== (rightEntry?.visible ?? false)) {
      changes.push('visible');
    }
    if ((leftEntry?.error || '') !== (rightEntry?.error || '')) {
      changes.push('error');
    }
    if ((leftEntry?.sampleText || '') !== (rightEntry?.sampleText || '')) {
      changes.push('sample_text');
    }

    return {
      name,
      left: {
        selector: leftEntry?.selector,
        count: leftEntry?.count,
        visible: leftEntry?.visible,
        error: leftEntry?.error,
        sampleText: leftEntry?.sampleText,
      },
      right: {
        selector: rightEntry?.selector,
        count: rightEntry?.count,
        visible: rightEntry?.visible,
        error: rightEntry?.error,
        sampleText: rightEntry?.sampleText,
      },
      changed: changes.length > 0,
      changes,
    };
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function serveFile(res: http.ServerResponse, filePath: string): Promise<void> {
  const file = await fs.readFile(filePath);
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
  res.end(file);
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.mp4':
      return 'video/mp4';
    case '.svg':
      return 'image/svg+xml';
    case '.woff':
    case '.woff2':
      return 'font/woff2';
    case '.srt':
    case '.txt':
    case '.md':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
