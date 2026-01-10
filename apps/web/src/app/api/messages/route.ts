import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Message } from '@jetpack/shared';

interface ExtendedMessage extends Message {
  source: 'broadcast' | 'direct';
  direction?: 'sent' | 'received';
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
        timestamp: new Date(message.timestamp).toISOString() as any,
        source,
        direction,
      });
    } catch (err) {
      // Skip invalid files
    }
  }

  return messages;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // task, agent, coordination
    const from = searchParams.get('from'); // agent id
    const to = searchParams.get('to'); // agent id
    const since = searchParams.get('since'); // ISO timestamp
    const includeHeartbeats = searchParams.get('includeHeartbeats') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const mailBaseDir = path.join(process.cwd(), '../..', '.jetpack', 'mail');
    const allMessages: ExtendedMessage[] = [];

    // Read broadcast messages from outbox
    const outboxDir = path.join(mailBaseDir, 'outbox');
    const outboxMessages = await readMessagesFromDir(outboxDir, 'broadcast');
    allMessages.push(...outboxMessages);

    // Read direct messages from all agent inboxes
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
      filtered = filtered.filter(m => new Date(m.timestamp) > sinceDate);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    const messages = filtered.slice(0, limit);

    // Compute stats for response
    const stats = {
      total: messages.length,
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
