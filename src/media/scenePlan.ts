import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileExists } from '../utils/fs.js';

interface StoryboardSceneRow {
  sceneIndex?: number;
  visualPrompt?: string;
  voiceover?: string;
  estimatedDurationSec?: number;
  durationSec?: number;
}

interface ScriptSceneRow {
  sceneIndex?: number;
  voiceover?: string;
}

interface NarrativeSceneRow {
  sceneIndex?: number;
  voiceoverDraft?: string;
}

export interface ScenePlan {
  sceneIndex: number;
  visualPrompt: string;
  narration: string;
  durationSec: number;
}

export async function loadScenePlan(runDir: string, topic: string): Promise<ScenePlan[]> {
  const storyboardPath = path.join(runDir, 'outputs', 'storyboard.json');
  const scriptPath = path.join(runDir, 'outputs', 'script.json');
  const narrativePath = path.join(runDir, 'outputs', 'narrative_map.json');

  const [storyboardRows, scriptMap, narrativeMap] = await Promise.all([
    loadStoryboardRows(storyboardPath),
    loadScriptVoiceMap(scriptPath),
    loadNarrativeVoiceMap(narrativePath),
  ]);

  const storyboardByIndex = new Map<number, StoryboardSceneRow>();
  for (const row of storyboardRows) {
    const index = normalizeSceneIndex(row.sceneIndex);
    storyboardByIndex.set(index, row);
  }

  const indices = new Set<number>();
  for (const index of storyboardByIndex.keys()) indices.add(index);
  for (const index of scriptMap.keys()) indices.add(index);
  for (const index of narrativeMap.keys()) indices.add(index);
  if (indices.size === 0) indices.add(1);

  return [...indices]
    .sort((a, b) => a - b)
    .map((sceneIndex) => {
      const storyboard = storyboardByIndex.get(sceneIndex);
      const visualPrompt = nonEmpty(storyboard?.visualPrompt)
        || `Cinematic educational still image about ${topic}, scene ${sceneIndex}`;
      const narration = scriptMap.get(sceneIndex)
        || narrativeMap.get(sceneIndex)
        || nonEmpty(storyboard?.voiceover)
        || `Scene ${sceneIndex}. ${topic}`;
      const durationFromStoryboard = normalizeDuration(storyboard?.estimatedDurationSec)
        ?? normalizeDuration(storyboard?.durationSec);
      const durationSec = durationFromStoryboard ?? estimateDurationSec(narration);

      return {
        sceneIndex,
        visualPrompt,
        narration,
        durationSec,
      };
    });
}

function normalizeSceneIndex(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.round(value);
}

function normalizeDuration(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0) return undefined;
  return Math.max(2, Math.min(60, value));
}

function estimateDurationSec(text: string): number {
  const words = text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
  const seconds = words > 0 ? words / 2.6 : 4;
  return Math.max(3, Math.min(18, Number(seconds.toFixed(2))));
}

async function loadStoryboardRows(filePath: string): Promise<StoryboardSceneRow[]> {
  const raw = await readJsonFile(filePath);
  if (!isRecord(raw) || !Array.isArray(raw.scenes)) return [];
  return raw.scenes
    .filter(isRecord)
    .map((row) => ({
      sceneIndex: asNumber(row.sceneIndex),
      visualPrompt: asString(row.visualPrompt),
      voiceover: asString(row.voiceover),
      estimatedDurationSec: asNumber(row.estimatedDurationSec),
      durationSec: asNumber(row.durationSec),
    }));
}

async function loadScriptVoiceMap(filePath: string): Promise<Map<number, string>> {
  const raw = await readJsonFile(filePath);
  if (!isRecord(raw) || !Array.isArray(raw.scenes)) return new Map();
  const rows = raw.scenes.filter(isRecord).map((row) => ({
    sceneIndex: normalizeSceneIndex(asNumber(row.sceneIndex)),
    voiceover: nonEmpty(asString(row.voiceover)),
  })) as ScriptSceneRow[];

  const map = new Map<number, string>();
  for (const row of rows) {
    const text = nonEmpty(row.voiceover);
    if (!text) continue;
    map.set(row.sceneIndex ?? 1, text);
  }
  return map;
}

async function loadNarrativeVoiceMap(filePath: string): Promise<Map<number, string>> {
  const raw = await readJsonFile(filePath);
  if (!isRecord(raw) || !Array.isArray(raw.scenes)) return new Map();
  const rows = raw.scenes.filter(isRecord).map((row) => ({
    sceneIndex: normalizeSceneIndex(asNumber(row.sceneIndex)),
    voiceoverDraft: nonEmpty(asString(row.voiceoverDraft)),
  })) as NarrativeSceneRow[];

  const map = new Map<number, string>();
  for (const row of rows) {
    const text = nonEmpty(row.voiceoverDraft);
    if (!text) continue;
    map.set(row.sceneIndex ?? 1, text);
  }
  return map;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  if (!(await fileExists(filePath))) return null;
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
