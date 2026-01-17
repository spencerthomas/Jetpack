#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import { SupervisorAgent } from '@jetpack/supervisor';
import { AgentSkill, TaskPriority, parseDurationMs, formatDuration, RuntimeLimits } from '@jetpack/shared';

// Default config for new projects
const DEFAULT_CONFIG = {
  version: '0.1.0',
  agents: 3,
  port: 3002,
};

// CLAUDE.md section to add
const CLAUDE_MD_SECTION = `
## Jetpack Multi-Agent System

This project uses Jetpack for multi-agent task orchestration.

### Creating Tasks

To create a task for the agent swarm, you have two options:

**Option 1: CLI**
\`\`\`bash
jetpack task -t "Task title" -d "Description" -p medium -s typescript,backend
\`\`\`

**Option 2: Drop a .md file in .beads/tasks/**
\`\`\`markdown
---
title: Your task title
priority: high
skills: [typescript, backend]
estimate: 30
---

Description of what needs to be done.
\`\`\`

### Checking Status
- Web UI: http://localhost:3002 (when running)
- CLI: \`jetpack status\`

### Starting the System
\`\`\`bash
jetpack start          # Start orchestrator, agents, and web UI
jetpack start -a 5     # Start with 5 agents
\`\`\`
`;

// Check if a command exists
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Load config from .jetpack/config.json if it exists
interface JetpackConfig {
  version?: string;
  agents?: number;
  port?: number;
}

function loadConfig(workDir: string): JetpackConfig {
  const configPath = path.join(workDir, '.jetpack', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors, use defaults
  }
  return {};
}

const program = new Command();

// Web server process reference
let webServerProcess: ChildProcess | null = null;

// Function to start the web UI
async function startWebUI(port: number = 3002, workDir?: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Find the web app directory
    const webAppDir = path.resolve(__dirname, '../../web');

    console.log(chalk.gray(`  Starting web UI from ${webAppDir}...`));

    webServerProcess = spawn('pnpm', ['dev', '-p', port.toString()], {
      cwd: webAppDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: true,
      env: {
        ...process.env,
        JETPACK_WORK_DIR: workDir || process.cwd(),
      },
    });

    let started = false;

    webServerProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Ready') || output.includes('started server') || output.includes('localhost')) {
        if (!started) {
          started = true;
          resolve(true);
        }
      }
    });

    webServerProcess.stderr?.on('data', (data: Buffer) => {
      // Next.js outputs some info to stderr, check for ready state there too
      const output = data.toString();
      if (output.includes('Ready') || output.includes('localhost')) {
        if (!started) {
          started = true;
          resolve(true);
        }
      }
    });

    webServerProcess.on('error', (err) => {
      console.error(chalk.red(`Failed to start web UI: ${err.message}`));
      resolve(false);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!started) {
        started = true;
        // Assume it started even if we didn't see the ready message
        resolve(true);
      }
    }, 30000);
  });
}

// Function to open browser
function openBrowser(url: string) {
  const command = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
}

program
  .name('jetpack')
  .description(`
  Jetpack - Multi-Agent Development Stack

  Commands:
    init [path]                Initialize Jetpack in a directory
    start                      Start orchestrator, agents, supervisor, and web UI
    task                       Create a new task for agents
    status                     Show current system status
    demo                       Run demo with sample tasks
    supervise <request>        LLM-powered task orchestration

  Examples:
    jetpack init .             Initialize in current directory
    jetpack start              Start everything with auto-supervisor
    jetpack start -a 5         Start with 5 agents
    jetpack start --no-supervisor  Disable background supervisor
    jetpack start --supervisor-interval 60000  Monitor every 60s
    jetpack start --no-ui      CLI only, no web UI
    jetpack task -t "Title"    Create a task
    jetpack status             Check system status
    jetpack demo               Run demo workflow
    jetpack supervise "Build auth" --llm claude

  Create tasks via:
    • Web UI at http://localhost:3002
    • CLI: jetpack task -t "Your task" -p high -s typescript
    • Drop .md files in .beads/tasks/
  `.trim())
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Jetpack in a directory')
  .argument('[path]', 'Directory to initialize', '.')
  .option('--no-gitignore', 'Skip .gitignore updates')
  .option('--no-claude-md', 'Skip CLAUDE.md updates')
  .option('-a, --agents <number>', 'Default number of agents', '3')
  .option('-p, --port <number>', 'Default web UI port', '3002')
  .action(async (targetPath: string, options) => {
    const workDir = path.resolve(targetPath);

    console.log(chalk.bold.cyan('\n🚀 Initializing Jetpack\n'));
    console.log(chalk.gray(`Directory: ${workDir}\n`));

    const spinner = ora('Creating directories...').start();

    try {
      // 1. Create directories
      const dirs = [
        path.join(workDir, '.beads'),
        path.join(workDir, '.beads', 'tasks'),
        path.join(workDir, '.beads', 'processed'),
        path.join(workDir, '.cass'),
        path.join(workDir, '.jetpack'),
        path.join(workDir, '.jetpack', 'mail'),
      ];

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      spinner.succeed(chalk.green('Directories created'));

      // 2. Create config file
      spinner.start('Creating config...');
      const configPath = path.join(workDir, '.jetpack', 'config.json');
      const config = {
        ...DEFAULT_CONFIG,
        agents: parseInt(options.agents),
        port: parseInt(options.port),
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      spinner.succeed(chalk.green('Config created'));

      // 3. Update .gitignore (optional)
      if (options.gitignore !== false) {
        spinner.start('Updating .gitignore...');
        const gitignorePath = path.join(workDir, '.gitignore');
        const gitignoreEntries = [
          '',
          '# Jetpack',
          '.cass/',
          '.jetpack/mail/',
        ];

        let gitignoreContent = '';
        if (fs.existsSync(gitignorePath)) {
          gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        }

        // Only add if not already present
        if (!gitignoreContent.includes('# Jetpack')) {
          fs.appendFileSync(gitignorePath, gitignoreEntries.join('\n') + '\n');
          spinner.succeed(chalk.green('.gitignore updated'));
        } else {
          spinner.succeed(chalk.gray('.gitignore already configured'));
        }
      }

      // 4. Update CLAUDE.md (optional)
      if (options.claudeMd !== false) {
        spinner.start('Updating CLAUDE.md...');
        const claudeMdPath = path.join(workDir, 'CLAUDE.md');

        let claudeMdContent = '';
        if (fs.existsSync(claudeMdPath)) {
          claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
        }

        // Only add if not already present
        if (!claudeMdContent.includes('## Jetpack Multi-Agent System')) {
          fs.appendFileSync(claudeMdPath, CLAUDE_MD_SECTION);
          spinner.succeed(chalk.green('CLAUDE.md updated'));
        } else {
          spinner.succeed(chalk.gray('CLAUDE.md already configured'));
        }
      }

      // 5. Validate environment
      console.log(chalk.bold('\n📋 Environment Check\n'));

      // Check for Claude CLI
      const hasClaude = commandExists('claude');
      if (hasClaude) {
        console.log(chalk.green('  ✓ Claude CLI found'));
      } else {
        console.log(chalk.yellow('  ⚠ Claude CLI not found'));
        console.log(chalk.gray('    Install: npm install -g @anthropic-ai/claude-code'));
      }

      // Check for API key
      const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
      if (hasApiKey) {
        console.log(chalk.green('  ✓ ANTHROPIC_API_KEY set'));
      } else {
        console.log(chalk.yellow('  ⚠ ANTHROPIC_API_KEY not set'));
        console.log(chalk.gray('    Set: export ANTHROPIC_API_KEY=your_key'));
      }

      // 6. Print success and next steps
      console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
      console.log(chalk.green.bold('  ✓ Jetpack initialized successfully!\n'));

      console.log(chalk.bold('  Created:'));
      console.log(chalk.gray('    .beads/          Task storage'));
      console.log(chalk.gray('    .beads/tasks/    Drop .md files here to create tasks'));
      console.log(chalk.gray('    .cass/           Agent memory'));
      console.log(chalk.gray('    .jetpack/        Config and mail'));
      console.log('');

      console.log(chalk.bold('  Next steps:'));
      console.log(chalk.cyan('    jetpack start    ') + chalk.gray('Launch agents and web UI'));
      console.log('');
      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    } catch (error) {
      spinner.fail(chalk.red('Initialization failed'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start Jetpack - launches agents, orchestrator, supervisor, and web UI')
  .option('-a, --agents <number>', 'Number of agents to start')
  .option('-p, --port <number>', 'Web UI port')
  .option('-d, --dir <path>', 'Working directory (or set JETPACK_WORK_DIR)', process.env.JETPACK_WORK_DIR || process.cwd())
  .option('--no-browser', 'Do not open browser automatically')
  .option('--no-ui', 'Run without web UI (CLI only mode)')
  .option('--no-supervisor', 'Disable background supervisor (opt-out)')
  .option('--supervisor-interval <ms>', 'Supervisor monitoring interval in ms', '30000')
  .option('-l, --llm <provider>', 'LLM provider for supervisor (claude, openai)', 'claude')
  .option('-m, --model <model>', 'LLM model for supervisor')
  .option('--max-cycles <number>', 'Stop after N work cycles (0 = unlimited)')
  .option('--max-runtime <duration>', 'Stop after duration (e.g., "8h", "30m", "1d")')
  .option('--idle-timeout <duration>', 'Stop if idle for duration (e.g., "5m")')
  .option('--max-failures <number>', 'Stop after N consecutive failures', '5')
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🚀 Jetpack Multi-Agent Development Stack\n'));

    // Load config from .jetpack/config.json if it exists
    const config = loadConfig(options.dir);

    // Use config values as defaults, CLI flags override
    const numAgents = options.agents ? parseInt(options.agents) : (config.agents || 3);
    const port = options.port ? parseInt(options.port) : (config.port || 3002);
    const url = `http://localhost:${port}`;

    const spinner = ora('Initializing orchestrator...').start();

    try {
      // Build runtime limits from CLI options
      const runtimeLimits: Partial<RuntimeLimits> = {};

      if (options.maxCycles) {
        runtimeLimits.maxCycles = parseInt(options.maxCycles);
      }
      if (options.maxRuntime) {
        try {
          runtimeLimits.maxRuntimeMs = parseDurationMs(options.maxRuntime);
        } catch (err) {
          spinner.fail(chalk.red(`Invalid --max-runtime format: ${options.maxRuntime}`));
          console.log(chalk.gray('Use formats like "30m", "8h", "1d"'));
          process.exit(1);
        }
      }
      if (options.idleTimeout) {
        try {
          runtimeLimits.idleTimeoutMs = parseDurationMs(options.idleTimeout);
        } catch (err) {
          spinner.fail(chalk.red(`Invalid --idle-timeout format: ${options.idleTimeout}`));
          console.log(chalk.gray('Use formats like "5m", "30m", "1h"'));
          process.exit(1);
        }
      }
      if (options.maxFailures) {
        runtimeLimits.maxConsecutiveFailures = parseInt(options.maxFailures);
      }

      const hasRuntimeLimits = Object.keys(runtimeLimits).length > 0;

      // 1. Initialize orchestrator
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: true,
        runtimeLimits: hasRuntimeLimits ? runtimeLimits : undefined,
        onEndState: async (endState, stats) => {
          console.log(chalk.bold.yellow(`\n\n⏹ Jetpack stopped: ${endState}`));
          console.log(chalk.gray(`  Cycles: ${stats.cycleCount}`));
          console.log(chalk.gray(`  Tasks completed: ${stats.tasksCompleted}`));
          console.log(chalk.gray(`  Tasks failed: ${stats.tasksFailed}`));
          console.log(chalk.gray(`  Runtime: ${formatDuration(stats.elapsedMs)}`));

          // Kill web server if running
          if (webServerProcess) {
            webServerProcess.kill('SIGTERM');
          }

          process.exit(0);
        },
      });

      await jetpack.initialize();
      spinner.succeed(chalk.green('Orchestrator initialized'));

      // 2. Start agents
      spinner.start('Starting agents...');
      await jetpack.startAgents(numAgents);
      spinner.succeed(chalk.green(`${numAgents} agents started`));

      // 3. Start supervisor (unless --no-supervisor)
      let supervisor: SupervisorAgent | undefined;
      if (options.supervisor !== false) {
        // Check if API key is available for the selected provider
        const hasApiKey = options.llm === 'claude'
          ? !!process.env.ANTHROPIC_API_KEY
          : options.llm === 'openai'
            ? !!process.env.OPENAI_API_KEY
            : true; // Ollama doesn't need API key

        if (hasApiKey) {
          spinner.start('Starting supervisor...');

          // Default models based on provider
          const defaultModel = options.llm === 'claude'
            ? 'claude-3-5-sonnet-20241022'
            : options.llm === 'openai'
              ? 'gpt-4'
              : 'llama2';

          const intervalMs = parseInt(options.supervisorInterval);

          supervisor = await jetpack.createSupervisor(
            {
              provider: options.llm as 'claude' | 'openai' | 'ollama',
              model: options.model || defaultModel,
            },
            {
              backgroundMonitorIntervalMs: intervalMs,
            }
          );

          // Start background monitoring
          supervisor.startBackgroundMonitoring();

          spinner.succeed(chalk.green(`Supervisor started (monitoring every ${intervalMs / 1000}s)`));
        } else {
          spinner.warn(chalk.yellow(`Supervisor disabled: ${options.llm.toUpperCase()}_API_KEY not set`));
        }
      }

      // 4. Start web UI (unless --no-ui)
      if (options.ui !== false) {
        spinner.start('Starting web UI...');
        const webStarted = await startWebUI(port, options.dir);
        if (webStarted) {
          spinner.succeed(chalk.green('Web UI started'));
        } else {
          spinner.warn(chalk.yellow('Web UI may have started (could not confirm)'));
        }
      }

      // Display connection info
      console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      if (options.ui !== false) {
        console.log(chalk.bold('  📺 Web Interface'));
        console.log(chalk.cyan(`     ${url}`));
        console.log('');
      }

      console.log(chalk.bold('  💻 Working Directory'));
      const workDirSource = process.env.JETPACK_WORK_DIR
        ? '(from JETPACK_WORK_DIR)'
        : options.dir !== process.cwd()
          ? '(from --dir)'
          : '(current directory)';
      console.log(chalk.gray(`     ${options.dir} ${workDirSource}`));
      console.log('');

      console.log(chalk.bold('  🤖 Agents'));
      console.log(chalk.gray(`     ${numAgents} agents watching for tasks`));
      console.log('');

      // Display supervisor status
      if (supervisor) {
        console.log(chalk.bold('  🧠 Supervisor'));
        const llmInfo = supervisor.getLLMInfo();
        console.log(chalk.gray(`     ${llmInfo.name} (${llmInfo.model})`));
        console.log(chalk.gray(`     Monitoring every ${parseInt(options.supervisorInterval) / 1000}s`));
        console.log(chalk.gray('     Auto-reassigns failed tasks, detects stalled agents'));
        console.log('');
      } else if (options.supervisor === false) {
        console.log(chalk.bold('  🧠 Supervisor'));
        console.log(chalk.gray('     Disabled (use --supervisor to enable)'));
        console.log('');
      }

      // Display runtime limits if configured
      if (hasRuntimeLimits) {
        console.log(chalk.bold('  ⏱ Runtime Limits'));
        if (runtimeLimits.maxCycles) {
          console.log(chalk.gray(`     Max cycles: ${runtimeLimits.maxCycles}`));
        }
        if (runtimeLimits.maxRuntimeMs) {
          console.log(chalk.gray(`     Max runtime: ${formatDuration(runtimeLimits.maxRuntimeMs)}`));
        }
        if (runtimeLimits.idleTimeoutMs) {
          console.log(chalk.gray(`     Idle timeout: ${formatDuration(runtimeLimits.idleTimeoutMs)}`));
        }
        if (runtimeLimits.maxConsecutiveFailures) {
          console.log(chalk.gray(`     Max consecutive failures: ${runtimeLimits.maxConsecutiveFailures}`));
        }
        console.log('');
      }

      console.log(chalk.bold('  📝 Create Tasks'));
      console.log(chalk.gray('     Use Claude Code, terminal, or web UI to create tasks:'));
      console.log(chalk.gray('     • Drop .md files in .beads/tasks/'));
      console.log(chalk.gray('     • jetpack task -t "Your task title"'));
      console.log(chalk.gray('     • Use web UI at ') + chalk.cyan(url));
      console.log('');

      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      // 4. Open browser (unless --no-browser)
      if (options.ui !== false && options.browser !== false) {
        console.log(chalk.gray('Opening browser...'));
        openBrowser(url);
      }

      console.log(chalk.cyan('Jetpack is running. Press Ctrl+C to stop.\n'));

      // Keep process alive - minimal status updates
      let lastCompleted = 0;
      const statusInterval = setInterval(async () => {
        try {
          const status = await jetpack.getStatus();

          // Only log when something changes
          if (status.tasks.completed > lastCompleted) {
            const newCompleted = status.tasks.completed - lastCompleted;
            console.log(chalk.green(`✓ ${newCompleted} task(s) completed (total: ${status.tasks.completed})`));
            lastCompleted = status.tasks.completed;
          }

          // Show agent activity
          const busyAgents = status.agents.filter(a => a.status === 'busy');
          if (busyAgents.length > 0) {
            busyAgents.forEach(agent => {
              if (agent.currentTask) {
                console.log(chalk.blue(`  ${agent.name} working on: ${agent.currentTask}`));
              }
            });
          }
        } catch (err) {
          // Ignore status errors silently
        }
      }, 5000); // Check every 5 seconds

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        clearInterval(statusInterval);
        console.log(chalk.yellow('\n\nShutting down Jetpack...'));

        // Stop supervisor monitoring if running
        if (supervisor) {
          console.log(chalk.gray('  Stopping supervisor...'));
          supervisor.stopBackgroundMonitoring();
          const stats = supervisor.getBackgroundStats();
          console.log(chalk.gray(`     Monitoring cycles: ${stats.monitoringCycles}`));
          console.log(chalk.gray(`     Tasks reassigned: ${stats.reassignedTasks}`));
        }

        // Kill web server if running
        if (webServerProcess) {
          console.log(chalk.gray('  Stopping web UI...'));
          webServerProcess.kill('SIGTERM');
        }

        console.log(chalk.gray('  Stopping agents...'));
        await jetpack.shutdown();
        console.log(chalk.green('\n✓ Jetpack shut down successfully'));
        process.exit(0);
      });
    } catch (error) {
      spinner.fail(chalk.red('Failed to start Jetpack'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('task')
  .description('Create a new task for agents to work on')
  .requiredOption('-t, --title <title>', 'Task title')
  .option('-d, --description <description>', 'Task description')
  .option('-p, --priority <priority>', 'Task priority (low, medium, high, critical)', 'medium')
  .option('-s, --skills <skills>', 'Required skills (comma-separated)')
  .option('-e, --estimate <minutes>', 'Estimated time in minutes')
  .option('--dir <path>', 'Working directory (or set JETPACK_WORK_DIR)', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const spinner = ora('Creating task...').start();

    try {
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: false,
      });

      await jetpack.initialize();

      const requiredSkills = options.skills
        ? options.skills.split(',').map((s: string) => s.trim() as AgentSkill)
        : [];

      const task = await jetpack.createTask({
        title: options.title,
        description: options.description,
        priority: options.priority as TaskPriority,
        requiredSkills,
        estimatedMinutes: options.estimate ? parseInt(options.estimate) : undefined,
      });

      spinner.succeed(chalk.green('Task created successfully'));
      console.log(chalk.bold(`\nTask ID: ${chalk.cyan(task.id)}`));
      console.log(`Title: ${task.title}`);
      console.log(`Priority: ${task.priority}`);
      console.log(`Status: ${task.status}`);
      if (requiredSkills.length > 0) {
        console.log(`Required Skills: ${requiredSkills.join(', ')}`);
      }

      await jetpack.shutdown();
    } catch (error) {
      spinner.fail(chalk.red('Failed to create task'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current status of Jetpack system')
  .option('--dir <path>', 'Working directory (or set JETPACK_WORK_DIR)', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    const spinner = ora('Loading status...').start();

    try {
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: false,
      });

      await jetpack.initialize();

      const status = await jetpack.getStatus();
      spinner.stop();

      console.log(chalk.bold('\n=== Jetpack Status ===\n'));

      console.log(chalk.bold('Agents:'));
      if (status.agents.length === 0) {
        console.log(chalk.gray('  No agents running'));
      } else {
        status.agents.forEach(agent => {
          const statusColor = agent.status === 'busy' ? chalk.yellow : chalk.green;
          console.log(`  ${statusColor(agent.name)}: ${agent.status}`);
          if (agent.currentTask) {
            console.log(chalk.gray(`    Working on: ${agent.currentTask}`));
          }
        });
      }

      console.log(chalk.bold('\nTasks:'));
      console.log(`  Total: ${status.tasks.total}`);
      console.log(`  Pending: ${chalk.yellow(status.tasks.pending.toString())}`);
      console.log(`  In Progress: ${chalk.blue(status.tasks.inProgress.toString())}`);
      console.log(`  Completed: ${chalk.green(status.tasks.completed.toString())}`);
      console.log(`  Failed: ${chalk.red(status.tasks.failed.toString())}`);

      console.log(chalk.bold('\nMemory System:'));
      console.log(`  Total Entries: ${status.memory.total}`);
      console.log(`  Avg Importance: ${status.memory.avgImportance.toFixed(2)}`);

      await jetpack.shutdown();
    } catch (error) {
      spinner.fail(chalk.red('Failed to get status'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Run a demo workflow with multiple tasks')
  .option('-a, --agents <number>', 'Number of agents', '5')
  .option('--dir <path>', 'Working directory (or set JETPACK_WORK_DIR)', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🚀 Jetpack Multi-Agent Swarm Demo\n'));

    const spinner = ora('Initializing Jetpack...').start();

    try {
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: true,
      });

      await jetpack.initialize();
      await jetpack.startAgents(parseInt(options.agents));

      spinner.succeed('Jetpack initialized');

      // Create a series of interdependent tasks
      console.log(chalk.yellow('\nCreating demo tasks...\n'));

      const task1 = await jetpack.createTask({
        title: 'Set up project structure',
        description: 'Initialize TypeScript project with necessary configuration',
        priority: 'high',
        requiredSkills: ['typescript'],
        estimatedMinutes: 5,
      });
      console.log(`✓ Created task: ${chalk.cyan(task1.id)} - ${task1.title}`);

      const task2 = await jetpack.createTask({
        title: 'Implement user authentication API',
        description: 'Create REST API endpoints for user login/logout',
        priority: 'high',
        requiredSkills: ['typescript', 'backend'],
        dependencies: [task1.id],
        estimatedMinutes: 10,
      });
      console.log(`✓ Created task: ${chalk.cyan(task2.id)} - ${task2.title}`);

      const task3 = await jetpack.createTask({
        title: 'Create login UI component',
        description: 'Build React component for user login',
        priority: 'medium',
        requiredSkills: ['react', 'frontend'],
        dependencies: [task1.id],
        estimatedMinutes: 8,
      });
      console.log(`✓ Created task: ${chalk.cyan(task3.id)} - ${task3.title}`);

      const task4 = await jetpack.createTask({
        title: 'Write integration tests',
        description: 'Test authentication flow end-to-end',
        priority: 'medium',
        requiredSkills: ['testing'],
        dependencies: [task2.id, task3.id],
        estimatedMinutes: 12,
      });
      console.log(`✓ Created task: ${chalk.cyan(task4.id)} - ${task4.title}`);

      const task5 = await jetpack.createTask({
        title: 'Update documentation',
        description: 'Document authentication API and UI components',
        priority: 'low',
        requiredSkills: ['documentation'],
        dependencies: [task2.id, task3.id],
        estimatedMinutes: 6,
      });
      console.log(`✓ Created task: ${chalk.cyan(task5.id)} - ${task5.title}`);

      console.log(chalk.green('\n✓ All demo tasks created!\n'));
      console.log(chalk.bold('Agents are now working on tasks...\n'));
      console.log(chalk.gray('Watch as agents claim and complete tasks based on:'));
      console.log(chalk.gray('  • Task dependencies'));
      console.log(chalk.gray('  • Agent skills'));
      console.log(chalk.gray('  • Task priorities\n'));

      // Monitor progress
      let completed = 0;
      const totalTasks = 5;

      const progressInterval = setInterval(async () => {
        const status = await jetpack.getStatus();

        if (status.tasks.completed > completed) {
          completed = status.tasks.completed;
          console.log(chalk.green(`\n✓ Task completed! (${completed}/${totalTasks})`));

          const agents = status.agents.filter(a => a.status === 'busy');
          if (agents.length > 0) {
            console.log(chalk.blue(`Active agents: ${agents.map(a => a.name).join(', ')}`));
          }
        }

        if (status.tasks.completed === totalTasks) {
          clearInterval(progressInterval);
          console.log(chalk.bold.green('\n\n🎉 All tasks completed!\n'));

          const finalStatus = await jetpack.getStatus();
          console.log(chalk.bold('Final Statistics:'));
          console.log(`  Agents: ${finalStatus.agents.length}`);
          console.log(`  Tasks Completed: ${chalk.green(finalStatus.tasks.completed.toString())}`);
          console.log(`  Memory Entries: ${finalStatus.memory.total}`);

          await jetpack.shutdown();
          console.log(chalk.cyan('\nDemo complete!'));
          process.exit(0);
        }
      }, 2000);

      // Safety timeout
      setTimeout(async () => {
        clearInterval(progressInterval);
        console.log(chalk.yellow('\n\nDemo timeout reached'));
        await jetpack.shutdown();
        process.exit(0);
      }, 300000); // 5 minutes

    } catch (error) {
      spinner.fail(chalk.red('Demo failed'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('supervise')
  .description('Use LangGraph supervisor to orchestrate a high-level request')
  .argument('<request>', 'High-level request to execute (e.g., "Build user authentication")')
  .option('-a, --agents <number>', 'Number of agents to start', '5')
  .option('-l, --llm <provider>', 'LLM provider (claude, openai, ollama)', 'claude')
  .option('-m, --model <model>', 'LLM model name')
  .option('--dir <path>', 'Working directory (or set JETPACK_WORK_DIR)', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (request: string, options) => {
    // Set default model based on provider (use cheaper options by default)
    const defaultModels: Record<string, string> = {
      claude: 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4o-mini', // Cheaper than gpt-4
      ollama: 'llama3.2', // Free local model
    };
    const llmProvider = options.llm as 'claude' | 'openai' | 'ollama';
    const model = options.model || defaultModels[llmProvider] || defaultModels.claude;

    console.log(chalk.bold.cyan('\n🧠 Jetpack LangGraph Supervisor\n'));
    console.log(chalk.gray(`Request: "${request}"`));
    console.log(chalk.gray(`LLM: ${llmProvider} (${model})`));
    console.log(chalk.gray(`Agents: ${options.agents}\n`));

    // Early API key validation BEFORE starting agents
    if (llmProvider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red('\n❌ Error: ANTHROPIC_API_KEY environment variable is required for Claude supervisor'));
      console.error(chalk.yellow('\nAlternatives (no Anthropic key needed):'));
      console.error(chalk.gray('  1. Use OpenAI: --llm openai (requires OPENAI_API_KEY, uses gpt-4o-mini by default)'));
      console.error(chalk.gray('  2. Use Ollama (FREE, runs locally): --llm ollama'));
      console.error(chalk.cyan('\n📦 Ollama setup (free, local LLM):'));
      console.error(chalk.gray('     brew install ollama'));
      console.error(chalk.gray('     ollama pull llama3.2'));
      console.error(chalk.gray('     ollama serve'));
      console.error(chalk.gray('     pnpm jetpack supervise "your request" --llm ollama'));
      process.exit(1);
    }
    if (llmProvider === 'openai' && !process.env.OPENAI_API_KEY) {
      console.error(chalk.red('\n❌ Error: OPENAI_API_KEY environment variable is required for OpenAI supervisor'));
      console.error(chalk.yellow('\nAlternatives:'));
      console.error(chalk.gray('  1. Set OPENAI_API_KEY: export OPENAI_API_KEY=your_key'));
      console.error(chalk.gray('  2. Use Ollama (FREE, runs locally): --llm ollama'));
      console.error(chalk.cyan('\n📦 Ollama setup (free, local LLM):'));
      console.error(chalk.gray('     brew install ollama && ollama pull llama3.2 && ollama serve'));
      process.exit(1);
    }
    if (llmProvider === 'ollama') {
      const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      console.log(chalk.cyan(`📦 Using Ollama (free, local) at: ${ollamaUrl}`));
      console.log(chalk.gray('   Tip: Run "ollama serve" if not running\n'));
    }

    const spinner = ora('Initializing Jetpack...').start();

    try {
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: true,
      });

      await jetpack.initialize();
      spinner.text = 'Starting agents...';

      await jetpack.startAgents(parseInt(options.agents));
      spinner.text = 'Initializing supervisor...';

      await jetpack.createSupervisor({
        provider: llmProvider,
        model: model,
      });

      spinner.succeed('Supervisor ready');
      console.log(chalk.yellow('\nExecuting request with supervisor...\n'));

      // Execute the request
      const result = await jetpack.supervise(request);

      // Display results
      console.log(chalk.bold('\n=== Supervisor Execution Complete ===\n'));

      if (result.success) {
        console.log(chalk.green('✓ Request completed successfully'));
      } else {
        console.log(chalk.red('✗ Request failed'));
        if (result.error) {
          console.log(chalk.red(`  Error: ${result.error}`));
        }
      }

      console.log(`\nTasks Created: ${result.completedTasks.length + result.failedTasks.length}`);
      console.log(`  ${chalk.green('Completed')}: ${result.completedTasks.length}`);
      console.log(`  ${chalk.red('Failed')}: ${result.failedTasks.length}`);
      console.log(`Conflicts Resolved: ${result.conflicts}`);
      console.log(`Iterations: ${result.iterations}`);

      console.log(chalk.bold('\n--- Final Report ---'));
      console.log(result.finalReport);

      await jetpack.shutdown();
      console.log(chalk.cyan('\nSupervision complete!'));
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      spinner.fail(chalk.red('Supervision failed'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Start MCP server for Claude Code integration')
  .option('--dir <path>', 'Working directory for Jetpack data (or set JETPACK_WORK_DIR)', process.env.JETPACK_WORK_DIR || process.cwd())
  .action(async (options) => {
    // Set the working directory for the MCP server
    process.env.JETPACK_WORK_DIR = options.dir;

    // Import and start the MCP server
    // The MCP server uses stdio transport, so we just need to run it
    console.error(chalk.cyan('Starting Jetpack MCP server...'));
    console.error(chalk.gray(`Working directory: ${options.dir}`));
    console.error(chalk.gray('Connect Claude Code using .claude/settings.json\n'));

    try {
      // Dynamically import the MCP server (it will handle stdio)
      await import('@jetpack/mcp-server');
    } catch (error) {
      console.error(chalk.red('Failed to start MCP server:'), error);
      process.exit(1);
    }
  });

program.parse();
