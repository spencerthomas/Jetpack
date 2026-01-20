import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync, mkdirSync, writeFileSync, rmdirSync } from 'fs';
import { SQLiteDataLayer } from '@jetpack-agent/data';
import { QualityCollector, QualityManager } from '../src/QualityCollector.js';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = '/tmp/jetpack-quality-test.db';

describe('QualityCollector', () => {
  let collector: QualityCollector;
  let testDir: string;

  beforeEach(() => {
    // Create a temp directory for testing
    testDir = path.join(os.tmpdir(), `quality-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    collector = new QualityCollector({
      workDir: testDir,
      commandTimeoutMs: 10_000,
    });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmdirSync(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('runCommand', () => {
    it('should run a simple command successfully', async () => {
      // Create a simple test script
      const testScript = path.join(testDir, 'test.sh');
      writeFileSync(testScript, '#!/bin/bash\necho "hello"');

      const customCollector = new QualityCollector({
        workDir: testDir,
        buildCommand: 'echo "hello"',
      });

      const result = await customCollector.runBuild();
      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('hello');
    });

    it('should capture failure exit codes', async () => {
      const customCollector = new QualityCollector({
        workDir: testDir,
        buildCommand: 'exit 1',
      });

      const result = await customCollector.runBuild();
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should handle command not found', async () => {
      const customCollector = new QualityCollector({
        workDir: testDir,
        buildCommand: 'nonexistent-command-12345',
      });

      const result = await customCollector.runBuild();
      expect(result.success).toBe(false);
    });
  });

  describe('parseTypeErrors', () => {
    it('should parse type error count from tsc output', async () => {
      // Create a collector that simulates tsc output
      const customCollector = new QualityCollector({
        workDir: testDir,
        commandTimeoutMs: 30_000,
        typecheckCommand:
          'echo "error TS2345: Argument of type" && echo "error TS2339: Property" && exit 1',
        buildCommand: 'echo "build ok"',
        lintCommand: 'echo "[]"',
        testCommand: 'echo "1 passed"',
      });

      const metrics = await customCollector.collect();
      expect(metrics.typeErrors).toBe(2);
    }, 30_000); // 30 second timeout
  });

  describe('parseLintResult', () => {
    it('should parse ESLint JSON output', async () => {
      // Provide all commands to avoid default timeouts
      const customCollector = new QualityCollector({
        workDir: testDir,
        commandTimeoutMs: 10_000,
        buildCommand: 'echo "build ok"',
        typecheckCommand: 'echo "types ok"',
        lintCommand: 'echo \'[{"errorCount": 3, "warningCount": 5}]\'',
        testCommand: 'echo "1 passed"',
      });

      const metrics = await customCollector.collect();
      expect(metrics.lintErrors).toBe(3);
      expect(metrics.lintWarnings).toBe(5);
    }, 30_000);
  });

  describe('parseTestResult', () => {
    it('should parse test count from output', async () => {
      // Provide all commands to avoid default timeouts
      const customCollector = new QualityCollector({
        workDir: testDir,
        commandTimeoutMs: 10_000,
        buildCommand: 'echo "build ok"',
        typecheckCommand: 'echo "types ok"',
        lintCommand: 'echo "[]"',
        testCommand: 'echo "Tests: 10 passed, 2 failed, 3 skipped"',
      });

      const metrics = await customCollector.collect();
      expect(metrics.testsPassing).toBe(10);
      expect(metrics.testsFailing).toBe(2);
      expect(metrics.testsSkipped).toBe(3);
    }, 30_000);
  });
});

describe('QualityManager', () => {
  let db: SQLiteDataLayer;
  let manager: QualityManager;
  let testDir: string;

  beforeEach(async () => {
    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }

    db = new SQLiteDataLayer({ dbPath: TEST_DB_PATH });
    await db.initialize();

    // Create a temp directory for testing
    testDir = path.join(os.tmpdir(), `quality-manager-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const collector = new QualityCollector({
      workDir: testDir,
      // Use simple commands that always succeed/fail predictably
      buildCommand: 'echo "build"',
      typecheckCommand: 'echo "types"',
      lintCommand: 'echo \'[{"errorCount": 0, "warningCount": 1}]\'',
      testCommand: 'echo "10 passed, 0 failed"',
    });

    manager = new QualityManager(db, collector);
  });

  afterEach(async () => {
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }
    try {
      rmdirSync(testDir, { recursive: true });
    } catch {
      // Ignore
    }
  });

  describe('recordSnapshot', () => {
    it('should record a quality snapshot', async () => {
      const snapshot = await manager.recordSnapshot();

      expect(snapshot.id).toBeDefined();
      expect(snapshot.buildSuccess).toBe(true);
      expect(snapshot.typeErrors).toBe(0);
      expect(snapshot.lintWarnings).toBe(1);
      expect(snapshot.testsPassing).toBe(10);
    });

    it('should record snapshot with task and agent IDs', async () => {
      // Create a task first
      const task = await db.tasks.create({
        title: 'Test Task',
        requiredSkills: [],
      });

      // Register an agent
      const agent = await db.agents.register({
        id: 'test-agent',
        name: 'Test Agent',
        type: 'claude-code',
        capabilities: { skills: [] },
      });

      const snapshot = await manager.recordSnapshot(task.id, agent.id);

      expect(snapshot.taskId).toBe(task.id);
      expect(snapshot.agentId).toBe(agent.id);
    });
  });

  describe('setBaseline', () => {
    it('should set quality baseline', async () => {
      const baseline = await manager.setBaseline('test-user');

      expect(baseline.buildSuccess).toBe(true);
      expect(baseline.typeErrors).toBe(0);
      expect(baseline.setBy).toBe('test-user');
    });
  });

  describe('checkQualityGates', () => {
    it('should pass quality gates when metrics are good', async () => {
      // Set baseline
      await manager.setBaseline();

      // Record a good snapshot
      const snapshot = await manager.recordSnapshot();

      // Check gates
      const result = await manager.checkQualityGates(snapshot.id);

      expect(result.passed).toBe(true);
      expect(result.blocking.length).toBe(0);
    });

    it('should fail quality gates when tests fail', async () => {
      // Create manager with failing tests
      const failingCollector = new QualityCollector({
        workDir: testDir,
        buildCommand: 'echo "build"',
        typecheckCommand: 'echo "types"',
        lintCommand: 'echo \'[{"errorCount": 0, "warningCount": 0}]\'',
        testCommand: 'echo "8 passed, 2 failed" && exit 1',
      });
      const failingManager = new QualityManager(db, failingCollector);

      const snapshot = await failingManager.recordSnapshot();
      const result = await failingManager.checkQualityGates(snapshot.id);

      expect(result.passed).toBe(false);
      expect(result.blocking.some((b) => b.includes('tests failing'))).toBe(true);
    });
  });

  describe('quickCheck', () => {
    it('should perform quick health check', async () => {
      const result = await manager.quickCheck();

      expect(result.healthy).toBe(true);
      expect(result.issues.length).toBe(0);
    });
  });
});
