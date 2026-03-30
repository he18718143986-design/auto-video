import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, fileExists, writeJson } from '../utils/fs.js';
import {
  TEXT_STAGE_PROFILE_KEYS,
  ROTATION_MODES,
  type AppConfig,
  type BrowserProfileConfig,
  type RotationMode,
  type TextStageProfileIdMap,
} from './types.js';

const CONFIG_PATH = path.join(process.cwd(), 'auto-video.config.json');

export async function loadConfig(): Promise<AppConfig> {
  if (!(await fileExists(CONFIG_PATH))) {
    const config = createDefaultConfig();
    await saveConfig(config);
    return config;
  }

  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Partial<AppConfig>;
  return normalizeConfig(parsed);
}

export async function saveConfig(config: Partial<AppConfig>): Promise<void> {
  await ensureDir(path.dirname(CONFIG_PATH));
  await writeJson(CONFIG_PATH, normalizeConfig(config));
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

function createDefaultConfig(): AppConfig {
  return {
    defaultProfileId: 'default',
    dailyRunLimit: 3,
    rotationMode: 'manual',
    launchDefaults: {
      topic: 'how kidneys work',
      provider: 'browser-chat-provider',
      referencePath: '',
      useMock: true,
      stageProfileIds: {},
    },
    profiles: [createDefaultProfile()],
  };
}

function createDefaultProfile(): BrowserProfileConfig {
  return {
    id: 'default',
    name: 'Default Browser Profile',
    webUrl: 'https://your-chat-page.example',
    promptSelector: 'textarea',
    responseSelector: '[data-message-author-role="assistant"]',
    uploadSelector: 'input[type="file"]',
    sendButtonSelector: '',
    readySelector: 'textarea',
    userDataDir: '.browser-profile/default',
    headless: false,
    allowManualLogin: true,
    navigationTimeoutMs: 45000,
    readyTimeoutMs: 10000,
    responseTimeoutMs: 120000,
    manualLoginTimeoutMs: 180000,
  };
}

function normalizeConfig(value: Partial<AppConfig>): AppConfig {
  const defaults = createDefaultConfig();
  const profiles = Array.isArray(value.profiles) && value.profiles.length > 0
    ? value.profiles.map((profile, index) => normalizeProfile(profile, index))
    : defaults.profiles;

  const defaultProfileId = value.defaultProfileId && profiles.some((profile) => profile.id === value.defaultProfileId)
    ? value.defaultProfileId
    : profiles[0].id;

  return {
    defaultProfileId,
    dailyRunLimit: parseNumber(value.dailyRunLimit, defaults.dailyRunLimit),
    rotationMode: normalizeRotationMode(value.rotationMode),
    launchDefaults: {
      topic: value.launchDefaults?.topic?.trim() || defaults.launchDefaults.topic,
      provider: value.launchDefaults?.provider?.trim() || defaults.launchDefaults.provider,
      referencePath: value.launchDefaults?.referencePath?.trim() || '',
      useMock: typeof value.launchDefaults?.useMock === 'boolean'
        ? value.launchDefaults.useMock
        : defaults.launchDefaults.useMock,
      stageProfileIds: normalizeStageProfileIds(value.launchDefaults?.stageProfileIds, profiles),
    },
    profiles,
  };
}

function normalizeProfile(value: Partial<BrowserProfileConfig> | undefined, index: number): BrowserProfileConfig {
  const defaults = createDefaultProfile();
  const fallbackId = index === 0 ? 'default' : `profile-${index + 1}`;
  return {
    id: value?.id?.trim() || fallbackId,
    name: value?.name?.trim() || `Browser Profile ${index + 1}`,
    webUrl: value?.webUrl?.trim() || defaults.webUrl,
    promptSelector: value?.promptSelector?.trim() || defaults.promptSelector,
    responseSelector: value?.responseSelector?.trim() || defaults.responseSelector,
    uploadSelector: value?.uploadSelector?.trim() || defaults.uploadSelector,
    sendButtonSelector: value?.sendButtonSelector?.trim() || '',
    readySelector: value?.readySelector?.trim() || defaults.readySelector,
    userDataDir: value?.userDataDir?.trim() || `.browser-profile/${fallbackId}`,
    headless: Boolean(value?.headless),
    allowManualLogin: typeof value?.allowManualLogin === 'boolean' ? value.allowManualLogin : true,
    navigationTimeoutMs: parseNumber(value?.navigationTimeoutMs, defaults.navigationTimeoutMs),
    readyTimeoutMs: parseNumber(value?.readyTimeoutMs, defaults.readyTimeoutMs),
    responseTimeoutMs: parseNumber(value?.responseTimeoutMs, defaults.responseTimeoutMs),
    manualLoginTimeoutMs: parseNumber(value?.manualLoginTimeoutMs, defaults.manualLoginTimeoutMs),
  };
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeStageProfileIds(
  value: unknown,
  profiles: BrowserProfileConfig[]
): TextStageProfileIdMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const profileIds = new Set(profiles.map((profile) => profile.id));
  const output: TextStageProfileIdMap = {};
  const input = value as Record<string, unknown>;

  for (const key of TEXT_STAGE_PROFILE_KEYS) {
    const candidate = typeof input[key] === 'string' ? input[key].trim() : '';
    if (!candidate) continue;
    if (!profileIds.has(candidate)) continue;
    output[key] = candidate;
  }

  return output;
}

function normalizeRotationMode(value: unknown): RotationMode {
  if (typeof value === 'string' && (ROTATION_MODES as readonly string[]).includes(value)) {
    return value as RotationMode;
  }
  return 'manual';
}
