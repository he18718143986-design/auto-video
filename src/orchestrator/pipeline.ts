import path from 'node:path';
import { cp, readFile } from 'node:fs/promises';
import { createPlaywrightAutomationSession } from '../browser/playwrightAutomation.js';
import { checkBrowserSession } from '../browser/session.js';
import { extractFirstJsonBlock } from '../extractors/parsers.js';
import { generateKeyframeImage } from '../media/keyframe.js';
import { loadScenePlan } from '../media/scenePlan.js';
import { synthesizeSpeechToMp3 } from '../media/tts.js';
import { renderFinalVideo } from '../render/ffmpeg.js';
import { validateNarrativeMap, validateResearch, validateScript, validateStoryboard, validateStyleDna } from '../validators/schemas.js';
import { copyIfExists, ensureDir, fileExists, writeJson, writeText } from '../utils/fs.js';
import { sleep } from '../utils/time.js';
import { createRunContext, finalizeRun, loadRunContext, markStage, pauseRun, resumeRun, setArtifact } from './runStore.js';
import type { RunArtifacts, RunContext, RunOptions, SessionHealth, StageName } from './types.js';
import { STAGE_SEQUENCE } from './types.js';

type StageFn = (ctx: RunContext) => Promise<void>;

class NeedsHumanError extends Error {}

const STAGE_FLOW: Array<{ stage: StageName; fn: StageFn }> = [
  { stage: 'session_preparation', fn: sessionPreparationStage },
  { stage: 'capability_assessment', fn: capabilityAssessmentStage },
  { stage: 'style_dna', fn: styleDnaStage },
  { stage: 'research', fn: researchStage },
  { stage: 'narrative_map', fn: narrativeMapStage },
  { stage: 'script', fn: scriptStage },
  { stage: 'qa', fn: qaStage },
  { stage: 'storyboard', fn: storyboardStage },
  { stage: 'asset_generation', fn: assetGenerationStage },
  { stage: 'scene_video_generation', fn: sceneVideoGenerationStage },
  { stage: 'tts', fn: ttsStage },
  { stage: 'render', fn: renderStage },
];

const REUSABLE_STAGE_ARTIFACTS: Partial<Record<StageName, { key: keyof RunArtifacts; relativePath: string }>> = {
  capability_assessment: { key: 'capabilityAssessment', relativePath: 'outputs/capability_assessment.json' },
  style_dna: { key: 'styleDna', relativePath: 'outputs/style_dna.json' },
  research: { key: 'research', relativePath: 'outputs/research.json' },
  narrative_map: { key: 'narrativeMap', relativePath: 'outputs/narrative_map.json' },
  script: { key: 'script', relativePath: 'outputs/script.json' },
  qa: { key: 'qa', relativePath: 'outputs/qa.json' },
  storyboard: { key: 'storyboard', relativePath: 'outputs/storyboard.json' },
  render: { key: 'finalVideo', relativePath: 'final/final_video.mp4' },
};

const PROMPT_CONTEXT_SOURCES: Partial<Record<StageName, Array<keyof RunArtifacts>>> = {
  style_dna: ['capabilityAssessment'],
  research: ['capabilityAssessment', 'styleDna'],
  narrative_map: ['styleDna', 'research'],
  script: ['styleDna', 'research', 'narrativeMap'],
  qa: ['styleDna', 'research', 'narrativeMap', 'script'],
  storyboard: ['styleDna', 'research', 'narrativeMap', 'script', 'qa'],
};

const ARTIFACT_LABELS: Record<keyof RunArtifacts, string> = {
  capabilityAssessment: 'Capability Assessment',
  styleDna: 'Style DNA',
  research: 'Research',
  narrativeMap: 'Narrative Map',
  script: 'Script',
  qa: 'QA Audit',
  storyboard: 'Storyboard',
  finalVideo: 'Final Video',
};

export async function runPipeline(options: RunOptions): Promise<string> {
  const baseRunsDir = path.join(process.cwd(), 'runs');
  const startStage = options.startFromStage || 'session_preparation';
  const startIndex = STAGE_FLOW.findIndex((item) => item.stage === startStage);
  if (startIndex < 0) {
    throw new Error(`Unknown retry stage: ${startStage}`);
  }
  if (startIndex > 0 && !options.retryFromRunId && !options.resumeExistingRun) {
    throw new Error('retryFromRunId is required when starting from a non-initial stage.');
  }
  if (options.retryFromRunId && options.resumeExistingRun) {
    throw new Error('retryFromRunId and resumeExistingRun cannot be combined.');
  }

  const ctx = options.resumeExistingRun
    ? await loadRunContext(baseRunsDir, options)
    : await createRunContext(baseRunsDir, options);
  await bootstrapRunLayout(ctx.runDir);
  if (!options.resumeExistingRun) {
    await ingestReferenceFile(ctx, options.referencePath);
  } else if (options.referencePath) {
    ctx.manifest.referenceVideoPath = options.referencePath;
  }
  if (options.retryFromRunId && !options.resumeExistingRun) {
    await hydrateFromRetrySource(ctx, options.retryFromRunId);
  }
  if (options.resumeExistingRun) {
    await markStage(ctx, startStage, 'resumed', `Run resumed after manual confirmation at stage: ${startStage}`);
  }

  try {
    for (let index = 0; index < STAGE_FLOW.length; index += 1) {
      const stageDef = STAGE_FLOW[index];
      if (index < startIndex) {
        if (options.retryFromRunId) {
          await markStage(
            ctx,
            stageDef.stage,
            'skipped',
            `Stage reused from retry source run: ${options.retryFromRunId}`
          );
          await restoreReusableArtifact(ctx, stageDef.stage);
        }
        continue;
      }
      await runStage(ctx, stageDef.stage, stageDef.fn);
    }
    await finalizeRun(ctx, 'completed');
    return ctx.runDir;
  } catch (error) {
    if (error instanceof NeedsHumanError) {
      await finalizeRun(ctx, 'needs_human');
      return ctx.runDir;
    }
    await finalizeRun(ctx, 'failed');
    throw error;
  } finally {
    if (ctx.runtime.browser) {
      await ctx.runtime.browser.close().catch(() => undefined);
      ctx.runtime.browser = undefined;
    }
  }
}

async function bootstrapRunLayout(runDir: string): Promise<void> {
  await Promise.all([
    ensureDir(path.join(runDir, 'inputs')),
    ensureDir(path.join(runDir, 'outputs')),
    ensureDir(path.join(runDir, 'media', 'scenes')),
    ensureDir(path.join(runDir, 'logs')),
    ensureDir(path.join(runDir, 'screenshots')),
  ]);
}

async function ingestReferenceFile(ctx: RunContext, referencePath?: string): Promise<void> {
  const inputsDir = path.join(ctx.runDir, 'inputs');
  const destination = path.join(inputsDir, 'reference_input');

  if (referencePath) {
    const copied = await copyIfExists(referencePath, destination);
    if (copied) {
      ctx.manifest.referenceVideoPath = destination;
      return;
    }
  }

  const placeholderPath = path.join(inputsDir, 'reference_input.placeholder.txt');
  await writeText(
    placeholderPath,
    'No reference file was provided. This run uses placeholder input in mock mode.\n'
  );
  ctx.manifest.referenceVideoPath = placeholderPath;
}

async function runStage(ctx: RunContext, stage: StageName, fn: StageFn): Promise<void> {
  await waitForRunResume(ctx, stage);
  await markStage(ctx, stage, 'started', `Stage started: ${stage}`);
  try {
    await fn(ctx);
    await waitForRunResume(ctx, stage);
    await markStage(ctx, stage, 'completed', `Stage completed: ${stage}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof NeedsHumanError) {
      await markStage(ctx, stage, 'needs_human', `Stage paused for manual action: ${message}`);
      throw error;
    }
    await markStage(ctx, stage, 'failed', `Stage failed: ${message}`);
    throw error;
  }
}

async function waitForRunResume(ctx: RunContext, stage: StageName): Promise<void> {
  const control = ctx.runtime.control;
  if (!control?.isPaused()) return;
  await pauseRun(ctx, stage, `Run paused by operator at stage: ${stage}`);
  await control.waitWhilePaused();
  await resumeRun(ctx, stage, `Run resumed by operator at stage: ${stage}`);
}

async function hydrateFromRetrySource(ctx: RunContext, retryFromRunId: string): Promise<void> {
  const sourceDir = path.join(process.cwd(), 'runs', retryFromRunId);
  if (!(await fileExists(sourceDir))) {
    throw new Error(`Retry source run does not exist: ${retryFromRunId}`);
  }

  const copyTargets = ['outputs', 'media', 'final', 'screenshots'] as const;
  for (const folderName of copyTargets) {
    const sourcePath = path.join(sourceDir, folderName);
    if (!(await fileExists(sourcePath))) continue;
    const destinationPath = path.join(ctx.runDir, folderName);
    await cp(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
  }
}

async function restoreReusableArtifact(ctx: RunContext, stage: StageName): Promise<void> {
  const artifact = REUSABLE_STAGE_ARTIFACTS[stage];
  if (!artifact) return;
  const absolutePath = path.join(ctx.runDir, artifact.relativePath);
  if (!(await fileExists(absolutePath))) return;
  await setArtifact(ctx, artifact.key, artifact.relativePath);
}

async function sessionPreparationStage(ctx: RunContext): Promise<void> {
  const outputPath = path.join(ctx.runDir, 'outputs', 'session_preparation.json');

  if (ctx.runtime.useMock) {
    const session = await checkBrowserSession(ctx.manifest.provider);
    await writeJson(outputPath, { ...session, mode: 'mock' });
    await sleep(80);
    return;
  }

  const session = await ensureBrowserSessionForStage(ctx, 'session_preparation');
  await writeJson(outputPath, {
    ...session,
    mode: 'playwright',
    profileId: ctx.runtime.activeBrowserProfileId || ctx.runtime.defaultBrowserProfileId || ctx.manifest.provider,
  });
}

async function capabilityAssessmentStage(ctx: RunContext): Promise<void> {
  const textPath = path.join(ctx.runDir, 'outputs', 'capability_assessment.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'capability_assessment.json');

  if (ctx.runtime.useMock) {
    const mockText = [
      '# Capability Assessment',
      '',
      '- script pipeline: confident on tone, language, wpm',
      '- visual pipeline: confident on rendering style, palette, camera motion',
      '- audio pipeline: inferred on music mood and sfx style',
    ].join('\n');

    const mockJson = {
      scriptFields: ['tone', 'language', 'wordsPerMinute'],
      visualFields: ['renderingStyle', 'palette', 'cameraMotionPatterns'],
      audioFields: ['musicMood', 'sfxStyle'],
      hasVoiceAudio: true,
      mode: 'mock',
    };

    await writeText(textPath, `${mockText}\n`);
    await writeJson(jsonPath, mockJson);
    await setArtifact(ctx, 'capabilityAssessment', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'capability_assessment',
    promptFile: 'capability-assessment.md',
    rawOutputPath: textPath,
    requireStrictJson: false,
  });

  const parsed = tryParseJson(rawText) ?? {
    scriptFields: inferFields(rawText, ['tone', 'language', 'wordsPerMinute', 'narrativeStructure']),
    visualFields: inferFields(rawText, ['renderingStyle', 'palette', 'cameraMotionPatterns']),
    audioFields: inferFields(rawText, ['musicMood', 'sfxStyle', 'voicePacing']),
    hasVoiceAudio: true,
    rawText,
  };

  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'capabilityAssessment', relativeToRun(ctx.runDir, jsonPath));
}

async function styleDnaStage(ctx: RunContext): Promise<void> {
  const rawPath = path.join(ctx.runDir, 'outputs', 'style_dna.raw.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'style_dna.json');

  if (ctx.runtime.useMock) {
    const payload = {
      scriptPipeline: {
        tone: 'engaging educational',
        vocabularyLevel: 'intermediate',
        metaphorDensity: 'medium',
        wordsPerMinute: 150,
        narrativeStructure: ['hook', 'question', 'mechanism', 'summary'],
      },
      visualPipeline: {
        renderingStyle: 'clean 3d explanatory',
        palette: ['#2A9D8F', '#264653', '#E9C46A'],
        cameraMotionPatterns: ['slow push-in', 'static wide'],
      },
      audioPipeline: {
        musicMood: 'curious and focused',
        voicePacing: 1.0,
      },
    };

    const rawText = `Model output:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
    await writeText(rawPath, rawText);
    const parsed = extractFirstJsonBlock(rawText);
    validateStyleDna(parsed);
    await writeJson(jsonPath, parsed);
    await setArtifact(ctx, 'styleDna', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'style_dna',
    promptFile: 'style-dna.md',
    rawOutputPath: rawPath,
    requireStrictJson: true,
    uploadReference: shouldUploadReference(ctx),
  });

  const parsed = extractFirstJsonBlock(rawText);
  validateStyleDna(parsed);
  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'styleDna', relativeToRun(ctx.runDir, jsonPath));
}

async function researchStage(ctx: RunContext): Promise<void> {
  const rawPath = path.join(ctx.runDir, 'outputs', 'research.raw.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'research.json');

  if (ctx.runtime.useMock) {
    const research = {
      topic: ctx.manifest.topic,
      facts: [
        { id: 'f1', text: 'Kidneys filter blood and remove waste.' },
        { id: 'f2', text: 'Nephrons are the functional filtering units.' },
      ],
      misconceptions: [
        { id: 'm1', myth: 'Kidneys only remove water.', correction: 'They balance electrolytes and pH too.' },
      ],
      terms: [
        { id: 't1', term: 'Nephron', definition: 'Microscopic kidney filtration unit.' },
      ],
      analogies: [
        { id: 'a1', analogy: 'Like a water treatment plant for blood.' },
      ],
    };

    await writeText(rawPath, `Research completed for topic: ${ctx.manifest.topic}\n`);
    validateResearch(research);
    await writeJson(jsonPath, research);
    await setArtifact(ctx, 'research', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'research',
    promptFile: 'research.md',
    rawOutputPath: rawPath,
    requireStrictJson: true,
  });
  const parsed = extractFirstJsonBlock(rawText);
  validateResearch(parsed);
  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'research', relativeToRun(ctx.runDir, jsonPath));
}

async function narrativeMapStage(ctx: RunContext): Promise<void> {
  const rawPath = path.join(ctx.runDir, 'outputs', 'narrative_map.raw.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'narrative_map.json');

  if (ctx.runtime.useMock) {
    const narrativeMap = {
      scenes: [
        { sceneIndex: 1, beat: 'hook', voiceoverDraft: 'What keeps your blood clean every minute?' },
        { sceneIndex: 2, beat: 'mechanism', voiceoverDraft: 'Nephrons filter and rebalance vital fluids.' },
        { sceneIndex: 3, beat: 'takeaway', voiceoverDraft: 'Healthy kidneys keep your whole body stable.' },
      ],
    };

    await writeText(rawPath, 'Narrative map drafted from research + style DNA.\n');
    await writeJson(jsonPath, narrativeMap);
    await setArtifact(ctx, 'narrativeMap', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'narrative_map',
    promptFile: 'narrative-map.md',
    rawOutputPath: rawPath,
    requireStrictJson: true,
  });
  const parsed = extractFirstJsonBlock(rawText);
  validateNarrativeMap(parsed);
  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'narrativeMap', relativeToRun(ctx.runDir, jsonPath));
}

async function scriptStage(ctx: RunContext): Promise<void> {
  const rawPath = path.join(ctx.runDir, 'outputs', 'script.raw.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'script.json');

  if (ctx.runtime.useMock) {
    const script = {
      scenes: [
        { sceneIndex: 1, voiceover: 'Your kidneys quietly clean your blood all day long.' },
        { sceneIndex: 2, voiceover: 'Inside each kidney, nephrons filter waste and keep balance.' },
        { sceneIndex: 3, voiceover: 'When kidneys work well, your whole system runs smoother.' },
      ],
    };

    await writeText(rawPath, 'Script expansion complete.\n');
    await writeJson(jsonPath, script);
    await setArtifact(ctx, 'script', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'script',
    promptFile: 'script.md',
    rawOutputPath: rawPath,
    requireStrictJson: true,
  });
  const parsed = extractFirstJsonBlock(rawText);
  validateScript(parsed);
  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'script', relativeToRun(ctx.runDir, jsonPath));
}

async function qaStage(ctx: RunContext): Promise<void> {
  const rawPath = path.join(ctx.runDir, 'outputs', 'qa.raw.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'qa.json');

  if (ctx.runtime.useMock) {
    const qa = {
      qualityPass: true,
      safetyPass: true,
      issues: [],
    };

    await writeText(rawPath, 'QA passed in mock mode.\n');
    await writeJson(jsonPath, qa);
    await setArtifact(ctx, 'qa', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'qa',
    promptFile: 'qa.md',
    rawOutputPath: rawPath,
    requireStrictJson: true,
  });
  const parsed = extractFirstJsonBlock(rawText);
  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'qa', relativeToRun(ctx.runDir, jsonPath));
}

async function storyboardStage(ctx: RunContext): Promise<void> {
  const rawPath = path.join(ctx.runDir, 'outputs', 'storyboard.raw.txt');
  const jsonPath = path.join(ctx.runDir, 'outputs', 'storyboard.json');

  if (ctx.runtime.useMock) {
    const storyboard = {
      scenes: [
        { sceneIndex: 1, visualPrompt: '3d kidney close-up with labels', cameraMotion: 'slow push-in' },
        { sceneIndex: 2, visualPrompt: 'nephron filtration animation', cameraMotion: 'orbital' },
        { sceneIndex: 3, visualPrompt: 'healthy body systems overview', cameraMotion: 'static wide' },
      ],
    };

    await writeText(rawPath, 'Storyboard generated.\n');
    validateStoryboard(storyboard);
    await writeJson(jsonPath, storyboard);
    await setArtifact(ctx, 'storyboard', relativeToRun(ctx.runDir, jsonPath));
    await sleep(80);
    return;
  }

  const rawText = await runBrowserPrompt(ctx, {
    stage: 'storyboard',
    promptFile: 'storyboard.md',
    rawOutputPath: rawPath,
    requireStrictJson: true,
  });
  const parsed = extractFirstJsonBlock(rawText);
  validateStoryboard(parsed);
  await writeJson(jsonPath, parsed);
  await setArtifact(ctx, 'storyboard', relativeToRun(ctx.runDir, jsonPath));
}

async function assetGenerationStage(ctx: RunContext): Promise<void> {
  const mediaDir = path.join(ctx.runDir, 'media');
  const referenceSheet = path.join(mediaDir, 'reference_sheet.png');
  const scenePlan = await loadScenePlan(ctx.runDir, ctx.manifest.topic);

  if (ctx.runtime.useMock) {
    const mockGenerated = scenePlan.map((scene) => ({
      sceneIndex: scene.sceneIndex,
      keyframe: `media/scenes/${scene.sceneIndex}/keyframe.png`,
      prompt: scene.visualPrompt,
      provider: 'mock',
    }));
    await Promise.all(
      scenePlan.map((scene) => ensureDir(path.join(mediaDir, 'scenes', String(scene.sceneIndex))))
    );
    await writeJson(path.join(ctx.runDir, 'outputs', 'asset_generation.json'), {
      referenceSheet: 'media/reference_sheet.png',
      sceneCount: scenePlan.length,
      generatedKeyframes: mockGenerated,
      mode: 'mock',
    });
    await sleep(80);
    return;
  }

  const generated: Array<{
    sceneIndex: number;
    keyframe: string;
    prompt: string;
    provider: string;
  }> = [];

  for (const scene of scenePlan) {
    const sceneDir = path.join(mediaDir, 'scenes', String(scene.sceneIndex));
    await ensureDir(sceneDir);
    const keyframePath = path.join(sceneDir, 'keyframe.png');
    const result = await generateKeyframeImage({
      prompt: scene.visualPrompt,
      outputPath: keyframePath,
      sceneIndex: scene.sceneIndex,
      topic: ctx.manifest.topic,
    });

    generated.push({
      sceneIndex: scene.sceneIndex,
      keyframe: relativeToRun(ctx.runDir, keyframePath),
      prompt: scene.visualPrompt,
      provider: result.provider,
    });
  }

  const fallbackCount = generated.filter((item) => item.provider.startsWith('ffmpeg_fallback')).length;

  if (generated[0]) {
    const firstFramePath = path.join(ctx.runDir, generated[0].keyframe);
    await cp(firstFramePath, referenceSheet, { force: true });
  } else {
    const fallback = await generateKeyframeImage({
      prompt: `Cover image for ${ctx.manifest.topic}`,
      outputPath: referenceSheet,
      sceneIndex: 1,
      topic: ctx.manifest.topic,
    });
    generated.push({
      sceneIndex: 1,
      keyframe: relativeToRun(ctx.runDir, referenceSheet),
      prompt: `Cover image for ${ctx.manifest.topic}`,
      provider: fallback.provider,
    });
  }

  await writeJson(path.join(ctx.runDir, 'outputs', 'asset_generation.json'), {
    referenceSheet: relativeToRun(ctx.runDir, referenceSheet),
    sceneCount: scenePlan.length,
    generatedKeyframes: generated,
    mode: fallbackCount > 0 ? 'keyframe_generation_with_fallback' : 'real_keyframe_generation',
  });
  await sleep(80);
}

async function sceneVideoGenerationStage(ctx: RunContext): Promise<void> {
  const scenePlan = await loadScenePlan(ctx.runDir, ctx.manifest.topic);
  const deferred = [];
  for (const scene of scenePlan) {
    const sceneDir = path.join(ctx.runDir, 'media', 'scenes', String(scene.sceneIndex));
    const keyframePath = path.join(sceneDir, 'keyframe.png');
    deferred.push({
      sceneIndex: scene.sceneIndex,
      keyframe: relativeToRun(ctx.runDir, keyframePath),
      expectedVoice: relativeToRun(ctx.runDir, path.join(sceneDir, 'voice.mp3')),
      strategy: 'defer_to_render_static_image_plus_voice',
      durationSec: scene.durationSec,
    });
  }
  await writeJson(path.join(ctx.runDir, 'outputs', 'video_generation_log.json'), {
    generatedVideos: [],
    deferred,
    mode: 'simplified_static_image_pipeline',
  });
  await sleep(80);
}

async function ttsStage(ctx: RunContext): Promise<void> {
  const scenePlan = await loadScenePlan(ctx.runDir, ctx.manifest.topic);

  if (ctx.runtime.useMock) {
    const mockGenerated = scenePlan.map((scene) => ({
      sceneIndex: scene.sceneIndex,
      voicePath: `media/scenes/${scene.sceneIndex}/voice.mp3`,
      voiceText: scene.narration,
      provider: 'mock',
      voice: 'mock',
    }));
    await writeJson(path.join(ctx.runDir, 'outputs', 'tts_manifest.json'), {
      generatedAudio: mockGenerated,
      mode: 'mock',
    });
    await sleep(80);
    return;
  }

  const generated: Array<{
    sceneIndex: number;
    voicePath: string;
    voiceText: string;
    provider: string;
    voice: string;
    model?: string;
  }> = [];

  for (const scene of scenePlan) {
    const sceneDir = path.join(ctx.runDir, 'media', 'scenes', String(scene.sceneIndex));
    await ensureDir(sceneDir);
    const audioPath = path.join(sceneDir, 'voice.mp3');
    const result = await synthesizeSpeechToMp3({
      text: scene.narration,
      outputPath: audioPath,
      sceneIndex: scene.sceneIndex,
    });
    generated.push({
      sceneIndex: scene.sceneIndex,
      voicePath: relativeToRun(ctx.runDir, audioPath),
      voiceText: scene.narration,
      provider: result.provider,
      voice: result.voice,
      model: result.model,
    });
  }

  const usedToneFallback = generated.some((item) => item.provider === 'ffmpeg_tone_fallback');

  await writeJson(path.join(ctx.runDir, 'outputs', 'tts_manifest.json'), {
    generatedAudio: generated,
    mode: usedToneFallback ? 'tts_tone_fallback' : 'real_tts_generation',
  });
  await sleep(80);
}

async function renderStage(ctx: RunContext): Promise<void> {
  if (ctx.runtime.useMock) {
    const finalDir = path.join(ctx.runDir, 'final');
    await ensureDir(finalDir);
    const manifestPath = path.join(finalDir, 'render_manifest.json');
    const placeholderPath = path.join(finalDir, 'final_video.placeholder.txt');
    await writeText(placeholderPath, 'Mock render: video assembly skipped in mock mode.\n');
    await writeJson(manifestPath, {
      mode: 'mock',
      renderedAt: new Date().toISOString(),
      sceneCount: 0,
      notes: 'Mock mode: video assembly skipped. Run without AUTO_VIDEO_USE_MOCK=1 for real rendering.',
    });
    await setArtifact(ctx, 'finalVideo', relativeToRun(ctx.runDir, placeholderPath));
    await sleep(80);
    return;
  }

  const result = await renderFinalVideo(ctx.runDir);
  await setArtifact(ctx, 'finalVideo', relativeToRun(ctx.runDir, result.videoPath));
  await sleep(80);
}

async function runBrowserPrompt(
  ctx: RunContext,
  params: {
    stage: StageName;
    promptFile: string;
    rawOutputPath: string;
    requireStrictJson: boolean;
    uploadReference?: boolean;
  }
): Promise<string> {
  await waitForRunResume(ctx, params.stage);
  await ensureBrowserSessionForStage(ctx, params.stage);
  const browser = ctx.runtime.browser;
  if (!browser) {
    throw new Error('Browser session is not initialized.');
  }
  const promptTemplate = await loadPrompt(params.promptFile);
  const prompt = await buildPromptText(ctx, params.stage, promptTemplate, params.requireStrictJson);
  const uploadPath = params.uploadReference ? getRealReferencePath(ctx) : undefined;
  const screenshotPath = path.join('screenshots', `${params.stage}.png`);
  const result = await browser.runPrompt({
    stage: params.stage,
    prompt,
    uploadPath,
    screenshotPath,
  });
  await waitForRunResume(ctx, params.stage);
  if (uploadPath) {
    ctx.runtime.referenceUploaded = true;
  }

  const decoratedText = `# stage: ${params.stage}\n# response_index: ${result.responseIndex}\n\n${result.text}\n`;
  await writeText(params.rawOutputPath, decoratedText);
  return decoratedText;
}

async function loadPrompt(fileName: string): Promise<string> {
  const filePath = path.join(process.cwd(), 'prompts', fileName);
  return readFile(filePath, 'utf8');
}

async function buildPromptText(
  ctx: RunContext,
  stage: StageName,
  promptTemplate: string,
  requireStrictJson: boolean
): Promise<string> {
  const strict = requireStrictJson
    ? '\n\nReturn only valid JSON. No markdown, no commentary, no code fences.'
    : '\n\nPrefer JSON when possible.';

  const upstreamSections = await loadPromptContextSections(ctx, stage);
  const contextHeader = [
    'Context:',
    `- Topic: ${ctx.manifest.topic}`,
    `- Run ID: ${ctx.manifest.id}`,
    `- Current Stage: ${stage}`,
    '- Use the explicit upstream JSON context below instead of relying on chat memory alone.',
    '- If multiple upstream artifacts overlap, prefer the most recent downstream artifact over earlier planning artifacts.',
  ];

  if (stage === 'style_dna' && getRealReferencePath(ctx)) {
    contextHeader.push('- A reference video file is attached in this turn. Extract style, not subject matter.');
  }

  return [
    promptTemplate.trim(),
    '',
    ...contextHeader,
    ...(upstreamSections.length > 0 ? ['', 'Upstream JSON Context:', ...upstreamSections] : []),
    strict,
  ].join('\n');
}

async function loadPromptContextSections(ctx: RunContext, stage: StageName): Promise<string[]> {
  const artifactKeys = PROMPT_CONTEXT_SOURCES[stage] ?? [];
  const sections: string[] = [];

  for (const key of artifactKeys) {
    const relativePath = ctx.manifest.artifacts[key] || findReusableArtifactPath(key);
    if (!relativePath) continue;

    const absolutePath = path.join(ctx.runDir, relativePath);
    if (!(await fileExists(absolutePath))) continue;

    const raw = await readFile(absolutePath, 'utf8');
    const formatted = formatArtifactForPrompt(relativePath, raw);
    sections.push([
      `BEGIN ${ARTIFACT_LABELS[key]} JSON (${relativePath})`,
      formatted,
      `END ${ARTIFACT_LABELS[key]} JSON`,
    ].join('\n'));
  }

  return sections;
}

function findReusableArtifactPath(key: keyof RunArtifacts): string | undefined {
  for (const artifact of Object.values(REUSABLE_STAGE_ARTIFACTS)) {
    if (artifact?.key === key) return artifact.relativePath;
  }
  return undefined;
}

function formatArtifactForPrompt(relativePath: string, raw: string): string {
  if (!relativePath.endsWith('.json')) {
    return summarizePlainTextForPrompt(raw);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(compactJsonForPrompt(parsed, 0), null, 2);
  } catch {
    return summarizePlainTextForPrompt(raw);
  }
}

function compactJsonForPrompt(value: unknown, depth: number): unknown {
  if (depth >= 6) return '[truncated-depth]';

  if (typeof value === 'string') {
    return value.length > 1200 ? `${value.slice(0, 1200)}... [truncated ${value.length - 1200} chars]` : value;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const kept = value.slice(0, 20).map((item) => compactJsonForPrompt(item, depth + 1));
    if (value.length > 20) {
      kept.push(`[truncated ${value.length - 20} additional items]`);
    }
    return kept;
  }

  const entries = Object.entries(value);
  const limitedEntries = entries.slice(0, 30).map(([key, item]) => [key, compactJsonForPrompt(item, depth + 1)]);
  const compacted = Object.fromEntries(limitedEntries);
  if (entries.length > 30) {
    compacted._truncatedKeys = entries.length - 30;
  }
  return compacted;
}

function summarizePlainTextForPrompt(raw: string): string {
  const normalized = raw.replaceAll(/\s+/g, ' ').trim();
  if (normalized.length <= 2000) return normalized;
  return `${normalized.slice(0, 2000)}... [truncated ${normalized.length - 2000} chars]`;
}

function shouldUploadReference(ctx: RunContext): boolean {
  return !ctx.runtime.referenceUploaded && Boolean(getRealReferencePath(ctx));
}

async function ensureBrowserSessionForStage(ctx: RunContext, stage: StageName): Promise<SessionHealth> {
  const targetProfileId = resolveProfileIdForStage(ctx, stage);
  const currentProfileId = ctx.runtime.activeBrowserProfileId;
  const hasReusableSession = Boolean(ctx.runtime.browser && currentProfileId === targetProfileId);

  if (!hasReusableSession) {
    if (ctx.runtime.browser) {
      await ctx.runtime.browser.close().catch(() => undefined);
      ctx.runtime.browser = undefined;
    }

    if (ctx.runtime.applyBrowserProfileById) {
      await ctx.runtime.applyBrowserProfileById(targetProfileId);
    }

    ctx.runtime.browser = await createPlaywrightAutomationSession({
      provider: targetProfileId,
      runDir: ctx.runDir,
    });
    ctx.runtime.activeBrowserProfileId = targetProfileId;
  }

  const browser = ctx.runtime.browser;
  if (!browser) {
    throw new Error(`Browser session could not be initialized for profile "${targetProfileId}".`);
  }

  const health = await browser.checkSession();
  if (!health.ok || health.needsHuman) {
    throw new NeedsHumanError(
      `Profile "${targetProfileId}" is not ready for stage "${stage}". Complete login/CAPTCHA and continue run.`
    );
  }
  return health;
}

export function resolveProfileIdForStage(ctx: RunContext, stage: StageName): string {
  const mappedId = ctx.runtime.stageProfileIds?.[stage];
  if (mappedId?.trim()) return mappedId;

  if (ctx.runtime.rotationMode === 'round-robin') {
    const profiles = ctx.runtime.availableProfileIds;
    if (profiles && profiles.length > 1) {
      const stageIndex = STAGE_SEQUENCE.indexOf(stage);
      return profiles[stageIndex % profiles.length];
    }
  }

  if (ctx.runtime.defaultBrowserProfileId?.trim()) return ctx.runtime.defaultBrowserProfileId;
  return ctx.manifest.provider;
}

function getRealReferencePath(ctx: RunContext): string | undefined {
  const filePath = ctx.manifest.referenceVideoPath;
  if (!filePath) return undefined;
  if (filePath.endsWith('.placeholder.txt')) return undefined;
  return filePath;
}

function tryParseJson(text: string): unknown | null {
  try {
    return extractFirstJsonBlock(text);
  } catch {
    return null;
  }
}

function inferFields(rawText: string, candidates: string[]): string[] {
  const text = rawText.toLowerCase();
  const found = candidates.filter((item) => text.includes(item.toLowerCase()));
  return found.length > 0 ? found : candidates.slice(0, 2);
}

function relativeToRun(runDir: string, absolutePath: string): string {
  return path.relative(runDir, absolutePath).replaceAll(path.sep, '/');
}
