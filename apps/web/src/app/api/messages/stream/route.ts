import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const JETPACK_DIR = path.join(process.cwd(), '../..', '.jetpack');
const MAIL_DIR = path.join(JETPACK_DIR, 'mail');

// Track seen messages per client connection
const seenMessages = new Map<string, Set<string>>();

/**
 * GET /api/messages/stream - Server-Sent Events stream for real-time message updates
 *
 * Events emitted:
 * - 'message': New message received
 * - 'heartbeat': Keep-alive ping (every 30s)
 * - 'connected': Initial connection confirmation
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Generate unique client ID for this connection
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  seenMessages.set(clientId, new Set());

  // Check if client requested abort
  const abortSignal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`)
      );

      let isRunning = true;

      // Cleanup on abort
      abortSignal.addEventListener('abort', () => {
        isRunning = false;
        seenMessages.delete(clientId);
      });

      // Watch directories for changes
      const watchDirs = [
        path.join(MAIL_DIR, 'outbox'),
        path.join(MAIL_DIR, 'archive'),
      ];

      // Also watch inbox directories
      try {
        const inboxBase = path.join(MAIL_DIR, 'inbox');
        if (fs.existsSync(inboxBase)) {
          const agentDirs = fs.readdirSync(inboxBase);
          for (const dir of agentDirs) {
            const inboxDir = path.join(inboxBase, dir);
            if (fs.statSync(inboxDir).isDirectory()) {
              watchDirs.push(inboxDir);
            }
          }
        }
      } catch {
        // Inbox doesn't exist yet
      }

      // Ensure directories exist
      for (const dir of watchDirs) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch {
          // Already exists
        }
      }

      const watchers: fs.FSWatcher[] = [];
      const clientSeen = seenMessages.get(clientId)!;

      // Function to send a message event
      const sendMessageEvent = (filePath: string) => {
        if (!isRunning) return;
        if (!filePath.endsWith('.json')) return;

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const message = JSON.parse(content);

          // Skip if already seen
          if (clientSeen.has(message.id)) return;
          clientSeen.add(message.id);

          // Determine source
          const isOutbox = filePath.includes('/outbox/');
          const source = isOutbox ? 'broadcast' : 'direct';

          const eventData = {
            ...message,
            source,
            direction: message.from === 'human-overseer' ? 'sent' : 'received',
          };

          controller.enqueue(
            encoder.encode(`event: message\ndata: ${JSON.stringify(eventData)}\n\n`)
          );
        } catch {
          // File might be gone or invalid
        }
      };

      // Watch each directory
      for (const dir of watchDirs) {
        try {
          const watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
            if (!isRunning) return;
            if (eventType === 'rename' && filename && filename.endsWith('.json')) {
              // Small delay to ensure file is written
              setTimeout(() => {
                const filePath = path.join(dir, filename);
                if (fs.existsSync(filePath)) {
                  sendMessageEvent(filePath);
                }
              }, 50);
            }
          });
          watchers.push(watcher);
        } catch {
          // Directory might not exist yet
        }
      }

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (!isRunning) {
          clearInterval(heartbeatInterval);
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`)
          );
        } catch {
          isRunning = false;
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Also do initial scan to send any recent messages
      const recentCutoff = Date.now() - 5000; // Messages from last 5 seconds
      for (const dir of watchDirs) {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const filePath = path.join(dir, file);
            try {
              const stat = fs.statSync(filePath);
              // Only send very recent messages to avoid duplicates
              if (stat.mtimeMs > recentCutoff) {
                sendMessageEvent(filePath);
              }
            } catch {
              // File might be gone
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }

      // Cleanup when connection closes
      const cleanup = () => {
        isRunning = false;
        clearInterval(heartbeatInterval);
        for (const watcher of watchers) {
          try {
            watcher.close();
          } catch {
            // Already closed
          }
        }
        seenMessages.delete(clientId);
      };

      // Handle connection close
      abortSignal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
