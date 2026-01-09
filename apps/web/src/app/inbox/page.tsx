'use client';

import { useEffect, useState } from 'react';
import { Message, Agent } from '@jetpack/shared';
import { Mail, Archive, Trash2, RefreshCw } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { formatDistanceToNow } from 'date-fns';

// Helper to format message type for display
const formatMessageType = (type: string) => {
  return type.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
};

// Helper to get a summary from payload
const getPayloadSummary = (payload: Record<string, unknown>): string => {
  if (payload.taskId) return `Task: ${payload.taskId}`;
  if (payload.message) return String(payload.message).slice(0, 60);
  if (payload.error) return `Error: ${String(payload.error).slice(0, 50)}`;
  return JSON.stringify(payload).slice(0, 60);
};

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [messagesRes, agentsRes] = await Promise.all([
          fetch('/api/messages'),
          fetch('/api/agents'),
        ]);

        const messagesData = await messagesRes.json();
        const agentsData = await agentsRes.json();

        setMessages(messagesData.messages || []);
        setAgents(agentsData.agents || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || agentId;
  };

  const getAgentInitial = (agentId: string) => {
    const name = getAgentName(agentId);
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-purple border-t-transparent mx-auto"></div>
          <p className="mt-3 text-sm text-secondary">Loading inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-subtle shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-primary">Inbox</h1>
          {messages.length > 0 && (
            <Badge variant="primary" size="sm">{messages.length}</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Message List */}
        <div className="w-96 border-r border-subtle overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Mail className="w-12 h-12 text-muted mb-3" />
              <p className="text-secondary font-medium">No messages</p>
              <p className="text-sm text-muted mt-1">
                Messages from agents will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {messages.map((message) => (
                <button
                  key={message.id}
                  onClick={() => setSelectedMessage(message)}
                  className={`
                    w-full text-left p-4 hover:bg-hover transition-colors
                    ${selectedMessage?.id === message.id ? 'bg-hover' : ''}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent-purple/20 text-accent-purple flex items-center justify-center text-sm font-medium shrink-0">
                      {getAgentInitial(message.from)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-primary truncate">
                          {getAgentName(message.from)}
                        </span>
                        <span className="text-2xs text-muted shrink-0">
                          {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-secondary truncate mt-0.5">
                        {formatMessageType(message.type)}
                      </p>
                      <p className="text-xs text-muted truncate mt-1">
                        {getPayloadSummary(message.payload)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedMessage ? (
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-purple/20 text-accent-purple flex items-center justify-center font-medium">
                    {getAgentInitial(selectedMessage.from)}
                  </div>
                  <div>
                    <h2 className="font-semibold text-primary">
                      {getAgentName(selectedMessage.from)}
                    </h2>
                    <p className="text-sm text-muted">
                      {formatDistanceToNow(new Date(selectedMessage.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">
                    <Archive className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <h3 className="text-lg font-medium text-primary mb-4">
                {formatMessageType(selectedMessage.type)}
              </h3>

              <div className="p-4 rounded-lg bg-surface border border-subtle">
                <h4 className="text-sm font-medium text-secondary mb-2">Payload</h4>
                <pre className="text-sm text-primary font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedMessage.payload, null, 2)}
                </pre>
              </div>

              {selectedMessage.correlationId && (
                <div className="mt-4 text-sm">
                  <span className="text-muted">Correlation ID: </span>
                  <code className="text-secondary font-mono">{selectedMessage.correlationId}</code>
                </div>
              )}

              {selectedMessage.to && (
                <div className="mt-2 text-sm">
                  <span className="text-muted">To: </span>
                  <span className="text-secondary">{getAgentName(selectedMessage.to)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Mail className="w-16 h-16 text-muted mb-4" />
              <p className="text-secondary font-medium">Select a message</p>
              <p className="text-sm text-muted mt-1">
                Choose a message from the list to view its contents
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
