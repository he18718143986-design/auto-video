# Style DNA Extraction Prompt

Analyze the uploaded reference video and extract a compact, downstream-usable Style DNA for a science explainer video replication workflow.

Important:

- The output will be used to generate a NEW video about a NEW topic.
- Replicate style, not subject matter.
- Do not copy topic-specific content from the reference video into reusable fields.
- Use only fields that can materially improve later script, storyboard, image, audio, and render stages.
- When unsure, prefer conservative extraction and explicitly mark low-confidence fields.

Use the previous capability-assessment result in this conversation as a guide for what should or should not be extracted.

Requirements:

- `scriptPipeline` must contain writing constraints, not story facts.
- `visualPipeline` must contain prompt-ready visual constraints in concise language.
- `audioPipeline` must contain prompt-ready audio constraints in concise language.
- Add `confidence` and `evidence` where useful, but keep the structure compact.
- If a field is inferred, say so inside that field object.
- Extract transcript-sensitive values conservatively.

Return JSON only using this shape:

{
  "scriptPipeline": {
    "hookStrategy": {
      "value": "counter-intuitive",
      "confidence": "confident",
      "evidence": "Reference opens by overturning common intuition."
    },
    "narrativeStructure": {
      "value": ["hook", "mechanism", "escalation", "takeaway"],
      "confidence": "confident",
      "evidence": "The story arc is structurally observable."
    },
    "emotionalToneArc": {
      "value": "curious -> urgent -> reassuring",
      "confidence": "inferred",
      "evidence": "Tone progression is consistent but partly interpretive."
    },
    "vocabularyLevel": {
      "value": "general-public",
      "confidence": "confident",
      "evidence": "Low jargon density and direct second-person phrasing."
    },
    "metaphorDensity": {
      "value": "medium",
      "confidence": "inferred",
      "evidence": "Several visual analogies are used but not every scene."
    },
    "wordsPerMinute": {
      "value": 150,
      "confidence": "inferred",
      "evidence": "Approximate pacing based on spoken density."
    },
    "ctaPattern": {
      "value": "imperative + because + emotional comparative close",
      "confidence": "confident",
      "evidence": "Closing structure is directly observable."
    }
  },
  "visualPipeline": {
    "renderingStyle": {
      "value": "clean cinematic 3d educational animation",
      "confidence": "confident",
      "evidence": "Consistent 3D rendered explanatory visuals."
    },
    "palette": {
      "value": ["#2A9D8F", "#264653", "#E9C46A"],
      "confidence": "confident",
      "evidence": "Dominant grading and accent colors recur throughout."
    },
    "lightingStyle": {
      "value": "soft high-contrast studio lighting",
      "confidence": "confident",
      "evidence": "Consistent polished highlight and shadow behavior."
    },
    "cameraMotionPatterns": {
      "value": ["slow push-in", "orbital reveal", "static explanatory wide"],
      "confidence": "confident",
      "evidence": "Repeated shot grammar across scenes."
    },
    "composition": {
      "value": "single-subject focus with clear negative space for labels",
      "confidence": "confident",
      "evidence": "Frames repeatedly reserve space for educational emphasis."
    },
    "visualMetaphorRule": {
      "value": "map abstract biological processes to concrete cinematic 3d objects or environments",
      "confidence": "inferred",
      "evidence": "Observed metaphor logic across multiple moments."
    }
  },
  "audioPipeline": {
    "musicMood": {
      "value": "curious, focused, lightly dramatic",
      "confidence": "confident",
      "evidence": "BGM stays educational with mild tension."
    },
    "voicePacing": {
      "value": 1.0,
      "confidence": "inferred",
      "evidence": "Estimated from spoken cadence."
    },
    "bgmRelativeEnergyByStage": {
      "value": {
        "hook": "medium-high",
        "body": "medium",
        "climax": "high",
        "closing": "medium-low"
      },
      "confidence": "inferred",
      "evidence": "Energy shifts appear aligned with narrative arc."
    }
  }
}
