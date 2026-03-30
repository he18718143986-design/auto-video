import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadConfig, saveConfig, getConfigPath } from './store.js';

const configPath = getConfigPath();

afterEach(async () => {
  await fs.rm(configPath, { force: true });
});

describe('loadConfig', () => {
  it('creates default config with dailyRunLimit when no file exists', async () => {
    await fs.rm(configPath, { force: true });
    const config = await loadConfig();
    expect(config.dailyRunLimit).toBe(3);
    expect(config.defaultProfileId).toBe('default');
    expect(config.profiles.length).toBeGreaterThan(0);
  });

  it('creates default config with rotationMode manual', async () => {
    await fs.rm(configPath, { force: true });
    const config = await loadConfig();
    expect(config.rotationMode).toBe('manual');
  });

  it('preserves custom dailyRunLimit when loading existing config', async () => {
    const custom = {
      defaultProfileId: 'default',
      dailyRunLimit: 10,
      launchDefaults: {
        topic: 'test',
        provider: 'mock',
        referencePath: '',
        useMock: true,
        stageProfileIds: {},
      },
      profiles: [{
        id: 'default',
        name: 'Test Profile',
        webUrl: 'https://example.com',
        promptSelector: 'textarea',
        responseSelector: '.response',
        uploadSelector: 'input[type="file"]',
        sendButtonSelector: '',
        readySelector: 'textarea',
        userDataDir: '.browser-profile/default',
        headless: false,
        allowManualLogin: true,
        navigationTimeoutMs: 45000,
        readyTimeoutMs: 10000,
        responseTimeoutMs: 120000,
        manualLoginTimeoutMs: 180000,
      }],
    };
    await fs.writeFile(configPath, JSON.stringify(custom), 'utf8');

    const config = await loadConfig();
    expect(config.dailyRunLimit).toBe(10);
  });

  it('falls back to default dailyRunLimit for invalid values', async () => {
    const custom = {
      defaultProfileId: 'default',
      dailyRunLimit: -5,
      launchDefaults: {
        topic: 'test',
        provider: 'mock',
        referencePath: '',
        useMock: true,
        stageProfileIds: {},
      },
      profiles: [{
        id: 'default',
        name: 'Test Profile',
        webUrl: 'https://example.com',
        promptSelector: 'textarea',
        responseSelector: '.response',
        uploadSelector: 'input[type="file"]',
        sendButtonSelector: '',
        readySelector: 'textarea',
        userDataDir: '.browser-profile/default',
        headless: false,
        allowManualLogin: true,
        navigationTimeoutMs: 45000,
        readyTimeoutMs: 10000,
        responseTimeoutMs: 120000,
        manualLoginTimeoutMs: 180000,
      }],
    };
    await fs.writeFile(configPath, JSON.stringify(custom), 'utf8');

    const config = await loadConfig();
    expect(config.dailyRunLimit).toBe(3);
  });

  it('falls back to default dailyRunLimit when field is missing', async () => {
    const custom = {
      defaultProfileId: 'default',
      launchDefaults: {
        topic: 'test',
        provider: 'mock',
        referencePath: '',
        useMock: true,
        stageProfileIds: {},
      },
      profiles: [{
        id: 'default',
        name: 'Test Profile',
        webUrl: 'https://example.com',
        promptSelector: 'textarea',
        responseSelector: '.response',
        uploadSelector: 'input[type="file"]',
        sendButtonSelector: '',
        readySelector: 'textarea',
        userDataDir: '.browser-profile/default',
        headless: false,
        allowManualLogin: true,
        navigationTimeoutMs: 45000,
        readyTimeoutMs: 10000,
        responseTimeoutMs: 120000,
        manualLoginTimeoutMs: 180000,
      }],
    };
    await fs.writeFile(configPath, JSON.stringify(custom), 'utf8');

    const config = await loadConfig();
    expect(config.dailyRunLimit).toBe(3);
  });
});

describe('saveConfig', () => {
  it('persists dailyRunLimit to disk', async () => {
    const config = await loadConfig();
    config.dailyRunLimit = 7;
    await saveConfig(config);

    const reloaded = await loadConfig();
    expect(reloaded.dailyRunLimit).toBe(7);
  });

  it('persists rotationMode to disk', async () => {
    const config = await loadConfig();
    config.rotationMode = 'round-robin';
    await saveConfig(config);

    const reloaded = await loadConfig();
    expect(reloaded.rotationMode).toBe('round-robin');
  });
});

describe('rotationMode normalization', () => {
  it('preserves valid round-robin mode', async () => {
    const custom = {
      defaultProfileId: 'default',
      rotationMode: 'round-robin',
      launchDefaults: { topic: 'test', provider: 'mock', referencePath: '', useMock: true, stageProfileIds: {} },
      profiles: [{ id: 'default', name: 'Test', webUrl: 'https://example.com', promptSelector: 'textarea', responseSelector: '.r', uploadSelector: 'input[type="file"]', sendButtonSelector: '', readySelector: 'textarea', userDataDir: '.browser-profile/default', headless: false, allowManualLogin: true, navigationTimeoutMs: 45000, readyTimeoutMs: 10000, responseTimeoutMs: 120000, manualLoginTimeoutMs: 180000 }],
    };
    await fs.writeFile(configPath, JSON.stringify(custom), 'utf8');

    const config = await loadConfig();
    expect(config.rotationMode).toBe('round-robin');
  });

  it('falls back to manual for invalid rotation mode', async () => {
    const custom = {
      defaultProfileId: 'default',
      rotationMode: 'invalid-mode',
      launchDefaults: { topic: 'test', provider: 'mock', referencePath: '', useMock: true, stageProfileIds: {} },
      profiles: [{ id: 'default', name: 'Test', webUrl: 'https://example.com', promptSelector: 'textarea', responseSelector: '.r', uploadSelector: 'input[type="file"]', sendButtonSelector: '', readySelector: 'textarea', userDataDir: '.browser-profile/default', headless: false, allowManualLogin: true, navigationTimeoutMs: 45000, readyTimeoutMs: 10000, responseTimeoutMs: 120000, manualLoginTimeoutMs: 180000 }],
    };
    await fs.writeFile(configPath, JSON.stringify(custom), 'utf8');

    const config = await loadConfig();
    expect(config.rotationMode).toBe('manual');
  });

  it('falls back to manual when rotationMode is missing', async () => {
    const custom = {
      defaultProfileId: 'default',
      launchDefaults: { topic: 'test', provider: 'mock', referencePath: '', useMock: true, stageProfileIds: {} },
      profiles: [{ id: 'default', name: 'Test', webUrl: 'https://example.com', promptSelector: 'textarea', responseSelector: '.r', uploadSelector: 'input[type="file"]', sendButtonSelector: '', readySelector: 'textarea', userDataDir: '.browser-profile/default', headless: false, allowManualLogin: true, navigationTimeoutMs: 45000, readyTimeoutMs: 10000, responseTimeoutMs: 120000, manualLoginTimeoutMs: 180000 }],
    };
    await fs.writeFile(configPath, JSON.stringify(custom), 'utf8');

    const config = await loadConfig();
    expect(config.rotationMode).toBe('manual');
  });
});
