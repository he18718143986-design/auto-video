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

export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'needs_human';

export type StageStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'needs_human'
  | 'paused'
  | 'resumed'
  | 'skipped';

export type StageName = (typeof STAGE_SEQUENCE)[number];

export interface SessionHealth {
  ok: boolean;
  needsHuman: boolean;
  checks: string[];
}

export interface BrowserPromptRequest {
  stage: StageName;
  prompt: string;
  uploadPath?: string;
  screenshotPath?: string;
}

export interface BrowserPromptResult {
  text: string;
  responseIndex: number;
  screenshotPath?: string;
}

export interface SelectorProbeRequest {
  name: string;
  selector: string;
}

export interface SelectorProbeResult {
  name: string;
  selector: string;
  count: number;
  visible: boolean;
  sampleText?: string;
  error?: string;
}

export interface SelectorDebugRequest {
  webUrl?: string;
  selectors: SelectorProbeRequest[];
  screenshotPath?: string;
}

export interface SelectorDebugResult {
  ok: boolean;
  webUrl: string;
  checks: string[];
  entries: SelectorProbeResult[];
  screenshotPath?: string;
}

export interface BrowserAutomationSession {
  checkSession(): Promise<SessionHealth>;
  uploadReferenceFile(filePath: string): Promise<void>;
  runPrompt(request: BrowserPromptRequest): Promise<BrowserPromptResult>;
  debugSelectors(request: SelectorDebugRequest): Promise<SelectorDebugResult>;
  close(): Promise<void>;
}

export interface RunControl {
  isPaused(): boolean;
  pause(): void;
  resume(): void;
  waitWhilePaused(): Promise<void>;
}

export interface RunRuntime {
  browser?: BrowserAutomationSession;
  activeBrowserProfileId?: string;
  defaultBrowserProfileId?: string;
  stageProfileIds?: Partial<Record<StageName, string>>;
  availableProfileIds?: string[];
  rotationMode?: 'manual' | 'round-robin';
  applyBrowserProfileById?: (profileId: string) => void | Promise<void>;
  referenceUploaded: boolean;
  useMock: boolean;
  control?: RunControl;
}

export interface RunHistoryEntry {
  stage: StageName;
  status: StageStatus;
  message: string;
  createdAt: string;
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

export interface RunOptions {
  topic: string;
  provider: string;
  referencePath?: string;
  runId?: string;
  startFromStage?: StageName;
  retryFromRunId?: string;
  resumeExistingRun?: boolean;
  launchProfileId?: string;
  defaultBrowserProfileId?: string;
  stageProfileIds?: Partial<Record<StageName, string>>;
  availableProfileIds?: string[];
  rotationMode?: 'manual' | 'round-robin';
  applyBrowserProfileById?: (profileId: string) => void | Promise<void>;
  control?: RunControl;
}

export interface RunContext {
  runDir: string;
  manifestPath: string;
  manifest: RunManifest;
  runtime: RunRuntime;
}
