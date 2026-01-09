"use client"

import { useEffect, useState } from "react"

interface BeadNode {
  id: string
  title: string
  status: "pending" | "ready" | "claimed" | "in-progress" | "completed"
  priority: "low" | "medium" | "high"
  depth: number
  parentId: string | null
}

const BEAD_SEQUENCE: BeadNode[] = [
  { id: "bd-a3f8", title: "Auth System", status: "in-progress", priority: "high", depth: 0, parentId: null },
  { id: "bd-a3f8.1", title: "JWT Setup", status: "completed", priority: "high", depth: 1, parentId: "bd-a3f8" },
  {
    id: "bd-a3f8.1.1",
    title: "Token Generation",
    status: "completed",
    priority: "high",
    depth: 2,
    parentId: "bd-a3f8.1",
  },
  {
    id: "bd-a3f8.1.2",
    title: "Validation Logic",
    status: "completed",
    priority: "medium",
    depth: 2,
    parentId: "bd-a3f8.1",
  },
  { id: "bd-a3f8.2", title: "OAuth Flow", status: "in-progress", priority: "medium", depth: 1, parentId: "bd-a3f8" },
  { id: "bd-a3f8.2.1", title: "Google Auth", status: "claimed", priority: "high", depth: 2, parentId: "bd-a3f8.2" },
  {
    id: "bd-a3f8.2.1.1",
    title: "Callback Handler",
    status: "ready",
    priority: "high",
    depth: 3,
    parentId: "bd-a3f8.2.1",
  },
  {
    id: "bd-a3f8.2.1.2",
    title: "Profile Sync",
    status: "pending",
    priority: "medium",
    depth: 3,
    parentId: "bd-a3f8.2.1",
  },
  {
    id: "bd-a3f8.3",
    title: "Session Management",
    status: "pending",
    priority: "medium",
    depth: 1,
    parentId: "bd-a3f8",
  },
  { id: "bd-a3f8.3.1", title: "Redis Store", status: "pending", priority: "low", depth: 2, parentId: "bd-a3f8.3" },
  { id: "bd-a3f8.3.2", title: "Expiry Logic", status: "pending", priority: "low", depth: 2, parentId: "bd-a3f8.3" },
]

const STATUS_CONFIG = {
  pending: {
    bg: "bg-card/30",
    border: "border-border/50",
    text: "text-muted-foreground",
    indicator: "bg-muted-foreground/50",
  },
  ready: {
    bg: "bg-card/50",
    border: "border-border",
    text: "text-foreground/80",
    indicator: "bg-foreground/60",
  },
  claimed: {
    bg: "bg-card/60",
    border: "border-primary",
    text: "text-foreground",
    indicator: "bg-primary",
  },
  "in-progress": {
    bg: "bg-card/70",
    border: "border-primary",
    text: "text-foreground",
    indicator: "bg-primary",
  },
  completed: {
    bg: "bg-card/20",
    border: "border-border/30",
    text: "text-muted-foreground/60",
    indicator: "bg-muted-foreground/40",
  },
}

export function BeadsVisualizer() {
  const [nodes, setNodes] = useState<BeadNode[]>(BEAD_SEQUENCE)
  const [scanIndex, setScanIndex] = useState(-1)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [phase, setPhase] = useState<"scanning" | "claiming" | "executing" | "complete" | "idle">("idle")
  const [typedText, setTypedText] = useState("")

  const fullText =
    "Beads provides persistent, structured memory for coding agents. A dependency-aware graph replaces messy markdown—agents handle long-horizon tasks without losing context."

  // Typewriter effect
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < fullText.length) {
        setTypedText(fullText.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
      }
    }, 25)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const runCycle = () => {
      setNodes(BEAD_SEQUENCE)
      setPhase("scanning")
      setScanIndex(0)

      // Scan through nodes one by one
      let currentScan = 0
      const scanInterval = setInterval(() => {
        currentScan++
        if (currentScan >= nodes.length) {
          clearInterval(scanInterval)

          // Find first ready node
          const readyIndex = BEAD_SEQUENCE.findIndex((n) => n.status === "ready")
          if (readyIndex !== -1) {
            setScanIndex(readyIndex)
            setActiveNodeId(BEAD_SEQUENCE[readyIndex].id)
            setPhase("claiming")

            setTimeout(() => {
              setNodes((prev) => prev.map((n, i) => (i === readyIndex ? { ...n, status: "claimed" as const } : n)))
              setPhase("executing")
            }, 800)

            setTimeout(() => {
              setNodes((prev) => prev.map((n, i) => (i === readyIndex ? { ...n, status: "in-progress" as const } : n)))
            }, 1600)

            setTimeout(() => {
              setNodes((prev) => prev.map((n, i) => (i === readyIndex ? { ...n, status: "completed" as const } : n)))
              setPhase("complete")
            }, 3000)

            setTimeout(() => {
              setPhase("idle")
              setScanIndex(-1)
              setActiveNodeId(null)
            }, 4000)
          }
        } else {
          setScanIndex(currentScan)
        }
      }, 120)

      return () => clearInterval(scanInterval)
    }

    const timeout = setTimeout(runCycle, 1500)
    const interval = setInterval(runCycle, 8000)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-muted-foreground">[</span>
          <span className="text-foreground tracking-widest text-sm font-semibold">BEADS</span>
          <span className="text-muted-foreground">]</span>
        </div>
        <h3 className="text-2xl font-semibold text-foreground mb-2">Persistent Task Memory</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {typedText}
          <span className="animate-pulse text-primary">_</span>
        </p>
      </div>

      {/* Main Visualization - Sequential List */}
      <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-card/80">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-mono">beads.list()</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {nodes.filter((n) => n.status === "completed").length}/{nodes.length} complete
            </span>
            {phase !== "idle" && (
              <span className="text-primary font-semibold">
                {phase === "scanning" && "SCANNING..."}
                {phase === "claiming" && "CLAIMING"}
                {phase === "executing" && "EXECUTING"}
                {phase === "complete" && "DONE"}
              </span>
            )}
          </div>
        </div>

        {/* Task list */}
        <div className="relative">
          {/* Scan line overlay */}
          {phase === "scanning" && scanIndex >= 0 && (
            <div
              className="absolute left-0 right-0 h-[44px] bg-primary/10 border-l-2 border-primary transition-transform duration-100"
              style={{ transform: `translateY(${scanIndex * 44}px)` }}
            />
          )}

          {nodes.map((node, index) => {
            const config = STATUS_CONFIG[node.status]
            const isActive = activeNodeId === node.id
            const isScanning = phase === "scanning" && scanIndex === index
            const depthMarkers = Array.from({ length: node.depth }, (_, i) => i)

            return (
              <div
                key={node.id}
                className={`
                  relative flex items-center h-[44px] border-b border-border/30
                  transition-all duration-300
                  ${isActive ? "bg-primary/10" : config.bg}
                  ${isScanning ? "bg-primary/5" : ""}
                `}
              >
                {/* Depth tree lines */}
                <div className="flex items-center h-full">
                  {depthMarkers.map((d) => (
                    <div key={d} className="w-6 h-full flex items-center justify-center">
                      <div className="w-px h-full bg-border/50" />
                    </div>
                  ))}
                  {node.depth > 0 && (
                    <div className="w-6 flex items-center">
                      <div className="w-3 h-px bg-border" />
                    </div>
                  )}
                </div>

                {/* Status indicator */}
                <div className="flex items-center gap-3 px-3 flex-1">
                  <div className="relative flex items-center justify-center w-5">
                    <div
                      className={`
                        w-2.5 h-2.5 rounded-full transition-all duration-300
                        ${config.indicator}
                        ${node.status === "in-progress" ? "scale-110" : ""}
                      `}
                    />
                    {isActive && phase === "executing" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full border border-primary/50 animate-[spin_2s_linear_infinite]">
                          <div className="absolute top-0 left-1/2 w-0.5 h-1 bg-primary -translate-x-1/2" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Task ID */}
                  <code
                    className={`
                      text-xs transition-all duration-300 w-28
                      ${config.text}
                      ${node.status === "completed" ? "line-through decoration-muted-foreground/40" : ""}
                    `}
                  >
                    {node.id}
                  </code>

                  {/* Task title */}
                  <span
                    className={`
                      text-sm transition-all duration-300 flex-1
                      ${node.status === "completed" ? "text-muted-foreground/60 line-through decoration-muted-foreground/40" : "text-foreground/80"}
                      ${isActive ? "text-foreground" : ""}
                    `}
                  >
                    {node.title}
                  </span>

                  {/* Status badge */}
                  <div
                    className={`
                      text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded transition-all duration-300
                      ${config.border} ${config.text}
                    `}
                  >
                    {node.status}
                  </div>

                  {/* Priority bar */}
                  <div className="w-8 flex gap-0.5 justify-end">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`
                          w-1 h-3 rounded-sm transition-colors duration-300
                          ${
                            (node.priority === "high" && level <= 3) ||
                            (node.priority === "medium" && level <= 2) ||
                            (node.priority === "low" && level <= 1)
                              ? "bg-primary/60"
                              : "bg-border/50"
                          }
                        `}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Command output footer */}
        <div className="border-t border-border/50 px-4 py-3 bg-card/80 text-xs font-mono">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-muted-foreground/50">$</span>
            {phase === "idle" && <span className="text-muted-foreground">ready</span>}
            {phase === "scanning" && (
              <span className="text-foreground/80">
                scanning task tree<span className="animate-pulse">...</span>
              </span>
            )}
            {phase === "claiming" && (
              <span>
                <span className="text-muted-foreground">beads.claimTask(</span>
                <span className="text-primary">"{activeNodeId}"</span>
                <span className="text-muted-foreground">)</span>
              </span>
            )}
            {phase === "executing" && (
              <span className="text-primary">
                executing {activeNodeId}
                <span className="animate-pulse">...</span>
              </span>
            )}
            {phase === "complete" && <span className="text-muted-foreground">task completed ✓</span>}
          </div>
        </div>
      </div>

      {/* Hierarchical ID explanation */}
      <div className="mt-6 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
        <div className="text-muted-foreground text-xs mb-4 tracking-wider">HIERARCHICAL ID STRUCTURE</div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex flex-col items-center">
            <code className="text-foreground bg-background/50 px-3 py-1.5 rounded-lg border border-border/50">
              bd-a3f8
            </code>
            <span className="text-muted-foreground text-xs mt-2">Epic</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex flex-col items-center">
            <code className="text-foreground bg-background/50 px-3 py-1.5 rounded-lg border border-border/50">
              bd-a3f8.1
            </code>
            <span className="text-muted-foreground text-xs mt-2">Task</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex flex-col items-center">
            <code className="text-foreground bg-background/50 px-3 py-1.5 rounded-lg border border-border/50">
              bd-a3f8.1.1
            </code>
            <span className="text-muted-foreground text-xs mt-2">Sub-task</span>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex flex-col items-center">
            <code className="text-muted-foreground bg-background/50 px-3 py-1.5 rounded-lg border border-border/50">
              bd-a3f8.1.1.1
            </code>
            <span className="text-muted-foreground text-xs mt-2">Leaf</span>
          </div>
        </div>
      </div>

      {/* Feature cards */}
      <div className="mt-4 grid md:grid-cols-3 gap-4 text-xs">
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-5 hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2 font-semibold">01 / STRUCTURE</div>
          <p className="text-muted-foreground">
            Hierarchical task trees with parent-child relationships and dependency tracking.
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-5 hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2 font-semibold">02 / ATOMIC</div>
          <p className="text-muted-foreground">
            Race-free task claiming ensures no duplicate work across parallel agents.
          </p>
        </div>
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-5 hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2 font-semibold">03 / PERSISTENT</div>
          <p className="text-muted-foreground">Tasks survive restarts—agents resume exactly where they left off.</p>
        </div>
      </div>
    </div>
  )
}
