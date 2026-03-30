export interface BrowserProfileConfig {
  id: string;
  name: string;
  webUrl: string;
  promptSelector: string;
  responseSelector: string;
  uploadSelector: string;
  sendButtonSelector: string;
  readySelector: string;
  userDataDir: string;
  headless: boolean;
  allowManualLogin: boolean;
  navigationTimeoutMs: number;
  readyTimeoutMs: number;
  responseTimeoutMs: number;
  manualLoginTimeoutMs: number;
}

export const TEXT_STAGE_PROFILE_KEYS = [
  'capability_assessment',
  'research',
  'script',
  'qa',
  'storyboard',
] as const;

export type TextStageProfileKey = (typeof TEXT_STAGE_PROFILE_KEYS)[number];

export type TextStageProfileIdMap = Partial<Record<TextStageProfileKey, string>>;

export interface LaunchDefaultsConfig {
  topic: string;
  provider: string;
  referencePath: string;
  useMock: boolean;
  stageProfileIds: TextStageProfileIdMap;
}

export type RotationMode = 'manual' | 'round-robin';

export const ROTATION_MODES: readonly RotationMode[] = ['manual', 'round-robin'] as const;

export interface AppConfig {
  defaultProfileId: string;
  dailyRunLimit: number;
  rotationMode: RotationMode;
  launchDefaults: LaunchDefaultsConfig;
  profiles: BrowserProfileConfig[];
}
