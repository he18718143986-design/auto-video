# Developer Guide

## 1. What This Project Is

`auto-video-main` is a local-first video generation workbench for a science/education creator.

The product goal is intentionally different from a cloud SaaS pipeline:

- use browser automation to operate AI chat websites locally
- take advantage of free chat quotas where possible instead of paying for API usage on every stage
- avoid mandatory paid infrastructure such as hosted databases or queue engines
- keep output volume intentionally limited with daily run quotas
- allow human intervention when chat pages require login, CAPTCHA, or other manual recovery
- still produce a publishable output through a simplified but reliable media pipeline

The project is best understood as a personal operator console plus orchestration engine, not as a multi-tenant web platform.

## 2. Current Architecture At A Glance

The codebase is split into two runtime layers:

1. Node.js orchestration/backend layer
- owns the 12-stage pipeline
- manages Playwright browser sessions
- writes artifacts into `runs/<run-id>/`
- exposes local HTTP APIs and SSE updates
- serves the built frontend from `ui/dist/`

2. React + Vite frontend layer
- provides the operator UI
- is Tauri-ready, but can also run as a normal local SPA
- talks to the backend through `/api/*` and `/api/events`

The project is deliberately local-first:

- persistence uses the filesystem, not a database
- browser auth state lives in local profile directories
- prompts are editable from local markdown files
- generated assets and logs stay in the repo-local `runs/` directory

## 3. Repository Map

```text
auto-video-main/
  prompts/                      Stage prompt templates
  runs/                         Generated run artifacts and debug output
  src/
    browser/                    Playwright session + selector automation
    config/                     Runtime config schema + file persistence
    extractors/                 Raw-response parsing helpers
    media/                      Keyframe generation, TTS, scene planning
    orchestrator/               Pipeline execution, run state, retry/resume logic
    render/                     FFmpeg final render
    utils/                      Filesystem and time helpers
    validators/                 JSON/schema validators for text stages
    web/                        Local HTTP API + SSE + static UI serving
  ui/
    src/components/             Layout shell
    src/pages/                  Home / New Run / Studio / Library / Settings
    src/api/                    HTTP + SSE client helpers
    src/hooks/                  UI data hooks
    src/types/                  Shared frontend runtime types
    src-tauri/                  Tauri wrapper files
```

## 4. Core Runtime Model

### Backend

Entry points:

- `src/index.ts`: CLI run entry
- `src/web/server.ts`: local UI server

Important behavior:

- `npm run run` executes a pipeline from the CLI
- `npm run ui` starts the local HTTP server on `127.0.0.1:3210`
- the server exposes JSON APIs plus `/api/events` SSE
- when `ui/dist/` exists, the backend serves the built SPA directly

### Frontend

The React app lives under `ui/`.

- Vite dev server proxies `/api` and `/runs` to `http://127.0.0.1:3210`
- production build outputs to `ui/dist/`
- routing uses `HashRouter`, which keeps the app simple for local/Tauri usage

## 5. Pipeline Overview

The orchestrator currently runs 12 stages:

1. `session_preparation`
2. `capability_assessment`
3. `style_dna`
4. `research`
5. `narrative_map`
6. `script`
7. `qa`
8. `storyboard`
9. `asset_generation`
10. `scene_video_generation`
11. `tts`
12. `render`

Important implementation notes:

- text stages use markdown prompts from `prompts/`
- previous-stage JSON is explicitly stitched into later prompts for context continuity
- retries can reuse upstream outputs
- runs can pause, resume, or enter `needs_human`
- `scene_video_generation` is still a simplified planning step rather than a full high-fidelity video generation engine
- the current publish-fast path is: keyframe images + narration + subtitles + FFmpeg render

Key files:

- `src/orchestrator/pipeline.ts`
- `src/orchestrator/runStore.ts`
- `src/orchestrator/runs.ts`
- `src/orchestrator/types.ts`

## 6. Browser / Profile Model

This project depends heavily on browser profiles.

A profile defines:

- target AI chat website URL
- prompt selector
- upload selector
- response selector
- send button selector
- ready selector
- persistent browser data directory
- timeout values
- whether manual login is allowed

Config file:

- local runtime file: `auto-video.config.json`
- shareable template: `auto-video.config.example.json`

Stage routing supports two modes:

- `manual`: unassigned stages fall back to the default profile
- `round-robin`: unassigned text stages rotate across configured profiles to spread quota usage

## 7. Current UI Information Architecture

Primary routes:

1. `Home`
- recent runs
- active run summary
- environment summary
- quick actions

2. `New Run`
- topic, provider, reference path
- launch profile
- mock mode
- per-stage routing overrides
- run preview panel

3. `Studio`
- run queue on the left
- tabbed main workspace in the center
- inspector on the right
- command bar for pause/resume/retry/continue-human

Studio tabs:

- `Overview`
- `Live Browser`
- `Outputs`
- `Timeline`
- `Handoff`

4. `Library`
- searchable run history
- assets view is still a placeholder

5. `Settings`
- `Browser Profiles`
- `Stage Routing`
- `Prompts`
- `Selectors`
- `System`

## 8. API Surface You Should Know First

Core endpoints:

- `GET /api/config`
- `PUT /api/config`
- `GET /api/prompts`
- `PUT /api/prompts/:name`
- `GET /api/quota`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/details`
- `PUT /api/runs/:runId/handoff`
- `POST /api/runs/start`
- `POST /api/runs/pause`
- `POST /api/runs/resume`
- `POST /api/runs/continue-human`
- `POST /api/runs/retry`
- `POST /api/selectors/debug`
- `GET /api/selectors/history`
- `POST /api/selectors/compare`
- `GET /api/events`

Important contract distinction:

- `GET /api/runs/:runId` returns the canonical `RunManifest` used by the current Studio route
- `GET /api/runs/:runId/details` returns richer artifact payloads for future debugging/detail views

## 9. Local Development Workflow

### Install

```bash
npm install
cd ui && npm install && cd ..
npx playwright install chromium
```

### Backend / pipeline checks

```bash
npm run typecheck
npm test
npm run run -- --topic "how kidneys work" --provider "browser-chat-provider" --reference "/absolute/path/reference.mov"
```

### Operator UI

```bash
npm run ui
```

Then open:

```text
http://127.0.0.1:3210
```

### Frontend-only iteration

In a second terminal:

```bash
cd ui
npm run dev
```

Vite proxies API traffic back to the local backend.

## 10. Common Change Paths

### Add or rewrite a prompt

Edit files in `prompts/`.

If the prompt output shape changes, also inspect:

- `src/extractors/parsers.ts`
- `src/validators/schemas.ts`
- downstream consumers in `src/orchestrator/pipeline.ts`

### Add a new stage

You will usually need to touch:

- `src/orchestrator/types.ts`
- `src/orchestrator/pipeline.ts`
- `ui/src/types/index.ts`
- `ui/src/pages/Studio.tsx`
- docs if the stage is user-visible

### Add a new config field

Update all of:

- `src/config/types.ts`
- `src/config/store.ts`
- `ui/src/types/index.ts`
- `ui/src/pages/Settings.tsx`
- `auto-video.config.example.json`

### Add a new Studio panel or artifact viewer

Inspect:

- `ui/src/pages/Studio.tsx`
- `ui/src/types/index.ts`
- `ui/src/api/client.ts`
- `src/web/server.ts`

## 11. Known Gaps And Honest Limits

These are the main places where the code is intentionally incomplete or still MVP-level:

- `Library > Assets` is a placeholder, not a real asset browser yet
- `scene_video_generation` is not yet a full automatic scene video generator
- selector robustness still depends on external site stability
- Tauri files are present, but desktop packaging is not the most battle-tested path yet
- there is no database, queue service, auth system, or cloud deployment layer by design

That is not accidental. It matches the product goal: a lower-cost local operator tool for a single creator or a very small internal team.

## 12. Recommended Next Development Priorities

If a new developer continues this project, the most valuable next steps are:

1. make the rich run-details payload first-class in the Studio outputs view
2. turn the Library assets tab into a real file browser across screenshots/media/final outputs
3. improve scene-level visual generation quality beyond static keyframes
4. add stronger recovery flows for page drift and selector breakage
5. validate and document the Tauri desktop packaging path end to end

## 13. Reading Order For New Developers

If you are onboarding into the codebase, read in this order:

1. `README.md`
2. `TECH_STACK.md`
3. `FRONTEND_INFORMATION_ARCHITECTURE.md`
4. `src/orchestrator/pipeline.ts`
5. `src/web/server.ts`
6. `ui/src/pages/Studio.tsx`
7. `ui/src/pages/Settings.tsx`

That sequence gives the fastest path from product intent to actual implementation.
