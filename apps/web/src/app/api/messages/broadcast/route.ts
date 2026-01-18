import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateMessageId } from '@jetpack-agent/shared';

const JETPACK_DIR = path.join(process.cwd(), '../..', '.jetpack');
const MAIL_DIR = path.join(JETPACK_DIR, 'mail');

interface BroadcastRequest {
  message: string;
  priority?: 'high' | 'normal' | 'low';
  type?: string;
  ackRequired?: boolean;
}

/**
 * POST /api/messages/broadcast - Broadcast a message from human overseer to all agents
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as BroadcastRequest;

    if (!body.message || !body.message.trim()) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Create the broadcast message
    const messageId = generateMessageId();
    const timestamp = new Date();
    const messageType = body.type || 'coordination.request';

    const message = {
      id: messageId,
      type: messageType,
      from: 'human-overseer',
      payload: {
        message: body.message.trim(),
        priority: body.priority || 'normal',
        source: 'web-ui',
      },
      timestamp: timestamp.toISOString(),
      ackRequired: body.ackRequired ?? false,
    };

    // Ensure outbox directory exists
    const outboxDir = path.join(MAIL_DIR, 'outbox');
    await fs.mkdir(outboxDir, { recursive: true });

    // Write to outbox for all agents to see
    const messageFile = path.join(outboxDir, `${messageId}.json`);
    await fs.writeFile(messageFile, JSON.stringify(message, null, 2));

    return NextResponse.json({
      success: true,
      messageId,
      timestamp: timestamp.toISOString(),
      recipients: 'broadcast',
    });
  } catch (error) {
    console.error('Error broadcasting message:', error);
    return NextResponse.json(
      { error: 'Failed to broadcast message' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/messages/broadcast - Get recent broadcasts from human overseer
 */
export async function GET() {
  try {
    const outboxDir = path.join(MAIL_DIR, 'outbox');

    // Also check archive for past broadcasts
    const archiveDir = path.join(MAIL_DIR, 'archive');

    const broadcasts: unknown[] = [];

    // Read from outbox
    try {
      const outboxFiles = await fs.readdir(outboxDir);
      for (const file of outboxFiles) {
        if (!file.endsWith('.json')) continue;
        const content = await fs.readFile(path.join(outboxDir, file), 'utf-8');
        const msg = JSON.parse(content);
        if (msg.from === 'human-overseer') {
          broadcasts.push(msg);
        }
      }
    } catch {
      // Outbox doesn't exist
    }

    // Read from archive
    try {
      const archiveFiles = await fs.readdir(archiveDir);
      for (const file of archiveFiles) {
        if (!file.endsWith('.json')) continue;
        const content = await fs.readFile(path.join(archiveDir, file), 'utf-8');
        const msg = JSON.parse(content);
        if (msg.from === 'human-overseer') {
          // Avoid duplicates
          if (!broadcasts.some((b: unknown) => (b as { id: string }).id === msg.id)) {
            broadcasts.push(msg);
          }
        }
      }
    } catch {
      // Archive doesn't exist
    }

    // Sort by timestamp descending
    broadcasts.sort((a: unknown, b: unknown) =>
      new Date((b as { timestamp: string }).timestamp).getTime() - new Date((a as { timestamp: string }).timestamp).getTime()
    );

    return NextResponse.json({
      broadcasts,
      count: broadcasts.length,
    });
  } catch (error) {
    console.error('Error getting broadcasts:', error);
    return NextResponse.json(
      { error: 'Failed to get broadcasts' },
      { status: 500 }
    );
  }
}
