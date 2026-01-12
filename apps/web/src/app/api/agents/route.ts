import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

interface AgentRegistryEntry {
  id: string;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  skills: string[];
  currentTask: string | null;
  lastHeartbeat: string;
  tasksCompleted: number;
  startedAt: string;
}

interface AgentRegistry {
  agents: AgentRegistryEntry[];
  updatedAt: string;
}

// Get work directory from env or default
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

// Read agent registry from .jetpack/agents.json
async function loadAgentRegistry(): Promise<AgentRegistry> {
  const registryPath = path.join(getWorkDir(), '.jetpack', 'agents.json');

  try {
    const content = await fs.readFile(registryPath, 'utf-8');
    return JSON.parse(content) as AgentRegistry;
  } catch (error) {
    // File doesn't exist or is empty - return empty registry
    return { agents: [], updatedAt: new Date().toISOString() };
  }
}

// Filter out agents with stale heartbeats (>60s old)
function filterStaleAgents(registry: AgentRegistry): AgentRegistryEntry[] {
  const now = Date.now();
  const staleThreshold = 60 * 1000; // 60 seconds

  return registry.agents.filter(agent => {
    const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
    const age = now - lastHeartbeat;
    return age < staleThreshold;
  });
}

export async function GET() {
  try {
    const registry = await loadAgentRegistry();

    // Filter out stale agents (heartbeat older than 60s)
    const activeAgents = filterStaleAgents(registry);

    // Transform for API response
    const agents = activeAgents.map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      skills: agent.skills,
      currentTask: agent.currentTask,
      tasksCompleted: agent.tasksCompleted,
      lastHeartbeat: agent.lastHeartbeat,
      startedAt: agent.startedAt,
      createdAt: agent.startedAt, // For compatibility
      lastActive: agent.lastHeartbeat, // For compatibility
    }));

    return NextResponse.json({
      agents,
      registryUpdatedAt: registry.updatedAt,
    });
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json({ agents: [], error: 'Failed to fetch agents' }, { status: 500 });
  }
}
