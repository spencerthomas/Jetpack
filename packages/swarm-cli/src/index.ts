#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { SQLiteDataLayer, createLocalDataLayer } from '@jetpack-agent/data';
import { createMockAdapter, createAdapter } from '@jetpack-agent/agent-harness';
import { SwarmCoordinator, type CoordinatorEvent } from '@jetpack-agent/coordinator';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

/**
 * Get the database path for a work directory
 */
function getDbPath(workDir: string): string {
  const jetpackDir = path.join(workDir, '.jetpack');
  if (!fs.existsSync(jetpackDir)) {
    fs.mkdirSync(jetpackDir, { recursive: true });
  }
  return path.join(jetpackDir, 'swarm.db');
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}

program
  .name('jetpack')
  .description(`
  Jetpack - AI Agent Swarm for Software Development

  Quick Start:
    jetpack start           Start everything (web UI + agents)
    jetpack start --mock    Start with mock agents (no API key needed)

  Commands:
    start                 Start web UI + coordinator + agents (all-in-one)
    task                  Create a new task
    tasks                 List tasks
    status                Show swarm status
    agents                List registered agents
    init [path]           Initialize database only (optional, start auto-inits)
    web                   Start web UI only (without agents)

  The dashboard opens at http://localhost:3000 by default.
  `)
  .version('0.1.0');

// ============================================================================
// INIT COMMAND
// ============================================================================

program
  .command('init')
  .description('Initialize swarm database in a directory')
  .argument('[path]', 'Directory to initialize', '.')
  .action(async (targetPath: string) => {
    const workDir = path.resolve(targetPath);
    const spinner = ora('Initializing swarm database...').start();

    try {
      const dbPath = getDbPath(workDir);
      const dataLayer = new SQLiteDataLayer({ dbPath });
      await dataLayer.initialize();

      spinner.succeed(chalk.green('Swarm database initialized'));
      console.log(chalk.gray(`  Database: ${dbPath}`));

      // Check health
      const healthy = await dataLayer.isHealthy();
      if (healthy) {
        console.log(chalk.green('  ✓ Database healthy'));
      }

      await dataLayer.close();
      console.log(chalk.cyan('\nRun `swarm start` to begin orchestration.'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to initialize'));
      console.error(error);
      process.exit(1);
    }
  });

// ============================================================================
// START COMMAND - The main entry point that does everything
// ============================================================================

/**
 * Open a URL in the default browser using spawn (safe, no shell injection)
 */
async function openBrowserSafe(url: string): Promise<void> {
  const { spawn } = await import('child_process');
  const openCmd = process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(openCmd, args, { detached: true, stdio: 'ignore' }).unref();
}

program
  .command('start')
  .description('Start Jetpack: web UI + coordinator + agents (all-in-one)')
  .option('-a, --agents <number>', 'Number of agents to spawn', '3')
  .option('-d, --dir <path>', 'Working directory', process.env.JETPACK_WORK_DIR || process.cwd())
  .option('-p, --port <port>', 'Web UI port', '3000')
  .option('--no-web', 'Skip starting the web UI')
  .option('--no-browser', 'Don\'t auto-open browser')
  .option('--mock', 'Force mock adapters (no Claude API needed)')
  .option('--agent-type <type>', 'Agent type (claude-code, codex, gemini)', 'claude-code')
  .option('--model <model>', 'Model to use (provider-specific)')
  .option('--provider-url <url>', 'Alternative provider base URL')
  .option('--verbose', 'Enable verbose output')
  .option('--strategy <strategy>', 'Claim strategy (first-fit, best-fit, round-robin, load-balanced)', 'best-fit')
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🚀 Jetpack\n'));

    const workDir = path.resolve(options.dir);
    const numAgents = parseInt(options.agents);
    const port = options.port;
    const startWeb = options.web !== false;
    const shouldOpenBrowser = options.browser !== false;

    // Auto-detect: check for relevant API keys based on agent type
    let hasApiKey = false;
    let missingKeyMsg = '';

    switch (options.agentType) {
      case 'codex':
        hasApiKey = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL);
        missingKeyMsg = 'set OPENAI_API_KEY';
        break;
      case 'gemini':
        hasApiKey = !!process.env.GOOGLE_API_KEY;
        missingKeyMsg = 'set GOOGLE_API_KEY';
        break;
      case 'claude-code':
      default:
        hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
        missingKeyMsg = 'set ANTHROPIC_API_KEY';
        break;
    }

    const useMock = options.mock || !hasApiKey;

    // Show configuration
    console.log(chalk.gray(`  Working directory: ${workDir}`));
    console.log(chalk.gray(`  Agents: ${numAgents}`));
    if (startWeb) {
      console.log(chalk.gray(`  Web UI: http://localhost:${port}`));
    }

    if (useMock && !options.mock) {
      console.log(chalk.yellow(`  Mode: mock (${missingKeyMsg} to use ${options.agentType})
  
  To use real agents, set one of:
    export ANTHROPIC_API_KEY=...  (for claude-code)
    export OPENAI_API_KEY=...     (for codex)
    export GOOGLE_API_KEY=...     (for gemini)
      `));
    } else if (useMock) {
      console.log(chalk.gray(`  Mode: mock (forced)`));
    } else {
      console.log(chalk.green(`  Mode: ${options.agentType}`));
      if (options.model) console.log(chalk.gray(`  Model: ${options.model}`));
      if (options.providerUrl) console.log(chalk.gray(`  Provider: ${options.providerUrl}`));
    }
    console.log('');

    const spinner = ora('Initializing...').start();

    try {
      // Auto-initialize database if needed
      const jetpackDir = path.join(workDir, '.jetpack');
      const isNewProject = !fs.existsSync(jetpackDir);
      if (isNewProject) {
        fs.mkdirSync(jetpackDir, { recursive: true });
        spinner.text = 'Creating .jetpack directory...';
      }

      // Initialize data layer
      const dbPath = getDbPath(workDir);
      const dataLayer = await createLocalDataLayer(dbPath);
      spinner.succeed(isNewProject ? 'Initialized new project' : 'Data layer ready');

      // Start web UI if enabled
      let webProcess: ReturnType<typeof import('child_process').spawn> | null = null;
      if (startWeb) {
        spinner.start('Starting web UI...');

        const webAppPath = path.resolve(__dirname, '../../..', 'apps/web');
        if (fs.existsSync(webAppPath)) {
          const { spawn } = await import('child_process');

          webProcess = spawn('pnpm', ['dev'], {
            cwd: webAppPath,
            env: {
              ...process.env,
              JETPACK_WORK_DIR: workDir,
              PORT: port,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            detached: false,
          });

          // Wait for web server to be ready
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 3000); // Max 3s wait
            webProcess!.stdout?.on('data', (data: Buffer) => {
              if (data.toString().includes('Ready') || data.toString().includes('started')) {
                clearTimeout(timeout);
                resolve();
              }
            });
          });

          spinner.succeed(`Web UI ready at http://localhost:${port}`);

          // Auto-open browser safely
          if (shouldOpenBrowser) {
            await openBrowserSafe(`http://localhost:${port}`);
          }
        } else {
          spinner.warn('Web UI not found (run pnpm build first)');
        }
      }

      // Create coordinator
      spinner.start('Starting coordinator...');
      const coordinator = new SwarmCoordinator(dataLayer, {
        workDir,
        maxAgents: numAgents + 5,
        claimStrategy: options.strategy as any,
        onEvent: (event: CoordinatorEvent) => {
          handleCoordinatorEvent(event);
        },
      });

      await coordinator.start();
      spinner.succeed('Coordinator started');

      // Spawn agents
      spinner.start(`Spawning ${numAgents} agents...`);

      const skills = [
        ['typescript', 'react', 'frontend'],
        ['typescript', 'backend', 'nodejs'],
        ['python', 'backend'],
        ['testing', 'quality'],
        ['documentation', 'markdown'],
      ];

      for (let i = 0; i < numAgents; i++) {
        const agentSkills = skills[i % skills.length];
        let adapter;

        if (useMock) {
          adapter = createMockAdapter({ executionDelayMs: 1000 + Math.random() * 2000 });
        } else {
          const models = options.model ? options.model.split(',') : [undefined];

          const providerConfig: any = {};
          if (options.providerUrl) {
            providerConfig.baseUrl = options.providerUrl;
          } else if (process.env.ANTHROPIC_BASE_URL) {
            providerConfig.baseUrl = process.env.ANTHROPIC_BASE_URL;
          }

          if (process.env.ANTHROPIC_AUTH_TOKEN) {
            providerConfig.authToken = process.env.ANTHROPIC_AUTH_TOKEN;
          }
          if (process.env.ANTHROPIC_API_KEY &&
            process.env.ANTHROPIC_API_KEY !== '""' &&
            process.env.ANTHROPIC_API_KEY !== "''") {
            providerConfig.apiKey = process.env.ANTHROPIC_API_KEY;
          }


          const modelForAgent = models[i % models.length];
          // Trim whitespace from model name if present
          const cleanModel = modelForAgent ? modelForAgent.trim() : undefined;

          adapter = createAdapter(options.agentType, {
            model: cleanModel,
            verbose: options.verbose,
            providerConfig: Object.keys(providerConfig).length > 0 ? providerConfig : undefined
          });
        }

        await coordinator.spawnAgent({
          name: `Agent-${i + 1}`,
          type: useMock ? 'custom' : (options.agentType as any),
          adapter,
          skills: agentSkills,
          workDir,
        });
      }

      spinner.succeed(`${numAgents} agents ready`);

      // Display status
      console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      console.log(chalk.bold.green('  ✓ Jetpack is running!\n'));

      if (startWeb) {
        console.log(chalk.bold(`  🌐 Dashboard: ${chalk.cyan(`http://localhost:${port}`)}`));
        console.log(chalk.gray('     Create tasks, monitor agents, configure settings\n'));
      }

      console.log(chalk.bold('  📝 Quick Commands:'));
      console.log(chalk.gray(`     jetpack task -t "Build a login page"`));
      console.log(chalk.gray(`     jetpack status`));
      console.log(chalk.gray(`     jetpack tasks\n`));

      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      console.log(chalk.gray('Press Ctrl+C to stop.\n'));

      // Status updates (less verbose)
      const statusInterval = setInterval(async () => {
        const stats = await coordinator.getStats();
        if (stats.inProgressTasks > 0) {
          console.log(
            chalk.blue(
              `[${new Date().toLocaleTimeString()}] ` +
              `${stats.busyAgents}/${stats.totalAgents} agents busy | ` +
              `${stats.inProgressTasks} tasks running | ` +
              `${stats.completedTasks} completed`
            )
          );
        }
      }, 15000);

      // Graceful shutdown
      const shutdown = async () => {
        clearInterval(statusInterval);
        console.log(chalk.yellow('\n\nShutting down...'));

        if (webProcess) {
          webProcess.kill('SIGTERM');
        }

        await coordinator.stop();
        await dataLayer.close();
        console.log(chalk.green('✓ Jetpack stopped'));
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Keep alive
      await new Promise(() => { });
    } catch (error) {
      spinner.fail(chalk.red('Failed to start'));
      console.error(error);
      process.exit(1);
    }
  });

// ============================================================================
// TASK COMMAND
// ============================================================================

program
  .command('task')
  .description('Create a new task')
  .requiredOption('-t, --title <title>', 'Task title')
  .option('--desc <description>', 'Task description')
  .option('-p, --priority <priority>', 'Priority (low, medium, high, critical)', 'medium')
  .option('-s, --skills <skills>', 'Required skills (comma-separated)')
  .option('--dir <path>', 'Working directory', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const spinner = ora('Creating task...').start();

    try {
      const dbPath = getDbPath(options.dir);
      const dataLayer = await createLocalDataLayer(dbPath);

      const skills = options.skills
        ? options.skills.split(',').map((s: string) => s.trim())
        : [];

      const task = await dataLayer.tasks.create({
        title: options.title,
        description: options.desc,
        priority: options.priority as any,
        requiredSkills: skills,
      });

      spinner.succeed(chalk.green('Task created'));

      console.log('');
      console.log(chalk.bold(`Task ID: ${chalk.cyan(task.id)}`));
      console.log(`Title: ${task.title}`);
      console.log(`Priority: ${task.priority}`);
      console.log(`Status: ${task.status}`);
      if (skills.length > 0) {
        console.log(`Required Skills: ${skills.join(', ')}`);
      }

      await dataLayer.close();
    } catch (error) {
      spinner.fail(chalk.red('Failed to create task'));
      console.error(error);
      process.exit(1);
    }
  });

// ============================================================================
// STATUS COMMAND
// ============================================================================

program
  .command('status')
  .description('Show swarm status')
  .option('--dir <path>', 'Working directory', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const spinner = ora('Loading status...').start();

    try {
      const dbPath = getDbPath(options.dir);
      const dataLayer = await createLocalDataLayer(dbPath);

      const swarmStatus = await dataLayer.getSwarmStatus();
      spinner.stop();

      console.log(chalk.bold('\n=== Swarm Status ===\n'));

      console.log(chalk.bold('Tasks:'));
      console.log(`  Total: ${swarmStatus.tasks.total}`);
      console.log(`  Pending: ${chalk.yellow(swarmStatus.tasks.pending.toString())}`);
      console.log(`  Ready: ${chalk.blue(swarmStatus.tasks.ready.toString())}`);
      console.log(`  In Progress: ${chalk.cyan(swarmStatus.tasks.inProgress.toString())}`);
      console.log(`  Completed: ${chalk.green(swarmStatus.tasks.completed.toString())}`);
      console.log(`  Failed: ${chalk.red(swarmStatus.tasks.failed.toString())}`);

      console.log(chalk.bold('\nAgents:'));
      console.log(`  Total: ${swarmStatus.agents.total}`);
      console.log(`  Idle: ${chalk.green(swarmStatus.agents.idle.toString())}`);
      console.log(`  Busy: ${chalk.yellow(swarmStatus.agents.busy.toString())}`);
      console.log(`  Offline: ${chalk.red(swarmStatus.agents.offline.toString())}`);

      console.log(chalk.bold('\nSystem:'));
      console.log(`  Status: ${swarmStatus.swarm.status}`);
      console.log(`  Data Layer: ${swarmStatus.swarm.dataLayerType}`);
      console.log(`  Uptime: ${formatDuration(swarmStatus.swarm.uptime)}`);

      await dataLayer.close();
    } catch (error) {
      spinner.fail(chalk.red('Failed to get status'));
      console.error(error);
      process.exit(1);
    }
  });

// ============================================================================
// AGENTS COMMAND
// ============================================================================

program
  .command('agents')
  .description('List registered agents')
  .option('--dir <path>', 'Working directory', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const spinner = ora('Loading agents...').start();

    try {
      const dbPath = getDbPath(options.dir);
      const dataLayer = await createLocalDataLayer(dbPath);

      const agents = await dataLayer.agents.list();
      spinner.stop();

      console.log(chalk.bold('\n=== Registered Agents ===\n'));

      if (agents.length === 0) {
        console.log(chalk.gray('No agents registered'));
      } else {
        agents.forEach((agent) => {
          const statusColor =
            agent.status === 'busy'
              ? chalk.yellow
              : agent.status === 'idle'
                ? chalk.green
                : chalk.red;

          console.log(`${chalk.bold(agent.name)} (${agent.id})`);
          console.log(`  Status: ${statusColor(agent.status)}`);
          console.log(`  Type: ${agent.type}`);
          console.log(`  Skills: ${agent.skills.join(', ') || 'none'}`);
          console.log(`  Completed: ${agent.tasksCompleted} | Failed: ${agent.tasksFailed}`);
          if (agent.currentTaskId) {
            console.log(`  Current Task: ${agent.currentTaskId}`);
          }
          console.log('');
        });
      }

      await dataLayer.close();
    } catch (error) {
      spinner.fail(chalk.red('Failed to list agents'));
      console.error(error);
      process.exit(1);
    }
  });

// ============================================================================
// TASKS LIST COMMAND
// ============================================================================

program
  .command('tasks')
  .description('List tasks')
  .option('--status <status>', 'Filter by status')
  .option('--limit <number>', 'Max tasks to show', '20')
  .option('--dir <path>', 'Working directory', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const spinner = ora('Loading tasks...').start();

    try {
      const dbPath = getDbPath(options.dir);
      const dataLayer = await createLocalDataLayer(dbPath);

      const filter: any = {
        limit: parseInt(options.limit),
      };
      if (options.status) {
        filter.status = options.status;
      }

      const tasks = await dataLayer.tasks.list(filter);
      spinner.stop();

      console.log(chalk.bold('\n=== Tasks ===\n'));

      if (tasks.length === 0) {
        console.log(chalk.gray('No tasks found'));
      } else {
        tasks.forEach((task) => {
          const statusColor =
            task.status === 'completed'
              ? chalk.green
              : task.status === 'failed'
                ? chalk.red
                : task.status === 'in_progress'
                  ? chalk.yellow
                  : chalk.gray;

          const priorityColor =
            task.priority === 'critical'
              ? chalk.red
              : task.priority === 'high'
                ? chalk.yellow
                : chalk.gray;

          console.log(
            `${chalk.cyan(task.id)} ${priorityColor(`[${task.priority}]`)} ${statusColor(task.status)}`
          );
          console.log(`  ${task.title}`);
          if (task.assignedAgent) {
            console.log(chalk.gray(`  Assigned: ${task.assignedAgent}`));
          }
          console.log('');
        });
      }

      await dataLayer.close();
    } catch (error) {
      spinner.fail(chalk.red('Failed to list tasks'));
      console.error(error);
      process.exit(1);
    }
  });

// ============================================================================
// WEB COMMAND
// ============================================================================

program
  .command('web')
  .description('Start the web UI dashboard')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .option('--dir <path>', 'Working directory (project with .jetpack/)', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const workDir = path.resolve(options.dir);
    const port = options.port;

    console.log(chalk.bold.cyan('\n🌐 Jetpack Web UI\n'));
    console.log(chalk.gray(`Working directory: ${workDir}`));
    console.log(chalk.gray(`Port: ${port}\n`));

    // Check if .jetpack directory exists
    const jetpackDir = path.join(workDir, '.jetpack');
    if (!fs.existsSync(jetpackDir)) {
      console.log(chalk.yellow('Note: .jetpack directory not found. Run `swarm init` first or create tasks.'));
      console.log('');
    }

    // Find the web app location (relative to CLI)
    const webAppPath = path.resolve(__dirname, '../../..', 'apps/web');

    if (!fs.existsSync(webAppPath)) {
      console.error(chalk.red('Web app not found. Please build the project first: pnpm build'));
      process.exit(1);
    }

    console.log(chalk.cyan(`Starting web UI at http://localhost:${port}\n`));
    console.log(chalk.gray('Press Ctrl+C to stop.\n'));

    // Use spawn to start Next.js
    const { spawn } = await import('child_process');

    const env = {
      ...process.env,
      JETPACK_WORK_DIR: workDir,
      PORT: port,
    };

    const child = spawn('pnpm', ['dev'], {
      cwd: webAppPath,
      env,
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (err) => {
      console.error(chalk.red('Failed to start web UI:'), err);
      process.exit(1);
    });

    const shutdown = () => {
      console.log(chalk.yellow('\nShutting down web UI...'));
      child.kill('SIGTERM');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

// ============================================================================
// EVENT HANDLER
// ============================================================================

function handleCoordinatorEvent(event: CoordinatorEvent) {
  const timestamp = new Date().toLocaleTimeString();

  switch (event.type) {
    case 'agent_spawned':
      console.log(chalk.green(`[${timestamp}] Agent spawned: ${event.name} (${event.agentId})`));
      break;

    case 'agent_stopped':
      console.log(chalk.yellow(`[${timestamp}] Agent stopped: ${event.agentId} - ${event.reason}`));
      break;

    case 'agent_crashed':
      console.log(chalk.red(`[${timestamp}] Agent crashed: ${event.agentId} - ${event.error}`));
      break;

    case 'task_distributed':
      console.log(
        chalk.blue(`[${timestamp}] Task distributed: ${event.taskId} → ${event.agentId}`)
      );
      break;

    case 'task_claimed':
      console.log(
        chalk.cyan(`[${timestamp}] Task claimed: ${event.taskId} by ${event.agentId}`)
      );
      break;

    case 'task_completed':
      console.log(
        chalk.green(`[${timestamp}] Task completed: ${event.taskId} by ${event.agentId}`)
      );
      break;

    case 'task_failed':
      console.log(
        chalk.red(`[${timestamp}] Task failed: ${event.taskId} by ${event.agentId}${event.error ? ` - ${event.error}` : ''}`)
      );
      break;

    case 'task_orphaned':
      console.log(
        chalk.yellow(
          `[${timestamp}] Task orphaned: ${event.taskId} (was: ${event.previousAgent})`
        )
      );
      break;

    case 'coordinator_started':
      console.log(chalk.green(`[${timestamp}] Coordinator started`));
      break;

    case 'coordinator_stopped':
      console.log(chalk.yellow(`[${timestamp}] Coordinator stopped: ${event.reason}`));
      break;
  }
}

program.parse();
