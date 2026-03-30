import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileExists } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';
import type { RunManifest } from './types.js';

const RUNS_DIR = path.join(process.cwd(), 'runs');

export async function listRuns(): Promise<RunManifest[]> {
  if (!(await fileExists(RUNS_DIR))) {
    return [];
  }

  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
  const manifests: RunManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await loadRunManifest(entry.name);
    if (manifest) manifests.push(manifest);
  }

  manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return manifests;
}

export async function countTodayRuns(): Promise<number> {
  const all = await listRuns();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  return all.filter(
    (m) => m.createdAt >= todayIso && (m.status === 'completed' || m.status === 'running'),
  ).length;
}

export async function loadRunManifest(runId: string): Promise<RunManifest | null> {
  const manifestPath = path.join(RUNS_DIR, runId, 'run.json');
  if (!(await fileExists(manifestPath))) {
    return null;
  }

  const raw = await fs.readFile(manifestPath, 'utf8');
  return normalizeManifest(JSON.parse(raw) as RunManifest);
}

export async function loadRunDetails(runId: string): Promise<{
  manifest: RunManifest;
  textArtifacts: Record<string, string>;
  screenshots: string[];
  mediaFiles: string[];
}> {
  const manifest = await loadRunManifest(runId);
  if (!manifest) {
    throw new Error(`Run not found: ${runId}`);
  }

  const runDir = path.join(RUNS_DIR, runId);
  const textArtifacts = await collectTextArtifacts(runDir);
  const screenshots = await collectFilesRecursive(path.join(runDir, 'screenshots'), runDir);
  const mediaFiles = await collectFilesFromRoots(
    [path.join(runDir, 'final'), path.join(runDir, 'media')],
    runDir
  );

  return { manifest, textArtifacts, screenshots, mediaFiles };
}

async function collectTextArtifacts(runDir: string): Promise<Record<string, string>> {
  const artifactFiles = [
    'outputs/session_preparation.json',
    'outputs/capability_assessment.txt',
    'outputs/capability_assessment.json',
    'outputs/style_dna.raw.txt',
    'outputs/style_dna.json',
    'outputs/research.raw.txt',
    'outputs/research.json',
    'outputs/narrative_map.raw.txt',
    'outputs/narrative_map.json',
    'outputs/script.raw.txt',
    'outputs/script.json',
    'outputs/qa.raw.txt',
    'outputs/qa.json',
    'outputs/storyboard.raw.txt',
    'outputs/storyboard.json',
    'outputs/asset_generation.json',
    'outputs/video_generation_log.json',
    'outputs/tts_manifest.json',
    'final/render_manifest.json',
    'final/subtitles.srt',
  ];

  const result: Record<string, string> = {};

  for (const relativePath of artifactFiles) {
    const absolutePath = path.join(runDir, relativePath);
    if (!(await fileExists(absolutePath))) continue;
    result[relativePath] = await fs.readFile(absolutePath, 'utf8');
  }

  return result;
}

async function collectFilesFromRoots(targetDirs: string[], runDir: string): Promise<string[]> {
  const records = await Promise.all(targetDirs.map((targetDir) => collectFilesRecursive(targetDir, runDir)));
  const merged = records.flat();
  return [...new Set(merged)];
}

async function collectFilesRecursive(targetDir: string, runDir: string): Promise<string[]> {
  if (!(await fileExists(targetDir))) return [];
  const records: Array<{ filePath: string; mtimeMs: number }> = [];
  await walkDirectory(targetDir, runDir, records);
  records.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return records.map((record) => record.filePath);
}

function normalizeManifest(manifest: RunManifest): RunManifest {
  const handoff = manifest.handoff || {
    confirmationNote: '',
    checklist: [],
    updatedAt: nowIso(),
  };
  const routing = manifest.routing || {
    launchProfileId: undefined,
    stageProfileIds: {},
  };
  return {
    ...manifest,
    handoff,
    routing,
  };
}

async function walkDirectory(
  targetDir: string,
  runDir: string,
  records: Array<{ filePath: string; mtimeMs: number }>
): Promise<void> {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(absolutePath, runDir, records);
      continue;
    }
    if (!entry.isFile()) continue;
    const stats = await fs.stat(absolutePath);
    records.push({
      filePath: path.relative(runDir, absolutePath).replaceAll(path.sep, '/'),
      mtimeMs: stats.mtimeMs,
    });
  }
}
