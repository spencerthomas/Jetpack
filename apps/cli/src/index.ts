#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import { AgentSkill, TaskPriority } from '@jetpack/shared';

const program = new Command();

program
  .name('jetpack')
  .description('Multi-Agent Swarm Development Stack')
  .version('0.1.0');

program
  .command('start')
  .description('Start the Jetpack multi-agent system')
  .option('-a, --agents <number>', 'Number of agents to start', '3')
  .option('-d, --dir <path>', 'Working directory', process.cwd())
  .action(async (options) => {
    const spinner = ora('Initializing Jetpack...').start();

    try {
      const jetpack = new JetpackOrchestrator({
        workDir: options.dir,
        autoStart: true,
      });

      await jetpack.initialize();
      spinner.text = 'Starting agents...';

      await jetpack.startAgents(parseInt(options.agents));
      spinner.succeed(chalk.green(`Jetpack started with ${options.agents} agents`));

      console.log(chalk.cyan('\nJetpack is running. Press Ctrl+C to stop.\n'));

      // Keep process alive and show status updates
      const statusInterval = setInterval(async () => {
        const status = await jetpack.getStatus();
        console.log(chalk.bold('\n--- Status Update ---'));
        console.log(chalk.blue(`Agents: ${status.agents.length}`));
        status.agents.forEach(agent => {
          const statusColor = agent.status === 'busy' ? chalk.yellow : chalk.green;
          const taskInfo = agent.currentTask ? ` (working on ${agent.currentTask})` : '';
          console.log(`  ${statusColor(agent.name)}: ${agent.status}${taskInfo}`);
        });
        console.log(chalk.blue(`\nTasks:`));
        console.log(`  Pending: ${status.tasks.pending}`);
        console.log(`  In Progress: ${status.tasks.inProgress}`);
        console.log(`  Completed: ${chalk.green(status.tasks.completed.toString())}`);
        console.log(`  Failed: ${chalk.red(status.tasks.failed.toString())}`);
        console.log(`\nMemory: ${status.memory.total} entries`);
      }, 10000); // Every 10 seconds

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        clearInterval(statusInterval);
        console.log(chalk.yellow('\n\nShutting down Jetpack...'));
        await jetpack.shutdown();
        console.log(chalk.green('Jetpack shut down successfully'));
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

program.parse();
