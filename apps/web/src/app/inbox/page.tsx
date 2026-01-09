'use client';

import { useEffect, useState, useMemo } from 'react';
import { Message, Agent } from '@jetpack/shared';
import {
  Mail,
  Archive,
  Trash2,
  Search,
  Inbox,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Bell,
  Clock,
  MoreVertical,
  Reply,
  ReplyAll,
  Forward,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { formatDistanceToNow, format } from 'date-fns';

type MessageCategory = 'all' | 'unread' | 'task' | 'agent' | 'coordination';

// Message type icons
const getMessageIcon = (type: string) => {
  if (type.startsWith('task.completed')) return <CheckCircle2 className="w-4 h-4 text-accent-green" />;
  if (type.startsWith('task.failed')) return <XCircle className="w-4 h-4 text-accent-red" />;
  if (type.startsWith('task.')) return <Bell className="w-4 h-4 text-accent-blue" />;
  if (type.startsWith('agent.error')) return <AlertTriangle className="w-4 h-4 text-accent-red" />;
  if (type.startsWith('agent.')) return <Activity className="w-4 h-4 text-accent-green" />;
  if (type.startsWith('coordination.')) return <Send className="w-4 h-4 text-accent-purple" />;
  return <Mail className="w-4 h-4 text-secondary" />;
};

// Get label/badge color based on message type
const getMessageBadge = (type: string): { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'primary' | 'info' } | null => {
  if (type === 'task.completed') return { label: 'Completed', variant: 'success' };
  if (type === 'task.failed') return { label: 'Failed', variant: 'error' };
  if (type === 'task.claimed') return { label: 'Claimed', variant: 'warning' };
  if (type === 'task.created') return { label: 'New Task', variant: 'primary' };
  if (type === 'agent.started') return { label: 'Started', variant: 'success' };
  if (type === 'agent.error') return { label: 'Error', variant: 'error' };
  return null;
};

// Helper to format message type for display
const formatMessageType = (type: string) => {
  return type.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
};

// Helper to get a summary from payload
const getPayloadSummary = (payload: Record<string, unknown>): string => {
  if (payload.title) return String(payload.title);
  if (payload.taskId) return `Task: ${payload.taskId}`;
  if (payload.message) return String(payload.message).slice(0, 100);
  if (payload.error) return `Error: ${String(payload.error).slice(0, 80)}`;
  if (payload.name) return String(payload.name);
  return JSON.stringify(payload).slice(0, 100);
};

// Navigation categories
const categories: { id: MessageCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All Mail', icon: <Inbox className="w-4 h-4" /> },
  { id: 'unread', label: 'Unread', icon: <Mail className="w-4 h-4" /> },
  { id: 'task', label: 'Tasks', icon: <Bell className="w-4 h-4" /> },
  { id: 'agent', label: 'Agents', icon: <Activity className="w-4 h-4" /> },
  { id: 'coordination', label: 'Coordination', icon: <Send className="w-4 h-4" /> },
];

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MessageCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());

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

  // Mark message as read when selected
  useEffect(() => {
    if (selectedMessage) {
      setReadMessages(prev => new Set(prev).add(selectedMessage.id));
    }
  }, [selectedMessage]);

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || agentId;
  };

  const getAgentInitial = (agentId: string) => {
    const name = getAgentName(agentId);
    return name.charAt(0).toUpperCase();
  };

  // Filter messages
  const filteredMessages = useMemo(() => {
    let filtered = messages.filter(msg => msg.type !== 'heartbeat');

    // Category filter
    if (selectedCategory === 'unread') {
      filtered = filtered.filter(msg => !readMessages.has(msg.id));
    } else if (selectedCategory === 'task') {
      filtered = filtered.filter(msg => msg.type.startsWith('task.'));
    } else if (selectedCategory === 'agent') {
      filtered = filtered.filter(msg => msg.type.startsWith('agent.'));
    } else if (selectedCategory === 'coordination') {
      filtered = filtered.filter(msg => msg.type.startsWith('coordination.') || msg.type.startsWith('file.'));
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(msg => {
        const agentName = getAgentName(msg.from).toLowerCase();
        const type = msg.type.toLowerCase();
        const summary = getPayloadSummary(msg.payload).toLowerCase();
        return agentName.includes(query) || type.includes(query) || summary.includes(query);
      });
    }

    return filtered;
  }, [messages, selectedCategory, searchQuery, readMessages, agents]);

  // Count unread messages per category
  const unreadCount = useMemo(() => {
    const nonHeartbeat = messages.filter(m => m.type !== 'heartbeat');
    return nonHeartbeat.filter(m => !readMessages.has(m.id)).length;
  }, [messages, readMessages]);

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
    <div className="flex h-full bg-base">
      {/* Left Sidebar - Categories */}
      <div className="w-56 border-r border-subtle flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-subtle">
          <h1 className="text-lg font-semibold text-primary">Inbox</h1>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {categories.map((category) => {
            const isActive = selectedCategory === category.id;
            const count = category.id === 'unread' ? unreadCount :
                         category.id === 'all' ? messages.filter(m => m.type !== 'heartbeat').length :
                         messages.filter(m => m.type !== 'heartbeat' && m.type.startsWith(category.id + '.')).length;

            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`
                  w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm
                  transition-colors duration-150
                  ${isActive
                    ? 'bg-accent-purple/10 text-accent-purple'
                    : 'text-secondary hover:bg-hover hover:text-primary'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {category.icon}
                  <span>{category.label}</span>
                </div>
                {count > 0 && (
                  <span className={`
                    text-xs font-medium px-1.5 py-0.5 rounded
                    ${isActive ? 'bg-accent-purple/20' : 'bg-hover'}
                  `}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Categories section */}
        <div className="p-4 border-t border-subtle">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Labels</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-secondary">
              <div className="w-2 h-2 rounded-full bg-accent-green"></div>
              <span>Success</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-secondary">
              <div className="w-2 h-2 rounded-full bg-accent-red"></div>
              <span>Errors</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-secondary">
              <div className="w-2 h-2 rounded-full bg-accent-yellow"></div>
              <span>In Progress</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Panel - Message List */}
      <div className="w-96 border-r border-subtle flex flex-col shrink-0">
        {/* Search Header */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-subtle">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-hover border border-subtle rounded-md text-sm text-primary placeholder:text-muted focus:border-accent-purple focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-subtle">
          <button className="px-3 py-1 text-xs font-medium rounded bg-hover text-primary">
            All
          </button>
          <button className="px-3 py-1 text-xs font-medium rounded text-muted hover:text-secondary hover:bg-hover transition-colors">
            Unread
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Mail className="w-12 h-12 text-muted mb-3" />
              <p className="text-secondary font-medium">No messages</p>
              <p className="text-sm text-muted mt-1">
                {searchQuery ? 'Try a different search' : 'Messages from agents will appear here'}
              </p>
            </div>
          ) : (
            <div>
              {filteredMessages.map((message) => {
                const isSelected = selectedMessage?.id === message.id;
                const isRead = readMessages.has(message.id);
                const badge = getMessageBadge(message.type);

                return (
                  <button
                    key={message.id}
                    onClick={() => setSelectedMessage(message)}
                    className={`
                      w-full text-left p-4 border-b border-subtle transition-colors
                      ${isSelected ? 'bg-hover' : 'hover:bg-hover/50'}
                      ${!isRead ? 'bg-accent-purple/5' : ''}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0
                        ${!isRead ? 'bg-accent-purple text-white' : 'bg-hover text-secondary'}
                      `}>
                        {getAgentInitial(message.from)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`font-medium truncate ${!isRead ? 'text-primary' : 'text-secondary'}`}>
                            {getAgentName(message.from)}
                          </span>
                          <span className="text-2xs text-muted shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: false })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          {getMessageIcon(message.type)}
                          <span className={`text-sm truncate ${!isRead ? 'text-primary' : 'text-secondary'}`}>
                            {formatMessageType(message.type)}
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate">
                          {getPayloadSummary(message.payload)}
                        </p>
                        {badge && (
                          <div className="mt-2">
                            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Message Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMessage ? (
          <>
            {/* Detail Header */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-subtle shrink-0">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm">
                  <Archive className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-subtle" />
                <Button variant="ghost" size="sm">
                  <Clock className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">
                  <Reply className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <ReplyAll className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Forward className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-subtle" />
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Sender Info */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-accent-purple/20 text-accent-purple flex items-center justify-center text-lg font-semibold">
                    {getAgentInitial(selectedMessage.from)}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-primary">
                      {getAgentName(selectedMessage.from)}
                    </h2>
                    <p className="text-sm text-muted">
                      {formatMessageType(selectedMessage.type)}
                    </p>
                    {selectedMessage.to && (
                      <p className="text-sm text-muted mt-1">
                        To: <span className="text-secondary">{getAgentName(selectedMessage.to)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-secondary">
                    {format(new Date(selectedMessage.timestamp), 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted">
                    {format(new Date(selectedMessage.timestamp), 'h:mm a')}
                  </p>
                </div>
              </div>

              {/* Message Type Badge */}
              <div className="mb-6">
                {getMessageBadge(selectedMessage.type) && (
                  <Badge
                    variant={getMessageBadge(selectedMessage.type)!.variant}
                    size="sm"
                  >
                    {getMessageBadge(selectedMessage.type)!.label}
                  </Badge>
                )}
              </div>

              {/* Payload Content */}
              <div className="rounded-lg bg-surface border border-subtle overflow-hidden">
                <div className="px-4 py-3 border-b border-subtle bg-hover/50">
                  <h4 className="text-sm font-medium text-secondary">Message Payload</h4>
                </div>
                <div className="p-4">
                  {/* Pretty print specific message types */}
                  {selectedMessage.type === 'task.created' && (selectedMessage.payload as { title?: string }).title && (
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wider">Task Title</label>
                        <p className="text-primary font-medium">{String((selectedMessage.payload as { title?: string }).title)}</p>
                      </div>
                      {Array.isArray((selectedMessage.payload as { requiredSkills?: string[] }).requiredSkills) && (
                        <div>
                          <label className="text-xs text-muted uppercase tracking-wider">Required Skills</label>
                          <div className="flex gap-2 flex-wrap mt-1">
                            {((selectedMessage.payload as { requiredSkills?: string[] }).requiredSkills || []).map((skill: string) => (
                              <Badge key={skill} variant="default" size="sm">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedMessage.type === 'agent.started' && (selectedMessage.payload as { name?: string }).name && (
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="text-xs text-muted uppercase tracking-wider">Agent Name</label>
                        <p className="text-primary font-medium">{String((selectedMessage.payload as { name?: string }).name)}</p>
                      </div>
                      {Array.isArray((selectedMessage.payload as { skills?: string[] }).skills) && (
                        <div>
                          <label className="text-xs text-muted uppercase tracking-wider">Skills</label>
                          <div className="flex gap-2 flex-wrap mt-1">
                            {((selectedMessage.payload as { skills?: string[] }).skills || []).map((skill: string) => (
                              <Badge key={skill} variant="default" size="sm">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw JSON */}
                  <div className="mt-4 pt-4 border-t border-subtle">
                    <label className="text-xs text-muted uppercase tracking-wider block mb-2">Raw Data</label>
                    <pre className="text-sm text-primary font-mono overflow-x-auto whitespace-pre-wrap bg-base p-3 rounded">
                      {JSON.stringify(selectedMessage.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                {selectedMessage.correlationId && (
                  <div>
                    <span className="text-muted">Correlation ID: </span>
                    <code className="text-secondary font-mono text-xs bg-hover px-1.5 py-0.5 rounded">
                      {selectedMessage.correlationId}
                    </code>
                  </div>
                )}
                <div>
                  <span className="text-muted">Message ID: </span>
                  <code className="text-secondary font-mono text-xs bg-hover px-1.5 py-0.5 rounded">
                    {selectedMessage.id}
                  </code>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-full bg-hover flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-lg font-medium text-primary mb-2">No message selected</h3>
            <p className="text-sm text-muted max-w-sm">
              Select a message from the list to view its contents and details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
