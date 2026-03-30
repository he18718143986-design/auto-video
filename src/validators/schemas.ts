function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateStyleDna(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error('style_dna is not an object');
  if (!isRecord(value.scriptPipeline) && value.scriptPipeline !== null) {
    throw new Error('style_dna.scriptPipeline must be object or null');
  }
  if (!isRecord(value.visualPipeline)) throw new Error('style_dna.visualPipeline is missing');
  if (!isRecord(value.audioPipeline)) throw new Error('style_dna.audioPipeline is missing');
}

export function validateResearch(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error('research is not an object');
  if (!Array.isArray(value.facts)) throw new Error('research.facts must be an array');
}

export function validateNarrativeMap(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error('narrative_map is not an object');
  if (!Array.isArray(value.scenes)) throw new Error('narrative_map.scenes must be an array');
}

export function validateScript(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error('script is not an object');
  if (!Array.isArray(value.scenes)) throw new Error('script.scenes must be an array');
}

export function validateStoryboard(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error('storyboard is not an object');
  if (!Array.isArray(value.scenes)) throw new Error('storyboard.scenes must be an array');
  for (let i = 0; i < value.scenes.length; i++) {
    if (!isRecord(value.scenes[i])) {
      throw new Error(`storyboard.scenes[${i}] must be an object`);
    }
  }
}
