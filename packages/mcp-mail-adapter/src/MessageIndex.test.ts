import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MessageIndex, createMessageIndex } from './MessageIndex';
import { Message, MessageType } from '@jetpack-agent/shared';

describe('MessageIndex', () => {
  let tempDir: string;
  let index: MessageIndex;

  function createMessage(overrides: Partial<Message> = {}): Message {
    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: 'task.created' as MessageType,
      from: 'agent-1',
      payload: { task: 'test task', description: 'test description' },
      timestamp: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'message-index-test-'));
    index = createMessageIndex({ indexDir: tempDir });
  });

  afterEach(() => {
    index.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('index', () => {
    it('should index a single message', async () => {
      const msg = createMessage();
      await index.index(msg);

      const result = index.getById(msg.id);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(msg.id);
      expect(result?.type).toBe(msg.type);
      expect(result?.from).toBe(msg.from);
    });

    it('should index message with to field', async () => {
      const msg = createMessage({ to: 'agent-2' });
      await index.index(msg);

      const result = index.getById(msg.id);
      expect(result?.to).toBe('agent-2');
    });

    it('should index message with correlationId', async () => {
      const msg = createMessage({ correlationId: 'corr-123' });
      await index.index(msg);

      const result = index.getById(msg.id);
      expect(result?.correlationId).toBe('corr-123');
    });

    it('should handle duplicate message IDs (upsert)', async () => {
      const msg = createMessage();
      await index.index(msg);

      const updatedMsg = { ...msg, payload: { updated: true } };
      await index.index(updatedMsg);

      const result = index.getById(msg.id);
      expect(result?.payload).toEqual({ updated: true });
    });
  });

  describe('indexBatch', () => {
    it('should index multiple messages at once', async () => {
      const messages = [
        createMessage({ id: 'msg-1' }),
        createMessage({ id: 'msg-2' }),
        createMessage({ id: 'msg-3' }),
      ];

      await index.indexBatch(messages);

      const stats = index.getStats();
      expect(stats.totalMessages).toBe(3);
    });

    it('should handle empty batch', async () => {
      await index.indexBatch([]);
      const stats = index.getStats();
      expect(stats.totalMessages).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      const messages: Message[] = [
        createMessage({
          id: 'msg-1',
          type: 'task.created',
          from: 'agent-1',
          payload: { task: 'implement search functionality' },
          timestamp: new Date('2026-01-01'),
        }),
        createMessage({
          id: 'msg-2',
          type: 'task.completed',
          from: 'agent-2',
          payload: { task: 'fix critical bug', status: 'success' },
          timestamp: new Date('2026-01-02'),
        }),
        createMessage({
          id: 'msg-3',
          type: 'agent.started',
          from: 'agent-1',
          to: 'agent-2',
          payload: { message: 'Starting work on search feature' },
          timestamp: new Date('2026-01-03'),
        }),
        createMessage({
          id: 'msg-4',
          type: 'coordination.request',
          from: 'agent-1',
          to: 'agent-3',
          correlationId: 'thread-1',
          payload: { request: 'Please review this code' },
          timestamp: new Date('2026-01-04'),
        }),
        createMessage({
          id: 'msg-5',
          type: 'coordination.response',
          from: 'agent-3',
          to: 'agent-1',
          correlationId: 'thread-1',
          payload: { response: 'Code looks good' },
          timestamp: new Date('2026-01-05'),
        }),
      ];
      await index.indexBatch(messages);
    });

    it('should search by text in payload', () => {
      const result = index.search('search');
      expect(result.messages.length).toBeGreaterThan(0);
      const messageIds = result.messages.map(m => m.id);
      expect(messageIds).toContain('msg-1');
      expect(messageIds).toContain('msg-3');
    });

    it('should search by type', () => {
      const result = index.search('', { type: 'task.completed' });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].id).toBe('msg-2');
    });

    it('should search by multiple types', () => {
      const result = index.search('', { type: ['task.created', 'task.completed'] });
      expect(result.messages.length).toBe(2);
    });

    it('should search by from agent', () => {
      const result = index.search('', { from: 'agent-1' });
      expect(result.messages.length).toBe(3);
    });

    it('should search by to agent', () => {
      const result = index.search('', { to: 'agent-2' });
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].id).toBe('msg-3');
    });

    it('should search by date range', () => {
      // since >= 2026-01-02 and until <= 2026-01-04 includes messages from 01-02, 01-03, 01-04
      const result = index.search('', {
        since: new Date('2026-01-02'),
        until: new Date('2026-01-04'),
      });
      expect(result.messages.length).toBe(3);
    });

    it('should search by correlationId', () => {
      const result = index.search('', { correlationId: 'thread-1' });
      expect(result.messages.length).toBe(2);
    });

    it('should combine text search with filters', () => {
      const result = index.search('search', { from: 'agent-1' });
      expect(result.messages.length).toBe(2);
    });

    it('should support pagination', () => {
      const result1 = index.search('', {}, 2, 0);
      expect(result1.messages.length).toBe(2);
      expect(result1.total).toBe(5);
      expect(result1.offset).toBe(0);
      expect(result1.limit).toBe(2);

      const result2 = index.search('', {}, 2, 2);
      expect(result2.messages.length).toBe(2);
      expect(result2.offset).toBe(2);
    });

    it('should sort by timestamp descending', () => {
      const result = index.search('');
      const timestamps = result.messages.map(m => m.timestamp.getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('getById', () => {
    it('should return null for non-existent message', () => {
      const result = index.getById('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return the correct message', async () => {
      const msg = createMessage({ id: 'specific-id' });
      await index.index(msg);

      const result = index.getById('specific-id');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('specific-id');
    });
  });

  describe('getThread', () => {
    it('should return messages in a thread', async () => {
      const messages: Message[] = [
        createMessage({
          id: 'original',
          type: 'coordination.request',
          payload: { question: 'Need help' },
        }),
        createMessage({
          id: 'reply-1',
          type: 'coordination.response',
          correlationId: 'original',
          payload: { answer: 'Sure!' },
        }),
        createMessage({
          id: 'reply-2',
          type: 'coordination.response',
          correlationId: 'original',
          payload: { answer: 'Me too!' },
        }),
        createMessage({
          id: 'unrelated',
          type: 'task.created',
          payload: { task: 'Something else' },
        }),
      ];
      await index.indexBatch(messages);

      const thread = index.getThread('original');
      expect(thread.length).toBe(3);
      expect(thread.map(m => m.id)).toContain('original');
      expect(thread.map(m => m.id)).toContain('reply-1');
      expect(thread.map(m => m.id)).toContain('reply-2');
    });

    it('should sort thread messages by timestamp ascending', async () => {
      const baseTime = new Date('2026-01-01');
      const messages: Message[] = [
        createMessage({
          id: 'msg-3',
          correlationId: 'thread',
          timestamp: new Date(baseTime.getTime() + 2000),
        }),
        createMessage({
          id: 'msg-1',
          correlationId: 'thread',
          timestamp: new Date(baseTime.getTime()),
        }),
        createMessage({
          id: 'msg-2',
          correlationId: 'thread',
          timestamp: new Date(baseTime.getTime() + 1000),
        }),
      ];
      await index.indexBatch(messages);

      const thread = index.getThread('thread');
      expect(thread.map(m => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });
  });

  describe('getRecent', () => {
    it('should return most recent messages', async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage({
          id: `msg-${i}`,
          timestamp: new Date(Date.now() + i * 1000),
        }));
      }
      await index.indexBatch(messages);

      const recent = index.getRecent(5);
      expect(recent.length).toBe(5);
      expect(recent[0].id).toBe('msg-9'); // Most recent
    });

    it('should return all messages if limit exceeds count', async () => {
      const messages: Message[] = [
        createMessage({ id: 'msg-1' }),
        createMessage({ id: 'msg-2' }),
      ];
      await index.indexBatch(messages);

      const recent = index.getRecent(100);
      expect(recent.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const messages: Message[] = [
        createMessage({ id: 'msg-1', type: 'task.created', from: 'agent-1', timestamp: new Date('2026-01-01') }),
        createMessage({ id: 'msg-2', type: 'task.created', from: 'agent-1', timestamp: new Date('2026-01-02') }),
        createMessage({ id: 'msg-3', type: 'task.completed', from: 'agent-2', timestamp: new Date('2026-01-03') }),
        createMessage({ id: 'msg-4', type: 'agent.started', from: 'agent-1', timestamp: new Date('2026-01-04') }),
      ];
      await index.indexBatch(messages);

      const stats = index.getStats();
      expect(stats.totalMessages).toBe(4);
      expect(stats.messagesByType['task.created']).toBe(2);
      expect(stats.messagesByType['task.completed']).toBe(1);
      expect(stats.messagesByType['agent.started']).toBe(1);
      expect(stats.messagesByAgent['agent-1']).toBe(3);
      expect(stats.messagesByAgent['agent-2']).toBe(1);
      expect(stats.oldestMessage).toEqual(new Date('2026-01-01'));
      expect(stats.newestMessage).toEqual(new Date('2026-01-04'));
    });

    it('should handle empty index', () => {
      const stats = index.getStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.oldestMessage).toBeNull();
      expect(stats.newestMessage).toBeNull();
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete messages older than specified date', async () => {
      const messages: Message[] = [
        createMessage({ id: 'old-1', timestamp: new Date('2025-01-01') }),
        createMessage({ id: 'old-2', timestamp: new Date('2025-06-01') }),
        createMessage({ id: 'new-1', timestamp: new Date('2026-01-01') }),
        createMessage({ id: 'new-2', timestamp: new Date('2026-06-01') }),
      ];
      await index.indexBatch(messages);

      const deleted = index.deleteOlderThan(new Date('2026-01-01'));
      expect(deleted).toBe(2);

      const stats = index.getStats();
      expect(stats.totalMessages).toBe(2);
    });

    it('should return 0 when nothing to delete', async () => {
      const messages: Message[] = [
        createMessage({ id: 'msg-1', timestamp: new Date('2026-01-01') }),
      ];
      await index.indexBatch(messages);

      const deleted = index.deleteOlderThan(new Date('2025-01-01'));
      expect(deleted).toBe(0);
    });
  });

  describe('createMessageIndex factory', () => {
    it('should create index with custom db filename', () => {
      const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-index-'));
      const customIndex = createMessageIndex({
        indexDir: customDir,
        dbFilename: 'custom.db',
      });

      expect(fs.existsSync(path.join(customDir, 'custom.db'))).toBe(true);

      customIndex.close();
      fs.rmSync(customDir, { recursive: true, force: true });
    });
  });
});
