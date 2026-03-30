export const STAGE_SEQUENCE = [
  'session_preparation',
  'capability_assessment',
  'style_dna',
  'research',
  'narrative_map',
  'script',
  'qa',
  'storyboard',
  'asset_generation',
  'scene_video_generation',
  'tts',
  'render',
] as const;

export type StageName = (typeof STAGE_SEQUENCE)[number];

export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'needs_human';

export type StageStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'needs_human'
  | 'paused'
  | 'resumed'
  | 'skipped';

export interface RunArtifacts {
  capabilityAssessment?: string;
  styleDna?: string;
  research?: string;
  narrativeMap?: string;
  script?: string;
  qa?: string;
  storyboard?: string;
  finalVideo?: string;
}

export interface HandoffChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface HandoffState {
  confirmationNote: string;
  checklist: HandoffChecklistItem[];
  updatedAt: string;
  confirmedAt?: string;
}

export interface RunHistoryEntry {
  stage: StageName;
  status: StageStatus;
  message: string;
  createdAt: string;
}

export interface RunRouting {
  launchProfileId?: string;
  stageProfileIds?: Partial<Record<StageName, string>>;
}

export interface RunManifest {
  id: string;
  status: RunStatus;
  currentStage: StageName | null;
  provider: string;
  referenceVideoPath: string;
  topic: string;
  artifacts: RunArtifacts;
  routing?: RunRouting;
  requiresHuman: boolean;
  handoff: HandoffState;
  history: RunHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  currentStage: StageName | null;
  provider: string;
  referenceVideoPath: string;
  topic: string;
  artifacts: RunArtifacts;
  requiresHuman: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RunDetails {
  manifest: RunManifest;
  textArtifacts: Record<string, string>;
  screenshots: string[];
  mediaFiles: string[];
}

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

export interface LaunchDefaultsConfig {
  topic: string;
  provider: string;
  referencePath: string;
  useMock: boolean;
  stageProfileIds: Partial<Record<TextStageProfileKey, string>>;
}

export type RotationMode = 'manual' | 'round-robin';

export interface AppConfig {
  defaultProfileId: string;
  dailyRunLimit: number;
  rotationMode: RotationMode;
  launchDefaults: LaunchDefaultsConfig;
  profiles: BrowserProfileConfig[];
}

export interface SelectorProbeResult {
  name: string;
  selector: string;
  count: number;
  visible: boolean;
  error?: string;
  sampleText?: string;
}

export interface SelectorDebugSnapshot {
  id: string;
  profileId: string;
  createdAt: string;
  webUrl: string;
  entries: SelectorProbeResult[];
  screenshotPath?: string;
}

export interface SelectorDiffRow {
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

// SSE event payloads
export interface SSEAllRunsPayload {
  mode: 'all';
  runs: RunSummary[];
  activeRunId: string | null;
  activeRunPaused: boolean;
  activePreviewUrl: string | null;
  emittedAt: number;
}

export interface SSESelectedRunPayload {
  mode: 'selected';
  run: RunSummary | null;
  activeRunId: string | null;
  activeRunPaused: boolean;
  activePreviewUrl: string | null;
  emittedAt: number;
}

export type SSERunsPayload = SSEAllRunsPayload | SSESelectedRunPayload;

// API request types
export interface StartRunRequest {
  topic: string;
  provider: string;
  profileId: string;
  referencePath?: string;
  useMock?: boolean;
  stageProfileIds?: Partial<Record<TextStageProfileKey, string>>;
}
