import type { SessionHealth } from '../orchestrator/types.js';

export async function checkBrowserSession(provider: string): Promise<SessionHealth> {
  const checks = [
    `provider profile prepared: ${provider}`,
    'login status assumed valid (mock)',
    'upload control check passed (mock)',
    'prompt input check passed (mock)',
  ];

  return {
    ok: true,
    needsHuman: false,
    checks,
  };
}
