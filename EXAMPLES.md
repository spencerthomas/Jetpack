# 📚 Jetpack Examples

Comprehensive examples for using Jetpack in various scenarios.

## Table of Contents

1. [Basic Workflow](#basic-workflow)
2. [Feature Development](#feature-development)
3. [Bug Fixing Swarm](#bug-fixing-swarm)
4. [Refactoring Project](#refactoring-project)
5. [Custom Agent Skills](#custom-agent-skills)

## Basic Workflow

### Simple Task Execution

```bash
# Start Jetpack
jetpack start --agents 2

# Create a simple task
jetpack task \
  --title "Add logging to API endpoints" \
  --priority medium \
  --skills typescript,backend

# Monitor progress
jetpack status
```

### Multiple Independent Tasks

```bash
# Create several independent tasks
jetpack task --title "Update README" --skills documentation
jetpack task --title "Fix TypeScript warnings" --skills typescript
jetpack task --title "Add unit tests" --skills testing

# Agents will work on them in parallel
```

## Feature Development

### Complex Feature with Dependencies

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function developFeature() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  await jetpack.startAgents(5);

  // Step 1: Design & Planning
  const designTask = await jetpack.createTask({
    title: 'Design user profile feature',
    description: 'Create API spec and UI mockups',
    priority: 'high',
    requiredSkills: ['documentation'],
    estimatedMinutes: 20,
  });

  // Step 2: Database Schema
  const schemaTask = await jetpack.createTask({
    title: 'Create user profile database schema',
    description: 'Add tables for user profiles and preferences',
    priority: 'high',
    requiredSkills: ['database'],
    dependencies: [designTask.id],
    estimatedMinutes: 15,
  });

  // Step 3: Backend API
  const apiTask = await jetpack.createTask({
    title: 'Implement user profile API endpoints',
    description: 'CRUD operations for user profiles',
    priority: 'high',
    requiredSkills: ['backend', 'typescript'],
    dependencies: [schemaTask.id],
    estimatedMinutes: 45,
  });

  // Step 4: Frontend Component
  const uiTask = await jetpack.createTask({
    title: 'Build user profile UI component',
    description: 'React component with form and validation',
    priority: 'medium',
    requiredSkills: ['frontend', 'react'],
    dependencies: [designTask.id],
    estimatedMinutes: 60,
  });

  // Step 5: Integration
  const integrationTask = await jetpack.createTask({
    title: 'Integrate profile UI with API',
    description: 'Connect frontend to backend endpoints',
    priority: 'medium',
    requiredSkills: ['frontend', 'backend'],
    dependencies: [apiTask.id, uiTask.id],
    estimatedMinutes: 30,
  });

  // Step 6: Testing
  const testTask = await jetpack.createTask({
    title: 'Write tests for user profile feature',
    description: 'Unit and integration tests',
    priority: 'high',
    requiredSkills: ['testing'],
    dependencies: [integrationTask.id],
    estimatedMinutes: 45,
  });

  // Step 7: Documentation
  const docsTask = await jetpack.createTask({
    title: 'Document user profile feature',
    description: 'API docs and user guide',
    priority: 'low',
    requiredSkills: ['documentation'],
    dependencies: [testTask.id],
    estimatedMinutes: 25,
  });

  console.log('Feature development pipeline created!');
  console.log('7 tasks with proper dependencies');

  // Monitor until complete
  while (true) {
    const status = await jetpack.getStatus();

    if (status.tasks.completed === 7) {
      console.log('Feature development complete!');
      break;
    }

    console.log(`Progress: ${status.tasks.completed}/7 tasks completed`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  await jetpack.shutdown();
}
```

## Bug Fixing Swarm

### Parallel Bug Resolution

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function fixBugs() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();

  // Start many agents for parallel bug fixing
  await jetpack.startAgents(8);

  // List of bugs from issue tracker
  const bugs = [
    { title: 'Login fails on Safari', skills: ['frontend'], priority: 'critical' },
    { title: 'Memory leak in WebSocket handler', skills: ['backend'], priority: 'high' },
    { title: 'Database query timeout on large datasets', skills: ['database', 'backend'], priority: 'high' },
    { title: 'UI flickering on mobile devices', skills: ['frontend', 'react'], priority: 'medium' },
    { title: 'TypeScript errors in build', skills: ['typescript'], priority: 'high' },
    { title: 'API rate limiting not working', skills: ['backend'], priority: 'medium' },
    { title: 'Broken links in documentation', skills: ['documentation'], priority: 'low' },
    { title: 'Test flakiness in CI/CD', skills: ['testing', 'devops'], priority: 'medium' },
  ];

  // Create all bug fix tasks
  for (const bug of bugs) {
    await jetpack.createTask({
      title: bug.title,
      priority: bug.priority as any,
      requiredSkills: bug.skills as any,
      estimatedMinutes: 30,
    });
  }

  console.log(`Created ${bugs.length} bug fix tasks`);
  console.log('Agents are working in parallel...');

  // Agents will automatically claim and fix bugs based on their skills
  await jetpack.shutdown();
}
```

## Refactoring Project

### Large-Scale Refactoring

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function refactorProject() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  await jetpack.startAgents(6);

  // Phase 1: Analysis
  const analysisTask = await jetpack.createTask({
    title: 'Analyze codebase for refactoring opportunities',
    description: 'Identify duplicated code, complex functions, and technical debt',
    priority: 'critical',
    requiredSkills: ['typescript'],
    estimatedMinutes: 30,
  });

  // Phase 2: Extract common utilities
  const utilsTask = await jetpack.createTask({
    title: 'Extract common utilities to shared package',
    description: 'Identify and extract reusable functions',
    priority: 'high',
    requiredSkills: ['typescript'],
    dependencies: [analysisTask.id],
    estimatedMinutes: 45,
  });

  // Phase 3: Modularize components
  const modulesTask = await jetpack.createTask({
    title: 'Break monolithic components into modules',
    description: 'Split large components into smaller, focused ones',
    priority: 'high',
    requiredSkills: ['react', 'frontend'],
    dependencies: [analysisTask.id],
    estimatedMinutes: 60,
  });

  // Phase 4: Improve type safety
  const typesTask = await jetpack.createTask({
    title: 'Add TypeScript strict mode',
    description: 'Fix all type errors and enable strict mode',
    priority: 'medium',
    requiredSkills: ['typescript'],
    dependencies: [utilsTask.id, modulesTask.id],
    estimatedMinutes: 90,
  });

  // Phase 5: Update tests
  const testsTask = await jetpack.createTask({
    title: 'Update tests for refactored code',
    description: 'Ensure all tests pass with new structure',
    priority: 'high',
    requiredSkills: ['testing'],
    dependencies: [typesTask.id],
    estimatedMinutes: 60,
  });

  // Phase 6: Performance optimization
  const perfTask = await jetpack.createTask({
    title: 'Optimize performance bottlenecks',
    description: 'Profile and optimize slow operations',
    priority: 'medium',
    requiredSkills: ['backend'],
    dependencies: [testsTask.id],
    estimatedMinutes: 45,
  });

  console.log('Refactoring pipeline created');
  console.log('Agents will execute in dependency order');

  await jetpack.shutdown();
}
```

## Custom Agent Skills

### Creating Specialized Agents

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import { AgentController } from '@jetpack/orchestrator';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';

async function customAgents() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
    autoStart: false, // We'll start agents manually
  });

  await jetpack.initialize();

  // Create specialized agent configurations
  const agentConfigs = [
    {
      name: 'frontend-specialist',
      skills: ['react', 'frontend', 'typescript'] as any,
    },
    {
      name: 'backend-specialist',
      skills: ['backend', 'database', 'typescript'] as any,
    },
    {
      name: 'devops-specialist',
      skills: ['devops', 'testing', 'documentation'] as any,
    },
    {
      name: 'full-stack-generalist',
      skills: ['frontend', 'backend', 'react', 'typescript'] as any,
    },
  ];

  // Manually create and start agents
  for (const config of agentConfigs) {
    const mail = new MCPMailAdapter({
      mailDir: '/path/to/mail',
      agentId: config.name,
    });
    await mail.initialize();

    const agent = new AgentController(
      config,
      jetpack.getBeadsAdapter(),
      mail,
      jetpack.getCASSAdapter()
    );

    await agent.start();
    console.log(`Started ${config.name} with skills:`, config.skills);
  }

  // Now create tasks that match specialist skills
  await jetpack.createTask({
    title: 'Optimize React component rendering',
    requiredSkills: ['react', 'frontend'],
    priority: 'high',
  });

  await jetpack.createTask({
    title: 'Set up CI/CD pipeline',
    requiredSkills: ['devops'],
    priority: 'medium',
  });

  await jetpack.shutdown();
}
```

## Using Memory System

### Storing and Retrieving Agent Learnings

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function memoryExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  const cass = jetpack.getCASSAdapter();

  // Store knowledge about the codebase
  await cass.store({
    type: 'codebase_knowledge',
    content: 'The authentication system uses JWT tokens with 24-hour expiry',
    importance: 0.9,
    metadata: {
      module: 'auth',
      technology: 'jwt',
    },
  });

  await cass.store({
    type: 'pattern_recognition',
    content: 'All API endpoints follow RESTful conventions with /api/v1 prefix',
    importance: 0.8,
    metadata: {
      pattern: 'api-design',
    },
  });

  // Search for relevant memories
  const authMemories = await cass.search('authentication', 5);
  console.log('Auth-related memories:', authMemories);

  // Get memories by type
  const patterns = await cass.getByType('pattern_recognition', 10);
  console.log('Recognized patterns:', patterns);

  // Memory compaction (remove low-importance entries)
  const removed = await cass.compact(0.4); // Remove entries with importance < 0.4
  console.log(`Removed ${removed} low-importance memories`);

  await jetpack.shutdown();
}
```

## File Leasing for Concurrent Safety

### Preventing Edit Conflicts

```typescript
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';

async function fileLeasingExample() {
  const agent1Mail = new MCPMailAdapter({
    mailDir: './.jetpack/mail',
    agentId: 'agent-1',
  });

  const agent2Mail = new MCPMailAdapter({
    mailDir: './.jetpack/mail',
    agentId: 'agent-2',
  });

  await agent1Mail.initialize();
  await agent2Mail.initialize();

  // Agent 1 tries to lease a file
  const leased1 = await agent1Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 1 lease:', leased1); // true

  // Agent 2 tries to lease the same file
  const leased2 = await agent2Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 2 lease:', leased2); // false - already leased

  // Check lease status
  const status = await agent1Mail.isLeased('src/utils/auth.ts');
  console.log('Lease status:', status); // { leased: true, agentId: 'agent-1' }

  // Agent 1 does work...
  console.log('Agent 1 is editing the file...');

  // Agent 1 releases the lease
  await agent1Mail.releaseLease('src/utils/auth.ts');

  // Now Agent 2 can lease it
  const leased2Again = await agent2Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 2 lease (retry):', leased2Again); // true

  await agent1Mail.shutdown();
  await agent2Mail.shutdown();
}
```

## Task Graph Visualization

### Understanding Task Dependencies

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function visualizeTaskGraph() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  await jetpack.startAgents(3);

  // Create interconnected tasks
  const t1 = await jetpack.createTask({ title: 'Task 1', priority: 'high' });
  const t2 = await jetpack.createTask({ title: 'Task 2', dependencies: [t1.id], priority: 'high' });
  const t3 = await jetpack.createTask({ title: 'Task 3', dependencies: [t1.id], priority: 'high' });
  const t4 = await jetpack.createTask({ title: 'Task 4', dependencies: [t2.id, t3.id], priority: 'medium' });

  // Build and inspect the task graph
  const graph = await jetpack.getBeadsAdapter().buildTaskGraph();

  console.log('Task Graph:');
  console.log('Nodes (tasks):', graph.tasks.size);
  console.log('\nDependencies:');

  for (const [taskId, deps] of graph.edges.entries()) {
    const task = graph.tasks.get(taskId);
    if (task && deps.size > 0) {
      console.log(`${task.title} depends on:`);
      for (const depId of deps) {
        const depTask = graph.tasks.get(depId);
        console.log(`  - ${depTask?.title}`);
      }
    }
  }

  // Execution order:
  // 1. Task 1 (no dependencies)
  // 2. Task 2 and Task 3 (in parallel, depend on Task 1)
  // 3. Task 4 (depends on Task 2 and Task 3)

  await jetpack.shutdown();
}
```

## Using the Supervisor Programmatically

### Submit High-Level Requests

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function supervisorExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();

  // Create a supervisor with Claude
  const supervisor = await jetpack.createSupervisor({
    provider: 'claude',
    model: 'claude-3-5-sonnet-20241022',
  });

  // Submit a high-level request
  const result = await jetpack.supervise(
    "Build a user authentication system with login, logout, and password reset"
  );

  console.log('Tasks created:', result.tasksCreated);
  console.log('Execution time:', result.executionTime);
  console.log('Final report:', result.report);

  await jetpack.shutdown();
}
```

### Custom Supervisor Configuration

```typescript
async function customSupervisor() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  await jetpack.startAgents(5);

  // Use OpenAI instead of Claude
  const supervisor = await jetpack.createSupervisor({
    provider: 'openai',
    model: 'gpt-4-turbo',
  });

  // Execute with priority
  const result = await jetpack.supervise(
    "Refactor the authentication module to use OAuth2",
    { priority: 'high' }
  );

  console.log('Conflicts resolved:', result.conflictsResolved);
  console.log('Iterations:', result.iterations);

  await jetpack.shutdown();
}
```

## Memory Dashboard Integration

### Programmatic Memory Management

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function memoryDashboardExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  const cass = jetpack.getCASSAdapter();

  // Get memory statistics (as shown in dashboard)
  const stats = await cass.getStats();
  console.log('Total memories:', stats.total);
  console.log('By type:', stats.byType);
  console.log('Avg importance:', stats.avgImportance);
  console.log('With embeddings:', stats.withEmbeddings);

  // Store different types of memories
  await cass.store({
    type: 'codebase_knowledge',
    content: 'The project uses TypeScript with strict mode enabled',
    importance: 0.9,
  });

  await cass.store({
    type: 'agent_learning',
    content: 'React components should use functional style with hooks',
    importance: 0.8,
  });

  await cass.store({
    type: 'decision_rationale',
    content: 'Chose JWT over sessions for stateless API design',
    importance: 0.7,
  });

  // Backfill embeddings for entries without them
  const backfillResult = await cass.backfillEmbeddings();
  console.log('Embeddings generated:', backfillResult.count);

  // Compact low-importance memories
  const compactResult = await cass.compact(0.3); // threshold
  console.log('Memories removed:', compactResult);

  await jetpack.shutdown();
}
```

### Hot-Reload CASS Configuration

```typescript
async function reconfigureCASSExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  const cass = jetpack.getCASSAdapter();

  // Check current configuration
  const currentConfig = await cass.getConfiguration();
  console.log('Current config:', currentConfig);

  // Hot-reload with new settings (no restart required)
  await cass.reconfigure({
    autoGenerateEmbeddings: true,
    embeddingModel: 'text-embedding-3-large',
    maxEntries: 10000,
    compactionThreshold: 0.4,
  });

  console.log('Configuration updated successfully');

  await jetpack.shutdown();
}
```

## Plan Management

### Creating and Executing Plans

```typescript
import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function planExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();

  // Create a plan (template for task creation)
  const plan = await jetpack.createPlan({
    name: 'API Feature Template',
    description: 'Standard workflow for new API endpoints',
    tasks: [
      { title: 'Design API spec', skills: ['documentation'], order: 1 },
      { title: 'Create database schema', skills: ['database'], order: 2, dependsOn: [1] },
      { title: 'Implement endpoint', skills: ['backend'], order: 3, dependsOn: [2] },
      { title: 'Write tests', skills: ['testing'], order: 4, dependsOn: [3] },
      { title: 'Update docs', skills: ['documentation'], order: 5, dependsOn: [4] },
    ],
    isTemplate: true,
    tags: ['api', 'backend'],
  });

  console.log('Plan created:', plan.id);

  // Execute plan (creates actual tasks)
  const execution = await jetpack.executePlan(plan.id, {
    priority: 'high',
    context: { feature: 'user-profile' },
  });

  console.log('Tasks created:', execution.tasks.length);
  console.log('Task IDs:', execution.tasks.map(t => t.id));

  await jetpack.shutdown();
}
```

### Using Plan Templates

```typescript
async function planTemplateExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();

  // List available templates
  const templates = await jetpack.listPlans({ isTemplate: true });
  console.log('Available templates:', templates.map(t => t.name));

  // Find a specific template
  const apiTemplate = templates.find(t => t.name === 'API Feature Template');

  if (apiTemplate) {
    // Execute template for a new feature
    const execution = await jetpack.executePlan(apiTemplate.id, {
      priority: 'medium',
      context: {
        feature: 'order-history',
        endpoint: '/api/orders',
      },
    });

    // Monitor execution
    while (true) {
      const status = await jetpack.getPlanStatus(execution.planId);

      if (status.status === 'completed') {
        console.log('Plan completed successfully!');
        break;
      }

      if (status.status === 'failed') {
        console.log('Plan failed:', status.error);
        break;
      }

      console.log(`Progress: ${status.completedTasks}/${status.totalTasks} tasks`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  await jetpack.shutdown();
}
```

---

For more examples, see the [tests](./packages/orchestrator/test) directory.
