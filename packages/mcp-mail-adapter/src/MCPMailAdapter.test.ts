import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MCPMailAdapter } from './MCPMailAdapter';
import { Message } from '@jetpack/shared';

const TEST_MAIL_DIR = '/tmp/jetpack-test-mail';
const TEST_AGENT_ID = 'test-agent-1';

describe('MCPMailAdapter', () => {
  let adapter: MCPMailAdapter;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_MAIL_DIR, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist
    }

    adapter = new MCPMailAdapter({
      mailDir: TEST_MAIL_DIR,
      agentId: TEST_AGENT_ID,
    });
  });

  afterEach(async () => {
    await adapter.shutdown();
    // Clean up
    try {
      await fs.rm(TEST_MAIL_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create required directories on initialize', async () => {
      await adapter.initialize();

      const inboxExists = await fs.access(path.join(TEST_MAIL_DIR, 'inbox', TEST_AGENT_ID))
        .then(() => true)
        .catch(() => false);
      const outboxExists = await fs.access(path.join(TEST_MAIL_DIR, 'outbox'))
        .then(() => true)
        .catch(() => false);
      const archiveExists = await fs.access(path.join(TEST_MAIL_DIR, 'archive'))
        .then(() => true)
        .catch(() => false);

      expect(inboxExists).toBe(true);
      expect(outboxExists).toBe(true);
      expect(archiveExists).toBe(true);
    });
  });

  describe('message publishing', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should publish broadcast messages to outbox', async () => {
      const message: Message = {
        id: 'test-msg-1',
        type: 'task.created',
        from: TEST_AGENT_ID,
        payload: { title: 'Test Task' },
        timestamp: new Date(),
      };

      await adapter.publish(message);

      const files = await fs.readdir(path.join(TEST_MAIL_DIR, 'outbox'));
      expect(files.length).toBe(1);
      expect(files[0]).toBe('test-msg-1.json');

      const content = await fs.readFile(
        path.join(TEST_MAIL_DIR, 'outbox', 'test-msg-1.json'),
        'utf-8'
      );
      const saved = JSON.parse(content);
      expect(saved.type).toBe('task.created');
      expect(saved.payload.title).toBe('Test Task');
    });

    it('should publish direct messages to target agent inbox', async () => {
      const targetAgent = 'target-agent';
      const message: Message = {
        id: 'test-msg-2',
        type: 'task.assigned',
        from: TEST_AGENT_ID,
        to: targetAgent,
        payload: { taskId: 'task-123' },
        timestamp: new Date(),
      };

      await adapter.publish(message);

      const targetInbox = path.join(TEST_MAIL_DIR, 'inbox', targetAgent);
      const files = await fs.readdir(targetInbox);
      expect(files.length).toBe(1);
      expect(files[0]).toBe('test-msg-2.json');
    });
  });

  describe('message archiving', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should archive inbox messages after processing', async () => {
      // Place a message directly in inbox
      const inboxPath = path.join(TEST_MAIL_DIR, 'inbox', TEST_AGENT_ID);
      const message: Message = {
        id: 'inbox-msg-1',
        type: 'task.assigned',
        from: 'other-agent',
        to: TEST_AGENT_ID,
        payload: { taskId: 'task-456' },
        timestamp: new Date(),
      };
      await fs.writeFile(
        path.join(inboxPath, 'inbox-msg-1.json'),
        JSON.stringify(message)
      );

      // Wait for polling to process
      await new Promise(resolve => setTimeout(resolve, 600));

      // Check message was moved to archive
      const archiveFiles = await fs.readdir(path.join(TEST_MAIL_DIR, 'archive'));
      expect(archiveFiles).toContain('inbox-msg-1.json');

      // Check message was removed from inbox
      const inboxFiles = await fs.readdir(inboxPath);
      expect(inboxFiles).not.toContain('inbox-msg-1.json');
    });

    it('should emit event when processing inbox message', async () => {
      const handler = vi.fn();
      adapter.subscribe('task.assigned', handler);

      // Place a message directly in inbox
      const inboxPath = path.join(TEST_MAIL_DIR, 'inbox', TEST_AGENT_ID);
      const message: Message = {
        id: 'inbox-msg-2',
        type: 'task.assigned',
        from: 'other-agent',
        to: TEST_AGENT_ID,
        payload: { taskId: 'task-789' },
        timestamp: new Date(),
      };
      await fs.writeFile(
        path.join(inboxPath, 'inbox-msg-2.json'),
        JSON.stringify(message)
      );

      // Wait for polling
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'inbox-msg-2',
          type: 'task.assigned',
        })
      );
    });

    it('should archive broadcast messages without removing from outbox', async () => {
      // Create another adapter to receive broadcasts
      const adapter2 = new MCPMailAdapter({
        mailDir: TEST_MAIL_DIR,
        agentId: 'test-agent-2',
      });
      await adapter2.initialize();

      // Agent 1 publishes broadcast
      await adapter.publish({
        id: 'broadcast-1',
        type: 'task.created',
        from: TEST_AGENT_ID,
        payload: { title: 'Broadcast Task' },
        timestamp: new Date(),
      });

      // Wait for agent 2 to process
      await new Promise(resolve => setTimeout(resolve, 600));

      // Broadcast should still be in outbox (for other agents)
      const outboxFiles = await fs.readdir(path.join(TEST_MAIL_DIR, 'outbox'));
      expect(outboxFiles).toContain('broadcast-1.json');

      // Broadcast should also be in archive
      const archiveFiles = await fs.readdir(path.join(TEST_MAIL_DIR, 'archive'));
      expect(archiveFiles).toContain('broadcast-1.json');

      await adapter2.shutdown();
    });

    it('should not re-process already archived broadcasts on restart', async () => {
      const handler = vi.fn();

      // Create another adapter that will receive
      const adapter2 = new MCPMailAdapter({
        mailDir: TEST_MAIL_DIR,
        agentId: 'test-agent-2',
      });
      await adapter2.initialize();
      adapter2.subscribe('task.created', handler);

      // Agent 1 publishes broadcast
      await adapter.publish({
        id: 'broadcast-2',
        type: 'task.created',
        from: TEST_AGENT_ID,
        payload: { title: 'Test' },
        timestamp: new Date(),
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(handler).toHaveBeenCalledTimes(1);

      // Shutdown and restart adapter2
      await adapter2.shutdown();

      const adapter3 = new MCPMailAdapter({
        mailDir: TEST_MAIL_DIR,
        agentId: 'test-agent-2',
      });
      await adapter3.initialize();
      adapter3.subscribe('task.created', handler);

      // Wait for polling - should NOT re-emit already processed broadcast
      await new Promise(resolve => setTimeout(resolve, 600));

      // Handler should still only have been called once (not twice)
      expect(handler).toHaveBeenCalledTimes(1);

      await adapter3.shutdown();
    });
  });

  describe('file leasing', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should acquire and release leases', async () => {
      const filePath = '/src/test.ts';

      const acquired = await adapter.acquireLease(filePath);
      expect(acquired).toBe(true);

      const status = await adapter.isLeased(filePath);
      expect(status.leased).toBe(true);
      expect(status.agentId).toBe(TEST_AGENT_ID);

      const released = await adapter.releaseLease(filePath);
      expect(released).toBe(true);

      const statusAfter = await adapter.isLeased(filePath);
      expect(statusAfter.leased).toBe(false);
    });

    it('should prevent other agents from acquiring leased files', async () => {
      const adapter2 = new MCPMailAdapter({
        mailDir: TEST_MAIL_DIR,
        agentId: 'test-agent-2',
      });
      await adapter2.initialize();

      const filePath = '/src/shared.ts';

      // Agent 1 acquires
      const acquired1 = await adapter.acquireLease(filePath);
      expect(acquired1).toBe(true);

      // Agent 2 tries to acquire - should fail
      const acquired2 = await adapter2.acquireLease(filePath);
      expect(acquired2).toBe(false);

      await adapter2.shutdown();
    });

    it('should allow lease renewal', async () => {
      const filePath = '/src/test.ts';

      await adapter.acquireLease(filePath, 1000);

      const renewed = await adapter.renewLease(filePath, 5000);
      expect(renewed).toBe(true);

      const status = await adapter.isLeased(filePath);
      expect(status.leased).toBe(true);
    });
  });

  describe('heartbeat', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should send heartbeat to outbox', async () => {
      await adapter.sendHeartbeat();

      const files = await fs.readdir(path.join(TEST_MAIL_DIR, 'outbox'));
      const heartbeatFile = files.find(f => f.includes('msg-'));
      expect(heartbeatFile).toBeDefined();

      const content = await fs.readFile(
        path.join(TEST_MAIL_DIR, 'outbox', heartbeatFile!),
        'utf-8'
      );
      const heartbeat = JSON.parse(content);
      expect(heartbeat.type).toBe('heartbeat');
      expect(heartbeat.from).toBe(TEST_AGENT_ID);
    });
  });

  describe('message acknowledgment', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should acknowledge a message in archive', async () => {
      // Create a message in archive
      const archivePath = path.join(TEST_MAIL_DIR, 'archive');
      const message: Message = {
        id: 'ack-test-1',
        type: 'task.created',
        from: 'other-agent',
        payload: { title: 'Test Task' },
        timestamp: new Date(),
        ackRequired: true,
      };
      await fs.writeFile(
        path.join(archivePath, 'ack-test-1.json'),
        JSON.stringify(message)
      );

      // Acknowledge the message
      const result = await adapter.acknowledge('ack-test-1');
      expect(result).toBe(true);

      // Verify acknowledgment was recorded
      const content = await fs.readFile(
        path.join(archivePath, 'ack-test-1.json'),
        'utf-8'
      );
      const updated = JSON.parse(content);
      expect(updated.ackedAt).toBeDefined();
      expect(updated.ackedBy).toBe(TEST_AGENT_ID);
    });

    it('should acknowledge a message in outbox', async () => {
      // Create a message in outbox
      const outboxPath = path.join(TEST_MAIL_DIR, 'outbox');
      const message: Message = {
        id: 'ack-test-2',
        type: 'task.created',
        from: TEST_AGENT_ID,
        payload: { title: 'Test Task' },
        timestamp: new Date(),
        ackRequired: true,
      };
      await fs.writeFile(
        path.join(outboxPath, 'ack-test-2.json'),
        JSON.stringify(message)
      );

      // Acknowledge with custom agent
      const result = await adapter.acknowledge('ack-test-2', 'other-agent');
      expect(result).toBe(true);

      // Verify
      const content = await fs.readFile(
        path.join(outboxPath, 'ack-test-2.json'),
        'utf-8'
      );
      const updated = JSON.parse(content);
      expect(updated.ackedBy).toBe('other-agent');
    });

    it('should acknowledge a message in inbox', async () => {
      // Create a message in another agent's inbox
      const otherInboxPath = path.join(TEST_MAIL_DIR, 'inbox', 'other-agent');
      await fs.mkdir(otherInboxPath, { recursive: true });
      const message: Message = {
        id: 'ack-test-3',
        type: 'task.assigned',
        from: TEST_AGENT_ID,
        to: 'other-agent',
        payload: { taskId: 'task-123' },
        timestamp: new Date(),
        ackRequired: true,
      };
      await fs.writeFile(
        path.join(otherInboxPath, 'ack-test-3.json'),
        JSON.stringify(message)
      );

      // Acknowledge
      const result = await adapter.acknowledge('ack-test-3');
      expect(result).toBe(true);

      // Verify
      const content = await fs.readFile(
        path.join(otherInboxPath, 'ack-test-3.json'),
        'utf-8'
      );
      const updated = JSON.parse(content);
      expect(updated.ackedAt).toBeDefined();
    });

    it('should return false for non-existent message', async () => {
      const result = await adapter.acknowledge('non-existent-id');
      expect(result).toBe(false);
    });

    it('should get acknowledgment status', async () => {
      // Create and acknowledge a message
      const archivePath = path.join(TEST_MAIL_DIR, 'archive');
      const ackedAt = new Date();
      const message: Message = {
        id: 'ack-status-1',
        type: 'task.completed',
        from: 'other-agent',
        payload: { result: 'success' },
        timestamp: new Date(),
        ackRequired: true,
        ackedAt,
        ackedBy: TEST_AGENT_ID,
      };
      await fs.writeFile(
        path.join(archivePath, 'ack-status-1.json'),
        JSON.stringify(message)
      );

      const status = await adapter.getAckStatus('ack-status-1');
      expect(status).not.toBeNull();
      expect(status!.messageId).toBe('ack-status-1');
      expect(status!.ackRequired).toBe(true);
      expect(status!.acked).toBe(true);
      expect(status!.ackedBy).toBe(TEST_AGENT_ID);
    });

    it('should return null status for non-existent message', async () => {
      const status = await adapter.getAckStatus('non-existent-id');
      expect(status).toBeNull();
    });

    it('should get unacknowledged messages', async () => {
      const archivePath = path.join(TEST_MAIL_DIR, 'archive');

      // Create messages - some needing ack, some not
      const messages: Message[] = [
        {
          id: 'unack-1',
          type: 'task.created',
          from: 'agent-1',
          payload: { title: 'Task 1' },
          timestamp: new Date(),
          ackRequired: true,
          // Not acked
        },
        {
          id: 'unack-2',
          type: 'task.completed',
          from: 'agent-2',
          payload: { result: 'done' },
          timestamp: new Date(),
          ackRequired: true,
          ackedAt: new Date(), // Already acked
          ackedBy: 'agent-1',
        },
        {
          id: 'unack-3',
          type: 'task.failed',
          from: 'agent-3',
          payload: { error: 'timeout' },
          timestamp: new Date(),
          ackRequired: true,
          // Not acked
        },
        {
          id: 'unack-4',
          type: 'heartbeat',
          from: 'agent-1',
          payload: { status: 'alive' },
          timestamp: new Date(),
          // ackRequired not set - shouldn't be included
        },
      ];

      for (const msg of messages) {
        await fs.writeFile(
          path.join(archivePath, `${msg.id}.json`),
          JSON.stringify(msg)
        );
      }

      const unacked = await adapter.getUnacknowledgedMessages();
      expect(unacked.length).toBe(2);
      expect(unacked.map(m => m.id)).toContain('unack-1');
      expect(unacked.map(m => m.id)).toContain('unack-3');
      expect(unacked.map(m => m.id)).not.toContain('unack-2'); // Already acked
      expect(unacked.map(m => m.id)).not.toContain('unack-4'); // No ack required
    });

    it('should include outbox messages in unacknowledged list', async () => {
      const outboxPath = path.join(TEST_MAIL_DIR, 'outbox');
      const message: Message = {
        id: 'outbox-unack-1',
        type: 'task.created',
        from: TEST_AGENT_ID,
        payload: { title: 'Broadcast Task' },
        timestamp: new Date(),
        ackRequired: true,
      };
      await fs.writeFile(
        path.join(outboxPath, 'outbox-unack-1.json'),
        JSON.stringify(message)
      );

      const unacked = await adapter.getUnacknowledgedMessages();
      expect(unacked.map(m => m.id)).toContain('outbox-unack-1');
    });
  });
});
