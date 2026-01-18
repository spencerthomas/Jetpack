import EventEmitter from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Message, MessageType, MessageBus, MessageAckStatus, Logger, generateMessageId } from '@jetpack-agent/shared';

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
  private archiveDir: string;
  private leasesFile: string;
  private leases: Map<string, FileLease> = new Map();
  private pollInterval?: NodeJS.Timeout;
  private broadcastPollInterval?: NodeJS.Timeout;
  private leaseCleanupInterval?: NodeJS.Timeout;
  private processedBroadcasts: Set<string> = new Set();

  constructor(private config: MCPMailConfig) {
    this.logger = new Logger(`MCPMail[${config.agentId}]`);
    this.inboxDir = path.join(config.mailDir, 'inbox', config.agentId);
    this.outboxDir = path.join(config.mailDir, 'outbox');
    this.archiveDir = path.join(config.mailDir, 'archive');
    this.leasesFile = path.join(config.mailDir, 'leases.json');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing MCP Mail adapter');

    // Create directories
    await fs.mkdir(this.inboxDir, { recursive: true });
    await fs.mkdir(this.outboxDir, { recursive: true });
    await fs.mkdir(this.archiveDir, { recursive: true });

    // Load existing leases
    await this.loadLeases();

    // Load processed broadcast IDs to avoid re-processing
    await this.loadProcessedBroadcasts();

    // Start polling for new messages
    this.startPolling();

    this.logger.info('MCP Mail adapter initialized');
  }

  async shutdown(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.broadcastPollInterval) {
      clearInterval(this.broadcastPollInterval);
    }
    if (this.leaseCleanupInterval) {
      clearInterval(this.leaseCleanupInterval);
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

  private async loadProcessedBroadcasts(): Promise<void> {
    // Load IDs of broadcasts we've already processed from archive
    // This prevents re-emitting the same broadcast messages on restart
    try {
      const archiveFiles = await fs.readdir(this.archiveDir);
      for (const file of archiveFiles) {
        if (file.endsWith('.json')) {
          // Extract message ID from filename (format: {id}.json)
          const msgId = file.replace('.json', '');
          this.processedBroadcasts.add(msgId);
        }
      }
      this.logger.debug(`Loaded ${this.processedBroadcasts.size} processed broadcast IDs`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to load processed broadcasts:', error);
      }
    }
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
    this.broadcastPollInterval = setInterval(() => {
      this.pollBroadcast().catch(err => {
        this.logger.error('Error polling broadcast:', err);
      });
    }, 500);

    // Cleanup expired leases every 60 seconds
    this.leaseCleanupInterval = setInterval(() => {
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

        // Defensive JSON parsing - skip empty or malformed files
        if (!content || content.trim() === '') {
          this.logger.debug(`Skipping empty inbox file: ${file}`);
          continue;
        }

        let message: Message;
        try {
          message = JSON.parse(content) as Message;
        } catch (parseError) {
          this.logger.warn(`Skipping malformed inbox file: ${file}`);
          // Move malformed file to archive to prevent repeated parsing attempts
          const archivePath = path.join(this.archiveDir, `malformed-${file}`);
          try {
            await fs.rename(filePath, archivePath);
          } catch {
            // Ignore if we can't move it
          }
          continue;
        }

        // Convert timestamp back to Date
        message.timestamp = new Date(message.timestamp);

        // Emit to subscribers
        this.emitter.emit(message.type, message);

        // Archive processed message instead of deleting
        const archivePath = path.join(this.archiveDir, file);
        try {
          await fs.rename(filePath, archivePath);
          this.logger.debug(`Archived inbox message: ${message.id}`);
        } catch (err) {
          // If rename fails (e.g., cross-device), copy then delete
          await fs.writeFile(archivePath, content);
          await fs.unlink(filePath);
          this.logger.debug(`Archived inbox message (copy): ${message.id}`);
        }
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

        // Defensive JSON parsing - skip empty or malformed files
        if (!content || content.trim() === '') {
          this.logger.debug(`Skipping empty broadcast file: ${file}`);
          continue;
        }

        let message: Message;
        try {
          message = JSON.parse(content) as Message;
        } catch (parseError) {
          this.logger.warn(`Skipping malformed broadcast file: ${file}`);
          continue;
        }

        // Don't process our own broadcasts
        if (message.from === this.config.agentId) continue;

        // Skip already processed broadcasts
        if (this.processedBroadcasts.has(message.id)) continue;

        // Convert timestamp back to Date
        message.timestamp = new Date(message.timestamp);

        // Emit to subscribers
        this.emitter.emit(message.type, message);

        // Mark as processed and archive
        this.processedBroadcasts.add(message.id);

        // Archive the broadcast message (keep original in outbox for other agents)
        const archivePath = path.join(this.archiveDir, file);
        try {
          // Copy to archive (don't move - other agents need to see it)
          await fs.writeFile(archivePath, content);
          this.logger.debug(`Archived broadcast message: ${message.id}`);
        } catch (err) {
          this.logger.warn(`Failed to archive broadcast ${message.id}:`, err);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // File leasing for concurrent work prevention
  async acquireLease(filePath: string, durationMs: number = 60000): Promise<boolean> {
    // Reload leases from disk to see leases from other agents
    await this.loadLeases();
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
    // Reload leases from disk to see leases from other agents
    await this.loadLeases();
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

  // Message acknowledgment methods

  /**
   * Acknowledge a message. Updates the message file with acknowledgment info.
   * Searches in archive, outbox, and all inboxes.
   */
  async acknowledge(messageId: string, ackedBy?: string): Promise<boolean> {
    const agentId = ackedBy || this.config.agentId;
    const ackedAt = new Date();

    // Search for the message in various locations
    const locations = [
      this.archiveDir,
      this.outboxDir,
      // Also check all inbox directories
      path.join(this.config.mailDir, 'inbox'),
    ];

    for (const location of locations) {
      const messageFile = path.join(location, `${messageId}.json`);
      try {
        const content = await fs.readFile(messageFile, 'utf-8');
        const message = JSON.parse(content) as Message;

        // Update message with acknowledgment info
        message.ackedAt = ackedAt;
        message.ackedBy = agentId;

        // Write back
        await fs.writeFile(messageFile, JSON.stringify(message, null, 2));
        this.logger.debug(`Acknowledged message ${messageId} by ${agentId}`);
        return true;
      } catch (error) {
        // File not found in this location, continue searching
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(`Error acknowledging message ${messageId}:`, error);
        }
      }
    }

    // Also search in agent-specific inbox directories
    try {
      const inboxBase = path.join(this.config.mailDir, 'inbox');
      const agentDirs = await fs.readdir(inboxBase);
      for (const agentDir of agentDirs) {
        const messageFile = path.join(inboxBase, agentDir, `${messageId}.json`);
        try {
          const content = await fs.readFile(messageFile, 'utf-8');
          const message = JSON.parse(content) as Message;

          message.ackedAt = ackedAt;
          message.ackedBy = agentId;

          await fs.writeFile(messageFile, JSON.stringify(message, null, 2));
          this.logger.debug(`Acknowledged message ${messageId} by ${agentId}`);
          return true;
        } catch {
          // Not in this inbox
        }
      }
    } catch {
      // Inbox directory doesn't exist
    }

    this.logger.warn(`Message ${messageId} not found for acknowledgment`);
    return false;
  }

  /**
   * Get the acknowledgment status of a message.
   */
  async getAckStatus(messageId: string): Promise<MessageAckStatus | null> {
    // Search for the message in various locations
    const locations = [
      this.archiveDir,
      this.outboxDir,
    ];

    for (const location of locations) {
      const messageFile = path.join(location, `${messageId}.json`);
      try {
        const content = await fs.readFile(messageFile, 'utf-8');
        const message = JSON.parse(content) as Message;

        return {
          messageId: message.id,
          ackRequired: message.ackRequired ?? false,
          acked: !!message.ackedAt,
          ackedAt: message.ackedAt ? new Date(message.ackedAt) : undefined,
          ackedBy: message.ackedBy,
        };
      } catch {
        // File not found in this location, continue searching
      }
    }

    // Also search in agent-specific inbox directories
    try {
      const inboxBase = path.join(this.config.mailDir, 'inbox');
      const agentDirs = await fs.readdir(inboxBase);
      for (const agentDir of agentDirs) {
        const messageFile = path.join(inboxBase, agentDir, `${messageId}.json`);
        try {
          const content = await fs.readFile(messageFile, 'utf-8');
          const message = JSON.parse(content) as Message;

          return {
            messageId: message.id,
            ackRequired: message.ackRequired ?? false,
            acked: !!message.ackedAt,
            ackedAt: message.ackedAt ? new Date(message.ackedAt) : undefined,
            ackedBy: message.ackedBy,
          };
        } catch {
          // Not in this inbox
        }
      }
    } catch {
      // Inbox directory doesn't exist
    }

    return null;
  }

  /**
   * Get all messages that require acknowledgment but haven't been acknowledged.
   */
  async getUnacknowledgedMessages(): Promise<Message[]> {
    const unacked: Message[] = [];

    // Search archive
    try {
      const archiveFiles = await fs.readdir(this.archiveDir);
      for (const file of archiveFiles) {
        if (!file.endsWith('.json')) continue;
        const content = await fs.readFile(path.join(this.archiveDir, file), 'utf-8');
        const message = JSON.parse(content) as Message;
        if (message.ackRequired && !message.ackedAt) {
          message.timestamp = new Date(message.timestamp);
          unacked.push(message);
        }
      }
    } catch {
      // Archive doesn't exist
    }

    // Search outbox
    try {
      const outboxFiles = await fs.readdir(this.outboxDir);
      for (const file of outboxFiles) {
        if (!file.endsWith('.json')) continue;
        const content = await fs.readFile(path.join(this.outboxDir, file), 'utf-8');
        const message = JSON.parse(content) as Message;
        if (message.ackRequired && !message.ackedAt) {
          message.timestamp = new Date(message.timestamp);
          unacked.push(message);
        }
      }
    } catch {
      // Outbox doesn't exist
    }

    return unacked;
  }
}
