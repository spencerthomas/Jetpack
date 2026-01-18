/**
 * CloudflareMailBus - Durable Objects-based messaging for Cloudflare Workers
 *
 * Implements IMailBus interface using Cloudflare Durable Objects for
 * real-time pub/sub messaging and file locking.
 *
 * @see docs/HYBRID_ARCHITECTURE.md
 */

import {
  Message,
  MessageType,
  IMailBus,
  LeaseStatus,
  generateMessageId,
} from '@jetpack-agent/shared';

/**
 * Durable Object stub type
 */
export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  get(id: DurableObjectId): DurableObjectStub;
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
}

export interface DurableObjectId {
  toString(): string;
}

export interface CloudflareMailBusConfig {
  agentId: string;
  mailboxDO: DurableObjectNamespace;
  leaseDO: DurableObjectNamespace;
  workerUrl?: string;
}

type MessageHandler = (message: Message) => void | Promise<void>;

/**
 * Client-side adapter for CloudflareMailBus
 * Connects to Durable Objects via HTTP/WebSocket
 */
export class CloudflareMailBus implements IMailBus {
  private config: CloudflareMailBusConfig;
  private handlers: Map<MessageType, Set<MessageHandler>> = new Map();
  private ws?: WebSocket;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(config: CloudflareMailBusConfig) {
    this.config = config;
  }

  get agentId(): string {
    return this.config.agentId;
  }

  async initialize(): Promise<void> {
    // Connect to mailbox Durable Object via WebSocket for real-time updates
    await this.connectWebSocket();
  }

  async shutdown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  private async connectWebSocket(): Promise<void> {
    const mailboxId = this.config.mailboxDO.idFromName('global-mailbox');
    const mailbox = this.config.mailboxDO.get(mailboxId);

    const response = await mailbox.fetch(
      new Request(`https://mailbox/subscribe?agentId=${this.config.agentId}`, {
        headers: { Upgrade: 'websocket' },
      })
    );

    const ws = response.webSocket;
    if (!ws) {
      throw new Error('Failed to establish WebSocket connection');
    }

    ws.accept();

    ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as Message;
        message.timestamp = new Date(message.timestamp);
        this.dispatchMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    ws.addEventListener('close', () => {
      // Attempt to reconnect after a delay
      this.reconnectTimer = setTimeout(() => {
        this.connectWebSocket().catch(console.error);
      }, 5000);
    });

    this.ws = ws;
  }

  private dispatchMessage(message: Message): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(message);
          if (result instanceof Promise) {
            result.catch(console.error);
          }
        } catch (error) {
          console.error(`Handler error for ${message.type}:`, error);
        }
      }
    }
  }

  async publish(message: Message): Promise<void> {
    const messageWithId: Message = {
      ...message,
      id: message.id || generateMessageId(),
      timestamp: message.timestamp || new Date(),
    };

    const mailboxId = this.config.mailboxDO.idFromName('global-mailbox');
    const mailbox = this.config.mailboxDO.get(mailboxId);

    await mailbox.fetch(
      new Request('https://mailbox/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageWithId),
      })
    );
  }

  subscribe(type: MessageType, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  unsubscribe(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  async sendTo(agentId: string, message: Message): Promise<void> {
    const messageWithId: Message = {
      ...message,
      id: message.id || generateMessageId(),
      timestamp: message.timestamp || new Date(),
      to: agentId,
    };

    const mailboxId = this.config.mailboxDO.idFromName('global-mailbox');
    const mailbox = this.config.mailboxDO.get(mailboxId);

    await mailbox.fetch(
      new Request('https://mailbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgent: agentId, message: messageWithId }),
      })
    );
  }

  async acknowledge(messageId: string, agentId: string): Promise<void> {
    const mailboxId = this.config.mailboxDO.idFromName('global-mailbox');
    const mailbox = this.config.mailboxDO.get(mailboxId);

    await mailbox.fetch(
      new Request('https://mailbox/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, agentId }),
      })
    );
  }

  async acquireLease(file: string, ttlMs: number): Promise<boolean> {
    const leaseId = this.config.leaseDO.idFromName(`lease:${file}`);
    const lease = this.config.leaseDO.get(leaseId);

    const response = await lease.fetch(
      new Request('https://lease/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          agentId: this.config.agentId,
          ttlMs,
        }),
      })
    );

    const result = await response.json() as { acquired: boolean };
    return result.acquired;
  }

  async releaseLease(file: string): Promise<void> {
    const leaseId = this.config.leaseDO.idFromName(`lease:${file}`);
    const lease = this.config.leaseDO.get(leaseId);

    await lease.fetch(
      new Request('https://lease/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file,
          agentId: this.config.agentId,
        }),
      })
    );
  }

  async isLeased(file: string): Promise<LeaseStatus> {
    const leaseId = this.config.leaseDO.idFromName(`lease:${file}`);
    const lease = this.config.leaseDO.get(leaseId);

    const response = await lease.fetch(
      new Request('https://lease/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      })
    );

    return await response.json() as LeaseStatus;
  }

  async sendHeartbeat(): Promise<void> {
    await this.publish({
      id: generateMessageId(),
      type: 'heartbeat',
      from: this.config.agentId,
      payload: {
        timestamp: new Date().toISOString(),
        status: 'alive',
      },
      timestamp: new Date(),
    });
  }
}

/**
 * MailboxDO - Durable Object for pub/sub messaging
 * Deploy this as a Durable Object in your Worker
 */
export class MailboxDurableObject {
  private subscribers: Map<string, WebSocket> = new Map();
  private typeSubscriptions: Map<string, Set<string>> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/subscribe':
        return this.handleSubscribe(request);
      case '/publish':
        return this.handlePublish(request);
      case '/send':
        return this.handleSend(request);
      case '/acknowledge':
        return this.handleAcknowledge(request);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  private handleSubscribe(request: Request): Response {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agentId');

    if (!agentId) {
      return new Response('Missing agentId', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    // Store the WebSocket connection
    this.subscribers.set(agentId, server);

    server.addEventListener('close', () => {
      this.subscribers.delete(agentId);
    });

    server.addEventListener('message', async (event) => {
      // Handle subscription messages
      try {
        const data = JSON.parse(event.data as string);
        if (data.action === 'subscribe' && data.type) {
          if (!this.typeSubscriptions.has(data.type)) {
            this.typeSubscriptions.set(data.type, new Set());
          }
          this.typeSubscriptions.get(data.type)!.add(agentId);
        }
      } catch (error) {
        console.error('Failed to parse subscription message:', error);
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handlePublish(request: Request): Promise<Response> {
    const message = await request.json() as Message;

    // Broadcast to all subscribers of this message type
    const subscribers = this.typeSubscriptions.get(message.type) || new Set();

    // Also send to all connected agents (for broadcasts without specific type subscription)
    for (const [agentId, ws] of this.subscribers) {
      // Don't send back to the sender
      if (agentId === message.from) continue;

      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        // WebSocket might be closed
        this.subscribers.delete(agentId);
      }
    }

    // Store message for later retrieval if needed
    await this.state.storage.put(`message:${message.id}`, message);

    return new Response('OK');
  }

  private async handleSend(request: Request): Promise<Response> {
    const { targetAgent, message } = await request.json() as {
      targetAgent: string;
      message: Message;
    };

    const ws = this.subscribers.get(targetAgent);
    if (ws) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        this.subscribers.delete(targetAgent);
      }
    }

    // Store for later retrieval
    await this.state.storage.put(`inbox:${targetAgent}:${message.id}`, message);

    return new Response('OK');
  }

  private async handleAcknowledge(request: Request): Promise<Response> {
    const { messageId, agentId } = await request.json() as {
      messageId: string;
      agentId: string;
    };

    const message = await this.state.storage.get<Message>(`message:${messageId}`);
    if (message) {
      message.ackedAt = new Date();
      message.ackedBy = agentId;
      await this.state.storage.put(`message:${messageId}`, message);
    }

    return new Response('OK');
  }
}

/**
 * LeaseDO - Durable Object for file locking
 * Deploy this as a Durable Object in your Worker
 */
export class LeaseDurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/acquire':
        return this.handleAcquire(request);
      case '/release':
        return this.handleRelease(request);
      case '/status':
        return this.handleStatus(request);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  private async handleAcquire(request: Request): Promise<Response> {
    const { file, agentId, ttlMs } = await request.json() as {
      file: string;
      agentId: string;
      ttlMs: number;
    };

    const existing = await this.state.storage.get<{
      agentId: string;
      expiresAt: number;
    }>(`lease:${file}`);

    const now = Date.now();

    // Check if there's an existing valid lease
    if (existing && existing.expiresAt > now && existing.agentId !== agentId) {
      return Response.json({ acquired: false });
    }

    // Acquire the lease
    await this.state.storage.put(`lease:${file}`, {
      agentId,
      expiresAt: now + ttlMs,
    });

    // Set an alarm to clean up the lease
    await this.state.storage.setAlarm(now + ttlMs);

    return Response.json({ acquired: true });
  }

  private async handleRelease(request: Request): Promise<Response> {
    const { file, agentId } = await request.json() as {
      file: string;
      agentId: string;
    };

    const existing = await this.state.storage.get<{
      agentId: string;
      expiresAt: number;
    }>(`lease:${file}`);

    // Only release if the agent owns the lease
    if (existing && existing.agentId === agentId) {
      await this.state.storage.delete(`lease:${file}`);
    }

    return new Response('OK');
  }

  private async handleStatus(request: Request): Promise<Response> {
    const { file } = await request.json() as { file: string };

    const existing = await this.state.storage.get<{
      agentId: string;
      expiresAt: number;
    }>(`lease:${file}`);

    const now = Date.now();

    if (existing && existing.expiresAt > now) {
      return Response.json({
        isLeased: true,
        agentId: existing.agentId,
        expiresAt: existing.expiresAt,
      } as LeaseStatus);
    }

    return Response.json({ isLeased: false } as LeaseStatus);
  }

  async alarm(): Promise<void> {
    // Clean up expired leases
    const entries = await this.state.storage.list<{
      agentId: string;
      expiresAt: number;
    }>({ prefix: 'lease:' });

    const now = Date.now();
    for (const [key, value] of entries) {
      if (value.expiresAt <= now) {
        await this.state.storage.delete(key);
      }
    }
  }
}

/**
 * Durable Object state interface
 */
interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  setAlarm(scheduledTime: number): Promise<void>;
}
