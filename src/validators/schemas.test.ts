import { describe, it, expect } from 'vitest';
import {
  validateStyleDna,
  validateResearch,
  validateStoryboard,
  validateNarrativeMap,
  validateScript,
} from './schemas.js';

describe('validateStyleDna', () => {
  it('passes for a valid style_dna object', () => {
    const valid = {
      scriptPipeline: { genre: 'educational' },
      visualPipeline: { style: 'cinematic' },
      audioPipeline: { music: 'ambient' },
    };
    expect(() => validateStyleDna(valid)).not.toThrow();
  });

  it('passes when scriptPipeline is null', () => {
    const valid = {
      scriptPipeline: null,
      visualPipeline: { style: 'cinematic' },
      audioPipeline: { music: 'ambient' },
    };
    expect(() => validateStyleDna(valid)).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateStyleDna('string')).toThrow('style_dna is not an object');
  });

  it('rejects when visualPipeline is missing', () => {
    expect(() =>
      validateStyleDna({ scriptPipeline: null, audioPipeline: {} })
    ).toThrow('style_dna.visualPipeline is missing');
  });

  it('rejects when audioPipeline is missing', () => {
    expect(() =>
      validateStyleDna({ scriptPipeline: null, visualPipeline: {} })
    ).toThrow('style_dna.audioPipeline is missing');
  });
});

describe('validateResearch', () => {
  it('passes for a valid research object', () => {
    expect(() => validateResearch({ facts: ['fact1', 'fact2'] })).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateResearch(null)).toThrow('research is not an object');
  });

  it('rejects when facts is not an array', () => {
    expect(() => validateResearch({ facts: 'not array' })).toThrow('research.facts must be an array');
  });
});

describe('validateNarrativeMap', () => {
  it('passes for a valid narrative_map object', () => {
    expect(() =>
      validateNarrativeMap({ scenes: [{ sceneIndex: 1 }] })
    ).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateNarrativeMap(42)).toThrow('narrative_map is not an object');
  });

  it('rejects when scenes is not an array', () => {
    expect(() => validateNarrativeMap({ scenes: {} })).toThrow('narrative_map.scenes must be an array');
  });
});

describe('validateScript', () => {
  it('passes for a valid script object', () => {
    expect(() =>
      validateScript({ scenes: [{ sceneIndex: 1, voiceover: 'text' }] })
    ).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateScript([])).toThrow('script is not an object');
  });

  it('rejects when scenes is not an array', () => {
    expect(() => validateScript({ scenes: 'text' })).toThrow('script.scenes must be an array');
  });
});

describe('validateStoryboard', () => {
  it('passes for a valid storyboard object', () => {
    expect(() =>
      validateStoryboard({
        scenes: [{ sceneIndex: 1, visualPrompt: 'a scene', estimatedDurationSec: 5 }],
      })
    ).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => validateStoryboard(null)).toThrow('storyboard is not an object');
  });

  it('rejects when scenes is not an array', () => {
    expect(() => validateStoryboard({ scenes: 123 })).toThrow('storyboard.scenes must be an array');
  });

  it('rejects when a scene entry is not an object', () => {
    expect(() => validateStoryboard({ scenes: ['bad'] })).toThrow(
      'storyboard.scenes[0] must be an object'
    );
  });
});
