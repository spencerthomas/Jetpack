#!/usr/bin/env npx tsx
/**
 * Jetpack Session Launcher for JaroLoan LOS
 *
 * This script initializes and starts the Jetpack multi-agent session
 * to build the complete mortgage LOS backend infrastructure.
 *
 * Usage: npx tsx scripts/start-jetpack.ts
 */

import { JetpackOrchestrator, JetpackConfig } from 'jetpack-agent';
import path from 'path';
import fs from 'fs';

const WORK_DIR = process.cwd();

// Agent configuration
const config: JetpackConfig = {
  workDir: WORK_DIR,
  numAgents: 4, // 4 agents to avoid OOM
  autoStart: true,
  enableTuiMode: true,

  supervisor: {
    enabled: true,
    taskRefillThreshold: 3,      // Refill queue when fewer than 3 tasks pending
    monitorInterval: 30000,      // Check every 30 seconds
    enableAgentMail: true,       // Allow agents to communicate
  },

  fileLocking: {
    enabled: true,
    lockTimeout: 300000,         // 5 minute lock timeout
    retryAttempts: 3,            // Retry 3 times before failing
    retryDelay: 5000,            // 5 second delay between retries
  },

  runtimeLimits: {
    maxTotalMinutes: 480,  // 8 hours max
    maxTaskMinutes: 60,    // 1 hour per task
    maxConsecutiveFailures: 3,
  },

  qualitySettings: {
    enabled: true,
    checkBuild: true,
    checkTests: true,
    checkLint: true,
    detectRegressions: true,
  },

  onEndState: async (endState, stats) => {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    JETPACK SESSION COMPLETE                     ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`End State: ${endState.reason}`);
    console.log(`Tasks Completed: ${stats.tasksCompleted}`);
    console.log(`Tasks Failed: ${stats.tasksFailed}`);
    console.log(`Total Runtime: ${Math.round(stats.totalRuntimeMinutes)} minutes`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Write session summary
    const summary = {
      endState: endState.reason,
      completedAt: new Date().toISOString(),
      stats: {
        tasksCompleted: stats.tasksCompleted,
        tasksFailed: stats.tasksFailed,
        totalRuntimeMinutes: stats.totalRuntimeMinutes,
      },
    };

    fs.writeFileSync(
      path.join(WORK_DIR, '.jetpack', 'session-summary.json'),
      JSON.stringify(summary, null, 2)
    );
  },

  onRuntimeEvent: (event) => {
    const timestamp = new Date().toISOString().slice(11, 19);

    switch (event.type) {
      case 'task_completed':
        console.log(`[${timestamp}] ✓ Task completed: ${event.taskId}`);
        break;
      case 'task_failed':
        console.log(`[${timestamp}] ✗ Task failed: ${event.taskId}`);
        if (event.error) console.log(`  Error: ${event.error}`);
        break;
      case 'agent_started':
        console.log(`[${timestamp}] 🤖 Agent started: ${event.agentId}`);
        break;
      case 'agent_stopped':
        console.log(`[${timestamp}] 🔴 Agent stopped: ${event.agentId}`);
        break;
    }
  },

  onQualityRegression: (summary) => {
    console.log('\n⚠️  Quality Regression Detected!');
    console.log(`Total Regressions: ${summary.totalRegressions}`);
    summary.regressions.forEach(r => {
      console.log(`  - ${r.metric}: ${r.previousValue} → ${r.currentValue}`);
    });
  },

  onAgentOutput: (event) => {
    // Agent output is handled by TUI mode
  },
};

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    JAROLOAN LOS - JETPACK SESSION              ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Building complete mortgage loan origination system with 8 agents:');
  console.log('');
  console.log('  1. Database & API Layer     - Prisma schema, API routes');
  console.log('  2. Authentication & RBAC    - NextAuth, permissions');
  console.log('  3. Workflow Engine          - Task orchestration, SLAs');
  console.log('  4. Document Management      - File storage, classification');
  console.log('  5. Disclosures & Compliance - TRID, proof-of-delivery');
  console.log('  6. Integration Hub          - Third-party services');
  console.log('  7. Real-time & Notifications - WebSockets, email/SMS');
  console.log('  8. Reporting & Analytics    - Dashboards, HMDA');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Ensure .jetpack directory exists
  const jetpackDir = path.join(WORK_DIR, '.jetpack');
  if (!fs.existsSync(jetpackDir)) {
    fs.mkdirSync(jetpackDir, { recursive: true });
  }

  // Initialize orchestrator
  console.log('Initializing Jetpack Orchestrator...');
  const orchestrator = new JetpackOrchestrator(config);

  try {
    await orchestrator.initialize();
    console.log('Orchestrator initialized successfully.');

    // Start watching for task files
    console.log('Starting task file watcher...');
    await orchestrator.startTaskFileWatcher();

    // Start agents
    console.log(`Starting ${config.numAgents} agents...`);
    await orchestrator.startAgents(config.numAgents);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('          SESSION RUNNING - AGENTS ARE WORKING                  ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Press Ctrl+C to gracefully stop the session.');
    console.log('');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT. Shutting down gracefully...');
      await orchestrator.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM. Shutting down gracefully...');
      await orchestrator.shutdown();
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {});

  } catch (error) {
    console.error('Error starting Jetpack session:', error);
    await orchestrator.shutdown();
    process.exit(1);
  }
}

main().catch(console.error);
