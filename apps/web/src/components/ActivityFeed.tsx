'use client';

import { useEffect, useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  Play,
  AlertCircle,
  UserPlus,
  UserMinus,
  FileText,
  ChevronDown,
  ChevronUp,
  Activity,
  Clock
} from 'lucide-react';
import clsx from 'clsx';

interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  agentId?: string;
  agentName?: string;
  taskId?: string;
  taskTitle?: string;
  timestamp: Date;
}

interface ActivityFeedProps {
  className?: string;
  maxEvents?: number;
  defaultExpanded?: boolean;
}

// Transform message types to user-friendly events
function transformMessage(msg: {
  id: string;
  type: string;
  from: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}): ActivityEvent | null {
  const timestamp = new Date(msg.timestamp);
  const agentName = msg.from.replace('agent-', 'Agent ');

  switch (msg.type) {
    case 'task.created':
      return {
        id: msg.id,
        type: 'task.created',
        message: `created task "${(msg.payload as { title?: string })?.title || 'Untitled'}"`,
        agentId: msg.from,
        agentName,
        taskId: (msg.payload as { id?: string })?.id,
        taskTitle: (msg.payload as { title?: string })?.title,
        timestamp,
      };
    case 'task.claimed':
      return {
        id: msg.id,
        type: 'task.claimed',
        message: `claimed "${(msg.payload as { title?: string })?.title || (msg.payload as { taskId?: string })?.taskId}"`,
        agentId: msg.from,
        agentName,
        taskId: (msg.payload as { taskId?: string })?.taskId,
        taskTitle: (msg.payload as { title?: string })?.title,
        timestamp,
      };
    case 'task.completed':
      return {
        id: msg.id,
        type: 'task.completed',
        message: `completed "${(msg.payload as { title?: string })?.title || (msg.payload as { taskId?: string })?.taskId}"`,
        agentId: msg.from,
        agentName,
        taskId: (msg.payload as { taskId?: string })?.taskId,
        taskTitle: (msg.payload as { title?: string })?.title,
        timestamp,
      };
    case 'task.failed':
      return {
        id: msg.id,
        type: 'task.failed',
        message: `failed on "${(msg.payload as { title?: string })?.title || (msg.payload as { taskId?: string })?.taskId}"`,
        agentId: msg.from,
        agentName,
        taskId: (msg.payload as { taskId?: string })?.taskId,
        taskTitle: (msg.payload as { title?: string })?.title,
        timestamp,
      };
    case 'agent.started':
      return {
        id: msg.id,
        type: 'agent.started',
        message: 'came online',
        agentId: msg.from,
        agentName,
        timestamp,
      };
    case 'agent.stopped':
      return {
        id: msg.id,
        type: 'agent.stopped',
        message: 'went offline',
        agentId: msg.from,
        agentName,
        timestamp,
      };
    default:
      // Skip heartbeats and other internal messages
      return null;
  }
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'task.created':
      return <FileText className="w-3.5 h-3.5 text-[#8b8b8e]" />;
    case 'task.claimed':
      return <Play className="w-3.5 h-3.5 text-[#a855f7]" />;
    case 'task.completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />;
    case 'task.failed':
      return <AlertCircle className="w-3.5 h-3.5 text-[#ef4444]" />;
    case 'agent.started':
      return <UserPlus className="w-3.5 h-3.5 text-[rgb(79,255,238)]" />;
    case 'agent.stopped':
      return <UserMinus className="w-3.5 h-3.5 text-[#8b8b8e]" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-[#8b8b8e]" />;
  }
}

function EventRow({ event }: { event: ActivityEvent }) {
  const timeAgo = formatDistanceToNow(event.timestamp, { addSuffix: false });
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="flex items-start gap-3 py-2 px-3 hover:bg-[#16161a] transition-colors group">
      {/* Time */}
      <span className="text-[10px] text-[#8b8b8e] font-mono w-16 flex-shrink-0 pt-0.5">
        {time}
      </span>

      {/* Icon */}
      <div className="flex-shrink-0 pt-0.5">
        <EventIcon type={event.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-xs">
          <span className="text-[rgb(79,255,238)] font-medium">{event.agentName}</span>
          <span className="text-[#8b8b8e]"> {event.message}</span>
        </span>
      </div>

      {/* Relative time - shown on hover */}
      <span className="text-[10px] text-[#8b8b8e]/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {timeAgo} ago
      </span>
    </div>
  );
}

export default function ActivityFeed({
  className,
  maxEvents = 30,
  defaultExpanded = true
}: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  // Fetch messages and transform to events
  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch('/api/messages?limit=50&includeHeartbeats=false');
        const data = await res.json();

        const newEvents = (data.messages || [])
          .map(transformMessage)
          .filter((e: ActivityEvent | null): e is ActivityEvent => e !== null)
          .slice(0, maxEvents);

        setEvents(newEvents);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [maxEvents]);

  // Track scroll position for auto-scroll
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = feed;
      wasAtBottom.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    feed.addEventListener('scroll', handleScroll);
    return () => feed.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new events arrive (if user was at bottom)
  useEffect(() => {
    if (wasAtBottom.current && feedRef.current) {
      feedRef.current.scrollTop = 0; // Newest at top, so scroll to top
    }
  }, [events]);

  return (
    <div className={clsx(
      'border-t border-[#26262a] bg-[#0d0d0f]',
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#16161a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[rgb(79,255,238)]" />
          <span className="text-xs font-medium text-[#f7f8f8]">Activity Feed</span>
          <span className="text-[10px] text-[#8b8b8e]">({events.length} events)</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[#8b8b8e]" />
        ) : (
          <ChevronUp className="w-4 h-4 text-[#8b8b8e]" />
        )}
      </button>

      {/* Feed Content */}
      {isExpanded && (
        <div
          ref={feedRef}
          className="max-h-48 overflow-y-auto border-t border-[#26262a]"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="w-4 h-4 text-[#8b8b8e] animate-pulse mr-2" />
              <span className="text-xs text-[#8b8b8e]">Loading activity...</span>
            </div>
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-[#8b8b8e]">No recent activity</span>
            </div>
          ) : (
            <div className="divide-y divide-[#26262a]/50">
              {events.map(event => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
