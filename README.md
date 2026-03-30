# Auto Video (Minimal Runnable Skeleton)

This repository (`auto-video-main`) contains a local-first skeleton for browser-automation-assisted video generation.

It supports two modes:

- `Playwright` mode (default): opens a real webpage, uploads file, sends prompts, extracts responses.
- `Mock` mode (`AUTO_VIDEO_USE_MOCK=1`): keeps upstream text stages deterministic for local testing.

It now also includes a local operator UI for configuring browser profiles, starting runs, reviewing artifacts, and editing prompts.

It now supports a practical "publish-fast" path:

- real TTS voice per scene
- real keyframe generation per scene
- simplified final cut with static keyframes + narration + subtitles

## Quick Start

Requires **FFmpeg** and **ffprobe** on your `PATH` for the final render stage (or set `FFMPEG_PATH` / `FFPROBE_PATH`).

```bash
npm install
cd ui && npm install && npm run build && cd ..
npx playwright install chromium
npm run run -- --topic "how kidneys work" --provider "browser-chat-provider" --reference "/absolute/path/reference.mov"
```

To start the local Web UI after the frontend has been built:

```bash
npm run ui
```

Then open `http://127.0.0.1:3210`.

Notes:

- `npm run ui` serves the built frontend from `ui/dist/`, so run `cd ui && npm run build` once before using it.
- For frontend-only iteration, run `cd ui && npm run dev` in a second terminal while the backend is running.

Required environment for Playwright mode:

```bash
AUTO_VIDEO_WEB_URL=https://your-chat-page.example
AUTO_VIDEO_PROMPT_SELECTOR=textarea
AUTO_VIDEO_UPLOAD_SELECTOR='input[type="file"]'
AUTO_VIDEO_RESPONSE_SELECTOR='[data-message-author-role="assistant"]'
# Optional:
AUTO_VIDEO_SEND_BUTTON_SELECTOR='button[type="submit"]'
AUTO_VIDEO_HEADLESS=false
AUTO_VIDEO_ALLOW_MANUAL_LOGIN=true
```

Recommended media environment for real outputs:

```bash
# Optional but recommended for best quality:
OPENAI_API_KEY=...

# Generation providers:
AUTO_VIDEO_TTS_PROVIDER=auto          # auto | openai | system
AUTO_VIDEO_IMAGE_PROVIDER=auto        # auto | openai | pollinations

# Optional fine-tuning:
AUTO_VIDEO_TTS_VOICE=alloy
AUTO_VIDEO_OPENAI_TTS_MODEL=gpt-4o-mini-tts
AUTO_VIDEO_OPENAI_IMAGE_MODEL=gpt-image-1
AUTO_VIDEO_IMAGE_SIZE=1280x720
AUTO_VIDEO_POLLINATIONS_MODEL=flux
```

Note: if system TTS cannot produce playable voice on your machine, the pipeline falls back to an ffmpeg tone track so the run still completes.

For local smoke testing without browser automation:

```bash
npm run demo:mock
```

For local UI smoke testing with mock mode enabled by default:

```bash
npm run ui:mock
```

## Project Structure

```text
auto-video-main/
  prompts/               # Prompt templates
  runs/                  # Generated run artifacts
  ui/                    # React + Vite + TypeScript frontend (Tauri-ready)
  src/
    browser/             # Playwright session + page automation helpers
    config/              # UI-editable runtime configuration
    extractors/          # Raw-to-JSON helpers
    media/               # TTS + keyframe generation helpers
    orchestrator/        # Pipeline stages + run state
    web/                 # HTTP API server (serves ui/dist/ in production)
    render/              # FFmpeg final render (local media + storyboard)
    validators/          # Artifact validators
```

For developer onboarding and architecture handoff, see:

- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)
- [DEVELOPER_GUIDE.zh-CN.md](DEVELOPER_GUIDE.zh-CN.md)

For a full tech stack analysis with justification and alternatives, see:

- [TECH_STACK.md](TECH_STACK.md)

For the complete frontend information architecture (production readiness, pipeline flow, page-level IA), see:

- [FRONTEND_INFORMATION_ARCHITECTURE.md](FRONTEND_INFORMATION_ARCHITECTURE.md)

## Operator UI

The current UI is a React + Vite SPA with five primary routes:

1. `Home`: dashboard with active-run summary, recent runs, environment status, and quick actions.
2. `New Run`: operator-first launch flow for topic, provider, reference path, launch profile, mock mode, and per-stage routing overrides.
3. `Studio`: three-column monitoring workspace with run queue, tabbed main area (`Overview / Live Browser / Outputs / Timeline / Handoff`), and a right-side inspector.
4. `Library`: searchable run history plus a real asset browser for screenshots, media, text artifacts, and final outputs.
5. `Settings`: system configuration hub with sub-tabs for `Browser Profiles`, `Stage Routing`, `Prompts`, `Selectors`, and `System`.

Current operator controls:

- `Pause / Resume`: stop an active run and continue later.
- `Continue Human`: resume the same run after login, CAPTCHA, or other manual intervention.
- `Retry From Stage`: spawn a new run that reuses earlier artifacts and restarts from a selected stage.
- `Live Browser Preview`: SSE-driven live screenshot preview for the active run.
- `Selector Debugger`: probe configured selectors, capture screenshots, and persist snapshot history; the backend also exposes compare data for future diff-focused UI.
- `Handoff Editor`: edit confirmation notes and checklist items before resuming a `needs_human` run.

See [FRONTEND_INFORMATION_ARCHITECTURE.md](FRONTEND_INFORMATION_ARCHITECTURE.md) for the fuller page map and future Tauri-facing IA.

## Runtime Config

The UI reads and writes a local `auto-video.config.json` file.

- If the file does not exist, the app creates it from defaults on first launch.
- Use [auto-video.config.example.json](auto-video.config.example.json) as the shareable template.
- `auto-video.config.json` is gitignored so local browser profiles and private target URLs do not get committed.

## API Notes

- `GET /api/runs` returns run summaries for the queue and dashboard.
- `GET /api/runs/:runId` returns the canonical `RunManifest` used by the Studio route.
- `GET /api/runs/:runId/details` returns richer artifact data (`manifest`, `textArtifacts`, `screenshots`, `mediaFiles`) used by the current Studio Outputs and Library Assets views.

## Current Status

Implemented:

- runnable CLI entrypoint
- staged workflow execution (Playwright-backed text stages)
- output files for each stage
- manifest lifecycle tracking
- scene-level real TTS generation (`voice.mp3`)
- scene-level real keyframe generation (`keyframe.png`)
- simplified publish pipeline via `render`: static image + narration + subtitles

Not implemented yet:

- fully automated high-fidelity scene video generation model (current path intentionally uses static keyframes + voice for speed and reliability)

Implemented locally:

- FFmpeg assembly from `media/scenes/{n}/scene.mp4` or `keyframe.{png|jpg|jpeg|webp}`, with `voice.mp3`, plus `outputs/storyboard.json`, `outputs/script.json`, and optional `outputs/narrative_map.json` for subtitles

Use this as the foundation for the next iteration.
