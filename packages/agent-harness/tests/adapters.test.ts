import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { ClaudeCodeAdapter } from '../src/adapters/ClaudeCodeAdapter.js';
import { CodexAdapter } from '../src/adapters/CodexAdapter.js';
import { GeminiAdapter } from '../src/adapters/GeminiAdapter.js';
import type { ExecutionRequest } from '../src/types.js';

// Mock child_process
vi.mock('child_process', () => ({
    spawn: vi.fn(),
    execSync: vi.fn(),
}));

describe('Adapters', () => {
    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    const mockRequest: ExecutionRequest = {
        taskId: 'test-task',
        systemPrompt: 'System prompt',
        workDir: '/tmp',
        messages: [{ role: 'user', content: 'Do something' }],
    };

    beforeEach(() => {
        vi.resetAllMocks();
        // Default mock implementation to return a mock process
        let closeHandler: ((code: number) => void) | null = null;
        let errorHandler: ((err: Error) => void) | null = null;

        mockSpawn.mockReturnValue({
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn((event, callback) => {
                if (event === 'close') {
                    closeHandler = callback;
                } else if (event === 'error') {
                    errorHandler = callback;
                }
            }),
            kill: vi.fn(),
            // Store handlers for test access
            _closeHandler: () => closeHandler,
            _errorHandler: () => errorHandler,
            _triggerClose: (code: number) => closeHandler?.(code),
            _triggerError: (err: Error) => errorHandler?.(err),
        });
    });

    describe('ClaudeCodeAdapter', () => {
        it('should inject correct environment variables for custom provider', async () => {
            const adapter = new ClaudeCodeAdapter({
                providerConfig: {
                    baseUrl: 'https://openrouter.ai/api',
                    apiKey: 'sk-test',
                },
            });

            // Execute the adapter
            const promise = adapter.execute(mockRequest);

            // Get the mock process and trigger close event
            const mockProcess = mockSpawn.mock.results[0].value;
            mockProcess._triggerClose(0);

            await promise;

            expect(mockSpawn).toHaveBeenCalled();
            const [cmd, args, options] = mockSpawn.mock.calls[0];

            expect(cmd).toBe('claude');
            expect(options.env.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api');
            expect(options.env.ANTHROPIC_API_KEY).toBe('sk-test');
        });

        it('should pass verbose flag when enabled', async () => {
            const adapter = new ClaudeCodeAdapter({
                verbose: true,
            });

            adapter.execute(mockRequest);

            const mockProcess = mockSpawn.mock.results[0].value;
            mockProcess._triggerClose(0);

            const [cmd, args] = mockSpawn.mock.calls[0];
            expect(args).toContain('--verbose');
        });
    });

    describe('CodexAdapter', () => {
        it('should set OpenAI env vars and default flags', async () => {
            const adapter = new CodexAdapter({
                providerConfig: {
                    baseUrl: 'https://api.openai.com/v1',
                    apiKey: 'sk-openai',
                },
            });

            adapter.execute(mockRequest);

            const mockProcess = mockSpawn.mock.results[0].value;
            mockProcess._triggerClose(0);

            const [cmd, args, options] = mockSpawn.mock.calls[0];

            expect(cmd).toBe('codex');
            expect(args).toContain('--full-auto'); // Default
            expect(options.env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
            expect(options.env.OPENAI_API_KEY).toBe('sk-openai');
        });

        it('should respect mode configuration', async () => {
            const adapter = new CodexAdapter({
                mode: 'suggest',
            });

            adapter.execute(mockRequest);

            const mockProcess = mockSpawn.mock.results[0].value;
            mockProcess._triggerClose(0);

            const [cmd, args] = mockSpawn.mock.calls[0];
            expect(args).toContain('--suggest');
        });
    });

    describe('GeminiAdapter', () => {
        it('should set Google env vars and flags', async () => {
            const adapter = new GeminiAdapter({
                providerConfig: {
                    apiKey: 'AIza-test',
                },
                sandbox: true,
                yolo: true,
            });

            adapter.execute(mockRequest);

            const mockProcess = mockSpawn.mock.results[0].value;
            mockProcess._triggerClose(0);

            const [cmd, args, options] = mockSpawn.mock.calls[0];

            expect(cmd).toBe('gemini');
            expect(args).toContain('--sandbox');
            expect(args).toContain('--yolo');
            expect(options.env.GOOGLE_API_KEY).toBe('AIza-test');
        });
    });

    describe('Error Propagation', () => {
        it('should handle CLI binary not found', async () => {
            const adapter = new ClaudeCodeAdapter({
                cliPath: '/nonexistent/binary',
            });

            const isAvailable = await adapter.isAvailable();
            expect(isAvailable).toBe(false);
        });

        it('should handle process exit with non-zero code', async () => {
            const adapter = new ClaudeCodeAdapter({});

            // Mock spawn to return a process that exits with code 1
            mockSpawn.mockReturnValueOnce({
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn((event, callback) => {
                    if (event === 'data') callback('Error output');
                }) },
                on: vi.fn((event, callback) => {
                    if (event === 'close') callback(1);
                }),
                kill: vi.fn(),
            });

            const result = await adapter.execute(mockRequest);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('Error output');
        });

        it('should handle process error event', async () => {
            const adapter = new ClaudeCodeAdapter({});

            // Mock spawn to emit error
            mockSpawn.mockReturnValueOnce({
                stdout: { on: vi.fn() },
                stderr: { on: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === 'error') callback(new Error('Process spawn failed'));
                }),
                kill: vi.fn(),
            });

            const result = await adapter.execute(mockRequest);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Process spawn failed');
        });

        it('should validate CLI path for shell injection', () => {
            expect(() => {
                const adapter = new ClaudeCodeAdapter({
                    cliPath: 'claude; rm -rf /',
                });
                // Validation happens on isAvailable or execute
                adapter.validateCliPath(adapter['cliPath']);
            }).toThrow('contains shell metacharacters');
        });

        it('should validate CLI path for command substitution', () => {
            expect(() => {
                const adapter = new ClaudeCodeAdapter({
                    cliPath: 'claude $(rm -rf /)',
                });
                adapter.validateCliPath(adapter['cliPath']);
            }).toThrow('contains shell metacharacters');
        });
    });
});
