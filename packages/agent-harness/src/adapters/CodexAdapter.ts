import { spawn, execSync } from 'child_process';
import type {
    ModelConfig,
    ExecutionRequest,
    ExecutionResult,
    ProgressCallback,
    OutputCallback,
} from '../types.js';
import { BaseAdapter } from './BaseAdapter.js';
import { TIMING, TASK } from '../constants.js';

/**
 * Configuration specific to Codex CLI
 */
export interface CodexConfig extends ModelConfig {
    /** Path to codex CLI binary (default: 'codex') */
    cliPath?: string;
    /** Automation mode */
    mode?: 'suggest' | 'auto-edit' | 'full-auto';
    /** Provider configuration */
    providerConfig?: {
        baseUrl?: string;
        apiKey?: string;
    };
}

/**
 * Adapter for OpenAI Codex CLI
 */
export class CodexAdapter extends BaseAdapter {
    private cliPath: string;
    declare config: CodexConfig;

    constructor(config: CodexConfig) {
        super({ ...config, provider: 'codex' });
        this.cliPath = config.cliPath ?? 'codex';
        this.config = config;
    }

    async isAvailable(): Promise<boolean> {
        this.validateCliPath(this.cliPath);

        try {
            execSync(`${this.cliPath} --version`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    async execute(
        request: ExecutionRequest,
        onProgress?: ProgressCallback,
        onOutput?: OutputCallback
    ): Promise<ExecutionResult> {
        this.validateCliPath(this.cliPath);

        const startTime = Date.now();

        const args: string[] = [];

        // Add mode flag
        if (this.config.mode) {
            args.push(`--${this.config.mode}`);
        } else {
            args.push('--full-auto');  // Default for automation
        }

        // Add model
        if (this.config.model && this.config.model !== 'default') {
            args.push('--model', this.config.model);
        }

        // Add prompt
        // Combine system prompt and task
        const fullPrompt = `${request.systemPrompt}\n\nTask:\n${request.messages?.map(m => m.content).join('\n') || ''}`;
        args.push(fullPrompt);

        return new Promise((resolve) => {
            const env: NodeJS.ProcessEnv = {
                ...process.env,
            };

            if (this.config.providerConfig?.baseUrl) {
                env.OPENAI_BASE_URL = this.config.providerConfig.baseUrl;
            }
            if (this.config.providerConfig?.apiKey) {
                env.OPENAI_API_KEY = this.config.providerConfig.apiKey;
            } else if (this.config.apiKey) {
                env.OPENAI_API_KEY = this.config.apiKey;
            }

            const proc = spawn(this.cliPath, args, {
                cwd: request.workDir,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                onOutput?.(chunk);
            });

            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            const timeoutMs = request.timeoutMs ?? this.config.timeoutMs ?? TIMING.DEFAULT_TIMEOUT_MS;
            const clearTimeoutFn = this.setupProcessTimeout(
                proc,
                timeoutMs,
                (error) => {
                    resolve({
                        success: false,
                        output: stdout,
                        filesCreated: [],
                        filesModified: [],
                        filesDeleted: [],
                        error: error.message,
                        durationMs: Date.now() - startTime,
                    });
                }
            );

            proc.on('close', (code) => {
                clearTimeoutFn();
                const durationMs = Date.now() - startTime;
                const files = this.parseFilesFromOutput(stdout);
                const success = code === 0 && !stderr.toLowerCase().includes('error');

                resolve({
                    success,
                    output: stdout,
                    filesCreated: files.filesCreated,
                    filesModified: files.filesModified,
                    filesDeleted: files.filesDeleted,
                    error: success ? undefined : stderr || `Process exited with code ${code}`,
                    durationMs,
                });
            });

            proc.on('error', (err) => {
                clearTimeoutFn();
                resolve({
                    success: false,
                    output: stdout,
                    filesCreated: [],
                    filesModified: [],
                    filesDeleted: [],
                    error: err.message,
                    durationMs: Date.now() - startTime,
                });
            });
        });
    }
}

export function createCodexAdapter(config: Partial<CodexConfig> = {}): CodexAdapter {
    return new CodexAdapter({
        provider: 'codex',
        model: 'default', // Default model
        ...config,
    });
}
