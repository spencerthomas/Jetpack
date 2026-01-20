import { NextRequest, NextResponse } from 'next/server';
import { getDataLayer } from '@/lib/data';
import type { MessageFilter, MessageCreate } from '@jetpack-agent/data';

/**
 * GET /api/messages
 * Get messages for a specific agent (or system broadcast messages)
 */
export async function GET(request: NextRequest) {
  try {
    const dataLayer = await getDataLayer();
    const searchParams = request.nextUrl.searchParams;

    // Get messages for a specific agent (required)
    const agentId = searchParams.get('agentId') || 'system';

    const filter: MessageFilter = {};

    const type = searchParams.get('type');
    if (type) {
      filter.type = type as MessageFilter['type'];
    }

    const limit = searchParams.get('limit');
    if (limit) {
      filter.limit = parseInt(limit, 10);
    }

    const messages = await dataLayer.messages.receive(agentId, filter);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Messages list error:', error);
    return NextResponse.json(
      { error: 'Failed to list messages', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/messages
 * Send a message
 */
export async function POST(request: NextRequest) {
  try {
    const dataLayer = await getDataLayer();
    const body = await request.json();

    const messageData: MessageCreate = {
      type: body.type,
      fromAgent: body.fromAgent || 'system',
      toAgent: body.toAgent,
      payload: body.payload || {},
      ackRequired: body.ackRequired || false,
    };

    const message = await dataLayer.messages.send(messageData);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('Message send error:', error);
    return NextResponse.json(
      { error: 'Failed to send message', details: String(error) },
      { status: 500 }
    );
  }
}
