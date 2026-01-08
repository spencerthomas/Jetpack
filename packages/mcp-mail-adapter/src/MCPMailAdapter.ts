import EventEmitter from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Message, MessageType, MessageBus, Logger, generateMessageId } from '@jetpack/shared';

export interface MCPMailConfig {
  mailDir: string;
  agentId: string;
}

interface FileLease {
  path: string;
  agentId: string;
  timestamp: Date;
  expiresAt: Date;
}

export class MCPMailAdapter implements MessageBus {
  private emitter = new EventEmitter();
  private logger: Logger;
  private inboxDir: string;
  private outboxDir: string;
  private leasesFile: string;
  private leases: Map<string, FileLease> = new Map();
  private pollInterval?: NodeJS.Timeout;

  constructor(private config: MCPMailConfig) {
    this.logger = new Logger(`MCPMail[${config.agentId}]`);
    this.inboxDir = path.join(config.mailDir, 'inbox', config.agentId);
    this.outboxDir = path.join(config.mailDir, 'outbox');
    this.leasesFile = path.join(config.mailDir, 'leases.json');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing MCP Mail adapter');

    // Create directories
    await fs.mkdir(this.inboxDir, { recursive: true });
    await fs.mkdir(this.outboxDir, { recursive: true });

    // Load existing leases
    await this.loadLeases();

    // Start polling for new messages
    this.startPolling();

    this.logger.info('MCP Mail adapter initialized');
  }

  async shutdown(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Release all leases held by this agent
    await this.releaseAllLeases();

    this.logger.info('MCP Mail adapter shut down');
  }

  private async loadLeases(): Promise<void> {
    try {
      const content = await fs.readFile(this.leasesFile, 'utf-8');
      const leasesArray = JSON.parse(content) as Array<FileLease & { timestamp: string; expiresAt: string }>;

      for (const lease of leasesArray) {
        this.leases.set(lease.path, {
          ...lease,
          timestamp: new Date(lease.timestamp),
          expiresAt: new Date(lease.expiresAt),
        });
      }

      // Clean up expired leases
      await this.cleanupExpiredLeases();

      this.logger.debug(`Loaded ${this.leases.size} active file leases`);
    } catch (error) {
      // File doesn't exist yet, that's okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to load leases:', error);
      }
    }
  }

  private async saveLeases(): Promise<void> {
    const leasesArray = Array.from(this.leases.values());
    await fs.writeFile(this.leasesFile, JSON.stringify(leasesArray, null, 2));
  }

  private async cleanupExpiredLeases(): Promise<void> {
    const now = new Date();
    let cleaned = 0;

    for (const [path, lease] of this.leases.entries()) {
      if (lease.expiresAt < now) {
        this.leases.delete(path);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.saveLeases();
      this.logger.debug(`Cleaned up ${cleaned} expired leases`);
    }
  }

  async publish(message: Message): Promise<void> {
    const messageWithId: Message = {
      ...message,
      id: message.id || generateMessageId(),
      timestamp: message.timestamp || new Date(),
    };

    if (message.to) {
      // Direct message to specific agent
      await this.sendToAgent(messageWithId, message.to);
    } else {
      // Broadcast to all agents
      await this.broadcast(messageWithId);
    }

    this.logger.debug(`Published message: ${messageWithId.type} from ${messageWithId.from}`);
  }

  private async sendToAgent(message: Message, agentId: string): Promise<void> {
    const targetInbox = path.join(this.config.mailDir, 'inbox', agentId);
    await fs.mkdir(targetInbox, { recursive: true });

    const messageFile = path.join(targetInbox, `${message.id}.json`);
    await fs.writeFile(messageFile, JSON.stringify(message, null, 2));
  }

  private async broadcast(message: Message): Promise<void> {
    const broadcastFile = path.join(this.outboxDir, `${message.id}.json`);
    await fs.writeFile(broadcastFile, JSON.stringify(message, null, 2));
  }

  subscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void {
    this.emitter.on(type, handler);
    this.logger.debug(`Subscribed to message type: ${type}`);
  }

  unsubscribe(type: MessageType, handler: (msg: Message) => void | Promise<void>): void {
    this.emitter.off(type, handler);
  }

  private startPolling(): void {
    // Poll inbox every 500ms for new messages
    this.pollInterval = setInterval(() => {
      this.pollInbox().catch(err => {
        this.logger.error('Error polling inbox:', err);
      });
    }, 500);

    // Also poll broadcast outbox
    setInterval(() => {
      this.pollBroadcast().catch(err => {
        this.logger.error('Error polling broadcast:', err);
      });
    }, 500);

    // Cleanup expired leases every 60 seconds
    setInterval(() => {
      this.cleanupExpiredLeases().catch(err => {
        this.logger.error('Error cleaning up leases:', err);
      });
    }, 60000);
  }

  private async pollInbox(): Promise<void> {
    try {
      const files = await fs.readdir(this.inboxDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.inboxDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const message = JSON.parse(content) as Message;

        // Convert timestamp back to Date
        message.timestamp = new Date(message.timestamp);

        // Emit to subscribers
        this.emitter.emit(message.type, message);

        // Delete processed message
        await fs.unlink(filePath);
      }
    } catch (error) {
      // Inbox might not exist yet
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async pollBroadcast(): Promise<void> {
    try {
      const files = await fs.readdir(this.outboxDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.outboxDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const message = JSON.parse(content) as Message;

        // Don't process our own broadcasts
        if (message.from === this.config.agentId) continue;

        // Convert timestamp back to Date
        message.timestamp = new Date(message.timestamp);

        // Emit to subscribers
        this.emitter.emit(message.type, message);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // File leasing for concurrent work prevention
  async acquireLease(filePath: string, durationMs: number = 60000): Promise<boolean> {
    await this.cleanupExpiredLeases();

    const existingLease = this.leases.get(filePath);
    if (existingLease && existingLease.agentId !== this.config.agentId) {
      this.logger.warn(`File ${filePath} is already leased by ${existingLease.agentId}`);
      return false;
    }

    const now = new Date();
    const lease: FileLease = {
      path: filePath,
      agentId: this.config.agentId,
      timestamp: now,
      expiresAt: new Date(now.getTime() + durationMs),
    };

    this.leases.set(filePath, lease);
    await this.saveLeases();

    this.logger.info(`Acquired lease for ${filePath}`);
    return true;
  }

  async releaseLease(filePath: string): Promise<boolean> {
    const lease = this.leases.get(filePath);
    if (!lease || lease.agentId !== this.config.agentId) {
      return false;
    }

    this.leases.delete(filePath);
    await this.saveLeases();

    this.logger.info(`Released lease for ${filePath}`);
    return true;
  }

  async renewLease(filePath: string, durationMs: number = 60000): Promise<boolean> {
    const lease = this.leases.get(filePath);
    if (!lease || lease.agentId !== this.config.agentId) {
      return false;
    }

    lease.expiresAt = new Date(Date.now() + durationMs);
    await this.saveLeases();

    this.logger.debug(`Renewed lease for ${filePath}`);
    return true;
  }

  async isLeased(filePath: string): Promise<{ leased: boolean; agentId?: string }> {
    await this.cleanupExpiredLeases();

    const lease = this.leases.get(filePath);
    if (lease) {
      return { leased: true, agentId: lease.agentId };
    }

    return { leased: false };
  }

  private async releaseAllLeases(): Promise<void> {
    const myLeases = Array.from(this.leases.entries())
      .filter(([, lease]) => lease.agentId === this.config.agentId);

    for (const [path] of myLeases) {
      this.leases.delete(path);
    }

    if (myLeases.length > 0) {
      await this.saveLeases();
      this.logger.info(`Released ${myLeases.length} leases on shutdown`);
    }
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
