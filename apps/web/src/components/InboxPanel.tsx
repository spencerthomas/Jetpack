'use client';

import { Message, Agent, MessageType } from '@jetpack/shared';
import { Mail, Send, Bell, AlertTriangle, CheckCircle, XCircle, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface InboxPanelProps {
  messages: Message[];
  agents: Agent[];
}

const messageTypeIcons: Record<MessageType, React.ReactNode> = {
  'task.created': <Bell className="w-4 h-4" />,
  'task.claimed': <Activity className="w-4 h-4" />,
  'task.updated': <Activity className="w-4 h-4" />,
  'task.completed': <CheckCircle className="w-4 h-4" />,
  'task.failed': <XCircle className="w-4 h-4" />,
  'agent.started': <Activity className="w-4 h-4" />,
  'agent.stopped': <Activity className="w-4 h-4" />,
  'agent.error': <AlertTriangle className="w-4 h-4" />,
  'file.lock': <Activity className="w-4 h-4" />,
  'file.unlock': <Activity className="w-4 h-4" />,
  'coordination.request': <Send className="w-4 h-4" />,
  'coordination.response': <Send className="w-4 h-4" />,
  'heartbeat': <Activity className="w-4 h-4" />,
};

const messageTypeColors: Record<MessageType, string> = {
  'task.created': 'bg-blue-100 text-blue-700',
  'task.claimed': 'bg-yellow-100 text-yellow-700',
  'task.updated': 'bg-gray-100 text-gray-700',
  'task.completed': 'bg-green-100 text-green-700',
  'task.failed': 'bg-red-100 text-red-700',
  'agent.started': 'bg-green-100 text-green-700',
  'agent.stopped': 'bg-gray-100 text-gray-700',
  'agent.error': 'bg-red-100 text-red-700',
  'file.lock': 'bg-purple-100 text-purple-700',
  'file.unlock': 'bg-purple-100 text-purple-700',
  'coordination.request': 'bg-indigo-100 text-indigo-700',
  'coordination.response': 'bg-indigo-100 text-indigo-700',
  'heartbeat': 'bg-gray-50 text-gray-500',
};

export default function InboxPanel({ messages, agents }: InboxPanelProps) {
  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || agentId;
  };

  const filteredMessages = messages.filter(msg => msg.type !== 'heartbeat');

  return (
    <div className="fixed right-0 top-16 w-96 h-[calc(100vh-64px)] border-l border-gray-200 bg-white shadow-lg overflow-y-auto z-10">
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary-600" />
          MCP Agent Mail Inbox
        </h2>
        <p className="text-xs text-gray-600 mt-1">
          Real-time agent communication
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {filteredMessages.map(message => {
          const timestamp = typeof message.timestamp === 'string'
            ? new Date(message.timestamp)
            : message.timestamp;

          return (
            <div
              key={message.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={clsx(
                  'p-2 rounded-lg flex-shrink-0',
                  messageTypeColors[message.type]
                )}>
                  {messageTypeIcons[message.type]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900">
                      {message.type.replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                      {formatDistanceToNow(timestamp, { addSuffix: true })}
                    </span>
                  </div>

                  <div className="text-xs text-gray-600 mb-2">
                    <span className="font-medium">{getAgentName(message.from)}</span>
                    {message.to && (
                      <span> → <span className="font-medium">{getAgentName(message.to)}</span></span>
                    )}
                  </div>

                  {Object.keys(message.payload).length > 0 && (
                    <div className="bg-gray-50 rounded p-2 text-xs font-mono overflow-x-auto">
                      {message.type === 'task.created' && (
                        <div>
                          <div className="text-gray-900 font-semibold mb-1">
                            {(message.payload as any).title}
                          </div>
                          {(message.payload as any).requiredSkills?.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {((message.payload as any).requiredSkills as string[]).map((skill: string) => (
                                <span key={skill} className="bg-white px-1.5 py-0.5 rounded text-xs">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {message.type === 'task.claimed' && (
                        <div>
                          <div className="text-gray-900">
                            <span className="font-semibold">{(message.payload as any).agentName}</span>
                            {' '}claimed{' '}
                            <span className="text-blue-600">{(message.payload as any).taskId}</span>
                          </div>
                        </div>
                      )}

                      {message.type === 'task.completed' && (
                        <div className="text-green-700">
                          Task <span className="font-semibold">{(message.payload as any).taskId}</span> completed!
                        </div>
                      )}

                      {message.type === 'task.failed' && (
                        <div className="text-red-700">
                          Task <span className="font-semibold">{(message.payload as any).taskId}</span> failed
                          {(message.payload as any).error && (
                            <div className="mt-1 text-xs">{(message.payload as any).error}</div>
                          )}
                        </div>
                      )}

                      {message.type === 'agent.started' && (
                        <div className="text-green-700">
                          Agent <span className="font-semibold">{(message.payload as any).name}</span> started
                          {(message.payload as any).skills?.length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-1">
                              {((message.payload as any).skills as string[]).map((skill: string) => (
                                <span key={skill} className="bg-white px-1.5 py-0.5 rounded text-xs">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {!['task.created', 'task.claimed', 'task.completed', 'task.failed', 'agent.started'].includes(message.type) && (
                        <pre className="text-gray-700 whitespace-pre-wrap break-all">
                          {JSON.stringify(message.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredMessages.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Agent communications will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
