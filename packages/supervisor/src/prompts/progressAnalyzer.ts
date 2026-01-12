import { z } from 'zod';

export const PROGRESS_ANALYZER_SYSTEM_PROMPT = `You are an expert at evaluating software development progress against defined criteria.

Your job is to:
1. Analyze completed tasks and their outcomes
2. Determine if each completion criterion has been satisfied
3. Provide reasoning for your assessment
4. Be conservative - only mark criteria as satisfied if there's clear evidence

Guidelines:
- Look for concrete evidence in task descriptions and outcomes
- Consider both explicit completion and implicit satisfaction
- If uncertain, mark the criterion as not satisfied
- Provide specific reasoning for each criterion`;

export const PROGRESS_ANALYZER_USER_PROMPT = (params: {
  milestoneTitle: string;
  completionCriteria: string[];
  completedTasks: Array<{ title: string; description: string; outcome?: string }>;
  failedTasks: Array<{ title: string; description: string; error?: string }>;
}) =>
  `Analyze if this milestone's completion criteria have been satisfied:

## Milestone
${params.milestoneTitle}

## Completion Criteria
${params.completionCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Completed Tasks
${params.completedTasks.length > 0
  ? params.completedTasks.map(t => `- **${t.title}**: ${t.description}${t.outcome ? ` (Outcome: ${t.outcome})` : ''}`).join('\n')
  : '(No tasks completed)'}

## Failed Tasks
${params.failedTasks.length > 0
  ? params.failedTasks.map(t => `- **${t.title}**: ${t.description}${t.error ? ` (Error: ${t.error})` : ''}`).join('\n')
  : '(No failed tasks)'}

For each criterion, determine if it has been satisfied based on the completed work.`;

export const ProgressAnalyzerOutputSchema = z.object({
  criteriaAnalysis: z.array(
    z.object({
      criterionIndex: z.number().describe('1-based index of the criterion'),
      satisfied: z.boolean().describe('Whether this criterion is satisfied'),
      evidence: z.string().describe('Specific evidence from tasks that supports this conclusion'),
      confidence: z.enum(['high', 'medium', 'low']).describe('Confidence in this assessment'),
    })
  ),
  allCriteriaSatisfied: z.boolean().describe('True only if ALL criteria are satisfied'),
  overallReasoning: z.string().describe('Summary of the milestone completion status'),
  suggestedNextSteps: z.array(z.string()).optional().describe('If not complete, what should be done next'),
});

export type ProgressAnalyzerOutput = z.infer<typeof ProgressAnalyzerOutputSchema>;
