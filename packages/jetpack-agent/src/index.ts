/**
 * Jetpack Agent - Multi-Agent Swarm Development Stack
 *
 * This meta-package provides access to all Jetpack components.
 * Install with: npm install jetpack-agent
 *
 * Usage:
 *   import { Orchestrator, Beads, CASS, MCPMail } from 'jetpack-agent';
 *   const jetpack = new Orchestrator.JetpackOrchestrator({ ... });
 */

// Re-export as namespaces to avoid conflicts
export * as Orchestrator from '@jetpack-agent/orchestrator';
export * as Shared from '@jetpack-agent/shared';
export * as Beads from '@jetpack-agent/beads-adapter';
export * as CASS from '@jetpack-agent/cass-adapter';
export * as MCPMail from '@jetpack-agent/mcp-mail-adapter';
export * as Quality from '@jetpack-agent/quality-adapter';
export * as Supervisor from '@jetpack-agent/supervisor';

// Also export the main class directly for convenience
export { JetpackOrchestrator } from '@jetpack-agent/orchestrator';
export { BeadsAdapter } from '@jetpack-agent/beads-adapter';
export { CASSAdapter } from '@jetpack-agent/cass-adapter';
export { MCPMailAdapter } from '@jetpack-agent/mcp-mail-adapter';
export { SupervisorAgent } from '@jetpack-agent/supervisor';
