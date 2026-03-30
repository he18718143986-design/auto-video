import { execFile as execFileCb, execFileSync } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';
import { ensureDir, fileExists, writeJson, writeText } from '../utils/fs.js';

const execFile = promisify(execFileCb);

function resolveBin(name: string): string | undefined {
  try {
    const line = execFileSync('which', [name], { encoding: 'utf8' }).trim();
    return line || undefined;
  } catch {
    return undefined;
  }
}

function configureFfmpegPaths(): void {
  const ffmpegBin = process.env.FFMPEG_PATH ?? resolveBin('ffmpeg');
  const ffprobeBin = process.env.FFPROBE_PATH ?? resolveBin('ffprobe');
  if (ffmpegBin) ffmpeg.setFfmpegPath(ffmpegBin);
  if (ffprobeBin) ffmpeg.setFfprobePath(ffprobeBin);
}

export interface RenderResult {
  videoPath: string;
  subtitlesPath: string;
  manifestPath: string;
}

interface StoryboardSceneRow {
  sceneIndex?: number;
  visualPrompt?: string;
  voiceover?: string;
  estimatedDurationSec?: number;
  durationSec?: number;
  cameraMotion?: string;
}

interface NarrativeSceneRow {
  sceneIndex?: number;
  voiceoverDraft?: string;
}

interface ScriptSceneRow {
  sceneIndex?: number;
  voiceover?: string;
}

async function statSize(filePath: string): Promise<number> {
  try {
    const st = await fs.stat(filePath);
    return st.size;
  } catch {
    return 0;
  }
}

async function isNonEmptyFile(filePath: string): Promise<boolean> {
  return (await statSize(filePath)) > 0;
}

function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

async function safeMediaDuration(filePath: string): Promise<number | null> {
  if (!(await isNonEmptyFile(filePath))) return null;
  try {
    const d = await getMediaDuration(filePath);
    return d > 0 ? d : null;
  } catch {
    return null;
  }
}

async function probeHasAudio(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const audio = metadata.streams?.some((s) => s.codec_type === 'audio');
      resolve(Boolean(audio));
    });
  });
}

function ffmpegMergeVideoAudio(
  videoPath: string,
  audioPath: string | undefined,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg().input(videoPath).inputOptions([`-t ${duration}`]);

    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        ...(audioPath ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
        '-movflags',
        '+faststart',
        `-t ${duration}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function ffmpegLoopVideo(
  videoPath: string,
  audioPath: string | undefined,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg().input(videoPath).inputOptions(['-stream_loop -1', `-t ${duration}`]);

    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        ...(audioPath ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : ['-an']),
        '-movflags',
        '+faststart',
        `-t ${duration}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function ffmpegImageToVideo(
  imagePath: string,
  audioPath: string | undefined,
  duration: number,
  effect: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let zoomFilter: string;
    switch (effect) {
      case 'zoom-out':
        zoomFilter = `zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.001))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
        break;
      default:
        zoomFilter = `zoompan=z='min(zoom+0.001,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
    }

    let cmd = ffmpeg().input(imagePath).inputOptions(['-loop 1']);

    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        '-vf',
        zoomFilter,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        ...(audioPath ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : ['-an']),
        '-movflags',
        '+faststart',
        `-t ${duration}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

async function ffmpegLavfiColor(duration: number, outputPath: string): Promise<void> {
  const t = String(Math.max(duration, 2));
  await execFile(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=#1a1a1a:s=1920x1080:r=25',
      '-t',
      t,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
}

async function ffmpegConcatenate(videoPaths: string[], listPath: string, outputPath: string): Promise<void> {
  const listContent = videoPaths.map((p) => `file '${escapeConcatPath(p)}'`).join('\n');
  await fs.writeFile(listPath, listContent, 'utf8');

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function escapeConcatPath(p: string): string {
  return path.resolve(p).replace(/'/g, `'\\''`);
}

function escapeSubtitlePathForFilter(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').replace(/'/g, "'\\\\\\''");
}

function ffmpegBurnSubtitles(videoPath: string, subtitlePath: string, outputPath: string): Promise<void> {
  const sub = escapeSubtitlePathForFilter(subtitlePath);
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .outputOptions([
        '-vf',
        `subtitles='${sub}':force_style='FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=2,Shadow=1,MarginV=40'`,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function buildSrt(entries: Array<{ durationSec: number; text: string }>): string {
  let cumulative = 0;
  let srtContent = '';
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const startTime = cumulative;
    const endTime = cumulative + entry.durationSec;
    srtContent += `${i + 1}\n`;
    srtContent += `${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}\n`;
    srtContent += `${entry.text}\n\n`;
    cumulative = endTime;
  }
  return srtContent;
}

async function ensureUniformSceneClip(inputPath: string, durationSec: number, outputPath: string): Promise<void> {
  let hasAudio = false;
  try {
    hasAudio = await probeHasAudio(inputPath);
  } catch {
    hasAudio = false;
  }

  if (hasAudio) {
    await execFile('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return;
  }

  const pad = Math.max(durationSec + 2, 3);
  await execFile(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t',
      String(pad),
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
}

async function renderSceneClip(params: {
  workDir: string;
  index: number;
  sceneIndex: number;
  durationHint: number;
  sceneVideoPath: string;
  keyframePath: string;
  voicePath: string;
}): Promise<{ durationSec: number; rawPath: string }> {
  const { workDir, index, durationHint, sceneVideoPath, keyframePath, voicePath } = params;

  let duration = Math.max(2, durationHint);
  const voiceOk = await isNonEmptyFile(voicePath);
  const voiceDur = voiceOk ? await safeMediaDuration(voicePath) : null;
  if (voiceDur !== null) {
    duration = Math.max(2, voiceDur);
  }

  const audioArg = voiceOk ? voicePath : undefined;
  const rawPath = path.join(workDir, `scene_${index}_raw.mp4`);

  const tryVideo = async (): Promise<boolean> => {
    if (!(await isNonEmptyFile(sceneVideoPath))) return false;
    const vd = await safeMediaDuration(sceneVideoPath);
    if (vd === null) return false;
    try {
      if (vd < duration - 0.05) {
        await ffmpegLoopVideo(sceneVideoPath, audioArg, duration, rawPath);
      } else {
        await ffmpegMergeVideoAudio(sceneVideoPath, audioArg, duration, rawPath);
      }
      return true;
    } catch {
      return false;
    }
  };

  const tryImage = async (): Promise<boolean> => {
    if (!(await isNonEmptyFile(keyframePath))) return false;
    try {
      await ffmpegImageToVideo(keyframePath, audioArg, duration, 'zoom-in', rawPath);
      return true;
    } catch {
      return false;
    }
  };

  if (!(await tryVideo()) && !(await tryImage())) {
    await ffmpegLavfiColor(duration, rawPath);
    if (voiceOk) {
      const merged = path.join(workDir, `scene_${index}_color_a.mp4`);
      await ffmpegMergeVideoAudio(rawPath, voicePath, duration, merged);
      await fs.rename(merged, rawPath);
    }
  }

  return { durationSec: duration, rawPath };
}

function captionForScene(
  scene: StoryboardSceneRow,
  voiceByIndex: Map<number, string>,
  scriptByIndex: Map<number, string>
): string {
  const idx = scene.sceneIndex ?? 0;
  const fromNarrative = voiceByIndex.get(idx);
  const fromScript = scriptByIndex.get(idx);
  const text =
    (fromScript && fromScript.trim()) ||
    (typeof scene.voiceover === 'string' && scene.voiceover.trim()) ||
    (fromNarrative && fromNarrative.trim()) ||
    (typeof scene.visualPrompt === 'string' && scene.visualPrompt.trim()) ||
    `Scene ${idx}`;
  return text;
}

function parseStoryboard(raw: unknown): StoryboardSceneRow[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { scenes?: unknown }).scenes)) {
    return [];
  }
  return (raw as { scenes: StoryboardSceneRow[] }).scenes;
}

function parseNarrativeVoiceovers(raw: unknown): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { scenes?: unknown }).scenes)) {
    return map;
  }
  for (const row of (raw as { scenes: NarrativeSceneRow[] }).scenes) {
    const idx = row.sceneIndex;
    if (typeof idx === 'number' && typeof row.voiceoverDraft === 'string') {
      map.set(idx, row.voiceoverDraft);
    }
  }
  return map;
}

function parseScriptVoiceovers(raw: unknown): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { scenes?: unknown }).scenes)) {
    return map;
  }
  for (const row of (raw as { scenes: ScriptSceneRow[] }).scenes) {
    const idx = row.sceneIndex;
    if (typeof idx === 'number' && typeof row.voiceover === 'string') {
      map.set(idx, row.voiceover);
    }
  }
  return map;
}

async function resolveSceneImagePath(sceneDir: string): Promise<string> {
  const candidates = ['keyframe.png', 'keyframe.jpg', 'keyframe.jpeg', 'keyframe.webp'];
  for (const fileName of candidates) {
    const candidate = path.join(sceneDir, fileName);
    if (await isNonEmptyFile(candidate)) {
      return candidate;
    }
  }
  return path.join(sceneDir, 'keyframe.png');
}

export async function renderFinalVideo(runDir: string): Promise<RenderResult> {
  configureFfmpegPaths();

  const finalDir = path.join(runDir, 'final');
  const workDir = path.join(runDir, '.render-work');
  await ensureDir(finalDir);
  await ensureDir(workDir);

  const videoPath = path.join(finalDir, 'final_video.mp4');
  const subtitlesPath = path.join(finalDir, 'subtitles.srt');
  const manifestPath = path.join(finalDir, 'render_manifest.json');

  const storyboardPath = path.join(runDir, 'outputs', 'storyboard.json');
  const narrativePath = path.join(runDir, 'outputs', 'narrative_map.json');
  const scriptPath = path.join(runDir, 'outputs', 'script.json');

  let scenes = parseStoryboard(
    (await fileExists(storyboardPath))
      ? JSON.parse(await fs.readFile(storyboardPath, 'utf8'))
      : { scenes: [] }
  );
  scenes = [...scenes].sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));

  const voiceByIndex = (await fileExists(narrativePath))
    ? parseNarrativeVoiceovers(JSON.parse(await fs.readFile(narrativePath, 'utf8')))
    : new Map();
  const scriptByIndex = (await fileExists(scriptPath))
    ? parseScriptVoiceovers(JSON.parse(await fs.readFile(scriptPath, 'utf8')))
    : new Map();

  const listPath = path.join(workDir, 'concat_list.txt');
  const concatenatedPath = path.join(workDir, 'concatenated.mp4');
  const burnedPath = path.join(workDir, 'final_burned.mp4');

  try {
    if (scenes.length === 0) {
      const slatePath = path.join(workDir, 'empty_slate.mp4');
      await ffmpegLavfiColor(3, slatePath);
      await writeText(subtitlesPath, buildSrt([{ durationSec: 3, text: 'No storyboard scenes.' }]));
      try {
        await ffmpegBurnSubtitles(slatePath, subtitlesPath, videoPath);
      } catch {
        await fs.copyFile(slatePath, videoPath);
      }
      await writeJson(manifestPath, {
        mode: 'ffmpeg',
        renderedAt: new Date().toISOString(),
        sceneCount: 0,
        notes: 'Empty storyboard: generated placeholder slate only.',
      });
      return { videoPath, subtitlesPath, manifestPath };
    }

    const sceneClips: string[] = [];
    const srtEntries: Array<{ durationSec: number; text: string }> = [];

    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i]!;
      const sceneIndex = scene.sceneIndex ?? i + 1;
      const durationHint =
        typeof scene.estimatedDurationSec === 'number'
          ? scene.estimatedDurationSec
          : typeof scene.durationSec === 'number'
            ? scene.durationSec
            : 5;

      const sceneDir = path.join(runDir, 'media', 'scenes', String(sceneIndex));
      const sceneVideoPath = path.join(sceneDir, 'scene.mp4');
      const keyframePath = await resolveSceneImagePath(sceneDir);
      const voicePath = path.join(runDir, 'media', 'scenes', String(sceneIndex), 'voice.mp3');

      const { durationSec, rawPath } = await renderSceneClip({
        workDir,
        index: i,
        sceneIndex,
        durationHint,
        sceneVideoPath,
        keyframePath,
        voicePath,
      });

      const uniformPath = path.join(workDir, `scene_${i}.mp4`);
      await ensureUniformSceneClip(rawPath, durationSec, uniformPath);
      await fs.unlink(rawPath).catch(() => undefined);

      sceneClips.push(uniformPath);
      srtEntries.push({
        durationSec,
        text: captionForScene(scene, voiceByIndex, scriptByIndex),
      });
    }

    await ffmpegConcatenate(sceneClips, listPath, concatenatedPath);

    const srtContent = buildSrt(srtEntries);
    await writeText(subtitlesPath, srtContent);

    try {
      await ffmpegBurnSubtitles(concatenatedPath, subtitlesPath, burnedPath);
      await fs.copyFile(burnedPath, videoPath);
    } catch {
      await fs.copyFile(concatenatedPath, videoPath);
    }

    await writeJson(manifestPath, {
      mode: 'ffmpeg',
      renderedAt: new Date().toISOString(),
      sceneCount: scenes.length,
      sources: 'local media/scenes/{index} (scene.mp4 or keyframe.{png|jpg|jpeg|webp}, voice.mp3)',
      notes: 'Local-only render; requires ffmpeg on PATH. Subtitle burn falls back to concat-only video on failure.',
    });

    return { videoPath, subtitlesPath, manifestPath };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
