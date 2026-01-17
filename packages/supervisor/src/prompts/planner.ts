import { z } from 'zod';

// ============================================================================
// Hierarchical Planning System
// ============================================================================
// Plans follow a 3-level hierarchy:
//   Epic: High-level feature domain (organizational, NOT directly claimable)
//   Task: Concrete work item (15-60 min), claimable by agents
//   Subtask: Atomic steps within a task, also claimable
//
// Agents claim tasks or subtasks, not epics. Epics are for grouping only.
// ============================================================================

export const PLANNER_SYSTEM_PROMPT = `You are a software project planner using a hierarchical Epic > Task > Subtask structure.

## Hierarchy Levels

**Epic**: High-level feature domain (NOT directly claimable by agents)
- Groups related tasks under a common theme
- Examples: "Authentication System", "User Dashboard", "API Layer"
- Used for organization and progress tracking
- Should have 2-5 tasks as children

**Task**: Concrete work item (15-60 minutes, CLAIMABLE by agents)
- Specific, implementable unit of work
- Examples: "Implement login form", "Create user API endpoint", "Write unit tests"
- May optionally have subtasks for complex work
- Should be completable in one focused session

**Subtask**: Atomic steps within a task (CLAIMABLE, typically 5-15 minutes)
- Only create subtasks when a task has multiple distinct steps
- Examples: "Add validation to form", "Create mock data", "Update types"
- Optional - simple tasks don't need subtasks

## Planning Guidelines

1. **PARALLEL BY DEFAULT**: Assume tasks can run in parallel unless they MUST be sequential
2. **MINIMIZE DEPENDENCIES**: Only add a dependency if Task B literally cannot start without Task A's output
3. **BATCH SIMILAR WORK**: Group related independent tasks so they can run simultaneously
4. **INTERFACE-FIRST**: Define interfaces/contracts first, then implementations can parallelize
5. **NO FALSE DEPENDENCIES**: "Create API" and "Create UI" can often run in parallel with mock data

## When You MUST Have Dependencies
- Database schema → Data access layer (true dependency)
- Type definitions → Implementations using those types (true dependency)
- Build system setup → Running build commands (true dependency)

## When You Should NOT Have Dependencies
- "Create login page" vs "Create signup page" (parallel, different files)
- "Write tests" vs "Write implementation" (can be parallel with TDD)
- "Frontend" vs "Backend" (parallel with API contracts)
- Different components/modules that don't share state

## Available Skills
typescript, javascript, python, rust, go, java, ruby, php, csharp,
react, vue, angular, svelte, nextjs, express, fastapi, django, rails,
backend, frontend, fullstack, devops, database, testing, documentation,
docker, kubernetes, git, ci-cd, aws, gcp, azure,
sql, nosql, data, ml, api, security, mobile, graphql, rest`;

export const PLANNER_USER_PROMPT = (userRequest: string) =>
  `Break down this request into a hierarchical plan:

"${userRequest}"

Create an Epic > Task > Subtask structure with:
- **Epics**: Group tasks by feature domain (1-3 epics typically)
- **Tasks**: Concrete work items with clear deliverables (15-60 min each)
- **Subtasks**: Only for complex tasks that need multiple steps

For each item, specify:
- Clear title
- Brief description
- Required skills
- Time estimate (minutes)
- Dependencies (minimize these - only when TRULY sequential)

Remember: MAXIMIZE parallelization. Most tasks should have NO dependencies.`;

// Schema for hierarchical subtasks
const SubtaskSchema = z.object({
  title: z.string().describe('Short, specific subtask title'),
  description: z.string().describe('What this subtask accomplishes'),
  requiredSkills: z.array(z.string()).describe('Skills needed'),
  estimatedMinutes: z.number().describe('Time estimate (5-15 min typically)'),
  dependsOn: z.array(z.string()).describe('Titles of subtasks that must complete first').default([]),
});

// Schema for tasks (can contain subtasks)
const TaskSchema = z.object({
  title: z.string().describe('Descriptive task title'),
  description: z.string().describe('Detailed description of what to implement'),
  requiredSkills: z.array(z.string()).describe('Skills needed: typescript, react, backend, etc.'),
  estimatedMinutes: z.number().describe('Time estimate (15-60 min)'),
  dependsOn: z.array(z.string()).describe('Titles of tasks that must complete first').default([]),
  subtasks: z.array(SubtaskSchema).optional().describe('Optional atomic steps for complex tasks'),
});

// Schema for epics (contains tasks)
const EpicSchema = z.object({
  title: z.string().describe('High-level feature domain name'),
  description: z.string().describe('What this epic encompasses'),
  tasks: z.array(TaskSchema).describe('Tasks within this epic'),
});

// Full planner output - hierarchical structure
export const PlannerOutputSchema = z.object({
  epics: z.array(EpicSchema).describe('High-level feature groupings'),
  // Also allow flat tasks for simple requests
  standaloneTask: z.array(TaskSchema).optional().describe('Tasks that don\'t fit into an epic'),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// Legacy flat schema for backwards compatibility
export const FlatPlannerOutputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe('Short, descriptive task title'),
      description: z.string().describe('Detailed description of what to implement'),
      requiredSkills: z.array(z.string()).describe('Skills needed: typescript, react, backend, etc.'),
      estimatedMinutes: z.number().describe('Time estimate in minutes (5-60)'),
      dependsOn: z.array(z.string()).describe('Titles of tasks that must complete first'),
    })
  ),
});

export type FlatPlannerOutput = z.infer<typeof FlatPlannerOutputSchema>;
