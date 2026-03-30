# Topic Research Prompt

Research the topic for a short science explainer video.

Use the Style DNA from earlier in this conversation only as style guidance for what kind of facts and explanations are useful.
Do not copy subject matter from the reference video.

Requirements:

- Return concise, high-signal facts that are useful for script writing.
- Prefer facts that are specific, visualizable, and explainable to a broad audience.
- Include misconceptions worth correcting if they matter for the topic.
- Include glossary terms only when they are important enough to appear in the script or storyboard.
- Include analogy seeds that can support later visual metaphors.
- Avoid medical advice wording and absolute claims.
- When possible, prefer quantified or comparative facts over vague statements.
- Keep language plain enough for downstream script generation.

Return JSON only using this shape:

{
  "topic": "the topic name",
  "facts": [
    {
      "id": "f1",
      "text": "Concise verified fact.",
      "sourceMarker": "Research shows",
      "visualPotential": "How this could appear in a 3D explanatory scene.",
      "recommendedStage": "hook"
    }
  ],
  "misconceptions": [
    {
      "id": "m1",
      "myth": "Common misconception.",
      "correction": "Accurate correction in plain language."
    }
  ],
  "terms": [
    {
      "id": "t1",
      "term": "Important term",
      "definition": "Plain-language definition."
    }
  ],
  "analogies": [
    {
      "id": "a1",
      "analogy": "Useful analogy seed.",
      "visualMapping": "How the analogy might be visualized later."
    }
  ]
}
