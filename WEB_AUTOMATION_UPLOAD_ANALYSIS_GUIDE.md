# Auto Video — Web Automation Upload And Analysis Guide

## Purpose

This document describes how `auto-video` can implement a local, browser-automation-assisted video generation workflow that mirrors the same high-level stages used by `video-studio`:

1. reference video analysis
2. topic research
3. narrative planning
4. script writing
5. QA review
6. storyboard generation
7. asset generation
8. TTS
9. final render

This is an experimental local workflow, not a production SaaS architecture.

---

## Operating Assumptions

Use this design only under these conditions:

- single user
- runs on the user's own device
- browser sessions are human-owned
- login is completed manually
- CAPTCHA is not bypassed automatically
- if a site blocks automation, the job pauses and asks for human intervention

Do not design this project around hidden scraping, CAPTCHA solving, or large-scale unattended batching.

---

## Recommended Positioning

Treat `auto-video` as:

- a local AI assistant
- a browser orchestration layer
- a workflow recorder
- a media assembly pipeline

Do not treat it as a fully autonomous cloud backend.

---

## Core Idea

`auto-video` replaces direct API calls for some analysis and writing steps with browser automation against permitted AI web apps.

The browser layer uploads the reference video, submits carefully structured prompts, waits for results, extracts structured outputs, saves them to disk, and passes them to the next stage.

Suggested automation engines:

- OpenClaw Browser
- Playwright
- a thin wrapper around Chromium DevTools Protocol

Use whichever tool gives you the most reliable DOM control and file upload support.

---

## High-Level Pipeline

### Stage 0 — Session Preparation

Before any job starts:

- launch a dedicated browser profile per provider
- validate that the user is already logged in
- confirm the target page is reachable
- check that file upload controls still exist
- write a run manifest to disk

If any of these checks fail, mark the run as `needs_human`.

### Stage 1 — Reference Upload + Capability Assessment

Goal:

- upload the local reference video to a multimodal chat page
- ask the model to describe which fields it can extract confidently

Outputs:

- `capability_assessment.txt`
- `capability_assessment.json`
- screenshots of the conversation state

### Stage 2 — Style DNA Extraction

Goal:

- send the second prompt in the same session
- request strict JSON describing script, visual, and audio style

Outputs:

- `style_dna.raw.txt`
- `style_dna.json`
- validation report

If parsing fails:

- save the raw response
- mark the step as `needs_review`
- do not silently continue with malformed JSON

### Stage 3 — Topic Research

Goal:

- submit the new topic
- collect verifiable facts, misconceptions, terms, and analogies

Outputs:

- `research.raw.txt`
- `research.json`

### Stage 4 — Narrative Map

Goal:

- convert the research pack and Style DNA into scene-level narrative contracts

Outputs:

- `narrative_map.raw.txt`
- `narrative_map.json`

### Stage 5 — Script Generation

Goal:

- expand the narrative map into final per-scene voiceover lines

Outputs:

- `script.raw.txt`
- `script.json`

### Stage 6 — QA Review

Goal:

- ask the model to review the script for factual accuracy, clarity, and style consistency

Outputs:

- `qa.raw.txt`
- `qa.json`

### Stage 7 — Storyboard Generation

Goal:

- convert script scenes into visual prompts, camera motion, and key elements

Outputs:

- `storyboard.raw.txt`
- `storyboard.json`

### Stage 8 — Image / Reference Asset Generation

Goal:

- use browser automation to submit prompts to an allowed image generation page
- generate:
  - one reference sheet
  - one keyframe per scene

Outputs:

- `reference_sheet.png`
- `scenes/<sceneIndex>/keyframe.png`
- metadata JSON for every generated asset

### Stage 9 — Scene Video Generation

Goal:

- submit each scene prompt and optional keyframe to a video generation page

Outputs:

- `scenes/<sceneIndex>/scene.mp4`
- `video_generation_log.json`

### Stage 10 — TTS

Goal:

- turn scene voiceover text into audio assets

Outputs:

- `scenes/<sceneIndex>/voice.mp3`
- `tts_manifest.json`

### Stage 11 — Render

Goal:

- use local FFmpeg to assemble:
  - keyframes or scene videos
  - per-scene audio
  - subtitles

Outputs:

- `final/final_video.mp4`
- `final/subtitles.srt`
- `final/render_manifest.json`

---

## Suggested Local Directory Layout

```text
auto-video/
  README.md
  docs/
  prompts/
    capability-assessment.md
    style-dna.md
    research.md
    narrative-map.md
    script.md
    qa.md
    storyboard.md
  runs/
    <run-id>/
      run.json
      inputs/
      outputs/
        capability_assessment.json
        style_dna.json
        research.json
        narrative_map.json
        script.json
        qa.json
        storyboard.json
      media/
        reference_sheet.png
        scenes/
      logs/
      screenshots/
  src/
    browser/
    orchestrator/
    extractors/
    validators/
    render/
```

---

## Suggested Run State Model

Persist a run manifest like this:

```json
{
  "id": "run_2026_03_29_001",
  "status": "running",
  "currentStage": "style_dna",
  "provider": "browser-chat-provider",
  "referenceVideoPath": "inputs/reference.mov",
  "topic": "how kidneys work",
  "artifacts": {
    "capabilityAssessment": "outputs/capability_assessment.json",
    "styleDna": "outputs/style_dna.json",
    "research": "outputs/research.json",
    "narrativeMap": "outputs/narrative_map.json",
    "script": "outputs/script.json",
    "qa": "outputs/qa.json",
    "storyboard": "outputs/storyboard.json",
    "finalVideo": "final/final_video.mp4"
  },
  "requiresHuman": false
}
```

---

## Browser Automation Design Rules

### 1. Use explicit page adapters

Each target website should get its own adapter:

- `openPage()`
- `assertReady()`
- `attachFile()`
- `sendPrompt()`
- `waitForCompletion()`
- `extractResponse()`
- `downloadAsset()`

Do not mix provider-specific selectors into the orchestrator.

### 2. Prefer stable selectors

Prefer, in order:

- file input elements
- ARIA labels
- button text
- stable `data-*` attributes
- semantic landmarks

Avoid brittle CSS chains.

### 3. Save evidence for every stage

For every browser task, save:

- screenshot before action
- screenshot after completion
- extracted response text
- DOM snapshot or selector debug info on failure

This makes page changes diagnosable.

### 4. Detect page breakage explicitly

Define standard failure reasons:

- `missing_upload_control`
- `missing_prompt_box`
- `response_timeout`
- `auth_expired`
- `captcha_required`
- `layout_changed`

When any of these occur, stop the stage and mark the run `needs_human`.

---

## Login, CAPTCHA, And Session Handling

Keep this boundary very clear:

- login can be assisted, but should be completed by the user
- password, MFA, and CAPTCHA should not be auto-solved
- session expiry should be detected, not bypassed
- when a site requires re-authentication, pause the run and resume after the user fixes it

Recommended session checks before every major stage:

- page title matches expected app
- user avatar or account menu exists
- prompt input exists
- upload control exists when needed

---

## Output Validation Rules

Every structured model result should be validated before the next stage.

Suggested contracts:

- `style_dna.json`
- `research.json`
- `narrative_map.json`
- `script.json`
- `qa.json`
- `storyboard.json`

If validation fails:

1. save the raw text
2. attempt one repair prompt
3. if still invalid, stop and request review

Do not let malformed outputs silently poison later stages.

---

## Prompt Strategy

Reuse the same conceptual sequence as `video-studio`:

1. capability self-assessment
2. Style DNA extraction
3. research
4. narrative map
5. script
6. QA
7. storyboard

Keep prompt templates in versioned markdown files so browser automation and API-driven versions can share the same logical workflow.

---

## Media Generation Strategy

For the browser-automation version, separate text steps from media steps:

### Text-heavy steps

These are good candidates for browser-chat automation:

- capability assessment
- Style DNA extraction
- research
- narrative map
- script
- QA
- storyboard

### Media-heavy steps

These need dedicated handling:

- reference sheet
- keyframes
- scene videos
- TTS

For these stages, the automation layer should:

- submit prompts
- wait for generation completion
- download the resulting files
- persist local metadata

The final render should still happen locally with FFmpeg.

---

## Human Checkpoints

A practical `auto-video` workflow should include human approval gates after:

1. Style DNA extraction
2. research
3. script generation
4. storyboard generation
5. final render

This keeps the system usable even when browser responses are messy or partially structured.

---

## Suggested Milestones

### Milestone 1

Implement:

- run manifest
- session health check
- upload a reference video
- collect capability assessment
- collect Style DNA JSON

### Milestone 2

Implement:

- research
- narrative map
- script
- QA

### Milestone 3

Implement:

- storyboard
- reference sheet download
- keyframe generation

### Milestone 4

Implement:

- scene video generation
- TTS
- local FFmpeg render

---

## Recommendation

If `auto-video` is intended as a real product, keep browser automation as an experimental or fallback path and preserve a clean API-based path where possible.

If `auto-video` is intended as a personal local assistant, this browser-assisted design is workable as long as you treat:

- login as manual
- browser failures as normal
- page changes as expected maintenance work
- rendering as a local deterministic step

The most robust split is:

- browser automation for upload, analysis, and text generation
- local filesystem for artifacts
- local FFmpeg for final assembly
