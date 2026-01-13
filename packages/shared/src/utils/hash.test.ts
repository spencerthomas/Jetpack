import { describe, it, expect } from 'vitest';
import { generateTaskId, generateAgentId, generateMessageId } from './hash';

describe('hash utilities', () => {
  describe('generateTaskId', () => {
    it('should generate ID with bd- prefix', () => {
      const id = generateTaskId();
      expect(id).toMatch(/^bd-[a-f0-9]{8}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTaskId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate 8 character hex suffix', () => {
      const id = generateTaskId();
      const suffix = id.replace('bd-', '');
      expect(suffix).toHaveLength(8);
      expect(suffix).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('generateAgentId', () => {
    it('should generate ID with agent- prefix', () => {
      const id = generateAgentId('test-agent');
      expect(id).toMatch(/^agent-[a-f0-9]{8}$/);
    });

    it('should generate consistent ID for same input', () => {
      const id1 = generateAgentId('my-agent');
      const id2 = generateAgentId('my-agent');
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different inputs', () => {
      const id1 = generateAgentId('agent-alpha');
      const id2 = generateAgentId('agent-beta');
      expect(id1).not.toBe(id2);
    });

    it('should handle special characters in name', () => {
      const id = generateAgentId('agent with spaces & symbols!');
      expect(id).toMatch(/^agent-[a-f0-9]{8}$/);
    });

    it('should handle empty string', () => {
      const id = generateAgentId('');
      expect(id).toMatch(/^agent-[a-f0-9]{8}$/);
    });

    it('should handle unicode characters', () => {
      const id = generateAgentId('エージェント');
      expect(id).toMatch(/^agent-[a-f0-9]{8}$/);
    });
  });

  describe('generateMessageId', () => {
    it('should generate ID with msg- prefix', () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg-\d+-[a-f0-9]{8}$/);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateMessageId();
      const after = Date.now();

      const parts = id.split('-');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate unique IDs even when called rapidly', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMessageId());
      }
      expect(ids.size).toBe(100);
    });

    it('should have random suffix after timestamp', () => {
      const id = generateMessageId();
      const parts = id.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[2]).toMatch(/^[a-f0-9]{8}$/);
    });
  });
});
