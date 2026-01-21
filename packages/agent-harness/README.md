# @jetpack-agent/agent-harness

A model-agnostic agent harness for Jetpack Swarm that wraps various AI coding assistant CLIs into a unified interface.

## Supported Adapters

This package provides adapters for the following CLI tools:

### 1. Claude Code (`ClaudeCodeAdapter`)
Wraps the Anthropic `claude` CLI.

**Features:**
- Native Anthropic API support.
- OpenRouter / Custom Provider support (via `providerConfig`).
- Local LLM support (e.g., Ollama) via OpenAI-compatible endpoints.
- Detailed logging with `--verbose`.

**Configuration:**
```typescript
interface ClaudeCodeConfig {
  /** Custom provider configuration */
  providerConfig?: {
    baseUrl?: string;    // e.g., "https://openrouter.ai/api"
    apiKey?: string;     // Environment variable injection
  };
  /** Pass explicit model ID */
  model?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}
```

### 2. OpenAI Codex (`CodexAdapter`)
Wraps the OpenAI `codex` CLI.

**Features:**
- OpenAI API support.
- Automation modes: `suggest`, `auto-edit`, `full-auto`.

**Configuration:**
```typescript
interface CodexConfig {
  /** Automation mode */
  mode?: 'suggest' | 'auto-edit' | 'full-auto';
  /** Custom provider config */
  providerConfig?: {
    baseUrl?: string;
    apiKey?: string;
  };
}
```

### 3. Google Gemini (`GeminiAdapter`)
Wraps the Google `gemini` CLI.

**Features:**
- Google AI Studio support.
- Sandbox mode (`--sandbox`) for safe execution.
- YOLO mode (`--yolo`) to skip confirmation prompts.

**Configuration:**
```typescript
interface GeminiConfig {
  /** Run in sandbox mode */
  sandbox?: boolean;
  /** Skip confirmations */
  yolo?: boolean;
}
```

## Usage

### Factory Creation
Use the `createAdapter` factory to instantiate adapters based on a string identifier:

```typescript
import { createAdapter } from '@jetpack-agent/agent-harness';

const adapter = createAdapter('claude-code', {
  model: 'anthropic/claude-3-5-sonnet',
  verbose: true,
  providerConfig: {
    baseUrl: 'https://openrouter.ai/api',
    apiKey: process.env.OPENROUTER_API_KEY
  }
});

const result = await adapter.execute(request);
```

### CLI Integration
The `swarm-cli` uses this harness to support multiple "flavors" of agents.
