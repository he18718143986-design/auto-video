import { describe, it, expect } from 'vitest';
import { resolveProfileIdForStage } from './pipeline.js';
import type { RunContext, StageName } from './types.js';

function makeCtx(overrides: Partial<RunContext['runtime']> = {}, manifestOverrides: Partial<RunContext['manifest']> = {}): RunContext {
  return {
    runDir: '/tmp/test-run',
    manifestPath: '/tmp/test-run/run.json',
    manifest: {
      id: 'test-run',
      status: 'running',
      currentStage: null,
      provider: 'fallback-provider',
      referenceVideoPath: '',
      topic: 'test',
      artifacts: {},
      requiresHuman: false,
      handoff: { confirmationNote: '', checklist: [], updatedAt: '' },
      history: [],
      createdAt: '',
      updatedAt: '',
      ...manifestOverrides,
    },
    runtime: {
      referenceUploaded: false,
      useMock: true,
      ...overrides,
    },
  };
}

describe('resolveProfileIdForStage', () => {
  it('uses explicit stageProfileIds when set', () => {
    const ctx = makeCtx({
      stageProfileIds: { research: 'gemini' },
      defaultBrowserProfileId: 'chatgpt',
    });
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('gemini');
  });

  it('falls back to defaultBrowserProfileId in manual mode', () => {
    const ctx = makeCtx({
      stageProfileIds: {},
      defaultBrowserProfileId: 'chatgpt',
      rotationMode: 'manual',
    });
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('chatgpt');
  });

  it('falls back to provider when no default set', () => {
    const ctx = makeCtx({}, { provider: 'test-provider' });
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('test-provider');
  });

  it('distributes stages across profiles in round-robin mode', () => {
    const profiles = ['chatgpt', 'gemini', 'claude'];
    const ctx = makeCtx({
      rotationMode: 'round-robin',
      availableProfileIds: profiles,
      defaultBrowserProfileId: 'chatgpt',
    });

    // STAGE_SEQUENCE indices: session_preparation=0, capability_assessment=1, style_dna=2,
    // research=3, narrative_map=4, script=5, qa=6, storyboard=7, asset_generation=8, ...
    expect(resolveProfileIdForStage(ctx, 'session_preparation')).toBe('chatgpt');  // 0 % 3 = 0
    expect(resolveProfileIdForStage(ctx, 'capability_assessment')).toBe('gemini');  // 1 % 3 = 1
    expect(resolveProfileIdForStage(ctx, 'style_dna')).toBe('claude');              // 2 % 3 = 2
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('chatgpt');              // 3 % 3 = 0
    expect(resolveProfileIdForStage(ctx, 'narrative_map')).toBe('gemini');           // 4 % 3 = 1
    expect(resolveProfileIdForStage(ctx, 'script')).toBe('claude');                  // 5 % 3 = 2
  });

  it('falls back to default with only one profile in round-robin', () => {
    const ctx = makeCtx({
      rotationMode: 'round-robin',
      availableProfileIds: ['chatgpt'],
      defaultBrowserProfileId: 'chatgpt',
    });
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('chatgpt');
  });

  it('explicit mapping overrides round-robin', () => {
    const ctx = makeCtx({
      rotationMode: 'round-robin',
      availableProfileIds: ['chatgpt', 'gemini'],
      stageProfileIds: { research: 'claude' },
      defaultBrowserProfileId: 'chatgpt',
    });
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('claude');
  });

  it('round-robin wraps around with 2 profiles', () => {
    const profiles = ['chatgpt', 'gemini'];
    const ctx = makeCtx({
      rotationMode: 'round-robin',
      availableProfileIds: profiles,
      defaultBrowserProfileId: 'chatgpt',
    });

    // Index 0 -> chatgpt, 1 -> gemini, 2 -> chatgpt, 3 -> gemini, etc.
    expect(resolveProfileIdForStage(ctx, 'session_preparation')).toBe('chatgpt');  // 0 % 2 = 0
    expect(resolveProfileIdForStage(ctx, 'capability_assessment')).toBe('gemini');  // 1 % 2 = 1
    expect(resolveProfileIdForStage(ctx, 'style_dna')).toBe('chatgpt');              // 2 % 2 = 0
    expect(resolveProfileIdForStage(ctx, 'research')).toBe('gemini');                // 3 % 2 = 1
  });
});
