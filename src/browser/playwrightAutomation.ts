import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { ensureDir, fileExists } from '../utils/fs.js';
import type {
  BrowserAutomationSession,
  SelectorDebugRequest,
  SelectorDebugResult,
  SelectorProbeResult,
  BrowserPromptRequest,
  BrowserPromptResult,
  SessionHealth,
} from '../orchestrator/types.js';

interface AutomationConfig {
  webUrl: string;
  promptSelector: string;
  responseSelector: string;
  uploadSelector: string;
  sendButtonSelector: string | null;
  readySelector: string;
  headless: boolean;
  allowManualLogin: boolean;
  navigationTimeoutMs: number;
  readyTimeoutMs: number;
  responseTimeoutMs: number;
  manualLoginTimeoutMs: number;
  userDataDir: string;
  previewIntervalMs: number;
}

export async function createPlaywrightAutomationSession(params: {
  provider: string;
  runDir: string;
}): Promise<BrowserAutomationSession> {
  const config = buildConfig(params.provider);
  await ensureDir(config.userDataDir);

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1440, height: 960 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  return new PlaywrightAutomationSession(context, page, config, params.runDir);
}

class PlaywrightAutomationSession implements BrowserAutomationSession {
  private previewTimer?: NodeJS.Timeout;
  private previewCaptureInFlight = false;

  constructor(
    private readonly context: BrowserContext,
    private readonly page: Page,
    private readonly config: AutomationConfig,
    private readonly runDir: string
  ) {}

  async checkSession(): Promise<SessionHealth> {
    const checks: string[] = [];
    await this.page.goto(this.config.webUrl, {
      timeout: this.config.navigationTimeoutMs,
      waitUntil: 'domcontentloaded',
    });
    this.startPreviewLoop();
    checks.push(`opened page: ${this.config.webUrl}`);

    const ready = await this.waitForReady();
    checks.push(...ready.checks);

    const uploadVisible = await this.page
      .locator(this.config.uploadSelector)
      .first()
      .isVisible()
      .catch(() => false);
    checks.push(
      uploadVisible
        ? `upload selector visible: ${this.config.uploadSelector}`
        : `upload selector not visible: ${this.config.uploadSelector}`
    );

    return {
      ok: ready.ok,
      needsHuman: ready.needsHuman,
      checks,
    };
  }

  async uploadReferenceFile(filePath: string): Promise<void> {
    if (!(await fileExists(filePath))) {
      throw new Error(`Reference file not found: ${filePath}`);
    }

    await this.page.waitForSelector(this.config.uploadSelector, { timeout: this.config.readyTimeoutMs });
    await this.page.setInputFiles(this.config.uploadSelector, filePath);
  }

  async runPrompt(request: BrowserPromptRequest): Promise<BrowserPromptResult> {
    this.startPreviewLoop();
    if (request.uploadPath) {
      await this.uploadReferenceFile(request.uploadPath);
    }

    await this.page.waitForSelector(this.config.promptSelector, {
      timeout: this.config.readyTimeoutMs,
    });
    const promptInput = this.page.locator(this.config.promptSelector).last();
    const responseLocator = this.page.locator(this.config.responseSelector);
    const beforeCount = await responseLocator.count();

    await promptInput.click({ timeout: this.config.readyTimeoutMs });
    await promptInput.fill(request.prompt);
    await this.sendPrompt();

    await this.waitForResponse(beforeCount);

    const afterCount = await responseLocator.count();
    if (afterCount === 0) {
      throw new Error(`No response messages found with selector: ${this.config.responseSelector}`);
    }

    const responseIndex = Math.max(0, afterCount - 1);
    const text = (await responseLocator.nth(responseIndex).innerText()).trim();
    if (!text) {
      throw new Error('Response message is empty.');
    }

    if (!request.screenshotPath) {
      return { text, responseIndex };
    }

    await this.captureScreenshot(request.screenshotPath, true);
    return { text, responseIndex, screenshotPath: request.screenshotPath };
  }

  async debugSelectors(request: SelectorDebugRequest): Promise<SelectorDebugResult> {
    const webUrl = request.webUrl || this.config.webUrl;
    const checks: string[] = [];
    await this.page.goto(webUrl, {
      timeout: this.config.navigationTimeoutMs,
      waitUntil: 'domcontentloaded',
    });
    this.startPreviewLoop();
    checks.push(`opened page: ${webUrl}`);

    const entries: SelectorProbeResult[] = [];
    for (const selectorEntry of request.selectors) {
      const probe = await this.probeSelector(selectorEntry.name, selectorEntry.selector);
      entries.push(probe);
    }

    let screenshotPath: string | undefined;
    if (request.screenshotPath) {
      await this.captureScreenshot(request.screenshotPath, true);
      screenshotPath = request.screenshotPath;
    }

    return {
      ok: entries.every((entry) => !entry.error),
      webUrl,
      checks,
      entries,
      screenshotPath,
    };
  }

  async close(): Promise<void> {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = undefined;
    }
    await this.context.close();
  }

  private async waitForReady(): Promise<SessionHealth> {
    const checks: string[] = [];
    const promptSelector = this.config.readySelector || this.config.promptSelector;

    const quickReady = await this.page
      .waitForSelector(promptSelector, { timeout: this.config.readyTimeoutMs })
      .then(() => true)
      .catch(() => false);

    if (quickReady) {
      checks.push(`ready selector detected: ${promptSelector}`);
      return { ok: true, needsHuman: false, checks };
    }

    if (!this.config.allowManualLogin) {
      checks.push(`ready selector missing: ${promptSelector}`);
      return { ok: false, needsHuman: true, checks };
    }

    checks.push(`ready selector missing, waiting for manual login: ${promptSelector}`);
    console.log('[auto-video] Prompt input not found yet. Complete login/CAPTCHA manually in the opened browser window.');

    const manualReady = await this.page
      .waitForSelector(promptSelector, { timeout: this.config.manualLoginTimeoutMs })
      .then(() => true)
      .catch(() => false);

    if (!manualReady) {
      checks.push('manual login timeout reached');
      return { ok: false, needsHuman: true, checks };
    }

    checks.push('manual login complete');
    return { ok: true, needsHuman: false, checks };
  }

  private async sendPrompt(): Promise<void> {
    if (this.config.sendButtonSelector) {
      const sendButton = this.page.locator(this.config.sendButtonSelector).first();
      const visible = await sendButton.isVisible().catch(() => false);
      if (visible) {
        await sendButton.click({ timeout: this.config.readyTimeoutMs });
        return;
      }
    }

    await this.page.keyboard.press('Enter');
  }

  private async waitForResponse(beforeCount: number): Promise<void> {
    try {
      await this.page.waitForFunction(
        ({ selector, count }) => document.querySelectorAll(selector).length > count,
        { selector: this.config.responseSelector, count: beforeCount },
        {
          timeout: this.config.responseTimeoutMs,
        }
      );
      return;
    } catch {
      // Fallback: some providers stream into an existing assistant node.
    }

    const locator = this.page.locator(this.config.responseSelector);
    const fallbackCount = await locator.count();
    if (fallbackCount === 0) {
      throw new Error(`Timed out waiting for response selector: ${this.config.responseSelector}`);
    }

    await this.page.waitForTimeout(1500);
  }

  private startPreviewLoop(): void {
    if (this.previewTimer) return;

    const livePath = path.join('screenshots', 'live', 'latest.jpg');
    this.previewTimer = setInterval(() => {
      void this.captureLivePreview(livePath);
    }, this.config.previewIntervalMs);
  }

  private async captureLivePreview(relativePath: string): Promise<void> {
    if (this.previewCaptureInFlight) return;
    this.previewCaptureInFlight = true;
    try {
      await this.captureScreenshot(relativePath, false);
    } catch {
      // Ignore screenshot capture errors while the page is changing.
    } finally {
      this.previewCaptureInFlight = false;
    }
  }

  private async captureScreenshot(relativePath: string, fullPage: boolean): Promise<void> {
    const absolutePath = path.join(this.runDir, relativePath);
    await ensureDir(path.dirname(absolutePath));
    await this.page.screenshot({ path: absolutePath, fullPage });
  }

  private async probeSelector(name: string, selector: string): Promise<SelectorProbeResult> {
    const trimmed = selector.trim();
    if (!trimmed) {
      return {
        name,
        selector,
        count: 0,
        visible: false,
        error: 'Selector is empty.',
      };
    }

    try {
      const locator = this.page.locator(trimmed);
      const count = await locator.count();
      const first = locator.first();
      const visible = count > 0 ? await first.isVisible().catch(() => false) : false;
      const sampleText = count > 0
        ? (await first.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 180)
        : '';
      return {
        name,
        selector: trimmed,
        count,
        visible,
        sampleText: sampleText || undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name,
        selector: trimmed,
        count: 0,
        visible: false,
        error: message,
      };
    }
  }
}

function buildConfig(provider: string): AutomationConfig {
  const webUrl = readRequiredEnv('AUTO_VIDEO_WEB_URL');
  const headless = readBooleanEnv('AUTO_VIDEO_HEADLESS', false);
  const allowManualLogin = readBooleanEnv('AUTO_VIDEO_ALLOW_MANUAL_LOGIN', true);
  const navigationTimeoutMs = readNumberEnv('AUTO_VIDEO_NAV_TIMEOUT_MS', 45_000);
  const readyTimeoutMs = readNumberEnv('AUTO_VIDEO_READY_TIMEOUT_MS', 10_000);
  const responseTimeoutMs = readNumberEnv('AUTO_VIDEO_RESPONSE_TIMEOUT_MS', 120_000);
  const manualLoginTimeoutMs = readNumberEnv('AUTO_VIDEO_MANUAL_LOGIN_TIMEOUT_MS', 180_000);
  const promptSelector = process.env.AUTO_VIDEO_PROMPT_SELECTOR?.trim() || 'textarea';
  const responseSelector = process.env.AUTO_VIDEO_RESPONSE_SELECTOR?.trim()
    || '[data-message-author-role="assistant"], [data-role="assistant"], .assistant, article';
  const uploadSelector = process.env.AUTO_VIDEO_UPLOAD_SELECTOR?.trim() || 'input[type="file"]';
  const readySelector = process.env.AUTO_VIDEO_READY_SELECTOR?.trim() || promptSelector;
  const sendButtonSelector = process.env.AUTO_VIDEO_SEND_BUTTON_SELECTOR?.trim() || null;
  const previewIntervalMs = readNumberEnv('AUTO_VIDEO_PREVIEW_INTERVAL_MS', 2_500);

  const profileRoot = process.env.AUTO_VIDEO_USER_DATA_DIR?.trim()
    || path.join(process.cwd(), '.browser-profile', sanitize(provider));

  return {
    webUrl,
    promptSelector,
    responseSelector,
    uploadSelector,
    sendButtonSelector,
    readySelector,
    headless,
    allowManualLogin,
    navigationTimeoutMs,
    readyTimeoutMs,
    responseTimeoutMs,
    manualLoginTimeoutMs,
    userDataDir: profileRoot,
    previewIntervalMs,
  };
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Playwright mode.`);
  }
  return value;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return defaultValue;
  return value === '1' || value === 'true' || value === 'yes';
}

function readNumberEnv(name: string, defaultValue: number): number {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
