#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import { AgentSkill, TaskPriority } from '@jetpack/shared';

const program = new Command();

// Web server process reference
let webServerProcess: ChildProcess | null = null;

// Function to start the web UI
async function startWebUI(port: number = 3002): Promise<boolean> {
  return new Promise((resolve) => {
    // Find the web app directory
    const webAppDir = path.resolve(__dirname, '../../web');

    console.log(chalk.gray(`  Starting web UI from ${webAppDir}...`));

    webServerProcess = spawn('pnpm', ['dev', '-p', port.toString()], {
      cwd: webAppDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: true,
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

  Start Jetpack to automatically launch:
  • Orchestrator - coordinates agent work
  • Agents - AI workers that execute tasks
  • Web UI - visualize and interact at localhost:3002

  Usage:
    jetpack start              Start everything (recommended)
    jetpack start -a 5         Start with 5 agents
    jetpack start --no-browser Don't auto-open browser
    jetpack task -t "title"    Create a new task

  Once running, create tasks via:
  • Web UI at http://localhost:3002
  • CLI: jetpack task -t "Your task"
  • Drop .md files in .beads/tasks/
  • Use Claude Code to edit task files
  `.trim())
  .version('0.1.0');

program
  .command('start')
  .description('Start Jetpack - launches agents, orchestrator, and web UI')
  .option('-a, --agents <number>', 'Number of agents to start', '3')
  .option('-p, --port <number>', 'Web UI port', '3002')
  .option('-d, --dir <path>', 'Working directory', process.cwd())
  .option('--no-browser', 'Do not open browser automatically')
  .option('--no-ui', 'Run without web UI (CLI only mode)')
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🚀 Jetpack Multi-Agent Development Stack\n'));

    const port = parseInt(options.port);
    const url = `http://localhost:${port}`;

    const spinner = ora('Initializing orchestrator...').start();

    try {
      // 1. Initialize orchestrator
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: true,
      });

      await jetpack.initialize();
      spinner.succeed(chalk.green('Orchestrator initialized'));

      // 2. Start agents
      spinner.start('Starting agents...');
      await jetpack.startAgents(parseInt(options.agents));
      spinner.succeed(chalk.green(`${options.agents} agents started`));

      // 3. Start web UI (unless --no-ui)
      if (options.ui !== false) {
        spinner.start('Starting web UI...');
        const webStarted = await startWebUI(port);
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
      console.log(chalk.gray(`     ${options.dir}`));
      console.log('');

      console.log(chalk.bold('  🤖 Agents'));
      console.log(chalk.gray(`     ${options.agents} agents watching for tasks`));
      console.log('');

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
  .option('--dir <path>', 'Working directory', process.cwd())
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
  .option('--dir <path>', 'Working directory', process.cwd())
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
  .option('--dir <path>', 'Working directory', process.cwd())
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
  .option('-m, --model <model>', 'LLM model name', 'claude-3-5-sonnet-20241022')
  .option('--dir <path>', 'Working directory', process.cwd())
  .action(async (request: string, options) => {
    console.log(chalk.bold.cyan('\n🧠 Jetpack LangGraph Supervisor\n'));
    console.log(chalk.gray(`Request: "${request}"`));
    console.log(chalk.gray(`LLM: ${options.llm} (${options.model})`));
    console.log(chalk.gray(`Agents: ${options.agents}\n`));

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
        provider: options.llm as 'claude' | 'openai' | 'ollama',
        model: options.model,
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

program.parse();
