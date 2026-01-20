import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { SQLiteDataLayer } from '@jetpack-agent/data';
import { DashboardProvider } from '../src/DashboardProvider.js';

const TEST_DB_PATH = '/tmp/jetpack-dashboard-test.db';

describe('DashboardProvider', () => {
  let db: SQLiteDataLayer;
  let dashboard: DashboardProvider;

  beforeEach(async () => {
    // Clean up test database
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }

    db = new SQLiteDataLayer({ dbPath: TEST_DB_PATH });
    await db.initialize();

    dashboard = new DashboardProvider(db, {
      pollingIntervalMs: 0, // Disable polling for tests
      enableStreaming: true,
      maxEventHistory: 100,
    });
  });

  afterEach(async () => {
    dashboard.stop();
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(TEST_DB_PATH + suffix)) {
        unlinkSync(TEST_DB_PATH + suffix);
      }
    }
  });

  describe('getStatus', () => {
    it('should return swarm status', async () => {
      const status = await dashboard.getStatus();

      expect(status.swarm).toBeDefined();
      expect(status.swarm.status).toBe('healthy');
      expect(status.agents).toBeDefined();
      expect(status.tasks).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should return aggregated metrics', async () => {
      const metrics = await dashboard.getMetrics();

      expect(metrics.taskMetrics).toBeDefined();
      expect(metrics.taskMetrics.total).toBeGreaterThanOrEqual(0);
      expect(metrics.agentMetrics).toBeDefined();
      expect(metrics.qualityMetrics).toBeDefined();
      expect(metrics.systemMetrics).toBeDefined();
    });
  });

  describe('getTasksByStatus', () => {
    it('should group tasks by status', async () => {
      // Create a task
      await db.tasks.create({ title: 'Test Task' });

      const grouped = await dashboard.getTasksByStatus();

      expect(grouped.pending).toBeDefined();
      expect(grouped.ready).toBeDefined();
      expect(grouped.completed).toBeDefined();
      // New tasks default to 'ready' status (not 'pending')
      expect(grouped.ready.length).toBe(1);
    });
  });

  describe('event handling', () => {
    it('should record events', () => {
      dashboard.recordEvent('task.created', { id: 'test-1' });

      const history = dashboard.getEventHistory();
      expect(history.length).toBe(1);
      expect(history[0].type).toBe('task.created');
    });

    it('should emit events to subscribers', async () => {
      const events: unknown[] = [];
      
      const unsubscribe = dashboard.subscribe('task.created', (event) => {
        events.push(event);
      });

      dashboard.recordEvent('task.created', { id: 'test-1' });
      dashboard.recordEvent('agent.registered', { id: 'agent-1' });
      dashboard.recordEvent('task.created', { id: 'test-2' });

      expect(events.length).toBe(2); // Only task.created events

      unsubscribe();
    });

    it('should limit event history', () => {
      const smallDashboard = new DashboardProvider(db, {
        maxEventHistory: 5,
        pollingIntervalMs: 0,
      });

      for (let i = 0; i < 10; i++) {
        smallDashboard.recordEvent('task.created', { id: `test-${i}` });
      }

      const history = smallDashboard.getEventHistory();
      expect(history.length).toBe(5);
    });
  });

  describe('start/stop', () => {
    it('should start and stop without errors', async () => {
      await dashboard.start();
      dashboard.stop();
      // No errors means success
    });

    it('should handle multiple start calls', async () => {
      await dashboard.start();
      await dashboard.start(); // Should be idempotent
      dashboard.stop();
    });
  });
});
