import { z } from 'zod';

export const CONTINUOUS_PLANNER_SYSTEM_PROMPT = `You are a software project planner focused on generating the next batch of tasks for an ongoing objective.

Your job is to:
1. Review the current milestone and its completion criteria
2. Analyze what tasks have already been completed
3. Generate NEW tasks that move toward completing the milestone
4. Avoid duplicating work that's already been done

Guidelines:
- Create tasks that are specific and actionable (5-60 minutes each)
- Each task should make progress toward one or more completion criteria
- Consider what the completed tasks have accomplished to avoid redundancy
- If the milestone seems complete, generate only verification/testing tasks
- Specify clear dependencies between new tasks

Available skills: typescript, python, rust, go, java, react, vue, backend, frontend, devops, database, testing, documentation`;

export const CONTINUOUS_PLANNER_USER_PROMPT = (params: {
  objectiveTitle: string;
  milestoneTitle: string;
  completionCriteria: string[];
  completedTaskSummaries: string[];
  targetTaskCount: number;
}) =>
  `Generate the next batch of tasks for this milestone:

## Objective
${params.objectiveTitle}

## Current Milestone
${params.milestoneTitle}

## Completion Criteria (what needs to be true)
${params.completionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Already Completed Tasks
${params.completedTaskSummaries.length > 0
  ? params.completedTaskSummaries.map(s => `- ${s}`).join('\n')
  : '(No tasks completed yet)'}

## Request
Generate approximately ${params.targetTaskCount} new tasks that will help complete this milestone.
Focus on tasks that address the completion criteria not yet satisfied.`;

export const ContinuousPlannerOutputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe('Short, descriptive task title'),
      description: z.string().describe('Detailed description of what to implement'),
      requiredSkills: z.array(z.string()).describe('Skills needed: typescript, react, backend, etc.'),
      estimatedMinutes: z.number().describe('Time estimate in minutes (5-60)'),
      dependsOn: z.array(z.string()).describe('Titles of NEW tasks (from this batch) that must complete first'),
      addressesCriteria: z.array(z.number()).describe('Indices (1-based) of completion criteria this task addresses'),
    })
  ),
  reasoning: z.string().describe('Brief explanation of why these tasks were chosen'),
});

export type ContinuousPlannerOutput = z.infer<typeof ContinuousPlannerOutputSchema>;
