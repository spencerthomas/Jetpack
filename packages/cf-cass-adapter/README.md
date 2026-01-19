# @jetpack-agent/cf-cass-adapter

Cloudflare D1+Vectorize-based memory storage adapter for Jetpack multi-agent systems.

## Overview

This package provides a `CloudflareMemoryStore` class that implements the `IMemoryStore` interface using:
- **Cloudflare D1** for memory entry storage and metadata
- **Cloudflare Vectorize** for embedding storage and semantic similarity search

## Installation

```bash
npm install @jetpack-agent/cf-cass-adapter
# or
pnpm add @jetpack-agent/cf-cass-adapter
```

## Requirements

- **Cloudflare D1**: Database for memory metadata storage
- **Cloudflare Vectorize**: Vector index for semantic search
- **Workers AI** (optional): For embedding generation

## Quick Start

```typescript
import { CloudflareMemoryStore } from '@jetpack-agent/cf-cass-adapter';

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Create embedding generator using Workers AI
    const embeddingGenerator = async (text: string) => {
      const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: [text],
      });
      return result.data[0];
    };

    const memoryStore = new CloudflareMemoryStore({
      db: env.DB,
      vectorize: env.VECTORIZE,
      embeddingGenerator,
      maxCapacity: 10000,
    });

    // Store a memory
    const id = await memoryStore.store({
      type: 'codebase_knowledge',
      content: 'The auth module uses JWT tokens with 24h expiry',
      importance: 0.8,
      metadata: { file: 'src/auth/jwt.ts' },
    });

    // Semantic search
    const related = await memoryStore.semanticSearchByQuery(
      'How does authentication work?',
      5
    );

    return Response.json({ id, related });
  },
};
```

## Wrangler Configuration

Add bindings to your `wrangler.toml`:

```toml
name = "jetpack-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "jetpack-memory"
database_id = "<your-database-id>"

[[vectorize]]
binding = "VECTORIZE"
index_name = "jetpack-embeddings"

[ai]
binding = "AI"
```

Create the Vectorize index:

```bash
wrangler vectorize create jetpack-embeddings --dimensions=768 --metric=cosine
```

## Database Migration

Create a migration file at `migrations/0001_create_memories.sql`:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  importance REAL DEFAULT 0.5,
  has_embedding INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0
);

CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_created_at ON memories(created_at);
```

Run the migration:

```bash
wrangler d1 migrations apply jetpack-memory
```

## API Reference

### Constructor

```typescript
new CloudflareMemoryStore(config: CloudflareMemoryStoreConfig)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.db` | `D1Database` | D1 database binding |
| `config.vectorize` | `VectorizeIndex` | Vectorize index binding |
| `config.embeddingGenerator` | `(text: string) => Promise<number[]>` | Optional function to generate embeddings |
| `config.maxCapacity` | `number` | Max memories before compaction (default: 10000) |
| `config.compactionThreshold` | `number` | Trigger compaction at this % of capacity (default: 0.8) |

### Methods

#### Storage Operations

| Method | Description |
|--------|-------------|
| `store(entry: MemoryInput)` | Store a new memory entry |
| `retrieve(id: string)` | Retrieve a memory by ID |
| `delete(id: string)` | Delete a memory |

#### Search Operations

| Method | Description |
|--------|-------------|
| `search(query: string, limit?: number)` | Text search using LIKE |
| `semanticSearch(embedding: number[], limit?: number)` | Search by embedding vector |
| `semanticSearchByQuery(query: string, limit?: number)` | Generate embedding and search |

#### Query Operations

| Method | Description |
|--------|-------------|
| `getByType(type: MemoryType, limit?: number)` | Get memories by type |
| `getRecentMemories(limit?: number)` | Get most recent memories |

#### Maintenance

| Method | Description |
|--------|-------------|
| `compact(threshold: number)` | Remove memories below importance threshold |
| `adaptiveCompact()` | Auto-remove lowest importance memories |
| `updateImportance(id: string, importance: number)` | Update memory importance |
| `backfillEmbeddings(batchSize?: number)` | Generate embeddings for entries without them |

#### Statistics

| Method | Description |
|--------|-------------|
| `getStats()` | Get memory statistics |
| `getEmbeddingStats()` | Get embedding coverage stats |
| `hasEmbeddingGenerator()` | Check if embedding generator is configured |

### Memory Types

- `codebase_knowledge` - Knowledge about the codebase
- `agent_learning` - Agent learned behaviors
- `pattern_recognition` - Recognized patterns
- `conversation_history` - Past conversations
- `decision_rationale` - Decision explanations
- `test_failure_analysis` - Test failure patterns
- `quality_improvement` - Quality insights
- `regression_pattern` - Regression patterns
- `successful_fix` - Successful fix patterns

## Automatic Compaction

The store automatically compacts when nearing capacity:
1. Triggers at 80% of `maxCapacity`
2. Removes the bottom 20% by importance score
3. Considers access count and recency as tiebreakers

## License

MIT
