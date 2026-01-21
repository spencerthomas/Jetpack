import { spawn } from 'child_process';
import type {
    ModelConfig,
    ExecutionRequest,
    ExecutionResult,
    ProgressCallback,
    OutputCallback,
} from '../types.js';
import { BaseAdapter } from './BaseAdapter.js';
import { TIMING } from '../constants.js';

/**
 * Configuration specific to Gemini CLI
 */
export interface GeminiConfig extends ModelConfig {
    /** Path to gemini CLI binary (default: 'gemini') */
    cliPath?: string;
    /** Run in sandbox mode */
    sandbox?: boolean;
    /** Skip confirmations (YOLO mode) */
    yolo?: boolean;
    /** Provider configuration */
    providerConfig?: {
        apiKey?: string;
    };
}

/**
 * Adapter for Google Gemini CLI
 */
export class GeminiAdapter extends BaseAdapter {
    private cliPath: string;
    declare config: GeminiConfig;

    constructor(config: GeminiConfig) {
        super({ ...config, provider: 'gemini' });
        this.cliPath = config.cliPath ?? 'gemini';
        this.config = config;
    }

    async isAvailable(): Promise<boolean> {
        this.validateCliPath(this.cliPath);

        return new Promise((resolve) => {
            const proc = spawn(this.cliPath, ['--version'], {
                stdio: ['ignore', 'pipe', 'ignore'],
            });

            proc.on('close', (code) => {
                resolve(code === 0);
            });

            proc.on('error', () => {
                resolve(false);
            });

            const clearTimeoutFn = this.setupProcessTimeout(
                proc,
                TIMING.VERSION_CHECK_TIMEOUT_MS,
                () => resolve(false)
            );
            proc.on('close', () => clearTimeoutFn());
        });
    }

    async execute(
        request: ExecutionRequest,
        onProgress?: ProgressCallback,
        onOutput?: OutputCallback
    ): Promise<ExecutionResult> {
        this.validateCliPath(this.cliPath);

        const startTime = Date.now();
        const args: string[] = [];

        if (this.config.sandbox) {
            args.push('--sandbox');
        }

        if (this.config.yolo) {
            args.push('--yolo');
        }

        if (this.config.model && this.config.model !== 'default') {
            args.push('--model', this.config.model);
        }

        // Gemini typically takes prompt as a positional arg
        const fullPrompt = `${request.systemPrompt}\n\n${request.messages?.map(m => `${m.role}: ${m.content}`).join('\n') || ''}`;
        args.push(fullPrompt);

        return new Promise((resolve) => {
            const env: NodeJS.ProcessEnv = {
                ...process.env,
            };

            if (this.config.providerConfig?.apiKey) {
                env.GOOGLE_API_KEY = this.config.providerConfig.apiKey;
            } else if (this.config.apiKey) {
                env.GOOGLE_API_KEY = this.config.apiKey;
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

export function createGeminiAdapter(config: Partial<GeminiConfig> = {}): GeminiAdapter {
    return new GeminiAdapter({
        provider: 'gemini',
        model: 'default',
        ...config,
    });
}
