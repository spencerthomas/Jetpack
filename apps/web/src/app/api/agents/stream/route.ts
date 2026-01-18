import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Get work directory from env or default
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

interface AgentRegistryEntry {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  skills: string[];
  currentTask: string | null;
  lastHeartbeat: string;
  tasksCompleted: number;
  startedAt: string;
  memoryUsage?: number;
  taskProgress?: number;
  currentPhase?: string;
}

interface AgentRegistry {
  agents: AgentRegistryEntry[];
  updatedAt: string;
}

// Track connected clients
const connectedClients = new Map<string, number>();

/**
 * GET /api/agents/stream - Server-Sent Events stream for real-time agent status updates
 *
 * Events emitted:
 * - 'connected': Initial connection confirmation
 * - 'agents': Agent status updates (every 5s or on file change)
 * - 'heartbeat': Keep-alive ping (every 15s)
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Generate unique client ID for this connection
  const clientId = `agent-stream-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  connectedClients.set(clientId, Date.now());

  // Check if client requested abort
  const abortSignal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let isRunning = true;

      // Cleanup on abort
      abortSignal.addEventListener('abort', () => {
        isRunning = false;
        connectedClients.delete(clientId);
      });

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`)
      );

      const registryPath = path.join(getWorkDir(), '.jetpack', 'agents.json');
      const jetpackDir = path.join(getWorkDir(), '.jetpack');

      // Ensure directory exists
      try {
        fs.mkdirSync(jetpackDir, { recursive: true });
      } catch {
        // Already exists
      }

      // Function to load and filter agent registry
      const loadAgents = (): AgentRegistryEntry[] => {
        try {
          if (!fs.existsSync(registryPath)) {
            return [];
          }
          const content = fs.readFileSync(registryPath, 'utf-8');
          const registry: AgentRegistry = JSON.parse(content);

          const now = Date.now();
          const staleThreshold = 60 * 1000; // 60 seconds

          // Filter out stale agents and enrich with health data
          return registry.agents.filter(agent => {
            const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
            const age = now - lastHeartbeat;
            return age < staleThreshold;
          }).map(agent => {
            const heartbeatAge = now - new Date(agent.lastHeartbeat).getTime();
            return {
              ...agent,
              // Calculate health status based on heartbeat age
              healthStatus: heartbeatAge < 10000 ? 'healthy' : heartbeatAge < 30000 ? 'warning' : 'critical',
              heartbeatAgeMs: heartbeatAge,
            };
          });
        } catch {
          return [];
        }
      };

      // Function to send agent update event
      const sendAgentUpdate = () => {
        if (!isRunning) return;
        try {
          const agents = loadAgents();
          const eventData = {
            agents,
            timestamp: new Date().toISOString(),
            agentCount: agents.length,
            busyCount: agents.filter(a => a.status === 'busy').length,
            idleCount: agents.filter(a => a.status === 'idle').length,
            errorCount: agents.filter(a => a.status === 'error').length,
          };
          controller.enqueue(
            encoder.encode(`event: agents\ndata: ${JSON.stringify(eventData)}\n\n`)
          );
        } catch {
          // File might be gone or invalid
        }
      };

      // Send initial agent data immediately
      sendAgentUpdate();

      // File watcher for real-time updates
      let watcher: fs.FSWatcher | null = null;
      try {
        // Ensure agents.json exists before watching
        if (!fs.existsSync(registryPath)) {
          // Create empty registry
          fs.writeFileSync(registryPath, JSON.stringify({ agents: [], updatedAt: new Date().toISOString() }), 'utf-8');
        }

        watcher = fs.watch(registryPath, { persistent: false }, (eventType) => {
          if (!isRunning) return;
          if (eventType === 'change') {
            // Debounce updates (50ms delay)
            setTimeout(sendAgentUpdate, 50);
          }
        });
      } catch {
        // File watcher failed, will rely on polling
      }

      // Polling interval as fallback (every 5 seconds)
      const pollInterval = setInterval(() => {
        if (!isRunning) {
          clearInterval(pollInterval);
          return;
        }
        sendAgentUpdate();
      }, 5000);

      // Heartbeat every 15 seconds to keep connection alive
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
      }, 15000);

      // Cleanup when connection closes
      const cleanup = () => {
        isRunning = false;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        if (watcher) {
          try {
            watcher.close();
          } catch {
            // Already closed
          }
        }
        connectedClients.delete(clientId);
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
