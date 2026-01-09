"use client"

import { useEffect, useState } from "react"

interface Node {
  id: number
  x: number
  y: number
  label: string
  size: number
  connections: number[]
}

const NODES: Node[] = [
  { id: 0, x: 50, y: 30, label: "user_preferences", size: 8, connections: [1, 3] },
  { id: 1, x: 25, y: 50, label: "project_context", size: 10, connections: [0, 2, 4] },
  { id: 2, x: 75, y: 55, label: "code_patterns", size: 9, connections: [1, 5] },
  { id: 3, x: 15, y: 25, label: "past_decisions", size: 7, connections: [0, 4] },
  { id: 4, x: 40, y: 70, label: "semantic_memory", size: 11, connections: [1, 3, 5] },
  { id: 5, x: 85, y: 40, label: "task_history", size: 8, connections: [2, 4] },
  { id: 6, x: 60, y: 80, label: "learned_styles", size: 6, connections: [4] },
  { id: 7, x: 30, y: 15, label: "domain_knowledge", size: 9, connections: [0, 3] },
]

export function CassVisualizer() {
  const [activeNode, setActiveNode] = useState<number | null>(null)
  const [queryPhase, setQueryPhase] = useState<"idle" | "searching" | "retrieving" | "complete">("idle")
  const [retrievedNodes, setRetrievedNodes] = useState<number[]>([])
  const [typedText, setTypedText] = useState("")

  const fullText =
    "CASS stores vector embeddings—numerical representations of meaning. When an agent needs context, it queries semantically similar memories from past work."

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
    }, 30)
    return () => clearInterval(interval)
  }, [])

  // Query animation cycle
  useEffect(() => {
    const cycle = () => {
      setQueryPhase("searching")
      setRetrievedNodes([])

      setTimeout(() => {
        setQueryPhase("retrieving")
        setRetrievedNodes([1, 4])
      }, 1500)

      setTimeout(() => {
        setRetrievedNodes([1, 4, 2])
      }, 2000)

      setTimeout(() => {
        setQueryPhase("complete")
      }, 2500)

      setTimeout(() => {
        setQueryPhase("idle")
        setRetrievedNodes([])
      }, 5000)
    }

    cycle()
    const interval = setInterval(cycle, 7000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full">
      {/* Header - styled to match site */}
      <div className="mb-6 border border-border/50 p-6 bg-card/50 backdrop-blur-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-muted-foreground">[</span>
          <span className="text-primary tracking-widest text-sm">CASS</span>
          <span className="text-muted-foreground">]</span>
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Context-Aware Semantic Storage</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {typedText}
          <span className="animate-pulse text-primary">_</span>
        </p>
      </div>

      {/* Main Visualization */}
      <div className="relative border border-border/50 bg-background/50 backdrop-blur-sm rounded-2xl aspect-[16/10] overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--primary)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--primary)) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* SVG Layer for connections */}
        <svg className="absolute inset-0 w-full h-full">
          {NODES.map((node) =>
            node.connections.map((targetId) => {
              const target = NODES.find((n) => n.id === targetId)
              if (!target || targetId < node.id) return null

              const isActive = retrievedNodes.includes(node.id) && retrievedNodes.includes(targetId)

              return (
                <line
                  key={`${node.id}-${targetId}`}
                  x1={`${node.x}%`}
                  y1={`${node.y}%`}
                  x2={`${target.x}%`}
                  y2={`${target.y}%`}
                  stroke={isActive ? "hsl(var(--primary))" : "hsl(var(--border))"}
                  strokeWidth={isActive ? 2 : 1}
                  strokeDasharray={isActive ? "none" : "4 4"}
                  className="transition-all duration-500"
                />
              )
            }),
          )}
        </svg>

        {/* Nodes */}
        {NODES.map((node) => {
          const isRetrieved = retrievedNodes.includes(node.id)
          const isHovered = activeNode === node.id

          return (
            <div
              key={node.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onMouseEnter={() => setActiveNode(node.id)}
              onMouseLeave={() => setActiveNode(null)}
            >
              {/* Pulse ring for retrieved nodes */}
              {isRetrieved && (
                <div
                  className="absolute rounded-full border border-primary animate-ping"
                  style={{
                    width: node.size * 6,
                    height: node.size * 6,
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              )}

              {/* Node core */}
              <div
                className={`
                  rounded-full transition-all duration-300 relative
                  ${isRetrieved ? "bg-primary" : isHovered ? "bg-muted-foreground" : "bg-muted"}
                `}
                style={{
                  width: node.size * 4,
                  height: node.size * 4,
                  boxShadow: isRetrieved ? "0 0 20px hsl(var(--primary) / 0.5)" : "none",
                }}
              >
                {/* Inner dot */}
                <div
                  className={`
                    absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full
                    ${isRetrieved ? "bg-primary-foreground" : "bg-background"}
                  `}
                  style={{
                    width: node.size * 1.5,
                    height: node.size * 1.5,
                  }}
                />
              </div>

              {/* Label */}
              <div
                className={`
                  absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs
                  transition-all duration-300
                  ${isRetrieved || isHovered ? "opacity-100" : "opacity-0"}
                `}
                style={{ top: node.size * 4 + 8 }}
              >
                <span className="text-muted-foreground">&lt;</span>
                <span className={isRetrieved ? "text-primary" : "text-foreground"}>{node.label}</span>
                <span className="text-muted-foreground">/&gt;</span>
              </div>
            </div>
          )
        })}

        {/* Query visualization */}
        {queryPhase !== "idle" && (
          <div className="absolute top-4 left-4 right-4">
            <div className="inline-flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border/50 px-4 py-2 text-xs rounded-lg">
              <span className="text-muted-foreground">agent.query(</span>
              <span className="text-primary">"relevant context"</span>
              <span className="text-muted-foreground">)</span>
              <span className="text-border mx-2">→</span>
              {queryPhase === "searching" && <span className="text-muted-foreground animate-pulse">searching...</span>}
              {queryPhase === "retrieving" && (
                <span className="text-foreground">retrieving [{retrievedNodes.length}]</span>
              )}
              {queryPhase === "complete" && <span className="text-primary">✓ {retrievedNodes.length} embeddings</span>}
            </div>
          </div>
        )}

        {/* Vector coordinates display */}
        <div className="absolute bottom-4 right-4 text-xs text-muted-foreground">
          <div className="flex flex-col items-end gap-1">
            <span>dimensions: 1536</span>
            <span>embeddings: {NODES.length}</span>
            <span className="text-muted-foreground/60">similarity: cosine</span>
          </div>
        </div>
      </div>

      {/* Footer explanation */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-primary mb-2">01 / STORE</div>
          <p className="text-muted-foreground">
            Text is converted into high-dimensional vectors that capture semantic meaning.
          </p>
        </div>
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-primary mb-2">02 / INDEX</div>
          <p className="text-muted-foreground">Similar concepts cluster together in vector space for fast retrieval.</p>
        </div>
        <div className="border border-border/50 p-4 bg-card/50 backdrop-blur-sm rounded-xl">
          <div className="text-primary mb-2">03 / RETRIEVE</div>
          <p className="text-muted-foreground">
            Agents query by meaning, not keywords—finding contextually relevant memories.
          </p>
        </div>
      </div>
    </div>
  )
}
