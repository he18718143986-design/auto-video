# Narrative Map Prompt

Create a narrative map for a short science explainer video using the previous research result and Style DNA already present in this conversation.

This is not the final script.
This stage defines scene-by-scene production contracts for the later script, storyboard, TTS, and render stages.

Rules:

- Keep the number of scenes compact and practical for a short explainer.
- The first scene must function as a hook.
- The last scene must function as takeaway or CTA.
- Each scene must have one clear informational job and one clear emotional job.
- Bind each scene to specific facts or analogy seeds from the research output.
- Keep voiceover drafts short and scene-level, not paragraph-level.
- Preserve the pacing and emotional arc implied by Style DNA.

Return JSON only using this shape:

{
  "scenes": [
    {
      "sceneIndex": 1,
      "beat": "hook",
      "goal": "Create curiosity by overturning a common assumption.",
      "voiceoverDraft": "What if the thing you think is simple is actually doing something astonishing every minute?",
      "factsBound": ["f1"],
      "analogyBound": ["a1"],
      "styleConstraints": [
        "second-person opening",
        "high-curiosity tone",
        "short sentence rhythm"
      ],
      "estimatedDurationSec": 5
    }
  ]
}
