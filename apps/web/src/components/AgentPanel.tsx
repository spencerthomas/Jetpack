'use client';

import { Agent } from '@jetpack-agent/shared';
import { Bot, Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface AgentPanelProps {
  agents: Agent[];
}

const statusColors = {
  idle: 'bg-gray-500',
  busy: 'bg-green-500',
  error: 'bg-red-500',
  offline: 'bg-gray-300',
};

const statusLabels = {
  idle: 'Idle',
  busy: 'Busy',
  error: 'Error',
  offline: 'Offline',
};

export default function AgentPanel({ agents }: AgentPanelProps) {
  return (
    <div className="w-64 border-l border-gray-200 bg-white overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary-600" />
          Agents ({agents.length})
        </h2>
      </div>

      <div className="divide-y divide-gray-100">
        {agents.map(agent => {
          const lastActive = typeof agent.lastActive === 'string'
            ? new Date(agent.lastActive)
            : agent.lastActive;

          return (
            <div key={agent.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Circle
                      className={clsx(
                        'w-2 h-2 rounded-full',
                        statusColors[agent.status],
                        agent.status === 'busy' && 'animate-pulse'
                      )}
                    />
                    <span className="font-medium text-sm text-gray-900">{agent.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">{statusLabels[agent.status]}</p>
                </div>
              </div>

              {agent.currentTask && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                  <p className="text-gray-600 mb-1">Working on:</p>
                  <p className="font-mono text-blue-700">{agent.currentTask}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1">
                {agent.skills.map(skill => (
                  <span
                    key={skill}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-2 text-xs text-gray-400">
                Active {formatDistanceToNow(lastActive, { addSuffix: true })}
              </div>
            </div>
          );
        })}

        {agents.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No agents running</p>
            <p className="text-xs mt-1">Start agents with the CLI</p>
          </div>
        )}
      </div>
    </div>
  );
}
