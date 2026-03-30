import type { ProviderId, ProviderSelectors } from './types.js';

/**
 * Default selector maps for known free-tier AI chat websites.
 *
 * These selectors are fragile by nature – the target sites update their
 * DOM regularly.  The workbench UI includes a "Selector Debugger" so the
 * operator can keep them up-to-date without touching code.
 */
export const DEFAULT_PROVIDERS: Record<ProviderId, ProviderSelectors> = {
  chatgpt: {
    chatUrl: 'https://chatgpt.com/',
    promptInput: '#prompt-textarea',
    sendButton: 'button[data-testid="send-button"]',
    responseBlock: '[data-message-author-role="assistant"]',
    readyIndicator: '#prompt-textarea',
    quotaExhaustedIndicator: 'text=You\'ve reached the current usage cap',
  },

  gemini: {
    chatUrl: 'https://gemini.google.com/app',
    promptInput: '.ql-editor[contenteditable="true"]',
    sendButton: 'button[aria-label="Send message"]',
    responseBlock: '.model-response-text',
    readyIndicator: '.ql-editor[contenteditable="true"]',
    quotaExhaustedIndicator: 'text=quota',
  },

  deepseek: {
    chatUrl: 'https://chat.deepseek.com/',
    promptInput: 'textarea#chat-input',
    sendButton: 'div[class*="send"]',
    responseBlock: '.ds-markdown',
    readyIndicator: 'textarea#chat-input',
    quotaExhaustedIndicator: 'text=limit',
  },

  kimi: {
    chatUrl: 'https://kimi.moonshot.cn/',
    promptInput: '[data-testid="msh-chatinput-editor"]',
    sendButton: '[data-testid="msh-chatinput-send-button"]',
    responseBlock: '.markdown-container',
    readyIndicator: '[data-testid="msh-chatinput-editor"]',
    quotaExhaustedIndicator: 'text=limit',
  },
};
