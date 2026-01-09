"use client"

import React from "react"

import { useEffect, useRef, useState } from "react"
import { Database, Mail, Brain, Users, ArrowRight } from "lucide-react"
import Link from "next/link"

const components = [
  { name: "Beads", purpose: "Persistent task queue with dependency tracking", storage: "data/beads.db" },
  { name: "MCP Mail", purpose: "Pub/sub messaging between agents", storage: "data/mcp-mail.db" },
  { name: "CASS", purpose: "Vector-based semantic memory for context", storage: "data/cass.db" },
  { name: "Orchestrator", purpose: "Coordinates adapters and agent lifecycle", storage: "In-memory" },
  { name: "Supervisor", purpose: "LLM-powered planning and conflict resolution", storage: "In-memory" },
]

const architectureCards = [
  {
    icon: Database,
    name: "Beads",
    subtitle: "Task Queue",
    tagline: "Persistent structured memory",
    description:
      "Replaces messy markdown with a dependency-aware graph. Hierarchical IDs (bd-a3f8.1.1) enable atomic claiming for long-horizon tasks.",
    href: "/features/beads",
  },
  {
    icon: Mail,
    name: "MCP Mail",
    subtitle: "Agent Inbox",
    tagline: "Coordination layer",
    description:
      "Mail-like system giving agents memorable identities, inbox/outbox, searchable history, and voluntary file leases to avoid conflicts.",
    href: "/features/mcp-mail",
  },
  {
    icon: Brain,
    name: "CASS",
    subtitle: "Shared Memory",
    tagline: "Context-aware semantic storage",
    description:
      "Vector embeddings for semantic search. Agents retrieve relevant context from past work without losing institutional knowledge.",
    href: "/features/cass",
  },
  {
    icon: Users,
    name: "Agent Controllers",
    subtitle: "Workers",
    tagline: "Parallel execution",
    description:
      "1-N worker agents powered by Claude Code. Each claims tasks atomically, executes independently, and reports back through the adapters.",
    href: "/features/agent-controller",
  },
]

export function Architecture() {
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
    <section ref={sectionRef} id="architecture" className="py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

      <div className="max-w-6xl mx-auto px-6 relative">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Architecture</p>
          <h2 className="text-4xl md:text-5xl font-semibold mb-6 tracking-tight">Layered Architecture</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Jetpack has a layered architecture with three core storage adapters and an optional LangGraph supervisor for
            intelligent orchestration.
          </p>
        </div>

        {/* Architecture Cards */}
        <div
          className={`grid md:grid-cols-2 gap-6 mb-16 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {architectureCards.map((card, i) => (
            <Link
              key={card.name}
              href={card.href}
              className="group relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 hover:-translate-y-1"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                    {React.createElement(card.icon, { className: "w-6 h-6" })}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">
                      {card.name} <span className="text-muted-foreground font-normal">— {card.subtitle}</span>
                    </h3>
                    <p className="text-sm text-primary">{card.tagline}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* ASCII Architecture Diagram */}
        <div
          className={`mb-16 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        ></div>

        {/* Component Table */}
        <div
          className={`transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-2xl font-semibold mb-6">Component Overview</h3>
          <div className="bg-card/30 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-card/50">
                    <th className="text-left p-4 font-semibold">Component</th>
                    <th className="text-left p-4 font-semibold">Purpose</th>
                    <th className="text-left p-4 font-semibold">Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((comp, i) => (
                    <tr key={comp.name} className={`border-b border-border/30 ${i % 2 === 0 ? "bg-card/20" : ""}`}>
                      <td className="p-4 font-medium text-primary">{comp.name}</td>
                      <td className="p-4 text-muted-foreground">{comp.purpose}</td>
                      <td className="p-4 font-mono text-sm text-muted-foreground">{comp.storage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
