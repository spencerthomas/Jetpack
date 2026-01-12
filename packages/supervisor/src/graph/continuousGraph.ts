import { StateGraph, END, START } from '@langchain/langgraph';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';
import { CASSAdapter } from '@jetpack/cass-adapter';
import { LLMProvider } from '../llm';
import { SupervisorStateAnnotation, SupervisorState } from './state';
import {
  createAssignerNode,
  createMonitorNode,
  createCoordinatorNode,
  createObjectiveParserNode,
  createQueueManagerNode,
  createContinuousPlannerNode,
  createProgressAnalyzerNode,
  isAllComplete,
  hasUnresolvedConflicts,
  maxIterationsReached,
  shouldGenerateMoreTasks,
  isObjectiveComplete,
} from './nodes';

export interface ContinuousGraphConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
  cass?: CASSAdapter;
  getAgentMail: (agentId: string) => MCPMailAdapter | undefined;
  pollIntervalMs: number;
  maxIterations: number;
}

/**
 * Create the continuous LangGraph supervisor graph.
 *
 * This extends the standard supervisor with continuous task generation:
 *
 * Graph flow:
 * START → objectiveParser → queueManager ─┬→ continuousPlanner → assigner
 *                               ↑          │
 *                               │          └→ (queue ok) → assigner
 *                               │
 *         monitor ─── progressAnalyzer ──┬→ (milestone done) → queueManager
 *            ↑            │              │
 *            │            └──────────────┴→ (still working) → assigner
 *            │
 *         coordinator ←──────────────────── (conflicts)
 *            │
 *            └→ assigner
 *
 * END conditions:
 * - objective.status === 'completed' (all milestones done)
 * - maxIterations reached
 * - error occurred
 */
export async function createContinuousGraph(config: ContinuousGraphConfig) {
  const { llm, beads, cass, getAgentMail, pollIntervalMs, maxIterations } = config;

  // Create node functions
  const objectiveParserNode = await createObjectiveParserNode({ llm });
  const queueManagerNode = await createQueueManagerNode({ beads });
  const continuousPlannerNode = await createContinuousPlannerNode({ llm, beads, cass });
  const assignerNode = await createAssignerNode({ llm, beads, getAgentMail });
  const monitorNode = await createMonitorNode({ beads, pollIntervalMs });
  const progressAnalyzerNode = await createProgressAnalyzerNode({ llm, beads });
  const coordinatorNode = await createCoordinatorNode({ llm, beads, getAgentMail });

  // Build the graph
  const graph = new StateGraph(SupervisorStateAnnotation)
    // Add nodes
    .addNode('objectiveParser', objectiveParserNode)
    .addNode('queueManager', queueManagerNode)
    .addNode('continuousPlanner', continuousPlannerNode)
    .addNode('assigner', assignerNode)
    .addNode('monitor', monitorNode)
    .addNode('progressAnalyzer', progressAnalyzerNode)
    .addNode('coordinator', coordinatorNode)

    // Entry: Parse objective first
    .addEdge(START, 'objectiveParser')

    // After parsing, check queue
    .addEdge('objectiveParser', 'queueManager')

    // Queue manager decides: generate tasks or proceed
    .addConditionalEdges('queueManager', (state: SupervisorState) => {
      if (state.error) return END;
      if (shouldGenerateMoreTasks(state)) return 'continuousPlanner';
      return 'assigner';
    })

    // After generating tasks, assign them
    .addEdge('continuousPlanner', 'assigner')

    // After assigning, monitor progress
    .addEdge('assigner', 'monitor')

    // Monitor decides next step
    .addConditionalEdges('monitor', (state: SupervisorState) => {
      if (state.error) return END;

      // Check max iterations
      if (maxIterationsReached(state, maxIterations)) return END;

      // In continuous mode, check objective completion via progress analyzer
      if (state.continuousMode && state.objective) {
        // Run progress analyzer periodically (after tasks complete)
        return 'progressAnalyzer';
      }

      // Standard mode: check if all tasks complete
      if (isAllComplete(state)) return END;

      // Handle conflicts
      if (hasUnresolvedConflicts(state)) return 'coordinator';

      return 'assigner';
    })

    // Progress analyzer evaluates milestone completion
    .addConditionalEdges('progressAnalyzer', (state: SupervisorState) => {
      if (state.error) return END;

      // Check if objective is complete
      if (isObjectiveComplete(state)) return END;

      // Check if milestone was just completed - need more tasks
      if (state.milestoneCheckResult?.allSatisfied) {
        return 'queueManager'; // Get more tasks for next milestone
      }

      // Handle conflicts
      if (hasUnresolvedConflicts(state)) return 'coordinator';

      // Check if we need more tasks
      if (shouldGenerateMoreTasks(state)) return 'queueManager';

      // Continue monitoring
      return 'assigner';
    })

    // Coordinator resolves conflicts then returns to assigner
    .addEdge('coordinator', 'assigner');

  return graph.compile();
}

/**
 * Type for the compiled continuous supervisor graph
 */
export type ContinuousGraph = Awaited<ReturnType<typeof createContinuousGraph>>;
