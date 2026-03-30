import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ensureDir, writeJson } from '../utils/fs.js';
import { createRunId, nowIso } from '../utils/time.js';
import type {
  HandoffChecklistItem,
  HandoffState,
  RunContext,
  RunManifest,
  RunOptions,
  RunRouting,
  RunRuntime,
  RunStatus,
  StageName,
  StageStatus,
} from './types.js';

export async function createRunContext(baseDir: string, options: RunOptions): Promise<RunContext> {
  const id = options.runId?.trim() || createRunId();
  const runDir = path.join(baseDir, id);
  const manifestPath = path.join(runDir, 'run.json');

  const manifest: RunManifest = {
    id,
    status: 'running',
    currentStage: null,
    provider: options.provider,
    referenceVideoPath: options.referencePath || '',
    topic: options.topic,
    artifacts: {},
    routing: buildRoutingFromOptions(options),
    requiresHuman: false,
    handoff: createDefaultHandoffState(),
    history: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await ensureDir(runDir);
  await writeJson(manifestPath, manifest);

  return {
    runDir,
    manifestPath,
    manifest,
    runtime: buildRunRuntime(options),
  };
}

export async function loadRunContext(baseDir: string, options: RunOptions): Promise<RunContext> {
  const id = options.runId?.trim();
  if (!id) {
    throw new Error('runId is required to resume an existing run.');
  }

  const runDir = path.join(baseDir, id);
  const manifestPath = path.join(runDir, 'run.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as RunManifest;
  manifest.handoff = normalizeHandoffState(manifest.handoff);
  manifest.routing = normalizeRouting(manifest.routing, options);

  manifest.provider = options.provider;
  manifest.topic = options.topic;
  manifest.referenceVideoPath = options.referencePath || manifest.referenceVideoPath;
  manifest.status = 'running';
  manifest.requiresHuman = false;
  manifest.updatedAt = nowIso();
  await writeJson(manifestPath, manifest);

  return {
    runDir,
    manifestPath,
    manifest,
    runtime: buildRunRuntime(options),
  };
}

function buildRunRuntime(options: RunOptions): RunRuntime {
  return {
    browser: undefined,
    activeBrowserProfileId: undefined,
    defaultBrowserProfileId: options.defaultBrowserProfileId,
    stageProfileIds: options.stageProfileIds,
    availableProfileIds: options.availableProfileIds,
    rotationMode: options.rotationMode,
    applyBrowserProfileById: options.applyBrowserProfileById,
    referenceUploaded: false,
    useMock: process.env.AUTO_VIDEO_USE_MOCK === '1',
    control: options.control,
  };
}

export async function markStage(
  ctx: RunContext,
  stage: StageName,
  status: StageStatus,
  message: string
): Promise<void> {
  ctx.manifest.currentStage = stage;
  ctx.manifest.history.push({
    stage,
    status,
    message,
    createdAt: nowIso(),
  });
  ctx.manifest.updatedAt = nowIso();
  switch (status) {
    case 'needs_human':
      ctx.manifest.status = 'needs_human';
      ctx.manifest.requiresHuman = true;
      break;
    case 'failed':
      ctx.manifest.status = 'failed';
      break;
    case 'paused':
      ctx.manifest.status = 'paused';
      break;
    case 'resumed':
      ctx.manifest.status = 'running';
      ctx.manifest.requiresHuman = false;
      break;
    default:
      if (ctx.manifest.status === 'paused') {
        ctx.manifest.status = 'running';
      }
      break;
  }
  await writeJson(ctx.manifestPath, ctx.manifest);
}

export async function pauseRun(
  ctx: RunContext,
  stage: StageName,
  message = 'Run paused by operator.'
): Promise<void> {
  await markStage(ctx, stage, 'paused', message);
}

export async function resumeRun(
  ctx: RunContext,
  stage: StageName,
  message = 'Run resumed by operator.'
): Promise<void> {
  await markStage(ctx, stage, 'resumed', message);
}

export async function setArtifact(
  ctx: RunContext,
  key: keyof RunManifest['artifacts'],
  value: string
): Promise<void> {
  ctx.manifest.artifacts[key] = value;
  ctx.manifest.updatedAt = nowIso();
  await writeJson(ctx.manifestPath, ctx.manifest);
}

export async function finalizeRun(ctx: RunContext, status: RunStatus): Promise<void> {
  ctx.manifest.status = status;
  ctx.manifest.updatedAt = nowIso();
  await writeJson(ctx.manifestPath, ctx.manifest);
}

export async function setHandoffState(ctx: RunContext, handoff: HandoffState): Promise<void> {
  ctx.manifest.handoff = normalizeHandoffState(handoff);
  ctx.manifest.updatedAt = nowIso();
  await writeJson(ctx.manifestPath, ctx.manifest);
}

function createDefaultHandoffState(): HandoffState {
  return {
    confirmationNote:
      'Complete login/CAPTCHA, verify input/upload/send controls, then click Continue Human Run.',
    checklist: [
      createChecklistItem('在目标网页完成账号登录'),
      createChecklistItem('若出现验证码/二次验证，先完成验证'),
      createChecklistItem('确认输入框可输入'),
      createChecklistItem('确认上传按钮或拖拽区可用'),
      createChecklistItem('确认发送按钮可点击或 Enter 可发送'),
    ],
    updatedAt: nowIso(),
  };
}

function createChecklistItem(text: string): HandoffChecklistItem {
  return {
    id: `step_${Math.random().toString(36).slice(2, 10)}`,
    text,
    done: false,
  };
}

function normalizeHandoffState(value: HandoffState | undefined): HandoffState {
  const base = createDefaultHandoffState();
  const checklist = Array.isArray(value?.checklist) && value?.checklist.length > 0
    ? value.checklist.map((item, index) => ({
      id: item.id?.trim() || `step_${index + 1}`,
      text: item.text?.trim() || `Step ${index + 1}`,
      done: Boolean(item.done),
    }))
    : base.checklist;

  return {
    confirmationNote: value?.confirmationNote?.trim() || base.confirmationNote,
    checklist,
    updatedAt: value?.updatedAt || nowIso(),
    confirmedAt: value?.confirmedAt,
  };
}

function buildRoutingFromOptions(options: RunOptions): RunRouting {
  return {
    launchProfileId: options.launchProfileId || options.defaultBrowserProfileId,
    stageProfileIds: options.stageProfileIds || {},
  };
}

function normalizeRouting(existing: RunRouting | undefined, options: RunOptions): RunRouting {
  const launchProfileId = options.launchProfileId || options.defaultBrowserProfileId || existing?.launchProfileId;
  const stageProfileIds = options.stageProfileIds || existing?.stageProfileIds || {};
  return {
    launchProfileId,
    stageProfileIds,
  };
}
