import { getDashboard } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const dashboard = await getDashboard();

      // Send initial status
      const metrics = await dashboard.getMetrics();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'metrics', data: metrics })}\n\n`)
      );

      // Subscribe to dashboard events
      const handlers = {
        'status.updated': (data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'status.updated', data })}\n\n`)
          );
        },
        'task.created': (data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'task.created', data })}\n\n`)
          );
        },
        'task.updated': (data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'task.updated', data })}\n\n`)
          );
        },
        'agent.registered': (data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'agent.registered', data })}\n\n`)
          );
        },
        'agent.updated': (data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'agent.updated', data })}\n\n`)
          );
        },
      };

      // Register all handlers
      for (const [event, handler] of Object.entries(handlers)) {
        dashboard.on(event, handler);
      }

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 30000);

      // Cleanup on close
      return () => {
        clearInterval(heartbeat);
        for (const [event, handler] of Object.entries(handlers)) {
          dashboard.off(event, handler);
        }
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
