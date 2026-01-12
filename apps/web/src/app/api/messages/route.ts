import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Message, MessageType } from '@jetpack/shared';
import { MessageIndex, createMessageIndex } from '@jetpack/mcp-mail-adapter';

interface ExtendedMessage extends Message {
  source: 'broadcast' | 'direct';
  direction?: 'sent' | 'received';
}

// Singleton message index
let messageIndex: MessageIndex | null = null;

function getMessageIndex(): MessageIndex {
  if (!messageIndex) {
    const indexDir = path.join(process.cwd(), '../..', '.jetpack', 'mail');
    messageIndex = createMessageIndex({ indexDir });
  }
  return messageIndex;
}

async function readMessagesFromDir(dir: string, source: ExtendedMessage['source'], direction?: ExtendedMessage['direction']): Promise<ExtendedMessage[]> {
  const messages: ExtendedMessage[] = [];

  try {
    await fs.access(dir);
  } catch {
    return messages;
  }

  const files = await fs.readdir(dir);

  for (const file of files.slice(-100)) {
    if (!file.endsWith('.json')) continue;

    try {
      const content = await fs.readFile(path.join(dir, file), 'utf-8');
      const message = JSON.parse(content) as Message;
      messages.push({
        ...message,
        timestamp: new Date(message.timestamp).toISOString() as unknown as Date,
        source,
        direction,
      });
    } catch {
      // Skip invalid files
    }
  }

  return messages;
}

// Index all messages from file system into SQLite
async function syncMessagesToIndex(index: MessageIndex, mailBaseDir: string): Promise<void> {
  const allMessages: Message[] = [];

  // Read from outbox
  const outboxDir = path.join(mailBaseDir, 'outbox');
  try {
    const files = await fs.readdir(outboxDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(outboxDir, file), 'utf-8');
        const msg = JSON.parse(content) as Message;
        msg.timestamp = new Date(msg.timestamp);
        allMessages.push(msg);
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist
  }

  // Read from archive
  const archiveDir = path.join(mailBaseDir, 'archive');
  try {
    const files = await fs.readdir(archiveDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(archiveDir, file), 'utf-8');
        const msg = JSON.parse(content) as Message;
        msg.timestamp = new Date(msg.timestamp);
        allMessages.push(msg);
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist
  }

  // Read from all inboxes
  const inboxBaseDir = path.join(mailBaseDir, 'inbox');
  try {
    const agentDirs = await fs.readdir(inboxBaseDir);
    for (const agentDir of agentDirs) {
      const agentInboxPath = path.join(inboxBaseDir, agentDir);
      try {
        const stats = await fs.stat(agentInboxPath);
        if (stats.isDirectory()) {
          const files = await fs.readdir(agentInboxPath);
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const content = await fs.readFile(path.join(agentInboxPath, file), 'utf-8');
              const msg = JSON.parse(content) as Message;
              msg.timestamp = new Date(msg.timestamp);
              allMessages.push(msg);
            } catch {
              // Skip invalid files
            }
          }
        }
      } catch {
        // Skip invalid directories
      }
    }
  } catch {
    // Directory doesn't exist
  }

  // Index all messages
  if (allMessages.length > 0) {
    await index.indexBatch(allMessages);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q'); // Full-text search query
    const type = searchParams.get('type'); // task, agent, coordination
    const from = searchParams.get('from'); // agent id
    const to = searchParams.get('to'); // agent id
    const since = searchParams.get('since'); // ISO timestamp
    const until = searchParams.get('until'); // ISO timestamp
    const correlationId = searchParams.get('correlationId'); // thread ID
    const includeHeartbeats = searchParams.get('includeHeartbeats') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const mailBaseDir = path.join(process.cwd(), '../..', '.jetpack', 'mail');

    // If there's a search query, use the indexed search
    if (query && query.trim()) {
      const index = getMessageIndex();

      // Sync messages to index before searching
      await syncMessagesToIndex(index, mailBaseDir);

      // Build type filter - handle type prefix filtering
      let typeFilter: MessageType | MessageType[] | undefined;
      if (type) {
        const allTypes: MessageType[] = [
          'task.created', 'task.claimed', 'task.assigned', 'task.updated', 'task.completed', 'task.failed',
          'agent.started', 'agent.stopped', 'agent.error',
          'file.lock', 'file.unlock',
          'coordination.request', 'coordination.response',
          'heartbeat'
        ];
        typeFilter = allTypes.filter(t => t.startsWith(type + '.') || t === type);
      }

      const result = index.search(query, {
        type: typeFilter,
        from: from ?? undefined,
        to: to ?? undefined,
        since: since ? new Date(since) : undefined,
        until: until ? new Date(until) : undefined,
        correlationId: correlationId ?? undefined,
      }, limit, offset);

      // Filter out heartbeats unless explicitly requested
      let messages = result.messages;
      if (!includeHeartbeats) {
        messages = messages.filter(m => m.type !== 'heartbeat');
      }

      // Add source information for UI compatibility
      const extendedMessages = messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
        source: m.to ? 'direct' : 'broadcast',
        direction: 'received',
      }));

      // Compute stats
      const stats = {
        total: result.total,
        returned: extendedMessages.length,
        offset: result.offset,
        limit: result.limit,
        byType: {} as Record<string, number>,
        bySource: {
          broadcast: extendedMessages.filter(m => m.source === 'broadcast').length,
          direct: extendedMessages.filter(m => m.source === 'direct').length,
        },
      };

      for (const msg of extendedMessages) {
        const typeCategory = msg.type.split('.')[0];
        stats.byType[typeCategory] = (stats.byType[typeCategory] || 0) + 1;
      }

      return NextResponse.json({
        messages: extendedMessages,
        stats,
        searchQuery: query,
      });
    }

    // Non-search mode: read directly from file system
    const allMessages: ExtendedMessage[] = [];

    // Read broadcast messages from outbox
    const outboxDir = path.join(mailBaseDir, 'outbox');
    const outboxMessages = await readMessagesFromDir(outboxDir, 'broadcast');
    allMessages.push(...outboxMessages);

    // Read archived messages (processed inbox + broadcast copies)
    const archiveDir = path.join(mailBaseDir, 'archive');
    const archiveMessages = await readMessagesFromDir(archiveDir, 'direct', 'received');
    allMessages.push(...archiveMessages);

    // Read direct messages from all agent inboxes (unprocessed)
    const inboxBaseDir = path.join(mailBaseDir, 'inbox');
    try {
      const agentDirs = await fs.readdir(inboxBaseDir);
      for (const agentDir of agentDirs) {
        const agentInboxPath = path.join(inboxBaseDir, agentDir);
        const stats = await fs.stat(agentInboxPath);
        if (stats.isDirectory()) {
          const directMessages = await readMessagesFromDir(agentInboxPath, 'direct', 'received');
          allMessages.push(...directMessages);
        }
      }
    } catch {
      // Inbox directory doesn't exist yet
    }

    // Read sent messages from agent sent folders
    const sentBaseDir = path.join(mailBaseDir, 'sent');
    try {
      const agentDirs = await fs.readdir(sentBaseDir);
      for (const agentDir of agentDirs) {
        const agentSentPath = path.join(sentBaseDir, agentDir);
        const stats = await fs.stat(agentSentPath);
        if (stats.isDirectory()) {
          const sentMessages = await readMessagesFromDir(agentSentPath, 'direct', 'sent');
          allMessages.push(...sentMessages);
        }
      }
    } catch {
      // Sent directory doesn't exist yet
    }

    // Deduplicate by message ID (same message might appear in multiple places)
    const uniqueMessages = Array.from(
      new Map(allMessages.map(m => [m.id, m])).values()
    );

    // Apply filters
    let filtered = uniqueMessages;

    // Filter out heartbeats unless explicitly requested
    if (!includeHeartbeats) {
      filtered = filtered.filter(m => m.type !== 'heartbeat');
    }

    // Type filter
    if (type) {
      filtered = filtered.filter(m => m.type.startsWith(type + '.') || m.type === type);
    }

    // From filter
    if (from) {
      filtered = filtered.filter(m => m.from === from);
    }

    // To filter
    if (to) {
      filtered = filtered.filter(m => m.to === to);
    }

    // Since filter
    if (since) {
      const sinceDate = new Date(since);
      filtered = filtered.filter(m => new Date(m.timestamp as unknown as string) > sinceDate);
    }

    // Until filter
    if (until) {
      const untilDate = new Date(until);
      filtered = filtered.filter(m => new Date(m.timestamp as unknown as string) < untilDate);
    }

    // Correlation ID filter
    if (correlationId) {
      filtered = filtered.filter(m => m.correlationId === correlationId || m.id === correlationId);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp as unknown as string).getTime() - new Date(a.timestamp as unknown as string).getTime());

    // Apply pagination
    const total = filtered.length;
    const messages = filtered.slice(offset, offset + limit);

    // Compute stats for response
    const stats = {
      total,
      returned: messages.length,
      offset,
      limit,
      byType: {} as Record<string, number>,
      bySource: {
        broadcast: messages.filter(m => m.source === 'broadcast').length,
        direct: messages.filter(m => m.source === 'direct').length,
      },
    };

    for (const msg of messages) {
      const typeCategory = msg.type.split('.')[0];
      stats.byType[typeCategory] = (stats.byType[typeCategory] || 0) + 1;
    }

    return NextResponse.json({ messages, stats });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ messages: [], error: 'Failed to fetch messages' }, { status: 500 });
  }
}
