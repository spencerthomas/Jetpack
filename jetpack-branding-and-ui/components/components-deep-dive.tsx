"use client"

import { useEffect, useRef, useState } from "react"
import { Database, Mail, Brain, Bot } from "lucide-react"
import { CassVisualizer } from "@/components/cass-visualizer"
import { AgentControllerVisualizer } from "@/components/agent-controller-visualizer"
import { BeadsVisualizer } from "@/components/beads-visualizer"
import { AgentMailVisualizer } from "@/components/agent-mail-visualizer"

const memoryTypes = [
  { type: "codebase_knowledge", description: "Understanding of project structure" },
  { type: "agent_learning", description: "Patterns learned from completed tasks" },
  { type: "conversation_history", description: "Past interactions" },
  { type: "decision_rationale", description: "Why certain choices were made" },
]

const agentSkills = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "react",
  "vue",
  "angular",
  "svelte",
  "backend",
  "frontend",
  "database",
  "devops",
  "testing",
  "documentation",
  "security",
]

const components = [
  {
    id: "beads",
    label: "Beads",
    subtitle: "Task Queue",
    icon: Database,
    description: "Persistent task storage system that manages task lifecycle and dependency tracking.",
  },
  {
    id: "mail",
    label: "MCP Mail",
    subtitle: "Agent Communication",
    icon: Mail,
    description: "Pub/sub messaging system for real-time agent coordination and event broadcasting.",
  },
  {
    id: "cass",
    label: "CASS",
    subtitle: "Shared Memory",
    icon: Brain,
    description: "Context-Aware Semantic Storage for vector embeddings and semantic search.",
  },
  {
    id: "agent",
    label: "Agent Controller",
    subtitle: "Worker",
    icon: Bot,
    description: "Autonomous workers that claim and execute tasks using Claude Code CLI.",
  },
]

export function ComponentsDeepDive() {
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
    <section ref={sectionRef} id="components" className="py-32 relative bg-card/20">
      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Deep Dive</p>
          <h2 className="text-4xl md:text-5xl font-semibold mb-6 tracking-tight">How Jetpack Works</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Detailed explanations of each component and how they work together.
          </p>
        </div>

        <div className="space-y-24">
          {/* Beads Section */}
          <div
            className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold">Beads</h3>
                <p className="text-muted-foreground">Task Queue</p>
              </div>
            </div>
            <BeadsVisualizer />
          </div>

          {/* MCP Mail Section */}
          <div
            className={`transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold">MCP Mail</h3>
                <p className="text-muted-foreground">Agent Communication</p>
              </div>
            </div>
            <AgentMailVisualizer />
          </div>

          {/* CASS Section */}
          <div
            className={`transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold">CASS</h3>
                <p className="text-muted-foreground">Shared Memory</p>
              </div>
            </div>
            <CassVisualizer />

            {/* Memory Types Cards */}
            <div className="mt-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h4 className="text-lg font-semibold mb-4">Memory Types</h4>
              <div className="grid md:grid-cols-2 gap-4">
                {memoryTypes.map((mem) => (
                  <div
                    key={mem.type}
                    className="group relative bg-background/50 rounded-xl p-5 border border-border/30 
                      hover:border-primary/50 hover:bg-background/80 
                      transition-all duration-300 ease-out
                      hover:shadow-lg hover:shadow-primary/5
                      hover:-translate-y-1"
                  >
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Brain className="w-4 h-4 text-primary" />
                        </div>
                        <p className="font-mono text-sm text-primary group-hover:text-primary/90">{mem.type}</p>
                      </div>
                      <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/90 pl-11">
                        {mem.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agent Controller Section */}
          <div
            className={`transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold">Agent Controller</h3>
                <p className="text-muted-foreground">Worker</p>
              </div>
            </div>
            <AgentControllerVisualizer />

            {/* Additional technical details */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h4 className="text-lg font-semibold mb-4">Claude Code Execution</h4>
                <p className="text-muted-foreground text-sm mb-4">
                  Each agent spawns a Claude Code process to do real work:
                </p>
                <div className="bg-background/50 rounded-xl p-4 overflow-x-auto">
                  <pre className="text-sm text-primary">
                    {`claude --print --dangerously-skip-permissions "<task prompt>"`}
                  </pre>
                </div>
              </div>

              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h4 className="text-lg font-semibold mb-4">Supported Skills</h4>
                <p className="text-muted-foreground text-sm mb-4">
                  Agents can be configured with any combination of skills:
                </p>
                <div className="flex flex-wrap gap-2">
                  {agentSkills.map((skill) => (
                    <span key={skill} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
