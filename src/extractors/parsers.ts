export function extractFirstJsonBlock(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON block found in text');
  }
  return JSON.parse(text.slice(start, end + 1));
}
