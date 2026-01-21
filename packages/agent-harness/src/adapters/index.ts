export { BaseAdapter } from './BaseAdapter.js';
export { ClaudeCodeAdapter, createClaudeCodeAdapter } from './ClaudeCodeAdapter.js';
export type { ClaudeCodeConfig } from './ClaudeCodeAdapter.js';
export { CodexAdapter, createCodexAdapter } from './CodexAdapter.js';
export type { CodexConfig } from './CodexAdapter.js';
export { GeminiAdapter, createGeminiAdapter } from './GeminiAdapter.js';
export type { GeminiConfig } from './GeminiAdapter.js';
export { MockAdapter, createMockAdapter } from './MockAdapter.js';
export type { MockAdapterConfig } from './MockAdapter.js';

import { createClaudeCodeAdapter } from './ClaudeCodeAdapter.js';
import { createCodexAdapter } from './CodexAdapter.js';
import { createGeminiAdapter } from './GeminiAdapter.js';
import { createMockAdapter } from './MockAdapter.js';
import { BaseAdapter } from './BaseAdapter.js';
import type { ClaudeCodeConfig } from './ClaudeCodeAdapter.js';
import type { CodexConfig } from './CodexAdapter.js';
import type { GeminiConfig } from './GeminiAdapter.js';
import type { MockAdapterConfig } from './MockAdapter.js';

export type AdapterConfig =
  | Partial<ClaudeCodeConfig>
  | Partial<CodexConfig>
  | Partial<GeminiConfig>
  | Partial<MockAdapterConfig>;

export function createAdapter(type: string, config: AdapterConfig = {}): BaseAdapter {
    switch (type) {
        case 'claude-code':
        case 'claude':
            return createClaudeCodeAdapter(config);
        case 'codex':
        case 'openai':
            return createCodexAdapter(config);
        case 'gemini':
        case 'google':
            return createGeminiAdapter(config);
        case 'custom':
        case 'mock':
            return createMockAdapter(config);
        default:
            throw new Error(`Unknown agent type: ${type}`);
    }
}
