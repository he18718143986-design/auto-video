import path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export interface TtsResult {
  provider: string;
  voice: string;
  model?: string;
}

export async function synthesizeSpeechToMp3(params: {
  text: string;
  outputPath: string;
  sceneIndex: number;
}): Promise<TtsResult> {
  const text = normalizeSpeechText(params.text);
  const configured = (process.env.AUTO_VIDEO_TTS_PROVIDER || 'auto').trim().toLowerCase();
  const providers = resolveProviderOrder(configured);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      if (provider === 'openai') {
        const result = await synthesizeWithOpenAi(text, params.outputPath);
        await assertPlayableAudio(params.outputPath);
        return result;
      }
      if (provider === 'system') {
        const result = await synthesizeWithSystemVoice(text, params.outputPath, params.sceneIndex);
        await assertPlayableAudio(params.outputPath);
        return result;
      }
      if (provider === 'tone') {
        const result = await synthesizeWithTone(params.outputPath, params.sceneIndex, estimateDurationSec(text));
        await assertPlayableAudio(params.outputPath);
        return result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`TTS synthesis failed. ${errors.join(' | ')}`);
}

function resolveProviderOrder(configured: string): Array<'openai' | 'system' | 'tone'> {
  if (configured === 'openai') return ['openai'];
  if (configured === 'system') return ['system'];
  if (configured === 'tone') return ['tone'];

  if (process.env.OPENAI_API_KEY?.trim()) {
    return ['openai', 'system', 'tone'];
  }
  return ['system', 'openai', 'tone'];
}

async function synthesizeWithOpenAi(text: string, outputPath: string): Promise<TtsResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const model = process.env.AUTO_VIDEO_OPENAI_TTS_MODEL?.trim() || 'gpt-4o-mini-tts';
  const voice = process.env.AUTO_VIDEO_TTS_VOICE?.trim() || 'alloy';
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS failed: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) {
    throw new Error('OpenAI TTS returned an empty payload.');
  }
  await writeFile(outputPath, bytes);
  return { provider: 'openai', voice, model };
}

async function synthesizeWithSystemVoice(text: string, outputPath: string, sceneIndex: number): Promise<TtsResult> {
  if (process.platform !== 'darwin') {
    throw new Error('System TTS fallback currently supports macOS only.');
  }

  const voice = process.env.AUTO_VIDEO_SYSTEM_VOICE?.trim() || 'Samantha';
  const rate = Number(process.env.AUTO_VIDEO_SYSTEM_RATE || 180);
  const tempAiffPath = path.join(path.dirname(outputPath), `voice_${sceneIndex}.aiff`);

  try {
    await execFile('say', ['-v', voice, '-r', String(Number.isFinite(rate) ? rate : 180), '-o', tempAiffPath, text], {
      maxBuffer: 20 * 1024 * 1024,
    });

    await execFile(
      'ffmpeg',
      ['-y', '-i', tempAiffPath, '-vn', '-ac', '2', '-ar', '44100', '-b:a', '192k', outputPath],
      { maxBuffer: 20 * 1024 * 1024 }
    );
  } finally {
    await unlink(tempAiffPath).catch(() => undefined);
  }

  return { provider: 'system', voice };
}

async function synthesizeWithTone(outputPath: string, sceneIndex: number, durationSec: number): Promise<TtsResult> {
  const frequency = String(220 + (sceneIndex % 6) * 55);
  await execFile(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:sample_rate=44100:duration=${durationSec.toFixed(2)}`,
      '-af',
      'volume=0.25',
      '-ac',
      '2',
      '-b:a',
      '128k',
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  return { provider: 'ffmpeg_tone_fallback', voice: `sine_${frequency}hz` };
}

function normalizeSpeechText(text: string): string {
  const cleaned = text
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/[`*_#]/g, ' ')
    .trim();
  if (cleaned.length === 0) {
    return 'Narration unavailable for this scene.';
  }
  if (cleaned.length <= 3500) {
    return cleaned;
  }
  return `${cleaned.slice(0, 3480)}...`;
}

function estimateDurationSec(text: string): number {
  const words = text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
  const seconds = words > 0 ? words / 2.7 : 4;
  return Math.max(3, Math.min(20, Number(seconds.toFixed(2))));
}

async function assertPlayableAudio(filePath: string): Promise<void> {
  const info = await stat(filePath);
  if (!Number.isFinite(info.size) || info.size <= 0) {
    throw new Error(`Generated audio is empty: ${filePath}`);
  }
  const probe = await execFile(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  const duration = Number.parseFloat((probe.stdout || '').trim());
  if (!Number.isFinite(duration) || duration <= 0.1) {
    throw new Error(`Generated audio is not playable: ${filePath}`);
  }
}
