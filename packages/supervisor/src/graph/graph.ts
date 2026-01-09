import { StateGraph, END, START } from '@langchain/langgraph';
import { BeadsAdapter } from '@jetpack/beads-adapter';
import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';
import { LLMProvider } from '../llm';
import { SupervisorStateAnnotation, SupervisorState } from './state';
import {
  createPlannerNode,
  createAssignerNode,
  createMonitorNode,
  createCoordinatorNode,
  isAllComplete,
  hasUnresolvedConflicts,
  maxIterationsReached,
} from './nodes';

export interface SupervisorGraphConfig {
  llm: LLMProvider;
  beads: BeadsAdapter;
  getAgentMail: (agentId: string) => MCPMailAdapter | undefined;
  pollIntervalMs: number;
  maxIterations: number;
}

/**
 * Create the LangGraph supervisor graph
 *
 * Graph flow:
 * START → planner → assigner → monitor ─┬→ coordinator → assigner (loop)
 *                       ↑               │
 *                       └───────────────┘ (all complete → END)
 */
export async function createSupervisorGraph(config: SupervisorGraphConfig) {
  const { llm, beads, getAgentMail, pollIntervalMs, maxIterations } = config;

  // Create node functions
  const plannerNode = await createPlannerNode({ llm, beads });
  const assignerNode = await createAssignerNode({ llm, beads, getAgentMail });
  const monitorNode = await createMonitorNode({ beads, pollIntervalMs });
  const coordinatorNode = await createCoordinatorNode({ llm, beads, getAgentMail });

  // Build the graph
  const graph = new StateGraph(SupervisorStateAnnotation)
    // Add nodes
    .addNode('planner', plannerNode)
    .addNode('assigner', assignerNode)
    .addNode('monitor', monitorNode)
    .addNode('coordinator', coordinatorNode)

    // Add edges
    .addEdge(START, 'planner')
    .addEdge('planner', 'assigner')
    .addEdge('assigner', 'monitor')

    // Conditional edges from monitor
    .addConditionalEdges('monitor', (state: SupervisorState) => {
      // Check for errors
      if (state.error) {
        return END;
      }

      // Check if all tasks complete
      if (isAllComplete(state)) {
        return END;
      }

      // Check max iterations
      if (maxIterationsReached(state, maxIterations)) {
        return END;
      }

      // Check for conflicts that need resolution
      if (hasUnresolvedConflicts(state)) {
        return 'coordinator';
      }

      // Continue monitoring (with delay handled externally)
      return 'assigner';
    })

    // After coordinator, go back to assigner for reassignments
    .addEdge('coordinator', 'assigner');

  return graph.compile();
}

/**
 * Type for the compiled supervisor graph
 */
export type SupervisorGraph = Awaited<ReturnType<typeof createSupervisorGraph>>;
