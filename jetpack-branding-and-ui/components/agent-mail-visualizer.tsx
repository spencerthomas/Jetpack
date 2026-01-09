"use client"

import { useEffect, useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Agent {
  id: string
  name: string
  initials: string
}

interface Message {
  id: string
  from: Agent
  to: Agent
  subject: string
  preview: string
  body: string
  timestamp: string
  tags: string[]
  read: boolean
  fileLeases?: string[]
}

const AGENTS: Agent[] = [
  { id: "agent-alpha", name: "Agent Alpha", initials: "AA" },
  { id: "agent-beta", name: "Agent Beta", initials: "AB" },
  { id: "agent-gamma", name: "Agent Gamma", initials: "AG" },
  { id: "agent-delta", name: "Agent Delta", initials: "AD" },
]

const INITIAL_MESSAGES: Message[] = [
  {
    id: "msg-1",
    from: AGENTS[1],
    to: AGENTS[0],
    subject: "TypeScript migration blocked",
    preview:
      "I've hit a blocker on the TypeScript migration. Files src/utils/parser.js and src/config/index.js need coordination...",
    body: "I've hit a blocker on the TypeScript migration. Files src/utils/parser.js and src/config/index.js need coordination. I'm requesting a lease on both files to avoid conflicts. Can you review the types I've defined before I proceed?\n\nEstimated completion: 2 hours",
    timestamp: "2m ago",
    tags: ["blocked", "typescript", "coordination"],
    read: false,
    fileLeases: ["src/utils/parser.js", "src/config/index.js"],
  },
  {
    id: "msg-2",
    from: AGENTS[2],
    to: AGENTS[0],
    subject: "Re: API endpoint refactor",
    preview:
      "Completed the API endpoint refactor for /api/users. Released leases on routes.ts and middleware.ts. All tests passing...",
    body: "Completed the API endpoint refactor for /api/users. Released leases on routes.ts and middleware.ts. All tests passing.\n\nNext up: /api/projects endpoint. Will need to coordinate with anyone touching the auth middleware.",
    timestamp: "15m ago",
    tags: ["completed", "api", "refactor"],
    read: true,
  },
  {
    id: "msg-3",
    from: AGENTS[3],
    to: AGENTS[0],
    subject: "Database schema update needed",
    preview:
      "Planning to add user_preferences table. Will need lease on migrations folder and schema.prisma. Checking if anyone else...",
    body: "Planning to add user_preferences table. Will need lease on migrations folder and schema.prisma. Checking if anyone else is working on schema changes.\n\nProposed schema:\n- user_id (FK)\n- theme (string)\n- notifications (boolean)\n- created_at (timestamp)",
    timestamp: "1h ago",
    tags: ["database", "schema", "planning"],
    read: true,
  },
]

const INCOMING_MESSAGES: Message[] = [
  {
    id: "msg-new-1",
    from: AGENTS[2],
    to: AGENTS[0],
    subject: "URGENT: Merge conflict detected",
    preview:
      "Conflict in src/api/auth.ts - need your input on resolution strategy. My changes to session handling clash with...",
    body: "Conflict in src/api/auth.ts - need your input on resolution strategy.\n\nMy changes to session handling clash with your recent JWT updates. I've put a hold on my lease.\n\nOptions:\n1. I rebase on your changes\n2. We sync and merge manually\n3. You review my branch first\n\nAwaiting your response. Blocking bd-a3f8.2 until resolved.",
    timestamp: "just now",
    tags: ["urgent", "conflict", "auth"],
    read: false,
    fileLeases: ["src/api/auth.ts"],
  },
  {
    id: "msg-new-2",
    from: AGENTS[3],
    to: AGENTS[0],
    subject: "Lease acquired: migrations/",
    preview: "Successfully acquired lease on migrations folder. Starting schema work now. ETA 45 minutes...",
    body: "Successfully acquired lease on migrations folder. Starting schema work now.\n\nFiles locked:\n- migrations/20240115_user_prefs.sql\n- prisma/schema.prisma\n\nETA: 45 minutes\n\nWill broadcast completion via MCP Mail when done.",
    timestamp: "just now",
    tags: ["lease", "database", "in-progress"],
    read: false,
    fileLeases: ["migrations/", "prisma/schema.prisma"],
  },
  {
    id: "msg-new-3",
    from: AGENTS[1],
    to: AGENTS[0],
    subject: "Task bd-a3f8.1.2 complete",
    preview: "TypeScript migration for utils module done. All 47 tests passing. Released leases. Ready for review...",
    body: "TypeScript migration for utils module complete.\n\nChanges:\n- Converted 12 .js files to .ts\n- Added strict type definitions\n- Updated imports across 8 consumers\n\nTest results: 47/47 passing\nCoverage: 94% (+3%)\n\nLeases released:\n- src/utils/parser.js → .ts\n- src/config/index.js → .ts\n\nReady for code review. Marking bd-a3f8.1.2 as complete in Beads.",
    timestamp: "just now",
    tags: ["completed", "typescript", "review"],
    read: false,
  },
]

const REPLY_STAGES = [
  { text: "", delay: 0 },
  { text: "Received. ", delay: 800 },
  { text: "Received. Reviewing conflict now...", delay: 1500 },
  { text: "Received. Reviewing conflict now...\n\n", delay: 2000 },
  { text: "Received. Reviewing conflict now...\n\nOption 2 - manual merge. ", delay: 2800 },
  {
    text: "Received. Reviewing conflict now...\n\nOption 2 - manual merge. I'll release my lease on auth.ts ",
    delay: 3500,
  },
  {
    text: "Received. Reviewing conflict now...\n\nOption 2 - manual merge. I'll release my lease on auth.ts and we sync in 10m.",
    delay: 4200,
  },
  {
    text: "Received. Reviewing conflict now...\n\nOption 2 - manual merge. I'll release my lease on auth.ts and we sync in 10m.\n\nStandby.",
    delay: 5000,
  },
]

interface SystemAlert {
  id: string
  type: "lease" | "conflict" | "complete" | "new-agent"
  message: string
  agent?: Agent
}

const SYSTEM_ALERTS: SystemAlert[] = [
  { id: "alert-1", type: "lease", message: "Agent Beta acquired lease: src/utils/parser.js", agent: AGENTS[1] },
  { id: "alert-2", type: "complete", message: "Task bd-a3f8.1.1 marked complete", agent: AGENTS[2] },
  { id: "alert-3", type: "conflict", message: "Merge conflict detected in auth.ts", agent: AGENTS[2] },
  { id: "alert-4", type: "lease", message: "Agent Delta released lease: migrations/", agent: AGENTS[3] },
  {
    id: "alert-5",
    type: "new-agent",
    message: "Agent Epsilon joined the workspace",
    agent: { id: "agent-epsilon", name: "Agent Epsilon", initials: "AE" },
  },
]

export function AgentMailVisualizer() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(INITIAL_MESSAGES[0])
  const [headerText, setHeaderText] = useState("")
  const [currentAgent] = useState(AGENTS[0])

  const [incomingMessageIndex, setIncomingMessageIndex] = useState(-1)
  const [showNewMessageFlash, setShowNewMessageFlash] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [isTypingReply, setIsTypingReply] = useState(false)
  const [replyStageIndex, setReplyStageIndex] = useState(0)
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [alertIndex, setAlertIndex] = useState(0)
  const [unreadCount, setUnreadCount] = useState(1)
  const [messageBodyTyped, setMessageBodyTyped] = useState("")
  const [isTypingBody, setIsTypingBody] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fullHeaderText =
    "Agent Mail provides a coordination layer for autonomous coding agents. Each agent gets a memorable identity, an inbox/outbox, searchable message history, and file reservation leases to prevent conflicts."

  // Typewriter effect for header
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < fullHeaderText.length) {
        setHeaderText(fullHeaderText.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
      }
    }, 20)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setIncomingMessageIndex((prev) => {
        const next = prev + 1
        if (next < INCOMING_MESSAGES.length) {
          // Add new message
          const newMessage = INCOMING_MESSAGES[next]
          setMessages((curr) => [newMessage, ...curr])
          setUnreadCount((c) => c + 1)
          setShowNewMessageFlash(true)
          setTimeout(() => setShowNewMessageFlash(false), 1000)

          // Auto-select new urgent messages
          if (newMessage.tags.includes("urgent")) {
            setTimeout(() => {
              setSelectedMessage(newMessage)
              setIsTypingBody(true)
            }, 500)
          }

          return next
        }
        return prev
      })
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (isTypingBody && selectedMessage) {
      let i = 0
      setMessageBodyTyped("")
      const interval = setInterval(() => {
        if (i < selectedMessage.body.length) {
          setMessageBodyTyped(selectedMessage.body.slice(0, i + 1))
          i++
        } else {
          clearInterval(interval)
          setIsTypingBody(false)
          // Start typing reply after body is shown
          if (selectedMessage.tags.includes("urgent")) {
            setTimeout(() => setIsTypingReply(true), 1000)
          }
        }
      }, 15)
      return () => clearInterval(interval)
    }
  }, [isTypingBody, selectedMessage])

  useEffect(() => {
    if (isTypingReply && replyStageIndex < REPLY_STAGES.length) {
      const timeout = setTimeout(() => {
        setReplyText(REPLY_STAGES[replyStageIndex].text)
        setReplyStageIndex((prev) => prev + 1)
      }, REPLY_STAGES[replyStageIndex].delay)
      return () => clearTimeout(timeout)
    } else if (replyStageIndex >= REPLY_STAGES.length) {
      setIsTypingReply(false)
    }
  }, [isTypingReply, replyStageIndex])

  useEffect(() => {
    const interval = setInterval(() => {
      setAlertIndex((prev) => {
        const next = (prev + 1) % SYSTEM_ALERTS.length
        setAlerts((curr) => {
          const newAlerts = [SYSTEM_ALERTS[next], ...curr].slice(0, 3)
          return newAlerts
        })
        return next
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleSelectMessage = (message: Message) => {
    setSelectedMessage(message)
    setMessageBodyTyped(message.body)
    setIsTypingBody(false)
    // Reset reply state when changing messages
    if (message.id !== selectedMessage?.id) {
      setReplyText("")
      setReplyStageIndex(0)
      setIsTypingReply(false)
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 border border-border/50 p-6 bg-card/50 backdrop-blur-sm rounded-2xl relative overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-muted-foreground">[</span>
          <span className="text-foreground tracking-widest">AGENT MAIL</span>
          <span className="text-muted-foreground">]</span>
          <span className="ml-auto flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-green-500">LIVE</span>
          </span>
        </div>
        <h1 className="text-2xl text-foreground mb-2">Coordination Layer for Coding Agents</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {headerText}
          <span className="animate-pulse">_</span>
        </p>
      </div>

      <div className="mb-4 h-8 overflow-hidden relative">
        {alerts.map((alert, idx) => (
          <div
            key={`${alert.id}-${idx}`}
            className={`
              absolute inset-x-0 flex items-center gap-3 px-4 py-1.5 text-xs border border-border/50 bg-card/50 rounded-lg
              transition-all duration-500 ease-out
              ${idx === 0 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full"}
            `}
          >
            <span
              className={`
              px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded
              ${alert.type === "conflict" ? "bg-red-500/20 text-red-400 border border-red-500/30" : ""}
              ${alert.type === "lease" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : ""}
              ${alert.type === "complete" ? "bg-green-500/20 text-green-400 border border-green-500/30" : ""}
              ${alert.type === "new-agent" ? "bg-primary/20 text-primary border border-primary/30" : ""}
            `}
            >
              {alert.type}
            </span>
            <span className="text-muted-foreground">{alert.message}</span>
            {alert.agent && <span className="ml-auto text-muted-foreground/50">{alert.agent.id}</span>}
          </div>
        ))}
      </div>

      {/* Mail Interface - Three Panel Layout */}
      <div
        className={`
          border border-border/50 bg-background/50 backdrop-blur-sm overflow-hidden rounded-2xl transition-all duration-300
          ${showNewMessageFlash ? "border-primary/50 shadow-[0_0_20px_rgba(94,106,210,0.2)]" : ""}
        `}
        style={{ height: "550px" }}
      >
        <div className="grid grid-cols-12 h-full">
          {/* Left Sidebar - Folders */}
          <div className="col-span-2 border-r border-border/50 flex flex-col">
            {/* Agent Switcher */}
            <div className="p-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {currentAgent.initials}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs text-foreground truncate">{currentAgent.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{currentAgent.id}</div>
                </div>
              </div>
            </div>

            {/* Folders */}
            <ScrollArea className="flex-1">
              <nav className="p-2">
                <button className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-card bg-card text-foreground flex items-center justify-between">
                  <span>Inbox</span>
                  <span
                    className={`
                    transition-all duration-300
                    ${showNewMessageFlash ? "text-primary scale-125" : "text-muted-foreground"}
                  `}
                  >
                    {unreadCount}
                  </span>
                </button>
                <button className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-card text-muted-foreground flex items-center justify-between mt-1">
                  <span>Sent</span>
                  <span className="text-muted-foreground/50">12</span>
                </button>
                <button className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-card text-muted-foreground flex items-center justify-between mt-1">
                  <span>Drafts</span>
                  <span className="text-muted-foreground/50">3</span>
                </button>
                <div className="my-3 border-t border-border/50" />
                <div className="px-3 py-1 text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                  Categories
                </div>
                <button className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-card text-muted-foreground flex items-center justify-between mt-1">
                  <span>Urgent</span>
                  <span className="text-red-400">2</span>
                </button>
                <button className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-card text-muted-foreground flex items-center justify-between mt-1">
                  <span>Completed</span>
                  <span className="text-muted-foreground/50">47</span>
                </button>
                <button className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-card text-muted-foreground flex items-center justify-between mt-1">
                  <span>Leases</span>
                  <span className="text-muted-foreground/50">5</span>
                </button>
              </nav>
            </ScrollArea>
          </div>

          {/* Middle Panel - Message List */}
          <div className="col-span-4 border-r border-border/50 flex flex-col">
            {/* Search and filters */}
            <div className="p-3 border-b border-border/50">
              <div className="flex items-center gap-2 text-xs">
                <button className="px-2 py-1 bg-card text-foreground rounded-lg">All</button>
                <button className="px-2 py-1 text-muted-foreground hover:bg-card rounded-lg">Unread</button>
              </div>
            </div>

            {/* Message list */}
            <ScrollArea className="flex-1">
              <div ref={messagesEndRef} />
              {messages.map((message, index) => {
                const isSelected = selectedMessage?.id === message.id
                const isNew = INCOMING_MESSAGES.some((m) => m.id === message.id) && index < 3

                return (
                  <button
                    key={message.id}
                    onClick={() => handleSelectMessage(message)}
                    className={`
                      relative w-full text-left p-4 border-b border-border/50 hover:bg-card/50 
                      transition-all duration-500
                      ${isSelected ? "bg-card/50" : ""}
                      ${isNew ? "animate-in slide-in-from-top-2 fade-in duration-500" : ""}
                    `}
                  >
                    {!message.read && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />}

                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`
                          w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                          transition-colors duration-300
                          ${!message.read ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
                        `}
                        >
                          {message.from.initials}
                        </div>
                        <span
                          className={`text-xs ${!message.read ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                        >
                          {message.from.name}
                        </span>
                        {message.tags.includes("urgent") && (
                          <span className="px-1 py-0.5 text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 rounded">
                            URGENT
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/50">{message.timestamp}</span>
                    </div>
                    <div className={`text-xs ${!message.read ? "text-foreground" : "text-muted-foreground"} mb-2`}>
                      {message.subject}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 line-clamp-2 mb-2">{message.preview}</div>
                    <div className="flex flex-wrap gap-1">
                      {message.tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className={`
                            text-[10px] h-4 px-1 
                            ${tag === "urgent" ? "border-red-500/50 text-red-400" : "border-border/50 text-muted-foreground"}
                            ${tag === "completed" ? "border-green-500/50 text-green-400" : ""}
                            ${tag === "conflict" ? "border-yellow-500/50 text-yellow-400" : ""}
                          `}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                )
              })}
            </ScrollArea>
          </div>

          {/* Right Panel - Message Display */}
          <div className="col-span-6 flex flex-col">
            {selectedMessage ? (
              <>
                {/* Message header */}
                <div className="p-4 border-b border-border/50">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold">
                        {selectedMessage.from.initials}
                      </div>
                      <div>
                        <div className="text-sm text-foreground font-semibold">{selectedMessage.from.name}</div>
                        <div className="text-xs text-muted-foreground">{selectedMessage.subject}</div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{selectedMessage.timestamp}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground/50">
                    To: <span className="text-muted-foreground">{selectedMessage.to.name}</span> (
                    {selectedMessage.to.id})
                  </div>

                  {/* File Leases */}
                  {selectedMessage.fileLeases && selectedMessage.fileLeases.length > 0 && (
                    <div className="mt-4 p-3 bg-card/50 border border-border/50 rounded-lg">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="text-yellow-500">◆</span>
                        <span>File Leases Requested</span>
                      </div>
                      {selectedMessage.fileLeases.map((file, i) => (
                        <div
                          key={file}
                          className="text-xs text-muted-foreground mt-1 flex items-center gap-2 animate-in fade-in duration-300"
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          <span className="text-muted-foreground/50">→</span>
                          <span>{file}</span>
                          <span className="text-yellow-500/50 text-[10px]">LOCKED</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Message body */}
                <ScrollArea className="flex-1 p-4">
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {isTypingBody ? (
                      <>
                        {messageBodyTyped}
                        <span className="animate-pulse text-foreground">▊</span>
                      </>
                    ) : (
                      messageBodyTyped || selectedMessage.body
                    )}
                  </div>
                </ScrollArea>

                {/* Reply section */}
                <div className="p-4 border-t border-border/50">
                  {isTypingReply && (
                    <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                      <span className="flex gap-0.5">
                        <span
                          className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </span>
                      <span>Agent Alpha is typing...</span>
                    </div>
                  )}
                  <div
                    className={`
                      min-h-[80px] p-3 bg-card/50 border border-border/50 rounded-lg text-sm text-foreground mb-2
                      transition-all duration-300
                      ${isTypingReply ? "border-primary/30" : ""}
                    `}
                  >
                    {replyText ? (
                      <>
                        {replyText}
                        {isTypingReply && <span className="animate-pulse text-foreground">▊</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground/50">Reply to {selectedMessage.from.name}...</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" className="rounded border-border" />
                        <span>Request file lease</span>
                      </label>
                    </div>
                    <Button
                      size="sm"
                      className={`
                        bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300
                        ${replyText && !isTypingReply ? "animate-pulse" : ""}
                      `}
                      disabled={!replyText || isTypingReply}
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No message selected
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <div className="mt-6 grid grid-cols-4 gap-4 text-xs">
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-muted-foreground mb-1">ACTIVE AGENTS</div>
          <div className="text-2xl text-foreground font-bold">{AGENTS.length}</div>
        </div>
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-muted-foreground mb-1">MESSAGES TODAY</div>
          <div className="text-2xl text-foreground font-bold">{47 + incomingMessageIndex + 1}</div>
        </div>
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-muted-foreground mb-1">ACTIVE LEASES</div>
          <div className="text-2xl text-foreground font-bold">8</div>
        </div>
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-muted-foreground mb-1">AVG RESPONSE</div>
          <div className="text-2xl text-foreground font-bold">12m</div>
        </div>
      </div>
    </div>
  )
}
