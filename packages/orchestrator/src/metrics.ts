/**
 * Prometheus/OpenTelemetry compatible metrics for Jetpack orchestrator.
 *
 * Provides observability metrics including:
 * - tasks_total (counter) - Total number of tasks by status
 * - tasks_in_progress (gauge) - Number of currently in-progress tasks
 * - task_duration_seconds (histogram) - Task execution duration
 * - agent_count (gauge) - Number of agents by status
 * - memory_entries_total (counter) - Total number of memory entries
 *
 * Supports both Prometheus text format and OpenTelemetry JSON format.
 */

export type MetricFormat = 'prometheus' | 'opentelemetry';

/**
 * Label set for metrics
 */
export interface MetricLabels {
  [key: string]: string;
}

/**
 * Counter metric - only increases
 */
export interface CounterMetric {
  name: string;
  help: string;
  type: 'counter';
  values: Map<string, number>; // label hash -> value
  labels: Map<string, MetricLabels>; // label hash -> labels
}

/**
 * Gauge metric - can increase or decrease
 */
export interface GaugeMetric {
  name: string;
  help: string;
  type: 'gauge';
  values: Map<string, number>;
  labels: Map<string, MetricLabels>;
}

/**
 * Histogram bucket
 */
export interface HistogramBucket {
  le: number; // upper bound
  count: number;
}

/**
 * Histogram metric - tracks distribution of values
 */
export interface HistogramMetric {
  name: string;
  help: string;
  type: 'histogram';
  buckets: number[]; // bucket boundaries
  values: Map<string, HistogramData>; // label hash -> histogram data
  labels: Map<string, MetricLabels>;
}

export interface HistogramData {
  buckets: number[]; // counts per bucket
  sum: number;
  count: number;
}

export type Metric = CounterMetric | GaugeMetric | HistogramMetric;

/**
 * Generate a hash key from labels for storage
 */
function labelsToHash(labels: MetricLabels): string {
  if (Object.keys(labels).length === 0) {
    return '__default__';
  }
  const sorted = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return sorted || '__default__';
}

/**
 * Format labels for Prometheus output
 */
function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const formatted = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return `{${formatted}}`;
}

/**
 * Default histogram buckets for task duration (in seconds)
 * Covers from 100ms to 1 hour
 */
const DEFAULT_DURATION_BUCKETS = [
  0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 1800, 3600,
];

/**
 * JetpackMetrics - Singleton metrics registry for Jetpack
 *
 * Usage:
 * ```typescript
 * const metrics = JetpackMetrics.getInstance();
 * metrics.tasksTotal.inc({ status: 'completed' });
 * metrics.tasksInProgress.set(5);
 * metrics.taskDurationSeconds.observe(30.5, { priority: 'high' });
 * ```
 */
export class JetpackMetrics {
  private static instance: JetpackMetrics | null = null;

  // Defined metrics
  private _tasksTotal: CounterMetric;
  private _tasksInProgress: GaugeMetric;
  private _taskDurationSeconds: HistogramMetric;
  private _agentCount: GaugeMetric;
  private _memoryEntriesTotal: CounterMetric;

  // Timestamps for rate calculations
  private _startTime: number;

  private constructor() {
    this._startTime = Date.now();

    // Initialize all metrics
    this._tasksTotal = {
      name: 'jetpack_tasks_total',
      help: 'Total number of tasks by status',
      type: 'counter',
      values: new Map(),
      labels: new Map(),
    };

    this._tasksInProgress = {
      name: 'jetpack_tasks_in_progress',
      help: 'Number of currently in-progress tasks',
      type: 'gauge',
      values: new Map(),
      labels: new Map(),
    };

    this._taskDurationSeconds = {
      name: 'jetpack_task_duration_seconds',
      help: 'Task execution duration in seconds',
      type: 'histogram',
      buckets: DEFAULT_DURATION_BUCKETS,
      values: new Map(),
      labels: new Map(),
    };

    this._agentCount = {
      name: 'jetpack_agent_count',
      help: 'Number of agents by status',
      type: 'gauge',
      values: new Map(),
      labels: new Map(),
    };

    this._memoryEntriesTotal = {
      name: 'jetpack_memory_entries_total',
      help: 'Total number of memory entries in CASS',
      type: 'counter',
      values: new Map(),
      labels: new Map(),
    };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): JetpackMetrics {
    if (!JetpackMetrics.instance) {
      JetpackMetrics.instance = new JetpackMetrics();
    }
    return JetpackMetrics.instance;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  static reset(): void {
    JetpackMetrics.instance = null;
  }

  /**
   * Get uptime in seconds
   */
  getUptimeSeconds(): number {
    return (Date.now() - this._startTime) / 1000;
  }

  // ========== Counter: tasks_total ==========

  /**
   * Increment the tasks_total counter
   * @param labels - Status label (required), optional additional labels
   * @param value - Amount to increment (default: 1)
   */
  incTasksTotal(labels: { status: string } & MetricLabels, value: number = 1): void {
    const hash = labelsToHash(labels);
    const current = this._tasksTotal.values.get(hash) || 0;
    this._tasksTotal.values.set(hash, current + value);
    this._tasksTotal.labels.set(hash, labels);
  }

  /**
   * Get the current value of tasks_total for given labels
   */
  getTasksTotal(labels: { status: string } & MetricLabels): number {
    const hash = labelsToHash(labels);
    return this._tasksTotal.values.get(hash) || 0;
  }

  // ========== Gauge: tasks_in_progress ==========

  /**
   * Set the tasks_in_progress gauge
   * @param value - Current number of in-progress tasks
   * @param labels - Optional labels (e.g., priority)
   */
  setTasksInProgress(value: number, labels: MetricLabels = {}): void {
    const hash = labelsToHash(labels);
    this._tasksInProgress.values.set(hash, value);
    this._tasksInProgress.labels.set(hash, labels);
  }

  /**
   * Increment tasks_in_progress
   */
  incTasksInProgress(labels: MetricLabels = {}): void {
    const hash = labelsToHash(labels);
    const current = this._tasksInProgress.values.get(hash) || 0;
    this._tasksInProgress.values.set(hash, current + 1);
    this._tasksInProgress.labels.set(hash, labels);
  }

  /**
   * Decrement tasks_in_progress
   */
  decTasksInProgress(labels: MetricLabels = {}): void {
    const hash = labelsToHash(labels);
    const current = this._tasksInProgress.values.get(hash) || 0;
    this._tasksInProgress.values.set(hash, Math.max(0, current - 1));
    this._tasksInProgress.labels.set(hash, labels);
  }

  /**
   * Get the current value of tasks_in_progress
   */
  getTasksInProgress(labels: MetricLabels = {}): number {
    const hash = labelsToHash(labels);
    return this._tasksInProgress.values.get(hash) || 0;
  }

  // ========== Histogram: task_duration_seconds ==========

  /**
   * Record a task duration observation
   * @param durationSeconds - Duration in seconds
   * @param labels - Optional labels (e.g., priority, skill)
   */
  observeTaskDuration(durationSeconds: number, labels: MetricLabels = {}): void {
    const hash = labelsToHash(labels);

    let data = this._taskDurationSeconds.values.get(hash);
    if (!data) {
      data = {
        buckets: new Array(this._taskDurationSeconds.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this._taskDurationSeconds.values.set(hash, data);
      this._taskDurationSeconds.labels.set(hash, labels);
    }

    // Update histogram
    data.sum += durationSeconds;
    data.count += 1;

    // Update bucket counts
    for (let i = 0; i < this._taskDurationSeconds.buckets.length; i++) {
      if (durationSeconds <= this._taskDurationSeconds.buckets[i]) {
        data.buckets[i]++;
      }
    }
  }

  /**
   * Get histogram data for given labels
   */
  getTaskDurationData(labels: MetricLabels = {}): HistogramData | undefined {
    const hash = labelsToHash(labels);
    return this._taskDurationSeconds.values.get(hash);
  }

  // ========== Gauge: agent_count ==========

  /**
   * Set the agent count gauge
   * @param value - Current number of agents
   * @param labels - Status label and optional additional labels
   */
  setAgentCount(value: number, labels: { status: string } & MetricLabels): void {
    const hash = labelsToHash(labels);
    this._agentCount.values.set(hash, value);
    this._agentCount.labels.set(hash, labels);
  }

  /**
   * Get the current agent count for given labels
   */
  getAgentCount(labels: { status: string } & MetricLabels): number {
    const hash = labelsToHash(labels);
    return this._agentCount.values.get(hash) || 0;
  }

  // ========== Counter: memory_entries_total ==========

  /**
   * Set the memory entries total (absolute value since it's from DB query)
   * @param value - Current total memory entries
   * @param labels - Optional labels (e.g., type)
   */
  setMemoryEntriesTotal(value: number, labels: MetricLabels = {}): void {
    const hash = labelsToHash(labels);
    this._memoryEntriesTotal.values.set(hash, value);
    this._memoryEntriesTotal.labels.set(hash, labels);
  }

  /**
   * Get the current memory entries total
   */
  getMemoryEntriesTotal(labels: MetricLabels = {}): number {
    const hash = labelsToHash(labels);
    return this._memoryEntriesTotal.values.get(hash) || 0;
  }

  // ========== Export Methods ==========

  /**
   * Export all metrics in Prometheus text format
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // Add uptime metric
    lines.push('# HELP jetpack_uptime_seconds Time since metrics were initialized');
    lines.push('# TYPE jetpack_uptime_seconds gauge');
    lines.push(`jetpack_uptime_seconds ${this.getUptimeSeconds().toFixed(3)}`);
    lines.push('');

    // tasks_total (counter)
    lines.push(`# HELP ${this._tasksTotal.name} ${this._tasksTotal.help}`);
    lines.push(`# TYPE ${this._tasksTotal.name} counter`);
    for (const [hash, value] of this._tasksTotal.values) {
      const labels = this._tasksTotal.labels.get(hash) || {};
      lines.push(`${this._tasksTotal.name}${formatLabels(labels)} ${value}`);
    }
    lines.push('');

    // tasks_in_progress (gauge)
    lines.push(`# HELP ${this._tasksInProgress.name} ${this._tasksInProgress.help}`);
    lines.push(`# TYPE ${this._tasksInProgress.name} gauge`);
    for (const [hash, value] of this._tasksInProgress.values) {
      const labels = this._tasksInProgress.labels.get(hash) || {};
      lines.push(`${this._tasksInProgress.name}${formatLabels(labels)} ${value}`);
    }
    lines.push('');

    // task_duration_seconds (histogram)
    lines.push(`# HELP ${this._taskDurationSeconds.name} ${this._taskDurationSeconds.help}`);
    lines.push(`# TYPE ${this._taskDurationSeconds.name} histogram`);
    for (const [hash, data] of this._taskDurationSeconds.values) {
      const labels = this._taskDurationSeconds.labels.get(hash) || {};
      const baseLabels = formatLabels(labels);
      const baseName = this._taskDurationSeconds.name;

      // Output bucket values (cumulative)
      let cumulative = 0;
      for (let i = 0; i < this._taskDurationSeconds.buckets.length; i++) {
        cumulative += data.buckets[i];
        const le = this._taskDurationSeconds.buckets[i];
        const bucketLabels = Object.keys(labels).length > 0
          ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')},le="${le}"}`
          : `{le="${le}"}`;
        lines.push(`${baseName}_bucket${bucketLabels} ${cumulative}`);
      }

      // +Inf bucket
      const infLabels = Object.keys(labels).length > 0
        ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')},le="+Inf"}`
        : `{le="+Inf"}`;
      lines.push(`${baseName}_bucket${infLabels} ${data.count}`);

      // Sum and count
      lines.push(`${baseName}_sum${baseLabels} ${data.sum.toFixed(6)}`);
      lines.push(`${baseName}_count${baseLabels} ${data.count}`);
    }
    lines.push('');

    // agent_count (gauge)
    lines.push(`# HELP ${this._agentCount.name} ${this._agentCount.help}`);
    lines.push(`# TYPE ${this._agentCount.name} gauge`);
    for (const [hash, value] of this._agentCount.values) {
      const labels = this._agentCount.labels.get(hash) || {};
      lines.push(`${this._agentCount.name}${formatLabels(labels)} ${value}`);
    }
    lines.push('');

    // memory_entries_total (counter)
    lines.push(`# HELP ${this._memoryEntriesTotal.name} ${this._memoryEntriesTotal.help}`);
    lines.push(`# TYPE ${this._memoryEntriesTotal.name} counter`);
    for (const [hash, value] of this._memoryEntriesTotal.values) {
      const labels = this._memoryEntriesTotal.labels.get(hash) || {};
      lines.push(`${this._memoryEntriesTotal.name}${formatLabels(labels)} ${value}`);
    }

    return lines.join('\n');
  }

  /**
   * Export all metrics in OpenTelemetry JSON format
   */
  toOpenTelemetryFormat(): OpenTelemetryMetrics {
    const metrics: OpenTelemetryMetric[] = [];
    const now = Date.now() * 1_000_000; // Convert to nanoseconds

    // Uptime
    metrics.push({
      name: 'jetpack_uptime_seconds',
      description: 'Time since metrics were initialized',
      unit: 's',
      gauge: {
        dataPoints: [{
          timeUnixNano: now,
          asDouble: this.getUptimeSeconds(),
          attributes: [],
        }],
      },
    });

    // tasks_total
    const tasksDataPoints: OTELDataPoint[] = [];
    for (const [hash, value] of this._tasksTotal.values) {
      const labels = this._tasksTotal.labels.get(hash) || {};
      tasksDataPoints.push({
        timeUnixNano: now,
        asInt: value,
        attributes: Object.entries(labels).map(([key, value]) => ({
          key,
          value: { stringValue: value },
        })),
      });
    }
    if (tasksDataPoints.length > 0) {
      metrics.push({
        name: this._tasksTotal.name,
        description: this._tasksTotal.help,
        unit: '1',
        sum: {
          dataPoints: tasksDataPoints,
          aggregationTemporality: 2, // AGGREGATION_TEMPORALITY_CUMULATIVE
          isMonotonic: true,
        },
      });
    }

    // tasks_in_progress
    const inProgressDataPoints: OTELDataPoint[] = [];
    for (const [hash, value] of this._tasksInProgress.values) {
      const labels = this._tasksInProgress.labels.get(hash) || {};
      inProgressDataPoints.push({
        timeUnixNano: now,
        asInt: value,
        attributes: Object.entries(labels).map(([key, value]) => ({
          key,
          value: { stringValue: value },
        })),
      });
    }
    if (inProgressDataPoints.length > 0) {
      metrics.push({
        name: this._tasksInProgress.name,
        description: this._tasksInProgress.help,
        unit: '1',
        gauge: {
          dataPoints: inProgressDataPoints,
        },
      });
    }

    // task_duration_seconds (histogram)
    const histogramDataPoints: OTELHistogramDataPoint[] = [];
    for (const [hash, data] of this._taskDurationSeconds.values) {
      const labels = this._taskDurationSeconds.labels.get(hash) || {};
      histogramDataPoints.push({
        timeUnixNano: now,
        count: data.count,
        sum: data.sum,
        bucketCounts: data.buckets,
        explicitBounds: this._taskDurationSeconds.buckets,
        attributes: Object.entries(labels).map(([key, value]) => ({
          key,
          value: { stringValue: value },
        })),
      });
    }
    if (histogramDataPoints.length > 0) {
      metrics.push({
        name: this._taskDurationSeconds.name,
        description: this._taskDurationSeconds.help,
        unit: 's',
        histogram: {
          dataPoints: histogramDataPoints,
          aggregationTemporality: 2,
        },
      });
    }

    // agent_count
    const agentDataPoints: OTELDataPoint[] = [];
    for (const [hash, value] of this._agentCount.values) {
      const labels = this._agentCount.labels.get(hash) || {};
      agentDataPoints.push({
        timeUnixNano: now,
        asInt: value,
        attributes: Object.entries(labels).map(([key, value]) => ({
          key,
          value: { stringValue: value },
        })),
      });
    }
    if (agentDataPoints.length > 0) {
      metrics.push({
        name: this._agentCount.name,
        description: this._agentCount.help,
        unit: '1',
        gauge: {
          dataPoints: agentDataPoints,
        },
      });
    }

    // memory_entries_total
    const memoryDataPoints: OTELDataPoint[] = [];
    for (const [hash, value] of this._memoryEntriesTotal.values) {
      const labels = this._memoryEntriesTotal.labels.get(hash) || {};
      memoryDataPoints.push({
        timeUnixNano: now,
        asInt: value,
        attributes: Object.entries(labels).map(([key, value]) => ({
          key,
          value: { stringValue: value },
        })),
      });
    }
    if (memoryDataPoints.length > 0) {
      metrics.push({
        name: this._memoryEntriesTotal.name,
        description: this._memoryEntriesTotal.help,
        unit: '1',
        sum: {
          dataPoints: memoryDataPoints,
          aggregationTemporality: 2,
          isMonotonic: true,
        },
      });
    }

    return {
      resourceMetrics: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'jetpack-orchestrator' } },
            { key: 'service.version', value: { stringValue: '1.0.0' } },
          ],
        },
        scopeMetrics: [{
          scope: {
            name: 'jetpack.metrics',
            version: '1.0.0',
          },
          metrics,
        }],
      }],
    };
  }

  /**
   * Export metrics in the specified format
   */
  export(format: MetricFormat = 'prometheus'): string {
    if (format === 'opentelemetry') {
      return JSON.stringify(this.toOpenTelemetryFormat(), null, 2);
    }
    return this.toPrometheusFormat();
  }

  /**
   * Collect metrics from a JetpackOrchestrator instance
   * This refreshes all metrics from the current orchestrator state
   */
  async collectFromOrchestrator(orchestrator: {
    getStatus(): Promise<{
      agents: Array<{ name: string; status: string; currentTask?: string }>;
      tasks: {
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
        failed: number;
      };
      memory: {
        total: number;
        avgImportance: number;
      };
    }>;
  }): Promise<void> {
    const status = await orchestrator.getStatus();

    // Update task counters
    this._tasksTotal.values.set(labelsToHash({ status: 'completed' }), status.tasks.completed);
    this._tasksTotal.labels.set(labelsToHash({ status: 'completed' }), { status: 'completed' });

    this._tasksTotal.values.set(labelsToHash({ status: 'failed' }), status.tasks.failed);
    this._tasksTotal.labels.set(labelsToHash({ status: 'failed' }), { status: 'failed' });

    this._tasksTotal.values.set(labelsToHash({ status: 'pending' }), status.tasks.pending);
    this._tasksTotal.labels.set(labelsToHash({ status: 'pending' }), { status: 'pending' });

    // Update tasks in progress gauge
    this.setTasksInProgress(status.tasks.inProgress);

    // Update agent counts by status
    const agentsByStatus = new Map<string, number>();
    for (const agent of status.agents) {
      const count = agentsByStatus.get(agent.status) || 0;
      agentsByStatus.set(agent.status, count + 1);
    }
    for (const [agentStatus, count] of agentsByStatus) {
      this.setAgentCount(count, { status: agentStatus });
    }

    // Update memory entries
    this.setMemoryEntriesTotal(status.memory.total);
  }
}

// ========== OpenTelemetry Types ==========

export interface OTELAttribute {
  key: string;
  value: { stringValue?: string; intValue?: number; doubleValue?: number };
}

export interface OTELDataPoint {
  timeUnixNano: number;
  asInt?: number;
  asDouble?: number;
  attributes: OTELAttribute[];
}

export interface OTELHistogramDataPoint {
  timeUnixNano: number;
  count: number;
  sum: number;
  bucketCounts: number[];
  explicitBounds: number[];
  attributes: OTELAttribute[];
}

export interface OpenTelemetryMetric {
  name: string;
  description: string;
  unit: string;
  gauge?: {
    dataPoints: OTELDataPoint[];
  };
  sum?: {
    dataPoints: OTELDataPoint[];
    aggregationTemporality: number;
    isMonotonic: boolean;
  };
  histogram?: {
    dataPoints: OTELHistogramDataPoint[];
    aggregationTemporality: number;
  };
}

export interface OpenTelemetryMetrics {
  resourceMetrics: Array<{
    resource: {
      attributes: OTELAttribute[];
    };
    scopeMetrics: Array<{
      scope: {
        name: string;
        version: string;
      };
      metrics: OpenTelemetryMetric[];
    }>;
  }>;
}

/**
 * Convenience function to get the metrics instance
 */
export function getMetrics(): JetpackMetrics {
  return JetpackMetrics.getInstance();
}
