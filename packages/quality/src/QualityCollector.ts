import { spawn } from 'child_process';
import type {
  DataLayer,
  QualitySnapshot,
  QualitySnapshotCreate,
  QualityBaseline,
  Regression,
} from '@jetpack-agent/data';

/**
 * Configuration for quality collection
 */
export interface QualityCollectorConfig {
  /** Working directory to run commands in */
  workDir: string;
  /** Command to run TypeScript type check */
  typecheckCommand?: string;
  /** Command to run linter */
  lintCommand?: string;
  /** Command to run tests */
  testCommand?: string;
  /** Command to run build */
  buildCommand?: string;
  /** Timeout for each command (ms) */
  commandTimeoutMs?: number;
}

/**
 * Result from running a quality command
 */
export interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Collected quality metrics
 */
export interface QualityMetrics {
  buildSuccess?: boolean;
  buildTimeMs?: number;
  buildOutput?: string;

  typeErrors: number;
  typeOutput?: string;

  lintErrors: number;
  lintWarnings: number;
  lintOutput?: string;

  testsPassing: number;
  testsFailing: number;
  testsSkipped: number;
  testCoverage?: number;
  testTimeMs?: number;
  testOutput?: string;
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
  passed: boolean;
  regressions: Regression[];
  warnings: string[];
  blocking: string[];
}

const DEFAULT_COMMANDS = {
  typecheck: 'npx tsc --noEmit',
  lint: 'npx eslint . --format json',
  test: 'npx vitest run --reporter=json',
  build: 'npm run build',
};

const DEFAULT_TIMEOUT = 300_000; // 5 minutes

/**
 * Collects quality metrics by running build tools
 */
export class QualityCollector {
  private config: Required<QualityCollectorConfig>;

  constructor(config: QualityCollectorConfig) {
    this.config = {
      workDir: config.workDir,
      typecheckCommand: config.typecheckCommand ?? DEFAULT_COMMANDS.typecheck,
      lintCommand: config.lintCommand ?? DEFAULT_COMMANDS.lint,
      testCommand: config.testCommand ?? DEFAULT_COMMANDS.test,
      buildCommand: config.buildCommand ?? DEFAULT_COMMANDS.build,
      commandTimeoutMs: config.commandTimeoutMs ?? DEFAULT_TIMEOUT,
    };
  }

  /**
   * Collect all quality metrics
   */
  async collect(): Promise<QualityMetrics> {
    const [buildResult, typeResult, lintResult, testResult] = await Promise.all([
      this.runBuild(),
      this.runTypecheck(),
      this.runLint(),
      this.runTests(),
    ]);

    return {
      buildSuccess: buildResult.success,
      buildTimeMs: buildResult.durationMs,
      buildOutput: buildResult.stdout + buildResult.stderr,

      typeErrors: this.parseTypeErrors(typeResult),
      typeOutput: typeResult.stdout + typeResult.stderr,

      ...this.parseLintResult(lintResult),
      lintOutput: lintResult.stdout + lintResult.stderr,

      ...this.parseTestResult(testResult),
      testTimeMs: testResult.durationMs,
      testOutput: testResult.stdout + testResult.stderr,
    };
  }

  /**
   * Run build command
   */
  async runBuild(): Promise<CommandResult> {
    return this.runCommand(this.config.buildCommand, 'build');
  }

  /**
   * Run typecheck command
   */
  async runTypecheck(): Promise<CommandResult> {
    return this.runCommand(this.config.typecheckCommand, 'typecheck');
  }

  /**
   * Run lint command
   */
  async runLint(): Promise<CommandResult> {
    return this.runCommand(this.config.lintCommand, 'lint');
  }

  /**
   * Run test command
   */
  async runTests(): Promise<CommandResult> {
    return this.runCommand(this.config.testCommand, 'test');
  }

  /**
   * Run a command and capture output
   */
  private runCommand(command: string, label: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const [cmd, ...args] = command.split(' ');

      const proc = spawn(cmd, args, {
        cwd: this.config.workDir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr: `${label} timed out after ${this.config.commandTimeoutMs}ms`,
          durationMs: Date.now() - startTime,
        });
      }, this.config.commandTimeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          success: code === 0,
          exitCode: code ?? -1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr: err.message,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Parse TypeScript errors from tsc output
   */
  private parseTypeErrors(result: CommandResult): number {
    if (result.success) return 0;

    // Count lines containing error pattern
    const output = result.stdout + result.stderr;
    const errorMatches = output.match(/error TS\d+:/g);
    return errorMatches?.length ?? (result.exitCode !== 0 ? 1 : 0);
  }

  /**
   * Parse ESLint output
   */
  private parseLintResult(result: CommandResult): { lintErrors: number; lintWarnings: number } {
    try {
      // Try to parse JSON output
      const json = JSON.parse(result.stdout);
      let errors = 0;
      let warnings = 0;

      if (Array.isArray(json)) {
        for (const file of json) {
          errors += file.errorCount ?? 0;
          warnings += file.warningCount ?? 0;
        }
      }

      return { lintErrors: errors, lintWarnings: warnings };
    } catch {
      // Fall back to counting error patterns
      const output = result.stdout + result.stderr;
      const errorMatches = output.match(/\d+ errors?/gi);
      const warningMatches = output.match(/\d+ warnings?/gi);

      return {
        lintErrors: errorMatches
          ? parseInt(errorMatches[0].match(/\d+/)?.[0] ?? '0')
          : result.exitCode !== 0
            ? 1
            : 0,
        lintWarnings: warningMatches
          ? parseInt(warningMatches[0].match(/\d+/)?.[0] ?? '0')
          : 0,
      };
    }
  }

  /**
   * Parse test results
   */
  private parseTestResult(result: CommandResult): {
    testsPassing: number;
    testsFailing: number;
    testsSkipped: number;
    testCoverage?: number;
  } {
    try {
      // Try to parse JSON output (vitest/jest)
      const json = JSON.parse(result.stdout);

      if (json.numPassedTests !== undefined) {
        // Jest format
        return {
          testsPassing: json.numPassedTests ?? 0,
          testsFailing: json.numFailedTests ?? 0,
          testsSkipped: json.numPendingTests ?? 0,
          testCoverage: json.coverageMap
            ? this.calculateCoverage(json.coverageMap)
            : undefined,
        };
      }

      if (json.testResults) {
        // Vitest format
        let passing = 0;
        let failing = 0;
        let skipped = 0;

        for (const file of json.testResults) {
          for (const test of file.assertionResults ?? []) {
            if (test.status === 'passed') passing++;
            else if (test.status === 'failed') failing++;
            else skipped++;
          }
        }

        return { testsPassing: passing, testsFailing: failing, testsSkipped: skipped };
      }
    } catch {
      // Fall back to parsing text output
    }

    const output = result.stdout + result.stderr;

    // Parse "X passed, Y failed, Z skipped" patterns
    const passedMatch = output.match(/(\d+)\s+passed/i);
    const failedMatch = output.match(/(\d+)\s+failed/i);
    const skippedMatch = output.match(/(\d+)\s+skipped/i);

    return {
      testsPassing: passedMatch ? parseInt(passedMatch[1]) : 0,
      testsFailing: failedMatch ? parseInt(failedMatch[1]) : result.exitCode !== 0 ? 1 : 0,
      testsSkipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
    };
  }

  /**
   * Calculate overall coverage percentage from coverage map
   */
  private calculateCoverage(coverageMap: Record<string, any>): number {
    let totalStatements = 0;
    let coveredStatements = 0;

    for (const file of Object.values(coverageMap)) {
      const stmts = file.statementMap ?? {};
      const covered = file.s ?? {};

      totalStatements += Object.keys(stmts).length;
      coveredStatements += Object.values(covered).filter((v) => (v as number) > 0).length;
    }

    return totalStatements > 0
      ? Math.round((coveredStatements / totalStatements) * 100)
      : 0;
  }
}

/**
 * Manager for quality snapshots and baselines
 */
export class QualityManager {
  constructor(
    private dataLayer: DataLayer,
    private collector: QualityCollector
  ) {}

  /**
   * Record a quality snapshot for a task
   */
  async recordSnapshot(
    taskId?: string,
    agentId?: string
  ): Promise<QualitySnapshot> {
    const metrics = await this.collector.collect();

    const snapshotData: QualitySnapshotCreate = {
      taskId,
      agentId,
      buildSuccess: metrics.buildSuccess,
      buildTimeMs: metrics.buildTimeMs,
      typeErrors: metrics.typeErrors,
      lintErrors: metrics.lintErrors,
      lintWarnings: metrics.lintWarnings,
      testsPassing: metrics.testsPassing,
      testsFailing: metrics.testsFailing,
      testsSkipped: metrics.testsSkipped,
      testCoverage: metrics.testCoverage,
      testTimeMs: metrics.testTimeMs,
      buildOutput: metrics.buildOutput,
      typeOutput: metrics.typeOutput,
      lintOutput: metrics.lintOutput,
      testOutput: metrics.testOutput,
    };

    return this.dataLayer.quality.recordSnapshot(snapshotData);
  }

  /**
   * Create or update the quality baseline
   */
  async setBaseline(setBy?: string): Promise<QualityBaseline> {
    const metrics = await this.collector.collect();

    return this.dataLayer.quality.setBaseline({
      buildSuccess: metrics.buildSuccess ?? true,
      typeErrors: metrics.typeErrors,
      lintErrors: metrics.lintErrors,
      lintWarnings: metrics.lintWarnings,
      testsPassing: metrics.testsPassing,
      testsFailing: metrics.testsFailing,
      testCoverage: metrics.testCoverage ?? 0,
      setBy,
    });
  }

  /**
   * Check if a snapshot passes quality gates
   */
  async checkQualityGates(snapshotId: string): Promise<QualityGateResult> {
    const baseline = await this.dataLayer.quality.getBaseline();
    const snapshot = await this.dataLayer.quality.getSnapshot(snapshotId);

    if (!snapshot) {
      return {
        passed: false,
        regressions: [],
        warnings: ['Snapshot not found'],
        blocking: ['Snapshot not found'],
      };
    }

    const regressions = await this.dataLayer.quality.detectRegressions(snapshot);
    const warnings: string[] = [];
    const blocking: string[] = [];

    // Blocking regressions (severity: 'error')
    if (regressions.some((r) => r.severity === 'error')) {
      blocking.push(
        ...regressions
          .filter((r) => r.severity === 'error')
          .map((r) => `${r.metric}: ${r.baseline} → ${r.current} (Δ${r.delta})`)
      );
    }

    // Warning-level regressions
    if (regressions.some((r) => r.severity === 'warning')) {
      warnings.push(
        ...regressions
          .filter((r) => r.severity === 'warning')
          .map((r) => `${r.metric}: ${r.baseline} → ${r.current} (Δ${r.delta})`)
      );
    }

    // Build must succeed
    if (snapshot.buildSuccess === false) {
      blocking.push('Build failed');
    }

    // Tests must pass
    if (snapshot.testsFailing > 0) {
      blocking.push(`${snapshot.testsFailing} tests failing`);
    }

    // Type errors block
    if (snapshot.typeErrors > 0) {
      blocking.push(`${snapshot.typeErrors} type errors`);
    }

    // Lint errors block
    if (snapshot.lintErrors > 0) {
      blocking.push(`${snapshot.lintErrors} lint errors`);
    }

    // Coverage regression warning (if baseline exists)
    const snapshotCoverage = snapshot.testCoverage;
    if (baseline && snapshotCoverage != null) {
      if (snapshotCoverage < baseline.testCoverage - 5) {
        warnings.push(
          `Coverage dropped from ${baseline.testCoverage}% to ${snapshotCoverage}%`
        );
      }
    }

    // Lint warnings are just warnings
    if (snapshot.lintWarnings > 0) {
      warnings.push(`${snapshot.lintWarnings} lint warnings`);
    }

    return {
      passed: blocking.length === 0,
      regressions,
      warnings,
      blocking,
    };
  }

  /**
   * Quick health check without full collection
   */
  async quickCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Run typecheck only (fastest check)
    const typeResult = await this.collector.runTypecheck();
    if (!typeResult.success) {
      issues.push('Type errors detected');
    }

    // Run lint only
    const lintResult = await this.collector.runLint();
    if (!lintResult.success) {
      issues.push('Lint errors detected');
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}
