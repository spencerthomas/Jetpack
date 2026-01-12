import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CASSAdapter, CASSConfig } from './CASSAdapter';
import { MemoryEntry, MemoryType } from '@jetpack/shared';

const TEST_CASS_DIR = '/tmp/jetpack-test-cass';

describe('CASSAdapter', () => {
  let adapter: CASSAdapter;
  const defaultConfig: CASSConfig = {
    cassDir: TEST_CASS_DIR,
    compactionThreshold: 0.3,
    maxEntries: 1000,
  };

  beforeEach(async () => {
    // Clean up test directory
    if (fs.existsSync(TEST_CASS_DIR)) {
      fs.rmSync(TEST_CASS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CASS_DIR, { recursive: true });

    adapter = new CASSAdapter(defaultConfig);
    await adapter.initialize();
  });

  afterEach(() => {
    adapter.close();
    // Clean up
    if (fs.existsSync(TEST_CASS_DIR)) {
      fs.rmSync(TEST_CASS_DIR, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create database file on initialize', () => {
      const dbPath = path.join(TEST_CASS_DIR, 'memory.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });

  describe('store and retrieve', () => {
    it('should store and retrieve a memory entry', async () => {
      const entry = {
        type: 'code_context' as MemoryType,
        content: 'Test memory content',
        importance: 0.8,
        metadata: { file: 'test.ts' },
      };

      const id = await adapter.store(entry);
      expect(id).toMatch(/^mem-/);

      const retrieved = await adapter.retrieve(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content).toBe('Test memory content');
      expect(retrieved!.type).toBe('code_context');
      expect(retrieved!.importance).toBe(0.8);
      expect(retrieved!.metadata).toEqual({ file: 'test.ts' });
    });

    it('should return null for non-existent ID', async () => {
      const result = await adapter.retrieve('non-existent-id');
      expect(result).toBeNull();
    });

    it('should increment access count on retrieve', async () => {
      const id = await adapter.store({
        type: 'code_context',
        content: 'Test',
        importance: 0.5,
      });

      // Note: retrieve returns the row BEFORE incrementing, then increments
      // So first retrieve shows 0, but increments to 1
      const first = await adapter.retrieve(id);
      expect(first!.accessCount).toBe(0);

      // Second retrieve shows 1 (incremented from first), then increments to 2
      const second = await adapter.retrieve(id);
      expect(second!.accessCount).toBe(1);

      await adapter.retrieve(id); // Shows 2, increments to 3

      // Fourth retrieve shows 3, increments to 4
      const entry = await adapter.retrieve(id);
      expect(entry!.accessCount).toBe(3);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await adapter.store({
        type: 'code_context',
        content: 'React component for user authentication',
        importance: 0.8,
      });
      await adapter.store({
        type: 'code_context',
        content: 'Database migration script',
        importance: 0.7,
      });
      await adapter.store({
        type: 'decision',
        content: 'Decided to use React for the frontend',
        importance: 0.9,
      });
    });

    it('should find entries by content text search', async () => {
      const results = await adapter.search('React');
      expect(results.length).toBe(2);
    });

    it('should return empty array for no matches', async () => {
      const results = await adapter.search('nonexistent term xyz');
      expect(results.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const results = await adapter.search('React', 1);
      expect(results.length).toBe(1);
    });
  });

  describe('semantic search', () => {
    it('should search by embedding vector', async () => {
      // Store entries with mock embeddings
      await adapter.store({
        type: 'code_context',
        content: 'Authentication module',
        importance: 0.8,
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
      });
      await adapter.store({
        type: 'code_context',
        content: 'Database module',
        importance: 0.7,
        embedding: [0.5, 0.4, 0.3, 0.2, 0.1],
      });

      // Search with embedding similar to first entry
      const results = await adapter.semanticSearch([0.1, 0.2, 0.3, 0.4, 0.5], 10);
      expect(results.length).toBe(2);
      // First result should be more similar
      expect(results[0].content).toBe('Authentication module');
    });

    it('should return empty array when no entries have embeddings', async () => {
      await adapter.store({
        type: 'code_context',
        content: 'No embedding here',
        importance: 0.5,
      });

      const results = await adapter.semanticSearch([0.1, 0.2, 0.3], 10);
      expect(results.length).toBe(0);
    });
  });

  describe('getByType', () => {
    beforeEach(async () => {
      await adapter.store({ type: 'code_context', content: 'Code 1', importance: 0.5 });
      await adapter.store({ type: 'code_context', content: 'Code 2', importance: 0.6 });
      await adapter.store({ type: 'decision', content: 'Decision 1', importance: 0.7 });
    });

    it('should filter by type', async () => {
      const codeEntries = await adapter.getByType('code_context');
      expect(codeEntries.length).toBe(2);

      const decisions = await adapter.getByType('decision');
      expect(decisions.length).toBe(1);
    });

    it('should respect limit', async () => {
      const results = await adapter.getByType('code_context', 1);
      expect(results.length).toBe(1);
    });
  });

  describe('compaction', () => {
    it('should remove low-importance entries', async () => {
      await adapter.store({ type: 'code_context', content: 'Low 1', importance: 0.1 });
      await adapter.store({ type: 'code_context', content: 'Low 2', importance: 0.2 });
      await adapter.store({ type: 'code_context', content: 'High', importance: 0.9 });

      const removed = await adapter.compact(0.5);
      expect(removed).toBe(2);

      const remaining = await adapter.getRecentMemories();
      expect(remaining.length).toBe(1);
      expect(remaining[0].content).toBe('High');
    });

    it('should not remove codebase_knowledge type', async () => {
      await adapter.store({ type: 'codebase_knowledge', content: 'Important', importance: 0.1 });
      await adapter.store({ type: 'code_context', content: 'Not important', importance: 0.1 });

      await adapter.compact(0.5);

      const results = await adapter.getByType('codebase_knowledge');
      expect(results.length).toBe(1);
    });
  });

  describe('updateImportance', () => {
    it('should update entry importance', async () => {
      const id = await adapter.store({
        type: 'code_context',
        content: 'Test',
        importance: 0.5,
      });

      await adapter.updateImportance(id, 0.9);

      const entry = await adapter.retrieve(id);
      expect(entry!.importance).toBe(0.9);
    });
  });

  describe('stats', () => {
    it('should return correct statistics', async () => {
      await adapter.store({ type: 'code_context', content: 'Code', importance: 0.5 });
      await adapter.store({ type: 'decision', content: 'Decision', importance: 0.7 });
      await adapter.retrieve((await adapter.getRecentMemories())[0].id);

      const stats = await adapter.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.code_context).toBe(1);
      expect(stats.byType.decision).toBe(1);
      expect(stats.avgImportance).toBe(0.6);
      expect(stats.totalAccesses).toBe(1);
    });
  });

  describe('embedding stats', () => {
    it('should track embeddings correctly', async () => {
      await adapter.store({
        type: 'code_context',
        content: 'With embedding',
        importance: 0.5,
        embedding: [0.1, 0.2, 0.3],
      });
      await adapter.store({
        type: 'code_context',
        content: 'Without embedding',
        importance: 0.5,
      });

      const stats = await adapter.getEmbeddingStats();
      expect(stats.withEmbedding).toBe(1);
      expect(stats.withoutEmbedding).toBe(1);
      expect(stats.total).toBe(2);
    });
  });

  describe('hasEmbeddingGenerator', () => {
    it('should return false when no embedding config provided', () => {
      expect(adapter.hasEmbeddingGenerator()).toBe(false);
    });
  });
});

describe('CASSAdapter with auto-embedding', () => {
  it('should warn when auto-embed enabled without API key', () => {
    const originalEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const config: CASSConfig = {
      cassDir: TEST_CASS_DIR,
      compactionThreshold: 0.3,
      maxEntries: 1000,
      autoGenerateEmbeddings: true,
    };

    // Should not throw, just warn
    const adapter = new CASSAdapter(config);
    expect(adapter.hasEmbeddingGenerator()).toBe(false);

    process.env.OPENAI_API_KEY = originalEnv;
  });
});
