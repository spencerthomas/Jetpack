#!/usr/bin/env npx tsx
/**
 * Codex Worker for Jetpack Task Queue
 *
 * This script runs Codex agents that consume tasks from the same
 * .beads/tasks.jsonl file as Jetpack's Claude Code agents.
 *
 * Usage: npx tsx scripts/codex-worker.ts
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { setTimeout as sleep } from 'timers/promises';

const TASKS_FILE = '.beads/tasks.jsonl';
const LOCK_FILE = '.beads/tasks.lock';
const WORK_DIR = process.cwd();
const AGENT_ID = `codex-${randomUUID().slice(0, 8)}`;
const POLL_INTERVAL = 10000; // 10 seconds between task checks
const LOCK_TIMEOUT = 5000; // 5 second lock timeout

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  files?: string[];
  assignedAgent?: string;
  retryCount?: number;
  maxRetries?: number;
  blockers?: string[];
  dependencies?: string[];
}

// Simple file-based locking
function acquireLock(): boolean {
  const lockPath = path.join(WORK_DIR, LOCK_FILE);
  const now = Date.now();

  try {
    // Check if lock exists and is stale
    if (fs.existsSync(lockPath)) {
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (now - lockData.timestamp < LOCK_TIMEOUT) {
        return false; // Lock is held by another process
      }
    }

    // Create/update lock
    fs.writeFileSync(lockPath, JSON.stringify({
      agent: AGENT_ID,
      timestamp: now
    }));
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  const lockPath = path.join(WORK_DIR, LOCK_FILE);
  try {
    if (fs.existsSync(lockPath)) {
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (lockData.agent === AGENT_ID) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch {
    // Ignore errors releasing lock
  }
}

function readTasks(): Task[] {
  const tasksPath = path.join(WORK_DIR, TASKS_FILE);
  if (!fs.existsSync(tasksPath)) {
    return [];
  }

  const content = fs.readFileSync(tasksPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(t => t !== null) as Task[];
}

function writeTasks(tasks: Task[]): void {
  const tasksPath = path.join(WORK_DIR, TASKS_FILE);
  const content = tasks.map(t => JSON.stringify(t)).join('\n') + '\n';
  fs.writeFileSync(tasksPath, content);
}

async function claimTask(): Promise<Task | null> {
  // Try to acquire lock
  let attempts = 0;
  while (!acquireLock() && attempts < 10) {
    attempts++;
    await sleep(500);
  }

  if (attempts >= 10) {
    console.log(`[${AGENT_ID}] Could not acquire lock, will retry later`);
    return null;
  }

  try {
    const tasks = readTasks();

    // Find a ready task (prioritize high priority)
    const priorityOrder = ['high', 'medium', 'low'];

    for (const priority of priorityOrder) {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];

        if (task.status !== 'ready') continue;
        if (task.priority !== priority) continue;

        // Check blockers
        if (task.blockers && task.blockers.length > 0) {
          const allBlockersCleared = task.blockers.every(blockerId => {
            const blocker = tasks.find(t => t.id === blockerId);
            return blocker && blocker.status === 'completed';
          });
          if (!allBlockersCleared) continue;
        }

        // Check dependencies
        if (task.dependencies && task.dependencies.length > 0) {
          const allDepsComplete = task.dependencies.every(depId => {
            const dep = tasks.find(t => t.id === depId);
            return dep && dep.status === 'completed';
          });
          if (!allDepsComplete) continue;
        }

        // Claim this task
        task.status = 'in_progress';
        task.assignedAgent = AGENT_ID;

        writeTasks(tasks);
        releaseLock();

        return task;
      }
    }

    releaseLock();
    return null;
  } catch (e) {
    releaseLock();
    throw e;
  }
}

async function updateTaskStatus(taskId: string, status: 'completed' | 'failed'): Promise<void> {
  let attempts = 0;
  while (!acquireLock() && attempts < 10) {
    attempts++;
    await sleep(500);
  }

  if (attempts >= 10) {
    console.log(`[${AGENT_ID}] Warning: Could not acquire lock to update task status`);
    return;
  }

  try {
    const tasks = readTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
      task.status = status;
      if (status === 'completed') {
        (task as any).completedAt = new Date().toISOString();
      } else if (status === 'failed') {
        task.retryCount = (task.retryCount || 0) + 1;
        // Reset to ready if under max retries
        if (task.retryCount < (task.maxRetries || 2)) {
          task.status = 'ready';
          task.assignedAgent = undefined;
        }
      }
      writeTasks(tasks);
    }

    releaseLock();
  } catch (e) {
    releaseLock();
    throw e;
  }
}

async function runCodexOnTask(task: Task): Promise<boolean> {
  const prompt = `You are working on a mortgage loan origination system (LOS) codebase.

TASK: ${task.title}
ID: ${task.id}
PRIORITY: ${task.priority}

DESCRIPTION:
${task.description}

${task.files && task.files.length > 0 ? `FILES TO CREATE/MODIFY:\n${task.files.join('\n')}` : ''}

WORKING DIRECTORY: ${WORK_DIR}

INSTRUCTIONS:
1. Read existing code to understand patterns and conventions
2. Implement the task according to the description
3. Follow TypeScript best practices
4. Use existing patterns from the codebase
5. Do NOT commit changes - just write the code

When done, summarize what you implemented.`;

  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${AGENT_ID}] Starting task: ${task.id} - ${task.title}`);
    console.log(`${'='.repeat(60)}\n`);

    const startTime = Date.now();

    const proc = spawn('codex', ['exec', '--full-auto', prompt], {
      stdio: 'inherit',
      cwd: WORK_DIR,
      env: { ...process.env }
    });

    proc.on('close', (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n[${AGENT_ID}] Task ${task.id} ${code === 0 ? 'completed' : 'failed'} in ${duration}s`);
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      console.error(`[${AGENT_ID}] Error running Codex:`, err.message);
      resolve(false);
    });
  });
}

function getStats(): { completed: number; inProgress: number; ready: number; failed: number } {
  const tasks = readTasks();
  return {
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    ready: tasks.filter(t => t.status === 'ready').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  };
}

function checkCodexInstalled(): boolean {
  try {
    const proc = spawn('which', ['codex'], { stdio: 'pipe' });
    return new Promise((resolve) => {
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}

async function main() {
  console.log(`
${'='.repeat(60)}
  CODEX WORKER FOR JETPACK
${'='.repeat(60)}
  Agent ID: ${AGENT_ID}
  Working Directory: ${WORK_DIR}
  Tasks File: ${TASKS_FILE}
${'='.repeat(60)}
`);

  // Check codex is available
  const hasCodex = await checkCodexInstalled();
  if (!hasCodex) {
    console.error('ERROR: codex CLI not found in PATH');
    console.error('Install with: npm install -g @openai/codex');
    process.exit(1);
  }

  let consecutiveEmpty = 0;

  while (true) {
    try {
      const stats = getStats();
      console.log(`\n[${AGENT_ID}] Queue: ${stats.completed} done, ${stats.inProgress} active, ${stats.ready} ready, ${stats.failed} failed`);

      const task = await claimTask();

      if (!task) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) {
          console.log(`[${AGENT_ID}] No tasks available. Waiting ${POLL_INTERVAL/1000}s...`);
        }
        await sleep(POLL_INTERVAL);
        continue;
      }

      consecutiveEmpty = 0;

      const success = await runCodexOnTask(task);
      await updateTaskStatus(task.id, success ? 'completed' : 'failed');

      // Brief pause between tasks
      await sleep(2000);

    } catch (error) {
      console.error(`[${AGENT_ID}] Error:`, error);
      await sleep(POLL_INTERVAL);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[${AGENT_ID}] Shutting down...`);
  releaseLock();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[${AGENT_ID}] Shutting down...`);
  releaseLock();
  process.exit(0);
});

main().catch(console.error);
