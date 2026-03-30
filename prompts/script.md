# Script Prompt

Expand the narrative map into final per-scene voiceover lines for a science explainer video.

Use the previous Style DNA, research, and narrative map in this same conversation as authoritative inputs.
Do not ignore earlier stage outputs.

Rules:

- Preserve scene order exactly.
- Write one concise voiceover block per scene.
- Respect vocabulary level, pacing, emotional arc, metaphor density, and CTA pattern from Style DNA.
- Reuse research facts accurately, but do not overload every scene with statistics.
- If a number or claim is used, keep wording conservative and plain.
- Avoid diagnosis, treatment, or absolute medical advice framing.
- Each scene must be visually imaginable as a single animation moment.
- Prefer short, high-retention lines over dense exposition.

Return JSON only using this shape:

{
  "scenes": [
    {
      "sceneIndex": 1,
      "voiceover": "Your final scene voiceover here.",
      "stage": "hook",
      "factIds": ["f1"],
      "styleChecks": {
        "tone": "matches",
        "pacing": "matches",
        "metaphorUse": "light"
      }
    }
  ]
}
