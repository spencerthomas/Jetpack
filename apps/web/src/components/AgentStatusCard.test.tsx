import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentStatusCard, type AgentStatusData } from './AgentStatusCard';

// Helper to create test agent data
function createMockAgent(overrides: Partial<AgentStatusData> = {}): AgentStatusData {
  return {
    id: 'agent-123',
    name: 'test-agent',
    status: 'idle',
    skills: ['typescript', 'react'],
    currentTask: null,
    tasksCompleted: 5,
    lastHeartbeat: new Date().toISOString(),
    startedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    ...overrides,
  };
}

describe('AgentStatusCard', () => {
  describe('rendering', () => {
    it('should render agent name', () => {
      const agent = createMockAgent({ name: 'my-test-agent' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('my-test-agent')).toBeInTheDocument();
    });

    it('should render agent skills', () => {
      const agent = createMockAgent({ skills: ['typescript', 'react', 'backend'] });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('typescript')).toBeInTheDocument();
      expect(screen.getByText('react')).toBeInTheDocument();
      expect(screen.getByText('backend')).toBeInTheDocument();
    });

    it('should truncate skills beyond 5 and show count', () => {
      const agent = createMockAgent({
        skills: ['typescript', 'react', 'backend', 'python', 'rust', 'go', 'java'],
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('typescript')).toBeInTheDocument();
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('should render tasks completed count', () => {
      const agent = createMockAgent({ tasksCompleted: 42 });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should show Idle status correctly', () => {
      const agent = createMockAgent({ status: 'idle' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('should show Working status for busy agents', () => {
      const agent = createMockAgent({ status: 'busy' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Working')).toBeInTheDocument();
    });

    it('should show Error status correctly', () => {
      const agent = createMockAgent({ status: 'error' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Agent encountered an error')).toBeInTheDocument();
    });

    it('should show Offline status correctly', () => {
      const agent = createMockAgent({ status: 'offline' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  describe('current task display', () => {
    it('should show current task when agent is working', () => {
      const agent = createMockAgent({
        status: 'busy',
        currentTask: 'bd-abc123',
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Working on')).toBeInTheDocument();
      expect(screen.getByText('bd-abc123')).toBeInTheDocument();
    });

    it('should show current phase when available', () => {
      const agent = createMockAgent({
        status: 'busy',
        currentTask: 'bd-abc123',
        currentPhase: 'executing tests',
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('executing tests')).toBeInTheDocument();
    });

    it('should show task progress when available', () => {
      const agent = createMockAgent({
        status: 'busy',
        currentTask: 'bd-abc123',
        taskProgress: 75,
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should not show current task section when not working', () => {
      const agent = createMockAgent({ status: 'idle', currentTask: null });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.queryByText('Working on')).not.toBeInTheDocument();
    });
  });

  describe('health status', () => {
    it('should show healthy status', () => {
      const agent = createMockAgent({ healthStatus: 'healthy' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    it('should show warning status', () => {
      const agent = createMockAgent({ healthStatus: 'warning' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('should show critical status', () => {
      const agent = createMockAgent({ healthStatus: 'critical' });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  describe('memory usage', () => {
    it('should show memory usage when available', () => {
      const agent = createMockAgent({ memoryUsage: 256 });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('256MB')).toBeInTheDocument();
      expect(screen.getByText('Memory')).toBeInTheDocument();
    });

    it('should not show memory section when not available', () => {
      const agent = createMockAgent({ memoryUsage: undefined });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.queryByText('Memory')).not.toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should call onClick when clicked', () => {
      const onClick = vi.fn();
      const agent = createMockAgent();
      render(<AgentStatusCard agent={agent} onClick={onClick} />);

      fireEvent.click(screen.getByText('test-agent'));
      expect(onClick).toHaveBeenCalled();
    });

    it('should apply selected styles when isSelected is true', () => {
      const agent = createMockAgent();
      const { container } = render(<AgentStatusCard agent={agent} isSelected={true} />);

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('border-[rgb(79,255,238)]');
    });
  });

  describe('compact mode', () => {
    it('should render compact version', () => {
      const agent = createMockAgent({ name: 'compact-agent' });
      render(<AgentStatusCard agent={agent} compact={true} />);

      expect(screen.getByText('compact-agent')).toBeInTheDocument();
      // Compact mode should not show extended details
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
      expect(screen.queryByText('Uptime')).not.toBeInTheDocument();
    });

    it('should show task count in compact mode', () => {
      const agent = createMockAgent({ tasksCompleted: 15 });
      render(<AgentStatusCard agent={agent} compact={true} />);

      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  describe('uptime formatting', () => {
    it('should format uptime for minutes', () => {
      const agent = createMockAgent({
        startedAt: new Date(Date.now() - 30 * 60000).toISOString(), // 30 minutes ago
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('30m')).toBeInTheDocument();
    });

    it('should format uptime for hours', () => {
      const agent = createMockAgent({
        startedAt: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('2h 0m')).toBeInTheDocument();
    });
  });

  describe('last activity formatting', () => {
    it('should show "just now" for very recent activity', () => {
      const agent = createMockAgent({
        lastHeartbeat: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('just now')).toBeInTheDocument();
    });

    it('should show seconds for recent activity', () => {
      const agent = createMockAgent({
        lastHeartbeat: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('30s ago')).toBeInTheDocument();
    });

    it('should show minutes for older activity', () => {
      const agent = createMockAgent({
        lastHeartbeat: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
      });
      render(<AgentStatusCard agent={agent} />);

      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });
  });
});
