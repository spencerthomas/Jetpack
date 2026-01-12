import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

const JETPACK_DIR = path.join(process.cwd(), '../..', '.jetpack');
const MAIL_DIR = path.join(JETPACK_DIR, 'mail');

interface AckRequest {
  ackedBy?: string;
}

/**
 * POST /api/messages/[id]/ack - Acknowledge a message
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const body = await request.json().catch(() => ({})) as AckRequest;
    const ackedBy = body.ackedBy || 'human-overseer';
    const ackedAt = new Date().toISOString();

    // Search for the message in various locations
    const locations = [
      path.join(MAIL_DIR, 'archive'),
      path.join(MAIL_DIR, 'outbox'),
    ];

    // Also search in agent inboxes
    try {
      const inboxBase = path.join(MAIL_DIR, 'inbox');
      const agentDirs = await fs.readdir(inboxBase);
      for (const agentDir of agentDirs) {
        locations.push(path.join(inboxBase, agentDir));
      }
    } catch {
      // Inbox directory doesn't exist
    }

    for (const location of locations) {
      const messageFile = path.join(location, `${messageId}.json`);
      try {
        const content = await fs.readFile(messageFile, 'utf-8');
        const message = JSON.parse(content);

        // Update message with acknowledgment info
        message.ackedAt = ackedAt;
        message.ackedBy = ackedBy;

        // Write back
        await fs.writeFile(messageFile, JSON.stringify(message, null, 2));

        return NextResponse.json({
          success: true,
          messageId,
          ackedAt,
          ackedBy,
        });
      } catch {
        // File not found in this location, continue searching
      }
    }

    return NextResponse.json(
      { error: 'Message not found', messageId },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error acknowledging message:', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge message' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/messages/[id]/ack - Get acknowledgment status
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;

    // Search for the message
    const locations = [
      path.join(MAIL_DIR, 'archive'),
      path.join(MAIL_DIR, 'outbox'),
    ];

    try {
      const inboxBase = path.join(MAIL_DIR, 'inbox');
      const agentDirs = await fs.readdir(inboxBase);
      for (const agentDir of agentDirs) {
        locations.push(path.join(inboxBase, agentDir));
      }
    } catch {
      // Inbox directory doesn't exist
    }

    for (const location of locations) {
      const messageFile = path.join(location, `${messageId}.json`);
      try {
        const content = await fs.readFile(messageFile, 'utf-8');
        const message = JSON.parse(content);

        return NextResponse.json({
          messageId: message.id,
          ackRequired: message.ackRequired ?? false,
          acked: !!message.ackedAt,
          ackedAt: message.ackedAt,
          ackedBy: message.ackedBy,
        });
      } catch {
        // File not found in this location, continue searching
      }
    }

    return NextResponse.json(
      { error: 'Message not found', messageId },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error getting ack status:', error);
    return NextResponse.json(
      { error: 'Failed to get acknowledgment status' },
      { status: 500 }
    );
  }
}
