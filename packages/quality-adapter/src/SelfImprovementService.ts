import {
  Logger,
  MemoryEntry,
  Regression,
  QualitySnapshot,
} from '@jetpack/shared';
import { QualityMetricsAdapter } from './QualityMetricsAdapter';
import { RegressionDetector, RegressionSummary } from './RegressionDetector';

/**
 * Interface for CASS adapter (to avoid circular dependency)
 */
export interface MemoryStore {
  store(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>): Promise<string>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
}

export interface SelfImprovementServiceConfig {
  qualityAdapter: QualityMetricsAdapter;
  regressionDetector: RegressionDetector;
  memoryStore?: MemoryStore;
}

/**
 * Failure pattern analysis result
 */
export interface FailureAnalysis {
  taskId: string;
  regressionSummary: RegressionSummary;
  patterns: string[];
  suggestedActions: string[];
  memoryId?: string;  // ID of stored memory if saved
}

/**
 * Quality context for task execution
 */
export interface QualityContext {
  baseline: QualitySnapshot | null;
  recentRegressions: string[];
  relevantMemories: MemoryEntry[];
  avoidPatterns: string[];
  qualityGuidelines: string[];
}

/**
 * SelfImprovementService analyzes failures and builds quality context
 * for agents to learn from past mistakes.
 */
export class SelfImprovementService {
  private logger: Logger;
  private qualityAdapter: QualityMetricsAdapter;
  private regressionDetector: RegressionDetector;
  private memoryStore?: MemoryStore;

  constructor(config: SelfImprovementServiceConfig) {
    this.logger = new Logger('SelfImprovementService');
    this.qualityAdapter = config.qualityAdapter;
    this.regressionDetector = config.regressionDetector;
    this.memoryStore = config.memoryStore;
  }

  /**
   * Analyze a task failure and optionally store the analysis in memory
   */
  async analyzeFailure(
    taskId: string,
    baseline: QualitySnapshot,
    current: QualitySnapshot,
    taskContext?: { title: string; description?: string }
  ): Promise<FailureAnalysis> {
    const regressions = this.regressionDetector.detectRegressions(baseline, current, taskId);
    const summary = this.regressionDetector.summarizeRegressions(regressions);

    // Extract patterns from regressions
    const patterns = this.extractPatterns(regressions, taskContext);

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(regressions);

    const analysis: FailureAnalysis = {
      taskId,
      regressionSummary: summary,
      patterns,
      suggestedActions,
    };

    // Store in memory if available
    if (this.memoryStore && summary.blocking) {
      const memoryId = await this.storeFailureAnalysis(analysis, taskContext);
      analysis.memoryId = memoryId;
    }

    this.logger.info(`Analyzed failure for task ${taskId}: ${patterns.length} patterns identified`);

    return analysis;
  }

  /**
   * Build quality context for a new task execution
   */
  async buildQualityContext(
    taskTitle: string,
    taskDescription?: string
  ): Promise<QualityContext> {
    const baseline = await this.qualityAdapter.getBaseline();

    // TODO: Analyze recent snapshots for regression patterns
    // const recentSnapshots = await this.qualityAdapter.getRecentSnapshots(20);
    const recentRegressions: string[] = [];

    // Search for relevant memories
    let relevantMemories: MemoryEntry[] = [];
    const avoidPatterns: string[] = [];

    if (this.memoryStore) {
      // Search for failure patterns related to this task
      const searchQuery = `${taskTitle} ${taskDescription || ''}`.trim();
      relevantMemories = await this.memoryStore.search(searchQuery, 5);

      // Filter to quality-related memories
      relevantMemories = relevantMemories.filter(m =>
        m.type === 'test_failure_analysis' ||
        m.type === 'quality_improvement' ||
        m.type === 'regression_pattern' ||
        m.type === 'successful_fix'
      );

      // Extract patterns to avoid
      for (const memory of relevantMemories) {
        if (memory.type === 'regression_pattern' || memory.type === 'test_failure_analysis') {
          avoidPatterns.push(memory.content);
        }
      }
    }

    // Build quality guidelines
    const qualityGuidelines = this.buildQualityGuidelines(baseline);

    this.logger.debug(`Built quality context: ${relevantMemories.length} memories, ${avoidPatterns.length} patterns to avoid`);

    return {
      baseline,
      recentRegressions,
      relevantMemories,
      avoidPatterns,
      qualityGuidelines,
    };
  }

  /**
   * Format quality context as prompt instructions for an agent
   */
  formatContextForPrompt(context: QualityContext): string {
    const sections: string[] = [];

    // Quality guidelines
    if (context.qualityGuidelines.length > 0) {
      sections.push('## Quality Guidelines\n' + context.qualityGuidelines.map(g => `- ${g}`).join('\n'));
    }

    // Patterns to avoid
    if (context.avoidPatterns.length > 0) {
      sections.push('## AVOID THESE PATTERNS (from past failures)\n' + context.avoidPatterns.map(p => `- ${p}`).join('\n'));
    }

    // Relevant learnings
    const learnings = context.relevantMemories.filter(m =>
      m.type === 'quality_improvement' || m.type === 'successful_fix'
    );
    if (learnings.length > 0) {
      sections.push('## Relevant Learnings\n' + learnings.map(l => `- ${l.content}`).join('\n'));
    }

    // Current baseline metrics
    if (context.baseline) {
      const m = context.baseline.metrics;
      sections.push(`## Current Quality Baseline
- Lint errors: ${m.lintErrors}
- Type errors: ${m.typeErrors}
- Tests: ${m.testsPassing} passing, ${m.testsFailing} failing
- Coverage: ${m.testCoverage.toFixed(1)}%
- Build: ${m.buildSuccess ? 'passing' : 'failing'}

**Important**: Do not introduce new lint errors, type errors, or test failures.`);
    }

    return sections.join('\n\n');
  }

  /**
   * Record a successful fix for learning
   */
  async recordSuccessfulFix(
    taskId: string,
    regressionType: string,
    howFixed: string
  ): Promise<string | undefined> {
    if (!this.memoryStore) return undefined;

    const content = `Successfully fixed ${regressionType} in task ${taskId}: ${howFixed}`;

    const memoryId = await this.memoryStore.store({
      type: 'successful_fix',
      content,
      importance: 0.8, // High importance - successful fixes are valuable
      metadata: {
        taskId,
        regressionType,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.info(`Stored successful fix memory: ${memoryId}`);
    return memoryId;
  }

  // Private helpers

  private extractPatterns(
    regressions: Regression[],
    taskContext?: { title: string; description?: string }
  ): string[] {
    const patterns: string[] = [];

    for (const reg of regressions) {
      switch (reg.type) {
        case 'lint_regression':
          patterns.push(`Lint errors introduced in "${taskContext?.title || 'task'}" (${reg.delta} new errors)`);
          break;
        case 'type_regression':
          patterns.push(`Type errors introduced in "${taskContext?.title || 'task'}" (${reg.delta} new errors)`);
          break;
        case 'test_regression':
          patterns.push(`Tests broken in "${taskContext?.title || 'task'}" (${reg.delta} failures)`);
          break;
        case 'coverage_regression':
          patterns.push(`Coverage decreased in "${taskContext?.title || 'task'}" (${Math.abs(reg.delta).toFixed(1)}% decrease)`);
          break;
        case 'build_failure':
          patterns.push(`Build broken in "${taskContext?.title || 'task'}"`);
          break;
      }
    }

    return patterns;
  }

  private generateSuggestedActions(regressions: Regression[]): string[] {
    const actions: string[] = [];

    const hasLintErrors = regressions.some(r => r.type === 'lint_regression');
    const hasTypeErrors = regressions.some(r => r.type === 'type_regression');
    const hasTestFailures = regressions.some(r => r.type === 'test_regression');
    const hasCoverageDecrease = regressions.some(r => r.type === 'coverage_regression');
    const hasBuildFailure = regressions.some(r => r.type === 'build_failure');

    if (hasLintErrors) {
      actions.push('Run linter and fix all errors before committing');
      actions.push('Consider enabling auto-fix on save');
    }

    if (hasTypeErrors) {
      actions.push('Run type checker and resolve all errors');
      actions.push('Ensure imports and exports are correct');
    }

    if (hasTestFailures) {
      actions.push('Run tests locally before committing');
      actions.push('Review test assertions and update if behavior changed intentionally');
    }

    if (hasCoverageDecrease) {
      actions.push('Add tests for new code paths');
      actions.push('Ensure edge cases are covered');
    }

    if (hasBuildFailure) {
      actions.push('Run build locally before committing');
      actions.push('Check for missing dependencies or syntax errors');
    }

    return actions;
  }

  private async storeFailureAnalysis(
    analysis: FailureAnalysis,
    taskContext?: { title: string; description?: string }
  ): Promise<string> {
    if (!this.memoryStore) throw new Error('Memory store not configured');

    const content = [
      `Task "${taskContext?.title || analysis.taskId}" caused quality regression:`,
      ...analysis.patterns,
      '',
      'Suggested actions:',
      ...analysis.suggestedActions.map(a => `- ${a}`),
    ].join('\n');

    const memoryId = await this.memoryStore.store({
      type: 'regression_pattern',
      content,
      importance: analysis.regressionSummary.blocking ? 0.9 : 0.7,
      metadata: {
        taskId: analysis.taskId,
        regressionTypes: Object.entries(analysis.regressionSummary.byType)
          .filter(([_, count]) => count > 0)
          .map(([type]) => type),
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.debug(`Stored failure analysis as memory ${memoryId}`);
    return memoryId;
  }

  private buildQualityGuidelines(baseline: QualitySnapshot | null): string[] {
    const guidelines: string[] = [
      'Run tests before marking task complete',
      'Ensure code compiles without type errors',
      'Follow project linting rules',
    ];

    if (baseline) {
      if (baseline.metrics.testCoverage > 0) {
        guidelines.push(`Maintain test coverage at or above ${baseline.metrics.testCoverage.toFixed(0)}%`);
      }
      if (baseline.metrics.lintErrors === 0) {
        guidelines.push('Keep lint errors at zero');
      }
    }

    return guidelines;
  }
}
