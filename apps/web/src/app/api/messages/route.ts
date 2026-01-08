import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Message } from '@jetpack/shared';

export async function GET() {
  try {
    const mailDir = path.join(process.cwd(), '../..', '.jetpack', 'mail', 'outbox');

    try {
      await fs.access(mailDir);
    } catch {
      return NextResponse.json({ messages: [] });
    }

    const files = await fs.readdir(mailDir);
    const messages: Message[] = [];

    for (const file of files.slice(-50)) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await fs.readFile(path.join(mailDir, file), 'utf-8');
        const message = JSON.parse(content) as Message;
        messages.push({
          ...message,
          timestamp: new Date(message.timestamp).toISOString() as any,
        });
      } catch (err) {
        console.error('Failed to read message file:', file, err);
      }
    }

    // Sort by timestamp descending
    messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ messages: messages.slice(0, 50) });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ messages: [], error: 'Failed to fetch messages' }, { status: 500 });
  }
}
