import type { BrowserContext, Page } from 'playwright';
import type { ProviderSelectors } from './types.js';

export interface ChatResult {
  answer: string;
  quotaExhausted: boolean;
}

export interface ChatAutomationOptions {
  /** Max ms to wait for the ready indicator after navigation. */
  readyTimeout?: number;
  /** Max ms to wait for the AI response to appear. */
  responseTimeout?: number;
  /** Interval (ms) to poll for response stability. */
  pollInterval?: number;
}

const DEFAULTS: Required<ChatAutomationOptions> = {
  readyTimeout: 30_000,
  responseTimeout: 120_000,
  pollInterval: 2_000,
};

/**
 * Drives a single prompt→response cycle on a live browser page.
 *
 * Lifecycle managed externally — this module only deals with one page
 * that is already attached to a persistent BrowserContext.
 */
export async function openChat(
  context: BrowserContext,
  selectors: ProviderSelectors,
  opts?: ChatAutomationOptions,
): Promise<Page> {
  const { readyTimeout } = { ...DEFAULTS, ...opts };
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(selectors.chatUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(selectors.readyIndicator, { timeout: readyTimeout });
  return page;
}

/**
 * Send a prompt and wait for the AI response to stabilize.
 *
 * "Stabilize" means the response text has not changed for two consecutive
 * poll intervals.
 */
export async function sendPrompt(
  page: Page,
  question: string,
  selectors: ProviderSelectors,
  opts?: ChatAutomationOptions,
): Promise<ChatResult> {
  const { responseTimeout, pollInterval } = { ...DEFAULTS, ...opts };

  // --- count existing response blocks so we know when a *new* one appears ---
  const beforeCount = await page.locator(selectors.responseBlock).count();

  // --- type the question ---
  const input = page.locator(selectors.promptInput);
  await input.click();
  await input.fill(question);

  // --- send ---
  if (selectors.sendButton) {
    await page.locator(selectors.sendButton).click();
  } else {
    await input.press('Enter');
  }

  // --- wait for a *new* response block to appear ---
  const deadline = Date.now() + responseTimeout;

  // Wait for response count to increase
  while (Date.now() < deadline) {
    const currentCount = await page.locator(selectors.responseBlock).count();
    if (currentCount > beforeCount) break;
    await page.waitForTimeout(pollInterval);
  }

  // --- poll until response text stabilises ---
  let prevText = '';
  let stableCount = 0;
  const STABLE_THRESHOLD = 2; // consecutive unchanged polls

  while (Date.now() < deadline) {
    const currentText = await page
      .locator(selectors.responseBlock)
      .last()
      .innerText()
      .catch(() => '');

    if (currentText === prevText && currentText.length > 0) {
      stableCount++;
      if (stableCount >= STABLE_THRESHOLD) break;
    } else {
      stableCount = 0;
    }
    prevText = currentText;
    await page.waitForTimeout(pollInterval);
  }

  // --- check for quota exhaustion ---
  let quotaExhausted = false;
  if (selectors.quotaExhaustedIndicator) {
    try {
      const indicator = selectors.quotaExhaustedIndicator.startsWith('text=')
        ? page.getByText(selectors.quotaExhaustedIndicator.slice(5))
        : page.locator(selectors.quotaExhaustedIndicator);
      quotaExhausted = (await indicator.count()) > 0;
    } catch {
      // ignore selector errors
    }
  }

  const answer = await page
    .locator(selectors.responseBlock)
    .last()
    .innerText()
    .catch(() => '');

  return { answer, quotaExhausted };
}

/**
 * Check whether the page currently shows a quota-exhausted indicator.
 */
export async function checkQuotaExhausted(
  page: Page,
  selectors: ProviderSelectors,
): Promise<boolean> {
  if (!selectors.quotaExhaustedIndicator) return false;
  try {
    const indicator = selectors.quotaExhaustedIndicator.startsWith('text=')
      ? page.getByText(selectors.quotaExhaustedIndicator.slice(5))
      : page.locator(selectors.quotaExhaustedIndicator);
    return (await indicator.count()) > 0;
  } catch {
    return false;
  }
}
