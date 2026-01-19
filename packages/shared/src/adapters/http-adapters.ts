/**
 * HTTP Client Adapters for Hybrid Cloudflare Architecture
 *
 * These adapters implement the storage interfaces (ITaskStore, IMailBus, IMemoryStore)
 * by calling the Jetpack Worker API over HTTP. Used when running in hybrid or edge mode
 * from a local CLI.
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import {
  ITaskStore,
  IMailBus,
  IMemoryStore,
  LeaseStatus,
  TaskStats,
  TaskInput,
  TaskUpdate,
  TaskListOptions,
  MessageHandler,
  MemoryInput,
  MemoryStats,
} from './interfaces';
import { Task, TaskStatus } from '../types/task';
import { Message, MessageType } from '../types/message';
import { MemoryEntry, MemoryType } from '../types/memory';

/**
 * Configuration for HTTP client adapters
 */
export interface HttpAdapterConfig {
  /** Worker API base URL (e.g., https://jetpack-api.your-account.workers.dev) */
  workerUrl: string;
  /** API token for authentication */
  apiToken: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Base HTTP client with common functionality
 */
class HttpClient {
  protected baseUrl: string;
  protected apiToken: string;
  protected timeoutMs: number;

  constructor(config: HttpAdapterConfig) {
    this.baseUrl = config.workerUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  protected async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`HTTP ${response.status}: ${(error as { error?: string }).error || response.statusText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// HttpTaskStore - ITaskStore implementation
// ============================================================================

/**
 * HTTP client implementation of ITaskStore
 * Calls the Worker API for task storage operations
 */
export class HttpTaskStore extends HttpClient implements ITaskStore {
  constructor(config: HttpAdapterConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    // Verify connection by calling health endpoint
    await this.fetch<{ status: string }>('/');
  }

  async close(): Promise<void> {
    // No-op for HTTP client
  }

  async createTask(input: TaskInput): Promise<Task> {
    return this.fetch<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getTask(id: string): Promise<Task | null> {
    try {
      return await this.fetch<Task>(`/api/tasks/${id}`);
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async updateTask(id: string, updates: TaskUpdate): Promise<Task | null> {
    try {
      return await this.fetch<Task>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async deleteTask(id: string): Promise<boolean> {
    try {
      await this.fetch<{ deleted: boolean }>(`/api/tasks/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  async listTasks(options?: TaskListOptions): Promise<Task[]> {
    const params = new URLSearchParams();
    if (options?.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      statuses.forEach((s: TaskStatus) => params.append('status', s));
    }
    if (options?.priority) {
      const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
      priorities.forEach((p: string) => params.append('priority', p));
    }
    if (options?.assignedAgent) {
      params.set('assignedAgent', options.assignedAgent);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.offset) {
      params.set('offset', String(options.offset));
    }

    const queryString = params.toString();
    const path = queryString ? `/api/tasks?${queryString}` : '/api/tasks';
    return this.fetch<Task[]>(path);
  }

  async getReadyTasks(): Promise<Task[]> {
    return this.fetch<Task[]>('/api/tasks/ready');
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.listTasks({ status });
  }

  async getTasksByAgent(agentId: string): Promise<Task[]> {
    return this.listTasks({ assignedAgent: agentId });
  }

  async claimTask(taskId: string, agentId: string): Promise<Task | null> {
    try {
      return await this.fetch<Task>(`/api/tasks/${taskId}/claim`, {
        method: 'POST',
        body: JSON.stringify({ agentId }),
      });
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async releaseTask(taskId: string): Promise<boolean> {
    try {
      await this.fetch<{ released: boolean }>(`/api/tasks/${taskId}/release`, {
        method: 'POST',
      });
      return true;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  async getStats(): Promise<TaskStats> {
    return this.fetch<TaskStats>('/api/tasks/stats');
  }
}

// ============================================================================
// HttpMailBus - IMailBus implementation
// ============================================================================

/**
 * HTTP client implementation of IMailBus
 * Uses HTTP for publishing and WebSocket for subscriptions
 */
export class HttpMailBus extends HttpClient implements IMailBus {
  readonly agentId: string;
  private subscriptions: Map<MessageType, Set<MessageHandler>> = new Map();
  private websocket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;

  constructor(config: HttpAdapterConfig & { agentId: string }) {
    super(config);
    this.agentId = config.agentId;
  }

  async initialize(): Promise<void> {
    // Connect WebSocket for subscriptions
    await this.connectWebSocket();
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.subscriptions.clear();
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = this.baseUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    const url = `${wsUrl}/api/mail/subscribe?agentId=${encodeURIComponent(this.agentId)}`;

    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
          },
        } as unknown as string[]);

        this.websocket.onopen = () => {
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data as string) as Message;
            this.dispatchMessage(message);
          } catch {
            // Ignore malformed messages
          }
        };

        this.websocket.onclose = () => {
          if (!this.isShuttingDown) {
            this.scheduleReconnect();
          }
        };

        this.websocket.onerror = (error) => {
          if (!this.isShuttingDown) {
            reject(error);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connectWebSocket();
      } catch {
        this.scheduleReconnect();
      }
    }, 5000); // Reconnect after 5 seconds
  }

  private dispatchMessage(message: Message): void {
    const handlers = this.subscriptions.get(message.type as MessageType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          void handler(message);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  async publish(message: Message): Promise<void> {
    await this.fetch<{ published: boolean }>('/api/mail/publish', {
      method: 'POST',
      body: JSON.stringify(message),
    });
  }

  subscribe(type: MessageType, handler: MessageHandler): void {
    if (!this.subscriptions.has(type)) {
      this.subscriptions.set(type, new Set());
    }
    this.subscriptions.get(type)!.add(handler);
  }

  unsubscribe(type: MessageType, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(type);
      }
    }
  }

  async sendTo(agentId: string, message: Message): Promise<void> {
    await this.publish({
      ...message,
      to: agentId,
    });
  }

  async acquireLease(file: string, ttlMs: number): Promise<boolean> {
    try {
      const result = await this.fetch<{ acquired: boolean }>('/api/mail/lease', {
        method: 'POST',
        body: JSON.stringify({ file, agentId: this.agentId, ttlMs }),
      });
      return result.acquired;
    } catch {
      return false;
    }
  }

  async releaseLease(file: string): Promise<void> {
    await this.fetch<{ released: boolean }>('/api/mail/lease', {
      method: 'DELETE',
      body: JSON.stringify({ file, agentId: this.agentId }),
    });
  }

  async isLeased(file: string): Promise<LeaseStatus> {
    return this.fetch<LeaseStatus>(`/api/mail/lease?file=${encodeURIComponent(file)}`);
  }

  async sendHeartbeat(): Promise<void> {
    await this.publish({
      id: '',
      type: 'heartbeat',
      from: this.agentId,
      payload: { timestamp: new Date().toISOString() },
      timestamp: new Date(),
    });
  }

  async acknowledge(messageId: string, agentId: string): Promise<void> {
    // Acknowledgement is handled via the coordination mechanism
    await this.publish({
      id: '',
      type: 'coordination.response',
      from: agentId,
      payload: { messageId, action: 'ack' },
      timestamp: new Date(),
    });
  }
}

// ============================================================================
// HttpMemoryStore - IMemoryStore implementation
// ============================================================================

/**
 * HTTP client implementation of IMemoryStore
 * Calls the Worker API for memory storage operations
 */
export class HttpMemoryStore extends HttpClient implements IMemoryStore {
  constructor(config: HttpAdapterConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    // Verify connection by calling health endpoint
    await this.fetch<{ status: string }>('/');
  }

  close(): void {
    // No-op for HTTP client
  }

  async store(entry: MemoryInput): Promise<string> {
    const result = await this.fetch<{ id: string }>('/api/memory', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    return result.id;
  }

  async retrieve(id: string): Promise<MemoryEntry | null> {
    try {
      return await this.fetch<MemoryEntry>(`/api/memory/${id}`);
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.fetch<{ deleted: boolean }>(`/api/memory/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  async search(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    return this.fetch<MemoryEntry[]>('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    });
  }

  async semanticSearch(embedding: number[], limit: number = 10): Promise<MemoryEntry[]> {
    return this.fetch<MemoryEntry[]>('/api/memory/semantic', {
      method: 'POST',
      body: JSON.stringify({ embedding, limit }),
    });
  }

  async semanticSearchByQuery(query: string, limit: number = 10): Promise<MemoryEntry[]> {
    return this.fetch<MemoryEntry[]>('/api/memory/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    });
  }

  async compact(threshold: number): Promise<number> {
    const result = await this.fetch<{ removed: number }>('/api/memory/compact', {
      method: 'POST',
      body: JSON.stringify({ threshold }),
    });
    return result.removed;
  }

  async adaptiveCompact(): Promise<number> {
    const result = await this.fetch<{ removed: number }>('/api/memory/compact', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return result.removed;
  }

  async updateImportance(id: string, importance: number): Promise<void> {
    await this.fetch<MemoryEntry>(`/api/memory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ importance }),
    });
  }

  async getStats(): Promise<MemoryStats> {
    return this.fetch<MemoryStats>('/api/memory/stats');
  }

  async getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]> {
    const params = limit ? `?limit=${limit}` : '';
    return this.fetch<MemoryEntry[]>(`/api/memory/type/${type}${params}`);
  }

  async getRecentMemories(limit: number = 50): Promise<MemoryEntry[]> {
    return this.fetch<MemoryEntry[]>(`/api/memory?limit=${limit}`);
  }

  async backfillEmbeddings(batchSize: number = 10): Promise<number> {
    const result = await this.fetch<{ processed: number }>('/api/memory/backfill', {
      method: 'POST',
      body: JSON.stringify({ batchSize }),
    });
    return result.processed;
  }

  async getEmbeddingStats(): Promise<{
    withEmbedding: number;
    withoutEmbedding: number;
    total: number;
  }> {
    const stats = await this.getStats();
    return {
      withEmbedding: stats.withEmbedding ?? 0,
      withoutEmbedding: stats.withoutEmbedding ?? 0,
      total: stats.total,
    };
  }

  hasEmbeddingGenerator(): boolean {
    // HTTP adapter relies on server-side embedding generation
    return true;
  }
}
