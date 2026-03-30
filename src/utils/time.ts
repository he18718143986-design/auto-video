export function nowIso(): string {
  return new Date().toISOString();
}

export function createRunId(date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `run_${stamp}`;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
