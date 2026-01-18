# @jetpack-agent/worker-api

Cloudflare Worker API for the Jetpack hybrid architecture. Exposes REST APIs for task management, messaging, and memory storage on the edge.

## Setup

### 1. Create D1 Database

```bash
wrangler d1 create jetpack-db
```

Copy the database ID and update `wrangler.toml`.

### 2. Create Vectorize Index

```bash
wrangler vectorize create jetpack-memories --dimensions=1536 --metric=cosine
```

### 3. Apply D1 Migrations

```bash
wrangler d1 migrations apply jetpack-db --local  # For local dev
wrangler d1 migrations apply jetpack-db          # For production
```

### 4. Set Secrets

```bash
wrangler secret put API_TOKEN
```

### 5. Deploy

```bash
pnpm run deploy
```

## Local Development

```bash
pnpm run dev
```

## API Endpoints

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks` | List tasks (with filters) |
| GET | `/api/tasks/:id` | Get task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/:id/claim` | Claim task (atomic) |
| POST | `/api/tasks/:id/release` | Release task |
| GET | `/api/tasks/ready` | Get ready tasks |
| GET | `/api/tasks/stats` | Get task statistics |

### Mail/Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/mail/publish` | Publish message |
| GET | `/api/mail/subscribe` | WebSocket subscription |
| POST | `/api/mail/lease` | Acquire file lease |
| DELETE | `/api/mail/lease` | Release file lease |
| GET | `/api/mail/lease?file=X` | Check lease status |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/memory` | Store memory |
| GET | `/api/memory/:id` | Retrieve memory |
| DELETE | `/api/memory/:id` | Delete memory |
| POST | `/api/memory/search` | Text search |
| POST | `/api/memory/semantic` | Semantic search |
| POST | `/api/memory/compact` | Trigger compaction |
| GET | `/api/memory/stats` | Get memory stats |
| GET | `/api/memory/type/:type` | Get memories by type |
| POST | `/api/memory/backfill` | Backfill embeddings |

## Authentication

All `/api/*` endpoints require Bearer token authentication:

```
Authorization: Bearer <API_TOKEN>
```

Authentication is disabled in development mode.
