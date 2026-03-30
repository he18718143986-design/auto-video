import path from 'node:path';
import { runPipeline } from './orchestrator/pipeline.js';
import type { RunOptions } from './orchestrator/types.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const options = parseArgs(args);
  const runDir = await runPipeline(options);
  const relativeRunDir = path.relative(process.cwd(), runDir) || '.';
  console.log(`Run completed.`);
  console.log(`Run directory: ${relativeRunDir}`);
  console.log(`Manifest: ${path.join(relativeRunDir, 'run.json')}`);
}

function parseArgs(args: string[]): RunOptions {
  const topic = readFlag(args, '--topic') || 'how kidneys work';
  const provider = readFlag(args, '--provider') || 'browser-chat-provider';
  const referencePath = readFlag(args, '--reference');
  const runId = readFlag(args, '--run-id');

  return {
    topic,
    provider,
    referencePath,
    runId,
  };
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

function printHelp(): void {
  const help = [
    'auto-video minimal runner',
    '',
    'Usage:',
    '  npm run run -- --topic "how kidneys work" --provider "browser-chat-provider" --reference "/abs/path/video.mov"',
    '',
    'Flags:',
    '  --topic      Target topic for generation (default: "how kidneys work")',
    '  --provider   Provider label for this run (default: "browser-chat-provider")',
    '  --reference  Optional path to a local reference video',
    '  --run-id     Optional run id',
    '',
    'Playwright mode env:',
    '  AUTO_VIDEO_WEB_URL                required',
    '  AUTO_VIDEO_PROMPT_SELECTOR        optional (default: textarea)',
    '  AUTO_VIDEO_UPLOAD_SELECTOR        optional (default: input[type="file"])',
    '  AUTO_VIDEO_RESPONSE_SELECTOR      optional',
    '  AUTO_VIDEO_SEND_BUTTON_SELECTOR   optional',
    '',
    'Media generation env (for publish-ready simplified pipeline):',
    '  AUTO_VIDEO_TTS_PROVIDER           auto | openai | system | tone (default: auto)',
    '  AUTO_VIDEO_IMAGE_PROVIDER         auto | openai | pollinations (default: auto)',
    '  AUTO_VIDEO_TTS_VOICE              optional (default: alloy for openai)',
    '  OPENAI_API_KEY                    optional, enables OpenAI image + TTS',
    '',
    'Mock mode:',
    '  AUTO_VIDEO_USE_MOCK=1',
  ].join('\n');
  console.log(help);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Run failed: ${message}`);
  process.exitCode = 1;
});
