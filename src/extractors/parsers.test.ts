import { describe, it, expect } from 'vitest';
import { extractFirstJsonBlock } from './parsers.js';

describe('extractFirstJsonBlock', () => {
  it('extracts a JSON object from surrounding text', () => {
    const raw = 'Some text before\n```json\n{"key": "value"}\n```\nafter';
    expect(extractFirstJsonBlock(raw)).toEqual({ key: 'value' });
  });

  it('extracts from a string that is just JSON', () => {
    expect(extractFirstJsonBlock('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts from text with nested braces', () => {
    const raw = 'prefix {"outer": {"inner": true}} suffix';
    expect(extractFirstJsonBlock(raw)).toEqual({ outer: { inner: true } });
  });

  it('throws when no braces are present', () => {
    expect(() => extractFirstJsonBlock('no json here')).toThrow('No JSON block found');
  });

  it('throws when braces are in wrong order', () => {
    expect(() => extractFirstJsonBlock('} before {')).toThrow('No JSON block found');
  });

  it('throws on invalid JSON between braces', () => {
    expect(() => extractFirstJsonBlock('{ not valid json }')).toThrow();
  });

  it('handles an array-like response by finding the outermost object', () => {
    const raw = 'Here is the result: {"scenes": [{"id": 1}, {"id": 2}]}';
    const result = extractFirstJsonBlock(raw) as Record<string, unknown>;
    expect(result.scenes).toHaveLength(2);
  });
});
