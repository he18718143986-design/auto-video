# Storyboard Prompt

Convert the approved script in this conversation into storyboard JSON.

Use the previously extracted Style DNA as the aesthetic authority.
Replicate style, lighting, palette, camera language, and composition logic.
Do not carry over the original reference video's subject-specific entities if they do not belong to the new topic.

Rules:

- One storyboard scene per script scene.
- Every `visualPrompt` must be directly usable for image generation.
- Keep prompts topic-correct and subject-isolated.
- Each scene must include the key objects, environment, framing logic, and motion intent.
- Align the first scene strongly with the hook and the last scene strongly with the takeaway or CTA.
- Keep estimated durations realistic for the line length and pacing.

Return JSON only using this shape:

{
  "scenes": [
    {
      "sceneIndex": 1,
      "visualPrompt": "Detailed image-generation-ready prompt here.",
      "cameraMotion": "slow push-in",
      "keyElements": [
        "primary subject",
        "secondary explanatory element"
      ],
      "estimatedDurationSec": 5,
      "voiceover": "Optional copy of the scene voiceover for render alignment."
    }
  ]
}
