# @jetpack-agent/cass-adapter

SQLite-based persistent agent memory system for Jetpack (CASS - Claude Agent Storage System). Supports semantic search via embeddings with multiple embedding providers.

## Installation

```bash
npm install @jetpack-agent/cass-adapter
# or
pnpm add @jetpack-agent/cass-adapter
```

## Quick Start

```typescript
import { CASSAdapter } from '@jetpack-agent/cass-adapter';

const cass = new CASSAdapter({
  cassDir: '/path/to/project/.cass',
  compactionThreshold: 0.3,  // Remove memories below 30% importance
  maxEntries: 10000,
  autoGenerateEmbeddings: true,
});

await cass.initialize();

// Store a memory
const id = await cass.store({
  type: 'agent_learning',
  content: 'TypeScript interfaces are preferred over type aliases for object shapes',
  importance: 0.8,
  metadata: { agentId: 'agent-1', taskId: 'bd-123' },
});

// Semantic search (requires embedding provider)
const results = await cass.semanticSearchByQuery('typescript best practices', 5);

// Text search fallback
const textResults = await cass.search('typescript', 10);

// Retrieve with access tracking
const memory = await cass.retrieve(id);

// Clean up
cass.close();
```

## API Reference

### CASSAdapter

Implements `IMemoryStore` interface from `@jetpack-agent/shared`.

#### Constructor Options

```typescript
interface CASSConfig {
  cassDir: string;              // Directory for SQLite database
  compactionThreshold: number;  // 0-1, importance below this gets compacted
  maxEntries: number;           // Max entries before forcing compaction
  autoGenerateEmbeddings?: boolean;  // Auto-generate embeddings on store
  embeddingConfig?: EmbeddingConfig; // Embedding provider configuration
}
```

#### Core Methods

```typescript
// Lifecycle
await cass.initialize();
cass.close();

// Storage
await cass.store(entry: MemoryInput): Promise<string>;  // Returns memory ID
await cass.retrieve(id: string): Promise<MemoryEntry | null>;
await cass.delete(id: string): Promise<boolean>;

// Text Search
await cass.search(query: string, limit?: number): Promise<MemoryEntry[]>;

// Semantic Search
await cass.semanticSearch(embedding: number[], limit?: number): Promise<MemoryEntry[]>;
await cass.semanticSearchByQuery(query: string, limit?: number): Promise<MemoryEntry[]>;

// Maintenance
await cass.compact(threshold: number): Promise<number>;  // Returns removed count
await cass.adaptiveCompact(): Promise<number>;           // Auto-triggered at 80% capacity
await cass.updateImportance(id: string, importance: number): Promise<void>;

// Queries
await cass.getByType(type: MemoryType, limit?: number): Promise<MemoryEntry[]>;
await cass.getRecentMemories(limit?: number): Promise<MemoryEntry[]>;
await cass.getStats(): Promise<MemoryStats>;
```

### Memory Types

```typescript
type MemoryType =
  | 'agent_learning'      // Lessons learned from task execution
  | 'codebase_knowledge'  // Project-specific knowledge (protected from compaction)
  | 'task_context'        // Context from completed tasks
  | 'error_pattern'       // Common error patterns and solutions
  | 'user_preference';    // User preferences and conventions
```

### MemoryInput

```typescript
interface MemoryInput {
  type: MemoryType;
  content: string;
  embedding?: number[];         // Optional pre-computed embedding
  metadata?: Record<string, unknown>;
  importance: number;           // 0-1, higher = more important
}
```

## Embedding Providers

CASS supports multiple embedding providers for semantic search.

### OpenAI (Recommended)

```typescript
const cass = new CASSAdapter({
  cassDir: './.cass',
  compactionThreshold: 0.3,
  maxEntries: 10000,
  autoGenerateEmbeddings: true,
  embeddingConfig: {
    provider: 'openai',
    model: 'text-embedding-ada-002',
    apiKey: process.env.OPENAI_API_KEY,
  },
});
```

Or via environment variables:

```bash
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-ada-002  # optional, defaults to ada-002
```

### Ollama (Local)

```typescript
const cass = new CASSAdapter({
  cassDir: './.cass',
  compactionThreshold: 0.3,
  maxEntries: 10000,
  autoGenerateEmbeddings: true,
  embeddingConfig: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
  },
});
```

Or via environment variables:

```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://localhost:11434  # optional
```

### None (Text Search Only)

```typescript
const cass = new CASSAdapter({
  cassDir: './.cass',
  compactionThreshold: 0.3,
  maxEntries: 10000,
  autoGenerateEmbeddings: false,  // No embeddings
});
```

### Embedding Utilities

```typescript
// Check if embeddings are available
cass.hasEmbeddingGenerator(): boolean;

// Get embedding statistics
const stats = await cass.getEmbeddingStats();
console.log(`With embedding: ${stats.withEmbedding}, Without: ${stats.withoutEmbedding}`);

// Backfill embeddings for existing entries
const updated = await cass.backfillEmbeddings(batchSize: 10);
console.log(`Backfilled ${updated} embeddings`);
```

## Runtime Reconfiguration

Update settings without restart:

```typescript
// Update compaction settings
await cass.reconfigure({
  compactionThreshold: 0.4,
  maxEntries: 20000,
});

// Update embedding configuration
await cass.reconfigure({
  autoGenerateEmbeddings: true,
  embeddingConfig: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    apiKey: newApiKey,
  },
});

// Get current configuration
const config = cass.getConfig();
console.log({
  autoGenerateEmbeddings: config.autoGenerateEmbeddings,
  hasEmbeddingGenerator: config.hasEmbeddingGenerator,
  embeddingProvider: config.embeddingProvider,
  embeddingModel: config.embeddingModel,
});
```

## Memory Management

### Compaction

CASS uses importance-based compaction to manage memory:

```typescript
// Manual compaction - remove memories below threshold
const removed = await cass.compact(0.3);  // Remove < 30% importance

// Adaptive compaction - auto-triggered at 80% capacity
// Removes bottom 20% by importance, keeping codebase_knowledge protected
const adaptiveRemoved = await cass.adaptiveCompact();
```

### Protected Memory Types

`codebase_knowledge` memories are protected from compaction - they persist regardless of importance threshold.

### Access Tracking

Every `retrieve()` call updates:
- `lastAccessed` timestamp
- `accessCount` counter

Use these for LRU-style cleanup or importance boosting.

## Example: Agent Learning System

```typescript
import { CASSAdapter } from '@jetpack-agent/cass-adapter';

const cass = new CASSAdapter({
  cassDir: './.cass',
  compactionThreshold: 0.3,
  maxEntries: 5000,
  autoGenerateEmbeddings: true,
});

await cass.initialize();

// Store learnings from completed tasks
await cass.store({
  type: 'agent_learning',
  content: 'React components should use functional patterns with hooks',
  importance: 0.7,
  metadata: { source: 'code_review', taskId: 'bd-123' },
});

await cass.store({
  type: 'error_pattern',
  content: 'ESLint rule react-hooks/exhaustive-deps requires all dependencies in useEffect',
  importance: 0.9,
  metadata: { errorType: 'lint', framework: 'react' },
});

// Before starting a new task, retrieve relevant context
const context = await cass.semanticSearchByQuery(
  'React hooks best practices error handling',
  5
);

for (const memory of context) {
  console.log(`[${memory.type}] ${memory.content}`);
}

// Get statistics
const stats = await cass.getStats();
console.log({
  total: stats.total,
  avgImportance: stats.avgImportance.toFixed(2),
  withEmbedding: stats.withEmbedding,
});

cass.close();
```

## Related Packages

- `@jetpack-agent/shared` - Shared types and `IMemoryStore` interface
- `@jetpack-agent/orchestrator` - Multi-agent orchestration engine
- `@jetpack-agent/beads-adapter` - Task management
- `@jetpack-agent/mcp-mail-adapter` - Inter-agent messaging

## License

MIT
