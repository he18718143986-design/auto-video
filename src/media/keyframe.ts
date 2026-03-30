import { execFile as execFileCb } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const DEFAULT_SIZE = '1280x720';

export interface KeyframeResult {
  provider: string;
  outputPath: string;
}

export async function generateKeyframeImage(params: {
  prompt: string;
  outputPath: string;
  sceneIndex: number;
  topic: string;
}): Promise<KeyframeResult> {
  const configured = (process.env.AUTO_VIDEO_IMAGE_PROVIDER || 'auto').trim().toLowerCase();
  const providers = resolveProviderOrder(configured);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      if (provider === 'openai') {
        await generateWithOpenAi(params.prompt, params.outputPath);
      } else if (provider === 'pollinations') {
        await generateWithPollinations(params.prompt, params.outputPath, params.sceneIndex);
      } else {
        continue;
      }
      return {
        provider,
        outputPath: params.outputPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  await generateFallbackCard(params.outputPath, params.sceneIndex, params.topic);
  return {
    provider: `ffmpeg_fallback${errors.length > 0 ? ` (${errors.join(' | ')})` : ''}`,
    outputPath: params.outputPath,
  };
}

function resolveProviderOrder(configured: string): Array<'openai' | 'pollinations'> {
  if (configured === 'openai') return ['openai'];
  if (configured === 'pollinations') return ['pollinations'];

  if (process.env.OPENAI_API_KEY?.trim()) {
    return ['openai', 'pollinations'];
  }
  return ['pollinations', 'openai'];
}

async function generateWithOpenAi(prompt: string, outputPath: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const model = process.env.AUTO_VIDEO_OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      size: process.env.AUTO_VIDEO_IMAGE_SIZE?.trim() || DEFAULT_SIZE,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = payload.data?.[0];
  if (!item) {
    throw new Error('OpenAI image generation returned no data.');
  }

  if (item.b64_json) {
    await writeFile(outputPath, Buffer.from(item.b64_json, 'base64'));
    return;
  }

  if (item.url) {
    await downloadImage(item.url, outputPath);
    return;
  }

  throw new Error('OpenAI image generation response missing b64_json/url.');
}

async function generateWithPollinations(prompt: string, outputPath: string, sceneIndex: number): Promise<void> {
  const seed = String(sceneIndex * 1009 + 17);
  const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  url.searchParams.set('width', '1280');
  url.searchParams.set('height', '720');
  url.searchParams.set('nologo', 'true');
  url.searchParams.set('seed', seed);
  url.searchParams.set('model', process.env.AUTO_VIDEO_POLLINATIONS_MODEL?.trim() || 'flux');
  await downloadImage(url.toString(), outputPath);
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const controller = AbortSignal.timeout(120_000);
  const response = await fetch(url, { signal: controller });
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) {
    throw new Error('Image payload is too small.');
  }
  await writeFile(outputPath, bytes);
}

async function generateFallbackCard(outputPath: string, sceneIndex: number, topic: string): Promise<void> {
  const palette = ['#0f172a', '#1e293b', '#172554', '#111827', '#334155'];
  const color = palette[(sceneIndex - 1) % palette.length];
  const metadata = `scene=${sceneIndex};topic=${topic.slice(0, 60)}`;

  await execFile(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=1280x720`,
      '-metadata',
      metadata,
      '-frames:v',
      '1',
      outputPath,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
}
