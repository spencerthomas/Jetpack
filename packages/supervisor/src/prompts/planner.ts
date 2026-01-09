import { z } from 'zod';

export const PLANNER_SYSTEM_PROMPT = `You are a software project planner. Your job is to break down a high-level user request into specific, actionable development tasks.

Guidelines:
1. Create tasks that are small enough for a single developer to complete in 5-60 minutes
2. Identify dependencies between tasks (which tasks must complete before others can start)
3. Specify required skills for each task (typescript, python, react, backend, frontend, testing, etc.)
4. Be specific about what each task should accomplish
5. Consider the typical software development workflow: setup -> implementation -> testing -> documentation

Available skills: typescript, python, rust, go, java, react, vue, backend, frontend, devops, database, testing, documentation`;

export const PLANNER_USER_PROMPT = (userRequest: string) =>
  `Break down this request into development tasks:

"${userRequest}"

Create a list of specific, actionable tasks with:
- Clear titles
- Detailed descriptions
- Required skills
- Time estimates (in minutes)
- Dependencies (which tasks must complete first)`;

export const PlannerOutputSchema = z.object({
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

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
