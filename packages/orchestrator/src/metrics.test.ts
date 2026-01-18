import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  JetpackMetrics,
  getMetrics,
  MetricLabels,
} from './metrics';

describe('JetpackMetrics', () => {
  let metrics: JetpackMetrics;

  beforeEach(() => {
    // Reset the singleton between tests
    JetpackMetrics.reset();
    metrics = JetpackMetrics.getInstance();
  });

  afterEach(() => {
    JetpackMetrics.reset();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const m1 = JetpackMetrics.getInstance();
      const m2 = JetpackMetrics.getInstance();
      expect(m1).toBe(m2);
    });

    it('should reset and create new instance', () => {
      const m1 = JetpackMetrics.getInstance();
      JetpackMetrics.reset();
      const m2 = JetpackMetrics.getInstance();
      expect(m1).not.toBe(m2);
    });

    it('should have getMetrics convenience function', () => {
      const m1 = getMetrics();
      const m2 = JetpackMetrics.getInstance();
      expect(m1).toBe(m2);
    });
  });

  describe('uptime', () => {
    it('should return positive uptime', async () => {
      const beforeUptime = metrics.getUptimeSeconds();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const afterUptime = metrics.getUptimeSeconds();

      expect(afterUptime).toBeGreaterThan(beforeUptime);
      expect(afterUptime).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe('tasks_total counter', () => {
    it('should start at zero', () => {
      expect(metrics.getTasksTotal({ status: 'completed' })).toBe(0);
    });

    it('should increment by 1 by default', () => {
      metrics.incTasksTotal({ status: 'completed' });
      expect(metrics.getTasksTotal({ status: 'completed' })).toBe(1);

      metrics.incTasksTotal({ status: 'completed' });
      expect(metrics.getTasksTotal({ status: 'completed' })).toBe(2);
    });

    it('should increment by specified value', () => {
      metrics.incTasksTotal({ status: 'failed' }, 5);
      expect(metrics.getTasksTotal({ status: 'failed' })).toBe(5);
    });

    it('should track different labels independently', () => {
      metrics.incTasksTotal({ status: 'completed' }, 10);
      metrics.incTasksTotal({ status: 'failed' }, 3);
      metrics.incTasksTotal({ status: 'pending' }, 7);

      expect(metrics.getTasksTotal({ status: 'completed' })).toBe(10);
      expect(metrics.getTasksTotal({ status: 'failed' })).toBe(3);
      expect(metrics.getTasksTotal({ status: 'pending' })).toBe(7);
    });

    it('should track with additional labels', () => {
      metrics.incTasksTotal({ status: 'completed', priority: 'high' });
      metrics.incTasksTotal({ status: 'completed', priority: 'low' }, 2);

      expect(metrics.getTasksTotal({ status: 'completed', priority: 'high' })).toBe(1);
      expect(metrics.getTasksTotal({ status: 'completed', priority: 'low' })).toBe(2);
    });
  });

  describe('tasks_in_progress gauge', () => {
    it('should start at zero', () => {
      expect(metrics.getTasksInProgress()).toBe(0);
    });

    it('should set value directly', () => {
      metrics.setTasksInProgress(5);
      expect(metrics.getTasksInProgress()).toBe(5);

      metrics.setTasksInProgress(3);
      expect(metrics.getTasksInProgress()).toBe(3);
    });

    it('should increment', () => {
      metrics.incTasksInProgress();
      expect(metrics.getTasksInProgress()).toBe(1);

      metrics.incTasksInProgress();
      expect(metrics.getTasksInProgress()).toBe(2);
    });

    it('should decrement', () => {
      metrics.setTasksInProgress(5);
      metrics.decTasksInProgress();
      expect(metrics.getTasksInProgress()).toBe(4);
    });

    it('should not go below zero', () => {
      metrics.setTasksInProgress(0);
      metrics.decTasksInProgress();
      expect(metrics.getTasksInProgress()).toBe(0);
    });

    it('should track with labels', () => {
      metrics.setTasksInProgress(3, { priority: 'high' });
      metrics.setTasksInProgress(5, { priority: 'low' });

      expect(metrics.getTasksInProgress({ priority: 'high' })).toBe(3);
      expect(metrics.getTasksInProgress({ priority: 'low' })).toBe(5);
    });
  });

  describe('task_duration_seconds histogram', () => {
    it('should return undefined for unobserved labels', () => {
      expect(metrics.getTaskDurationData()).toBeUndefined();
    });

    it('should record observations', () => {
      metrics.observeTaskDuration(1.5);
      const data = metrics.getTaskDurationData();

      expect(data).toBeDefined();
      expect(data!.count).toBe(1);
      expect(data!.sum).toBe(1.5);
    });

    it('should accumulate observations', () => {
      metrics.observeTaskDuration(1.0);
      metrics.observeTaskDuration(2.0);
      metrics.observeTaskDuration(3.0);

      const data = metrics.getTaskDurationData();
      expect(data!.count).toBe(3);
      expect(data!.sum).toBe(6.0);
    });

    it('should populate bucket counts correctly', () => {
      // Add observations at different bucket boundaries
      metrics.observeTaskDuration(0.05); // <= 0.1
      metrics.observeTaskDuration(0.3); // <= 0.5 (> 0.25)
      metrics.observeTaskDuration(1.2); // <= 2.5 (> 1)
      metrics.observeTaskDuration(45); // <= 60 (> 30)

      const data = metrics.getTaskDurationData();
      expect(data!.count).toBe(4);

      // Buckets are stored as cumulative (Prometheus format)
      // buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 1800, 3600]
      // 0.05 fits in all buckets (>=0.1)
      // 0.3 fits in buckets 2+ (>=0.5)
      // 1.2 fits in buckets 4+ (>=2.5)
      // 45 fits in buckets 8+ (>=60)
      expect(data!.buckets[0]).toBe(1); // <= 0.1: only 0.05
      expect(data!.buckets[1]).toBe(1); // <= 0.25: only 0.05
      expect(data!.buckets[2]).toBe(2); // <= 0.5: 0.05 + 0.3
      expect(data!.buckets[3]).toBe(2); // <= 1: 0.05 + 0.3
      expect(data!.buckets[4]).toBe(3); // <= 2.5: 0.05 + 0.3 + 1.2
      expect(data!.buckets[8]).toBe(4); // <= 60: all 4 observations
    });

    it('should track with labels', () => {
      metrics.observeTaskDuration(1.0, { priority: 'high' });
      metrics.observeTaskDuration(5.0, { priority: 'low' });

      expect(metrics.getTaskDurationData({ priority: 'high' })!.sum).toBe(1.0);
      expect(metrics.getTaskDurationData({ priority: 'low' })!.sum).toBe(5.0);
    });
  });

  describe('agent_count gauge', () => {
    it('should start at zero', () => {
      expect(metrics.getAgentCount({ status: 'idle' })).toBe(0);
    });

    it('should set value', () => {
      metrics.setAgentCount(5, { status: 'idle' });
      expect(metrics.getAgentCount({ status: 'idle' })).toBe(5);
    });

    it('should track different statuses', () => {
      metrics.setAgentCount(3, { status: 'idle' });
      metrics.setAgentCount(2, { status: 'busy' });
      metrics.setAgentCount(1, { status: 'error' });

      expect(metrics.getAgentCount({ status: 'idle' })).toBe(3);
      expect(metrics.getAgentCount({ status: 'busy' })).toBe(2);
      expect(metrics.getAgentCount({ status: 'error' })).toBe(1);
    });
  });

  describe('memory_entries_total counter', () => {
    it('should start at zero', () => {
      expect(metrics.getMemoryEntriesTotal()).toBe(0);
    });

    it('should set value', () => {
      metrics.setMemoryEntriesTotal(1000);
      expect(metrics.getMemoryEntriesTotal()).toBe(1000);
    });

    it('should track with labels', () => {
      metrics.setMemoryEntriesTotal(500, { type: 'codebase_knowledge' });
      metrics.setMemoryEntriesTotal(300, { type: 'agent_learning' });

      expect(metrics.getMemoryEntriesTotal({ type: 'codebase_knowledge' })).toBe(500);
      expect(metrics.getMemoryEntriesTotal({ type: 'agent_learning' })).toBe(300);
    });
  });

  describe('Prometheus format export', () => {
    it('should include HELP and TYPE comments', () => {
      const output = metrics.toPrometheusFormat();

      expect(output).toContain('# HELP jetpack_uptime_seconds');
      expect(output).toContain('# TYPE jetpack_uptime_seconds gauge');
      expect(output).toContain('# HELP jetpack_tasks_total');
      expect(output).toContain('# TYPE jetpack_tasks_total counter');
      expect(output).toContain('# HELP jetpack_tasks_in_progress');
      expect(output).toContain('# TYPE jetpack_tasks_in_progress gauge');
    });

    it('should include uptime metric', () => {
      const output = metrics.toPrometheusFormat();
      expect(output).toMatch(/jetpack_uptime_seconds \d+\.\d+/);
    });

    it('should format counter values with labels', () => {
      metrics.incTasksTotal({ status: 'completed' }, 10);
      const output = metrics.toPrometheusFormat();

      expect(output).toContain('jetpack_tasks_total{status="completed"} 10');
    });

    it('should format gauge values', () => {
      metrics.setTasksInProgress(5);
      const output = metrics.toPrometheusFormat();

      expect(output).toContain('jetpack_tasks_in_progress 5');
    });

    it('should format histogram with buckets', () => {
      metrics.observeTaskDuration(1.5);
      const output = metrics.toPrometheusFormat();

      expect(output).toContain('jetpack_task_duration_seconds_bucket{le="0.1"} 0');
      expect(output).toContain('jetpack_task_duration_seconds_bucket{le="2.5"} 1');
      expect(output).toContain('jetpack_task_duration_seconds_bucket{le="+Inf"} 1');
      expect(output).toContain('jetpack_task_duration_seconds_sum 1.500000');
      expect(output).toContain('jetpack_task_duration_seconds_count 1');
    });

    it('should format histogram with labels', () => {
      metrics.observeTaskDuration(1.5, { priority: 'high' });
      const output = metrics.toPrometheusFormat();

      expect(output).toContain('jetpack_task_duration_seconds_bucket{priority="high",le="0.1"} 0');
      expect(output).toContain('jetpack_task_duration_seconds_bucket{priority="high",le="+Inf"} 1');
    });

    it('should sort labels alphabetically', () => {
      metrics.incTasksTotal({ status: 'completed', priority: 'high', agent: 'agent-1' });
      const output = metrics.toPrometheusFormat();

      // Labels should be in alphabetical order
      expect(output).toContain('jetpack_tasks_total{agent="agent-1",priority="high",status="completed"} 1');
    });
  });

  describe('OpenTelemetry format export', () => {
    it('should return valid structure', () => {
      const output = metrics.toOpenTelemetryFormat();

      expect(output.resourceMetrics).toBeDefined();
      expect(output.resourceMetrics.length).toBe(1);
      expect(output.resourceMetrics[0].resource.attributes).toBeDefined();
      expect(output.resourceMetrics[0].scopeMetrics).toBeDefined();
    });

    it('should include service name in resource', () => {
      const output = metrics.toOpenTelemetryFormat();
      const serviceAttr = output.resourceMetrics[0].resource.attributes.find(
        (a) => a.key === 'service.name'
      );

      expect(serviceAttr).toBeDefined();
      expect(serviceAttr!.value.stringValue).toBe('jetpack-orchestrator');
    });

    it('should include scope info', () => {
      const output = metrics.toOpenTelemetryFormat();
      const scope = output.resourceMetrics[0].scopeMetrics[0].scope;

      expect(scope.name).toBe('jetpack.metrics');
      expect(scope.version).toBe('1.0.0');
    });

    it('should include gauge metrics', () => {
      metrics.setTasksInProgress(5);
      const output = metrics.toOpenTelemetryFormat();

      const inProgressMetric = output.resourceMetrics[0].scopeMetrics[0].metrics.find(
        (m) => m.name === 'jetpack_tasks_in_progress'
      );

      expect(inProgressMetric).toBeDefined();
      expect(inProgressMetric!.gauge).toBeDefined();
      expect(inProgressMetric!.gauge!.dataPoints[0].asInt).toBe(5);
    });

    it('should include sum (counter) metrics', () => {
      metrics.incTasksTotal({ status: 'completed' }, 10);
      const output = metrics.toOpenTelemetryFormat();

      const tasksMetric = output.resourceMetrics[0].scopeMetrics[0].metrics.find(
        (m) => m.name === 'jetpack_tasks_total'
      );

      expect(tasksMetric).toBeDefined();
      expect(tasksMetric!.sum).toBeDefined();
      expect(tasksMetric!.sum!.isMonotonic).toBe(true);
      expect(tasksMetric!.sum!.aggregationTemporality).toBe(2); // CUMULATIVE
    });

    it('should include histogram metrics', () => {
      metrics.observeTaskDuration(1.5);
      metrics.observeTaskDuration(2.5);
      const output = metrics.toOpenTelemetryFormat();

      const histogramMetric = output.resourceMetrics[0].scopeMetrics[0].metrics.find(
        (m) => m.name === 'jetpack_task_duration_seconds'
      );

      expect(histogramMetric).toBeDefined();
      expect(histogramMetric!.histogram).toBeDefined();
      expect(histogramMetric!.histogram!.dataPoints[0].count).toBe(2);
      expect(histogramMetric!.histogram!.dataPoints[0].sum).toBe(4.0);
      expect(histogramMetric!.histogram!.dataPoints[0].explicitBounds.length).toBe(14);
    });

    it('should include attributes for labels', () => {
      metrics.incTasksTotal({ status: 'completed' });
      const output = metrics.toOpenTelemetryFormat();

      const tasksMetric = output.resourceMetrics[0].scopeMetrics[0].metrics.find(
        (m) => m.name === 'jetpack_tasks_total'
      );

      const attrs = tasksMetric!.sum!.dataPoints[0].attributes;
      expect(attrs.find((a) => a.key === 'status')?.value.stringValue).toBe('completed');
    });
  });

  describe('export method', () => {
    it('should export prometheus format by default', () => {
      const output = metrics.export();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should export prometheus format when specified', () => {
      const output = metrics.export('prometheus');
      expect(output).toContain('# HELP');
    });

    it('should export opentelemetry format when specified', () => {
      const output = metrics.export('opentelemetry');
      const parsed = JSON.parse(output);
      expect(parsed.resourceMetrics).toBeDefined();
    });
  });

  describe('collectFromOrchestrator', () => {
    it('should collect metrics from orchestrator status', async () => {
      const mockOrchestrator = {
        getStatus: async () => ({
          agents: [
            { name: 'agent-1', status: 'idle' },
            { name: 'agent-2', status: 'busy', currentTask: 'task-1' },
            { name: 'agent-3', status: 'busy', currentTask: 'task-2' },
          ],
          tasks: {
            total: 100,
            pending: 20,
            inProgress: 5,
            completed: 70,
            failed: 5,
          },
          memory: {
            total: 500,
            avgImportance: 0.7,
          },
        }),
      };

      await metrics.collectFromOrchestrator(mockOrchestrator);

      // Check task counters
      expect(metrics.getTasksTotal({ status: 'completed' })).toBe(70);
      expect(metrics.getTasksTotal({ status: 'failed' })).toBe(5);
      expect(metrics.getTasksTotal({ status: 'pending' })).toBe(20);

      // Check in-progress gauge
      expect(metrics.getTasksInProgress()).toBe(5);

      // Check agent counts
      expect(metrics.getAgentCount({ status: 'idle' })).toBe(1);
      expect(metrics.getAgentCount({ status: 'busy' })).toBe(2);

      // Check memory entries
      expect(metrics.getMemoryEntriesTotal()).toBe(500);
    });
  });
});
