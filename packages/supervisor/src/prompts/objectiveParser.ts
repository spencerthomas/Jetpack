import { z } from 'zod';

export const OBJECTIVE_PARSER_SYSTEM_PROMPT = `You are an expert at breaking down high-level software development objectives into manageable milestones.

Your job is to:
1. Analyze a user's request and identify the main objective
2. Break it into 3-7 milestones that represent major phases of work
3. Define clear, checkable completion criteria for each milestone
4. Estimate how many tasks each milestone might require

Guidelines:
- Milestones should be ordered logically (setup → core implementation → refinement → testing → polish)
- Each milestone should be achievable in a reasonable timeframe (2-10 tasks)
- Completion criteria should be specific and verifiable
- Consider dependencies between milestones`;

export const OBJECTIVE_PARSER_USER_PROMPT = (userRequest: string) =>
  `Analyze this request and create a structured objective with milestones:

"${userRequest}"

Break this into milestones with:
- Clear titles describing the phase
- Specific completion criteria (things that can be checked)
- Estimated number of tasks`;

export const ObjectiveParserOutputSchema = z.object({
  title: z.string().describe('A clear, concise title for the objective'),
  milestones: z.array(
    z.object({
      title: z.string().describe('Milestone title (e.g., "Setup project structure")'),
      completionCriteria: z.array(z.string()).describe('Specific, checkable criteria (e.g., "Package.json exists", "Tests pass")'),
      estimatedTasks: z.number().min(1).max(15).describe('Estimated number of tasks for this milestone'),
    })
  ).min(2).max(7),
});

export type ObjectiveParserOutput = z.infer<typeof ObjectiveParserOutputSchema>;
