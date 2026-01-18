'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Message, Agent } from '@jetpack-agent/shared';
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
  Zap,
  Radio,
  ArrowRight,
  Users,
  Check,
  AlertCircle,
  Megaphone,
  X,
} from 'lucide-react';

// Extended message type with source info
interface ExtendedMessage extends Message {
  source?: 'broadcast' | 'direct';
  direction?: 'sent' | 'received';
}
import { Button, Badge, LiveIndicator, SystemAlerts, useRotatingAlerts } from '@/components/ui';
import type { SystemAlertItem } from '@/components/ui';
import { formatDistanceToNow, format } from 'date-fns';
import { useTypewriter } from '@/hooks/useTypewriter';

// Animation keyframes for message slide-in
const messageAnimationStyle = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(79, 255, 238, 0.4); }
    50% { box-shadow: 0 0 20px 2px rgba(79, 255, 238, 0.2); }
  }
`;

type MessageCategory = 'all' | 'unread' | 'task' | 'agent' | 'coordination' | 'direct' | 'flow' | 'threads';

// Thread type for grouped messages
interface MessageThread {
  id: string;  // correlationId or original message id
  messages: ExtendedMessage[];
  latestTimestamp: Date;
  participants: string[];
  subject: string;
}

// Message type icons
const getMessageIcon = (type: string) => {
  if (type.startsWith('task.completed')) return <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />;
  if (type.startsWith('task.failed')) return <XCircle className="w-4 h-4 text-[#ff6467]" />;
  if (type.startsWith('task.')) return <Bell className="w-4 h-4 text-[#26b5ce]" />;
  if (type.startsWith('agent.error')) return <AlertTriangle className="w-4 h-4 text-[#ff6467]" />;
  if (type.startsWith('agent.')) return <Activity className="w-4 h-4 text-[#22c55e]" />;
  if (type.startsWith('coordination.')) return <Send className="w-4 h-4 text-[rgb(79,255,238)]" />;
  return <Mail className="w-4 h-4 text-[#8b8b8e]" />;
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
  { id: 'threads', label: 'Threads', icon: <Reply className="w-4 h-4" /> },
  { id: 'task', label: 'Tasks', icon: <Bell className="w-4 h-4" /> },
  { id: 'agent', label: 'Agents', icon: <Activity className="w-4 h-4" /> },
  { id: 'direct', label: 'Direct', icon: <Send className="w-4 h-4" /> },
  { id: 'coordination', label: 'Coordination', icon: <Radio className="w-4 h-4" /> },
  { id: 'flow', label: 'Agent Flow', icon: <Users className="w-4 h-4" /> },
];

// System alerts for the inbox
const defaultAlerts: SystemAlertItem[] = [
  { id: '1', message: 'SSE real-time stream connected', type: 'success' },
  { id: '2', message: 'Agent communication channel open', type: 'success' },
  { id: '3', message: 'Messages delivered in real-time', type: 'info' },
];

export default function InboxPage() {
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MessageCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastPriority, setBroadcastPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [broadcastAckRequired, setBroadcastAckRequired] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  // Rotating system alerts
  const currentAlerts = useRotatingAlerts(defaultAlerts, 4000);

  // Typewriter effect for empty state
  const { displayText: emptyStateText } = useTypewriter({
    text: 'Messages from agents will appear here',
    speed: 30,
    delay: 300,
  });

  // Initial data fetch
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
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Fallback polling for agents only (less frequent)
    const agentInterval = setInterval(async () => {
      try {
        const agentsRes = await fetch('/api/agents');
        const agentsData = await agentsRes.json();
        setAgents(agentsData.agents || []);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    }, 10000);

    return () => clearInterval(agentInterval);
  }, []);

  // SSE stream for real-time message updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connect = () => {
      eventSource = new EventSource('/api/messages/stream');

      eventSource.addEventListener('connected', () => {
        setIsConnected(true);
        reconnectAttempts = 0;
        console.log('[SSE] Connected to message stream');
      });

      eventSource.addEventListener('message', (event) => {
        try {
          const newMessage = JSON.parse(event.data) as ExtendedMessage;
          // Convert timestamp string to Date
          newMessage.timestamp = new Date(newMessage.timestamp);

          setMessages(prev => {
            // Check if message already exists
            if (prev.some(m => m.id === newMessage.id)) {
              return prev;
            }
            // Add to front of list
            return [newMessage, ...prev];
          });
        } catch (error) {
          console.error('[SSE] Failed to parse message:', error);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        setIsConnected(true);
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource?.close();

        // Attempt reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`[SSE] Reconnecting... attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
          reconnectTimeout = setTimeout(connect, reconnectDelay);
        } else {
          console.log('[SSE] Max reconnect attempts reached, falling back to polling');
          // Fall back to polling
          setInterval(async () => {
            try {
              const messagesRes = await fetch('/api/messages');
              const messagesData = await messagesRes.json();
              setMessages(messagesData.messages || []);
              setIsConnected(true);
            } catch {
              setIsConnected(false);
            }
          }, 5000);
        }
      };
    };

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
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

  // Acknowledge a message
  const acknowledgeMessage = async (messageId: string) => {
    setAcknowledging(messageId);
    try {
      const response = await fetch(`/api/messages/${messageId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ackedBy: 'human-overseer' }),
      });
      if (response.ok) {
        // Update the message in state with ack info
        const ackData = await response.json();
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, ackedAt: ackData.ackedAt, ackedBy: ackData.ackedBy }
            : msg
        ));
        // Also update selected message if it's the one being acked
        if (selectedMessage?.id === messageId) {
          setSelectedMessage(prev => prev ? { ...prev, ackedAt: new Date(ackData.ackedAt), ackedBy: ackData.ackedBy } : null);
        }
      }
    } catch (error) {
      console.error('Failed to acknowledge message:', error);
    } finally {
      setAcknowledging(null);
    }
  };

  // Broadcast a message to all agents
  const sendBroadcast = useCallback(async () => {
    if (!broadcastMessage.trim()) return;

    setBroadcasting(true);
    try {
      const response = await fetch('/api/messages/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: broadcastMessage,
          priority: broadcastPriority,
          ackRequired: broadcastAckRequired,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Add the broadcast to messages list immediately
        const newMessage: ExtendedMessage = {
          id: result.messageId,
          type: 'coordination.request',
          from: 'human-overseer',
          payload: {
            message: broadcastMessage,
            priority: broadcastPriority,
            source: 'web-ui',
          },
          timestamp: new Date(result.timestamp),
          ackRequired: broadcastAckRequired,
          source: 'broadcast',
          direction: 'sent',
        };
        setMessages(prev => [newMessage, ...prev]);

        // Reset form and close modal
        setBroadcastMessage('');
        setBroadcastPriority('normal');
        setBroadcastAckRequired(false);
        setShowBroadcastModal(false);
      }
    } catch (error) {
      console.error('Failed to broadcast message:', error);
    } finally {
      setBroadcasting(false);
    }
  }, [broadcastMessage, broadcastPriority, broadcastAckRequired]);

  const getAgentInitial = (agentId: string) => {
    const name = getAgentName(agentId);
    return name.charAt(0).toUpperCase();
  };

  // Group messages into threads by correlationId (must be before filteredMessages which uses it)
  const threads = useMemo(() => {
    const threadMap = new Map<string, ExtendedMessage[]>();

    // Group messages that have correlationId or are referenced as correlationId
    for (const msg of messages) {
      if (msg.type === 'heartbeat') continue;

      // Use correlationId if present, otherwise use message id as thread key
      const threadId = msg.correlationId || msg.id;

      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(msg);
    }

    // Also add messages that are referenced by other messages' correlationId
    for (const msg of messages) {
      if (msg.type === 'heartbeat' || !msg.correlationId) continue;

      // If there's a message whose id equals this correlationId, add it to the thread
      const referencedMsg = messages.find(m => m.id === msg.correlationId);
      if (referencedMsg && !threadMap.get(msg.correlationId)?.includes(referencedMsg)) {
        threadMap.get(msg.correlationId)?.push(referencedMsg);
      }
    }

    // Convert to MessageThread array, only include threads with 2+ messages
    const threadList: MessageThread[] = [];

    for (const [threadId, msgs] of threadMap.entries()) {
      // Deduplicate and sort by timestamp
      const uniqueMsgs = Array.from(new Map(msgs.map(m => [m.id, m])).values())
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (uniqueMsgs.length >= 2 || msgs.some(m => m.correlationId)) {
        const participants = Array.from(new Set(uniqueMsgs.flatMap(m => [m.from, m.to].filter(Boolean) as string[])));
        const firstMsg = uniqueMsgs[0];

        threadList.push({
          id: threadId,
          messages: uniqueMsgs,
          latestTimestamp: new Date(uniqueMsgs[uniqueMsgs.length - 1].timestamp),
          participants,
          subject: getPayloadSummary(firstMsg.payload),
        });
      }
    }

    // Sort threads by latest timestamp
    return threadList.sort((a, b) => b.latestTimestamp.getTime() - a.latestTimestamp.getTime());
  }, [messages]);

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
    } else if (selectedCategory === 'direct') {
      filtered = filtered.filter(msg => msg.source === 'direct');
    } else if (selectedCategory === 'coordination') {
      filtered = filtered.filter(msg => msg.type.startsWith('coordination.') || msg.type.startsWith('file.'));
    } else if (selectedCategory === 'flow') {
      // Flow view shows all - filtering happens in the visualization
    } else if (selectedCategory === 'threads') {
      // Show only messages that are part of threads
      const threadMessageIds = new Set(threads.flatMap(t => t.messages.map(m => m.id)));
      filtered = filtered.filter(msg => threadMessageIds.has(msg.id));
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
  }, [messages, selectedCategory, searchQuery, readMessages, agents, threads]);

  // Compute agent flow data for visualization
  const agentFlowData = useMemo(() => {
    const flows: Map<string, { from: string; to: string; count: number; types: string[] }> = new Map();
    const agentSet = new Set<string>();

    for (const msg of messages) {
      if (msg.type === 'heartbeat') continue;
      agentSet.add(msg.from);
      if (msg.to) {
        agentSet.add(msg.to);
        const key = `${msg.from}->${msg.to}`;
        const existing = flows.get(key);
        if (existing) {
          existing.count++;
          if (!existing.types.includes(msg.type)) {
            existing.types.push(msg.type);
          }
        } else {
          flows.set(key, { from: msg.from, to: msg.to, count: 1, types: [msg.type] });
        }
      }
    }

    return {
      agents: Array.from(agentSet),
      flows: Array.from(flows.values()),
    };
  }, [messages]);

  // Count unread messages per category
  const unreadCount = useMemo(() => {
    const nonHeartbeat = messages.filter(m => m.type !== 'heartbeat');
    return nonHeartbeat.filter(m => !readMessages.has(m.id)).length;
  }, [messages, readMessages]);

  // Thread count for sidebar
  const threadCount = threads.length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d0d0f]">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[rgb(79,255,238)] border-t-transparent mx-auto"></div>
            <div className="absolute inset-0 animate-ping rounded-full h-10 w-10 border border-[rgb(79,255,238)]/30 mx-auto"></div>
          </div>
          <p className="mt-4 text-sm text-[#8b8b8e] font-mono">Connecting to agent network...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{messageAnimationStyle}</style>

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-[#16161a] border border-[#26262a] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#26262a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#ff6467]/20 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-[#ff6467]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[#f7f8f8]">Broadcast to All Agents</h2>
                  <p className="text-sm text-[#8b8b8e]">Send a message to every connected agent</p>
                </div>
              </div>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="p-2 rounded-lg hover:bg-[#2a2a30] transition-colors"
              >
                <X className="w-5 h-5 text-[#8b8b8e]" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Message Input */}
              <div>
                <label className="block text-sm font-medium text-[#f7f8f8] mb-2">
                  Message
                </label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Enter your broadcast message..."
                  className="w-full h-32 px-4 py-3 bg-[#0d0d0f] border border-[#26262a] rounded-lg text-[#f7f8f8] placeholder:text-[#8b8b8e] resize-none focus:border-[rgb(79,255,238)] focus:outline-none transition-colors"
                />
              </div>

              {/* Priority Select */}
              <div>
                <label className="block text-sm font-medium text-[#f7f8f8] mb-2">
                  Priority
                </label>
                <div className="flex gap-2">
                  {(['high', 'normal', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setBroadcastPriority(p)}
                      className={`
                        flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize
                        ${broadcastPriority === p
                          ? p === 'high'
                            ? 'bg-[#ff6467]/20 text-[#ff6467] border border-[#ff6467]'
                            : p === 'low'
                            ? 'bg-[#8b8b8e]/20 text-[#8b8b8e] border border-[#8b8b8e]'
                            : 'bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)] border border-[rgb(79,255,238)]'
                          : 'bg-[#2a2a30] text-[#8b8b8e] border border-transparent hover:border-[#26262a]'
                        }
                      `}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ack Required Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-[#f7f8f8]">
                    Require Acknowledgment
                  </label>
                  <p className="text-xs text-[#8b8b8e]">
                    Agents must confirm receipt of this message
                  </p>
                </div>
                <button
                  onClick={() => setBroadcastAckRequired(!broadcastAckRequired)}
                  className={`
                    w-12 h-6 rounded-full transition-colors relative
                    ${broadcastAckRequired ? 'bg-[rgb(79,255,238)]' : 'bg-[#2a2a30]'}
                  `}
                >
                  <div
                    className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                      ${broadcastAckRequired ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#26262a]">
              <Button
                variant="ghost"
                onClick={() => setShowBroadcastModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={sendBroadcast}
                disabled={!broadcastMessage.trim() || broadcasting}
                className={`${broadcastPriority === 'high' ? '!bg-[#ff6467] hover:!bg-[#ff6467]/80' : ''}`}
              >
                {broadcasting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Broadcasting...
                  </>
                ) : (
                  <>
                    <Megaphone className="w-4 h-4 mr-2" />
                    Broadcast Message
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full bg-[#0d0d0f]">
        {/* Left Sidebar - Categories */}
        <div className="w-56 border-r border-[#26262a] flex flex-col shrink-0 bg-[#0d0d0f]/50 backdrop-blur-sm">
          <div className="h-14 flex items-center justify-between px-4 border-b border-[#26262a]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[rgb(79,255,238)]" />
              <h1 className="text-lg font-semibold text-[#f7f8f8]">Inbox</h1>
            </div>
            <LiveIndicator
              label={isConnected ? 'LIVE' : 'OFFLINE'}
              variant={isConnected ? 'success' : 'error'}
            />
          </div>

          {/* Broadcast Button */}
          <div className="p-3 border-b border-[#26262a]">
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#ff6467]/10 hover:bg-[#ff6467]/20 border border-[#ff6467]/30 text-[#ff6467] font-medium transition-colors"
            >
              <Megaphone className="w-4 h-4" />
              <span>Broadcast</span>
            </button>
          </div>

        <nav className="flex-1 p-2 space-y-1">
          {categories.map((category) => {
            const isActive = selectedCategory === category.id;
            const count = category.id === 'unread' ? unreadCount :
                         category.id === 'all' ? messages.filter(m => m.type !== 'heartbeat').length :
                         category.id === 'threads' ? threadCount :
                         category.id === 'direct' ? messages.filter(m => m.type !== 'heartbeat' && (m as ExtendedMessage).source === 'direct').length :
                         category.id === 'flow' ? agentFlowData.agents.length :
                         messages.filter(m => m.type !== 'heartbeat' && m.type.startsWith(category.id + '.')).length;

            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`
                  w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm
                  transition-colors duration-150
                  ${isActive
                    ? 'bg-[rgb(79,255,238)]/10 text-[rgb(79,255,238)]'
                    : 'text-[#8b8b8e] hover:bg-[#1f1f24] hover:text-[#f7f8f8]'
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
                    ${isActive ? 'bg-[rgb(79,255,238)]/20' : 'bg-[#2a2a30]'}
                  `}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Categories section */}
        <div className="p-4 border-t border-[#26262a]">
          <h3 className="text-xs font-medium text-[#8b8b8e] uppercase tracking-wider mb-2">Labels</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-[#8b8b8e]">
              <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
              <span>Success</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#8b8b8e]">
              <div className="w-2 h-2 rounded-full bg-[#ff6467]"></div>
              <span>Errors</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#8b8b8e]">
              <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
              <span>In Progress</span>
            </div>
          </div>
        </div>
      </div>

        {/* Middle Panel - Message List */}
        <div className="w-96 border-r border-[#26262a] flex flex-col shrink-0">
          {/* Search Header */}
          <div className="h-14 flex items-center gap-2 px-4 border-b border-[#26262a]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b8e]" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#2a2a30] border border-[#26262a] rounded-md text-sm text-[#f7f8f8] placeholder:text-[#8b8b8e] focus:border-[rgb(79,255,238)] focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* System Alerts Bar */}
          <div className="px-4 py-2 border-b border-[#26262a] bg-[#16161a]/50">
            <SystemAlerts alerts={currentAlerts} maxVisible={1} />
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-[#26262a]">
            <button className="px-3 py-1 text-xs font-medium rounded bg-[#2a2a30] text-[#f7f8f8]">
              All
            </button>
            <button className="px-3 py-1 text-xs font-medium rounded text-[#8b8b8e] hover:text-[#f7f8f8] hover:bg-[#2a2a30] transition-colors">
              Unread
            </button>
            <div className="flex-1" />
            <span className="text-2xs text-[#8b8b8e] font-mono">
              {filteredMessages.length} msg{filteredMessages.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Message List */}
          <div ref={messageListRef} className="flex-1 overflow-y-auto">
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center" style={{ animation: 'fadeIn 0.5s ease-out' }}>
                <div className="w-16 h-16 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4" style={{ animation: 'pulse-glow 2s infinite' }}>
                  <Mail className="w-8 h-8 text-[#8b8b8e]" />
                </div>
                <p className="text-[#f7f8f8] font-medium">No messages</p>
                <p className="text-sm text-[#8b8b8e] mt-1 font-mono">
                  {searchQuery ? 'Try a different search' : emptyStateText}
                  <span className="animate-pulse text-[rgb(79,255,238)]">_</span>
                </p>
              </div>
            ) : (
              <div>
                {filteredMessages.map((message, index) => {
                  const isSelected = selectedMessage?.id === message.id;
                  const isRead = readMessages.has(message.id);
                  const badge = getMessageBadge(message.type);

                  return (
                    <button
                      key={message.id}
                      onClick={() => setSelectedMessage(message)}
                      className={`
                        w-full text-left p-4 border-b border-[#26262a] transition-all duration-200
                        ${isSelected ? 'bg-[#2a2a30] border-l-2 border-l-[rgb(79,255,238)]' : 'hover:bg-[#1f1f24] border-l-2 border-l-transparent'}
                        ${!isRead ? 'bg-[rgb(79,255,238)]/5' : ''}
                      `}
                      style={{
                        animation: `slideInRight 0.3s ease-out ${index * 0.05}s both`,
                      }}
                    >
                    <div className="flex items-start gap-3">
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0
                        ${!isRead ? 'bg-[rgb(79,255,238)] text-black' : 'bg-[#2a2a30] text-[#8b8b8e]'}
                      `}>
                        {getAgentInitial(message.from)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`font-medium truncate ${!isRead ? 'text-[#f7f8f8]' : 'text-[#8b8b8e]'}`}>
                            {getAgentName(message.from)}
                          </span>
                          <span className="text-2xs text-[#8b8b8e] shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: false })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          {getMessageIcon(message.type)}
                          <span className={`text-sm truncate ${!isRead ? 'text-[#f7f8f8]' : 'text-[#8b8b8e]'}`}>
                            {formatMessageType(message.type)}
                          </span>
                        </div>
                        <p className="text-xs text-[#8b8b8e] truncate">
                          {getPayloadSummary(message.payload)}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          {badge && (
                            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                          )}
                          {(message as ExtendedMessage).source === 'direct' && (
                            <Badge variant="info" size="sm">
                              <Send className="w-3 h-3 mr-1" />
                              Direct
                            </Badge>
                          )}
                          {(() => {
                            const thread = threads.find(t =>
                              t.messages.some(m => m.id === message.id)
                            );
                            if (thread && thread.messages.length > 1) {
                              return (
                                <Badge variant="default" size="sm">
                                  <Reply className="w-3 h-3 mr-1" />
                                  {thread.messages.length} in thread
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                          {/* Ack status badge */}
                          {message.ackRequired && !message.ackedAt && (
                            <Badge variant="warning" size="sm">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Needs Ack
                            </Badge>
                          )}
                          {message.ackedAt && (
                            <Badge variant="success" size="sm">
                              <Check className="w-3 h-3 mr-1" />
                              Acked
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Message Detail or Flow View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCategory === 'flow' ? (
          /* Agent Flow Visualization */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-[#f7f8f8] flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-[rgb(79,255,238)]" />
                Agent Communication Flow
              </h2>
              <p className="text-sm text-[#8b8b8e]">
                Visualizing how agents communicate with each other
              </p>
            </div>

            {agentFlowData.agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-[#8b8b8e]" />
                </div>
                <p className="text-[#f7f8f8] font-medium">No agent communications yet</p>
                <p className="text-sm text-[#8b8b8e] mt-1">
                  Direct messages between agents will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Agent list */}
                <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-4">
                  <h3 className="text-sm font-medium text-[#8b8b8e] uppercase tracking-wider mb-3">
                    Active Agents ({agentFlowData.agents.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {agentFlowData.agents.map((agentId) => (
                      <div
                        key={agentId}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d0d0f] border border-[#26262a]"
                      >
                        <div className="w-8 h-8 rounded-full bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)] flex items-center justify-center text-sm font-medium">
                          {getAgentInitial(agentId)}
                        </div>
                        <span className="text-[#f7f8f8] text-sm">{getAgentName(agentId)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Communication flows */}
                {agentFlowData.flows.length > 0 && (
                  <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-4">
                    <h3 className="text-sm font-medium text-[#8b8b8e] uppercase tracking-wider mb-3">
                      Direct Communications ({agentFlowData.flows.length})
                    </h3>
                    <div className="space-y-3">
                      {agentFlowData.flows.map((flow, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 rounded-lg bg-[#0d0d0f] border border-[#26262a]"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)] flex items-center justify-center text-sm font-medium">
                              {getAgentInitial(flow.from)}
                            </div>
                            <span className="text-[#f7f8f8] text-sm">{getAgentName(flow.from)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[rgb(79,255,238)]">
                            <ArrowRight className="w-5 h-5" />
                            <span className="text-xs bg-[rgb(79,255,238)]/20 px-2 py-0.5 rounded-full">
                              {flow.count} msg{flow.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] flex items-center justify-center text-sm font-medium">
                              {getAgentInitial(flow.to)}
                            </div>
                            <span className="text-[#f7f8f8] text-sm">{getAgentName(flow.to)}</span>
                          </div>
                          <div className="ml-auto flex flex-wrap gap-1">
                            {flow.types.slice(0, 3).map((type) => (
                              <Badge key={type} variant="default" size="sm">
                                {type.split('.').pop()}
                              </Badge>
                            ))}
                            {flow.types.length > 3 && (
                              <Badge variant="default" size="sm">
                                +{flow.types.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message type breakdown */}
                <div className="rounded-xl bg-[#16161a]/50 border border-[#26262a] p-4">
                  <h3 className="text-sm font-medium text-[#8b8b8e] uppercase tracking-wider mb-3">
                    Message Types
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(
                      messages.reduce((acc, msg) => {
                        if (msg.type !== 'heartbeat') {
                          const category = msg.type.split('.')[0];
                          acc[category] = (acc[category] || 0) + 1;
                        }
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([category, count]) => (
                      <div
                        key={category}
                        className="flex items-center justify-between p-2 rounded bg-[#0d0d0f] border border-[#26262a]"
                      >
                        <span className="text-sm text-[#f7f8f8] capitalize">{category}</span>
                        <span className="text-sm font-medium text-[rgb(79,255,238)]">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : selectedMessage ? (
          <>
            {/* Detail Header */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-[#26262a] shrink-0">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm">
                  <Archive className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Trash2 className="w-4 h-4" />
                </Button>
                <div className="w-px h-6 bg-[#26262a]" />
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
                <div className="w-px h-6 bg-[#26262a]" />
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
                  <div className="w-12 h-12 rounded-full bg-[rgb(79,255,238)]/20 text-[rgb(79,255,238)] flex items-center justify-center text-lg font-semibold">
                    {getAgentInitial(selectedMessage.from)}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#f7f8f8]">
                      {getAgentName(selectedMessage.from)}
                    </h2>
                    <p className="text-sm text-[#8b8b8e]">
                      {formatMessageType(selectedMessage.type)}
                    </p>
                    {selectedMessage.to && (
                      <p className="text-sm text-[#8b8b8e] mt-1">
                        To: <span className="text-[#f7f8f8]">{getAgentName(selectedMessage.to)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#f7f8f8]">
                    {format(new Date(selectedMessage.timestamp), 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-[#8b8b8e]">
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
              <div className="rounded-lg bg-[#16161a] border border-[#26262a] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#26262a] bg-[#1f1f24]">
                  <h4 className="text-sm font-medium text-[#f7f8f8]">Message Payload</h4>
                </div>
                <div className="p-4">
                  {/* Pretty print specific message types */}
                  {selectedMessage.type === 'task.created' && (selectedMessage.payload as { title?: string }).title && (
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="text-xs text-[#8b8b8e] uppercase tracking-wider">Task Title</label>
                        <p className="text-[#f7f8f8] font-medium">{String((selectedMessage.payload as { title?: string }).title)}</p>
                      </div>
                      {Array.isArray((selectedMessage.payload as { requiredSkills?: string[] }).requiredSkills) && (
                        <div>
                          <label className="text-xs text-[#8b8b8e] uppercase tracking-wider">Required Skills</label>
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
                        <label className="text-xs text-[#8b8b8e] uppercase tracking-wider">Agent Name</label>
                        <p className="text-[#f7f8f8] font-medium">{String((selectedMessage.payload as { name?: string }).name)}</p>
                      </div>
                      {Array.isArray((selectedMessage.payload as { skills?: string[] }).skills) && (
                        <div>
                          <label className="text-xs text-[#8b8b8e] uppercase tracking-wider">Skills</label>
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
                  <div className="mt-4 pt-4 border-t border-[#26262a]">
                    <label className="text-xs text-[#8b8b8e] uppercase tracking-wider block mb-2">Raw Data</label>
                    <pre className="text-sm text-[#f7f8f8] font-mono overflow-x-auto whitespace-pre-wrap bg-[#0d0d0f] p-3 rounded">
                      {JSON.stringify(selectedMessage.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Acknowledgment Section */}
              {(selectedMessage.ackRequired || selectedMessage.ackedAt) && (
                <div className="mt-6 rounded-lg bg-[#16161a] border border-[#26262a] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {selectedMessage.ackedAt ? (
                        <>
                          <div className="w-10 h-10 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
                            <Check className="w-5 h-5 text-[#22c55e]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#f7f8f8]">Acknowledged</p>
                            <p className="text-xs text-[#8b8b8e]">
                              By {selectedMessage.ackedBy || 'unknown'} • {format(new Date(selectedMessage.ackedAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-[#eab308]/20 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-[#eab308]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#f7f8f8]">Requires Acknowledgment</p>
                            <p className="text-xs text-[#8b8b8e]">
                              This message needs confirmation from the human overseer
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    {!selectedMessage.ackedAt && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => acknowledgeMessage(selectedMessage.id)}
                        disabled={acknowledging === selectedMessage.id}
                      >
                        {acknowledging === selectedMessage.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Acknowledging...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Acknowledge
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                {selectedMessage.correlationId && (
                  <div>
                    <span className="text-[#8b8b8e]">Correlation ID: </span>
                    <code className="text-[#f7f8f8] font-mono text-xs bg-[#2a2a30] px-1.5 py-0.5 rounded">
                      {selectedMessage.correlationId}
                    </code>
                  </div>
                )}
                <div>
                  <span className="text-[#8b8b8e]">Message ID: </span>
                  <code className="text-[#f7f8f8] font-mono text-xs bg-[#2a2a30] px-1.5 py-0.5 rounded">
                    {selectedMessage.id}
                  </code>
                </div>
              </div>

              {/* Thread View */}
              {(() => {
                const thread = threads.find(t =>
                  t.messages.some(m => m.id === selectedMessage.id)
                );
                if (!thread || thread.messages.length <= 1) return null;

                return (
                  <div className="mt-6 rounded-lg bg-[#16161a] border border-[#26262a] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#26262a] bg-[#1f1f24] flex items-center justify-between">
                      <h4 className="text-sm font-medium text-[#f7f8f8] flex items-center gap-2">
                        <Reply className="w-4 h-4 text-[rgb(79,255,238)]" />
                        Thread ({thread.messages.length} messages)
                      </h4>
                      <span className="text-xs text-[#8b8b8e]">
                        {thread.participants.length} participant{thread.participants.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="divide-y divide-[#26262a]">
                      {thread.messages.map((msg, idx) => {
                        const isCurrent = msg.id === selectedMessage.id;
                        return (
                          <button
                            key={msg.id}
                            onClick={() => setSelectedMessage(msg)}
                            className={`
                              w-full text-left p-3 transition-colors
                              ${isCurrent ? 'bg-[rgb(79,255,238)]/10 border-l-2 border-l-[rgb(79,255,238)]' : 'hover:bg-[#1f1f24] border-l-2 border-l-transparent'}
                            `}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#2a2a30] text-xs text-[#8b8b8e]">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${isCurrent ? 'text-[rgb(79,255,238)]' : 'text-[#f7f8f8]'}`}>
                                    {getAgentName(msg.from)}
                                  </span>
                                  {msg.to && (
                                    <>
                                      <ArrowRight className="w-3 h-3 text-[#8b8b8e]" />
                                      <span className="text-sm text-[#8b8b8e]">
                                        {getAgentName(msg.to)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <p className="text-xs text-[#8b8b8e] truncate mt-0.5">
                                  {formatMessageType(msg.type)} - {getPayloadSummary(msg.payload).slice(0, 50)}
                                </p>
                              </div>
                              <span className="text-2xs text-[#8b8b8e]">
                                {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: false })}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-full bg-[#2a2a30] flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-[#8b8b8e]" />
            </div>
            <h3 className="text-lg font-medium text-[#f7f8f8] mb-2">No message selected</h3>
            <p className="text-sm text-[#8b8b8e] max-w-sm">
              Select a message from the list to view its contents and details
            </p>
          </div>
          )}
        </div>
      </div>
    </>
  );
}
