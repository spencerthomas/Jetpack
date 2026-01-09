"use client"

import { ExternalLink } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const jeffreyTools = [
  "Claude Code Agent Farm",
  "Ultimate MCP Client",
  "MCP Agent Mail",
  "CASS Memory System",
  "Beads Viewer",
  "Named Tmux Manager",
  "Simultaneous Launch Button",
  "Ultimate Bug Scanner",
  "Coding Agent Session Search",
]

const links = [
  { label: "Jeffrey Emanuel's Projects", url: "https://www.jeffreyemanuel.com/projects" },
  { label: "Beads by Steve Yegge", url: "https://github.com/steveyegge/beads" },
  { label: "Model Context Protocol", url: "https://modelcontextprotocol.io" },
  { label: "LangGraph", url: "https://langchain.com" },
]

export function Credits() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} id="credits" className="py-32 relative bg-card/20">
      <div className="max-w-5xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Acknowledgments</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Built on Giants</h2>
          <p className="text-xl text-muted-foreground">
            This project integrates and builds upon amazing open-source work.
          </p>
        </div>

        <div
          className={`grid md:grid-cols-3 gap-8 mb-16 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {/* Jeffrey Emanuel Card */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center font-semibold text-primary text-xl">
                JE
              </div>
              <a
                href="https://www.jeffreyemanuel.com/projects"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                View Projects
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <h3 className="text-2xl font-semibold mb-3">Jeffrey Emanuel</h3>
            <p className="text-muted-foreground mb-6">
              Creator of the Agentic Coding Tooling Flywheel ecosystem—a comprehensive suite of tools for multi-agent
              software development.
            </p>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Flywheel Components:</p>
              <div className="flex flex-wrap gap-2">
                {jeffreyTools.map((tool) => (
                  <span
                    key={tool}
                    className="text-xs font-mono px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Steve Yegge Card */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-chart-2/10 flex items-center justify-center font-semibold text-chart-2 text-xl">
                SY
              </div>
              <a
                href="https://github.com/steveyegge/beads"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-chart-2 transition-colors"
              >
                View Beads
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <h3 className="text-2xl font-semibold mb-3">Steve Yegge</h3>
            <p className="text-muted-foreground mb-6">
              Creator of Beads—a git-backed task management system with dependency tracking and hash-based IDs for
              conflict-free merging. The foundation of Jetpack's task system.
            </p>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Key Features:</p>
              <div className="flex flex-wrap gap-2">
                {["Git-backed Storage", "Task Dependencies", "Hash-based IDs", "Conflict-free Merging"].map((feat) => (
                  <span
                    key={feat}
                    className="text-xs font-mono px-2.5 py-1 rounded-lg bg-chart-2/10 text-chart-2 border border-chart-2/20"
                  >
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* LangGraph Card */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 hover:border-chart-5/30 transition-colors">
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 rounded-xl bg-chart-5/10 flex items-center justify-center font-semibold text-chart-5 text-xl">
                LG
              </div>
              <a
                href="https://langchain.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-chart-5 transition-colors"
              >
                View LangGraph
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <h3 className="text-2xl font-semibold mb-3">LangGraph</h3>
            <p className="text-muted-foreground mb-6">
              A library for building stateful, multi-actor applications with LLMs. Powers Jetpack's optional supervisor
              mode for intelligent task orchestration.
            </p>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground mb-3">Key Features:</p>
              <div className="flex flex-wrap gap-2">
                {["State Management", "Multi-Actor", "Cycles & Branching", "Human-in-the-Loop"].map((feat) => (
                  <span
                    key={feat}
                    className="text-xs font-mono px-2.5 py-1 rounded-lg bg-chart-5/10 text-chart-5 border border-chart-5/20"
                  >
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Links */}
        <div
          className={`transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-xl font-semibold mb-6 text-center">Links</h3>
          <div className="flex flex-wrap justify-center gap-4">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card/50 border border-border/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                {link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
