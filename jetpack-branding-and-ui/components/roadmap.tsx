"use client"

import { useEffect, useRef, useState } from "react"
import {
  Terminal,
  Bug,
  Radio,
  GitBranch,
  Search,
  Rocket,
  Cloud,
  Github,
  Trophy,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  Mail,
  Brain,
} from "lucide-react"
import Link from "next/link"

const completedItems = [
  {
    icon: LayoutDashboard,
    title: "Kanban Web UI",
    description: "Modern drag-and-drop interface for task management",
  },
  {
    icon: Mail,
    title: "MCP Mail Inbox Viewer",
    description: "Real-time message monitoring between agents",
  },
  {
    icon: Brain,
    title: "LangGraph Supervisor",
    description: "Intelligent orchestration with multi-LLM support (Claude, OpenAI, Ollama)",
  },
]

const roadmapItems = [
  {
    icon: Terminal,
    title: "Named Tmux Manager",
    description: "Integration with Named Tmux Manager for command orchestration",
    status: "planned",
  },
  {
    icon: Bug,
    title: "Ultimate Bug Scanner",
    description: "Adapter for quality gates and automated bug detection",
    status: "planned",
  },
  {
    icon: Radio,
    title: "WebSocket Support",
    description: "Instant UI updates with real-time WebSocket connections",
    status: "in-progress",
  },
  {
    icon: GitBranch,
    title: "Task Dependency Graph",
    description: "Visual representation of task dependencies and execution flow",
    status: "in-progress",
  },
  {
    icon: Search,
    title: "Session Search",
    description: "Learn from history with searchable session archives",
    status: "planned",
  },
  {
    icon: Rocket,
    title: "Simultaneous Launch",
    description: "Safe multi-command execution with conflict prevention",
    status: "planned",
  },
  {
    icon: Cloud,
    title: "Cloud Agent Farm",
    description: "Cloud-hosted agent infrastructure for scalable workloads",
    status: "future",
  },
  {
    icon: Github,
    title: "Issue Tracking Integration",
    description: "GitHub Issues and Linear integration for seamless workflow",
    status: "future",
  },
  {
    icon: Trophy,
    title: "Agent Leaderboards",
    description: "Performance metrics and competitive agent rankings",
    status: "future",
  },
]

const statusConfig = {
  "in-progress": { label: "In Progress", className: "bg-chart-2/20 text-chart-2 border-chart-2/30" },
  planned: { label: "Planned", className: "bg-primary/20 text-primary border-primary/30" },
  future: { label: "Future", className: "bg-muted text-muted-foreground border-border" },
}

export function Roadmap() {
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
    <section ref={sectionRef} id="roadmap" className="relative py-32 px-6 bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-transparent to-muted/30" />

      <div className="max-w-6xl mx-auto relative">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Roadmap</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">What's Next</h2>
          <p className="text-xl text-muted-foreground">The future accelerates. Here's what we're building.</p>
        </div>

        {/* Completed Items */}
        <div
          className={`mb-16 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-chart-2" />
            Completed
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {completedItems.map((item, i) => (
              <div
                key={item.title}
                className="bg-chart-2/5 border border-chart-2/20 rounded-xl p-6 transition-all hover:border-chart-2/40"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-chart-2" />
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-chart-2" />
                </div>
                <h4 className="font-semibold mb-2">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Items */}
        <div
          className={`transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-xl font-semibold mb-6">Upcoming</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roadmapItems.map((item, i) => {
              const status = statusConfig[item.status as keyof typeof statusConfig]

              return (
                <div
                  key={item.title}
                  className="group bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-6 transition-all hover:border-primary/30"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-md border ${status.className}`}>
                      {status.label}
                    </span>
                  </div>

                  <h4 className="font-semibold mb-2">{item.title}</h4>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div
          className={`mt-12 text-center transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-muted-foreground mb-4">Have a feature request?</p>
          <Link
            href="https://github.com/spencerthomas/Jetpack/issues"
            target="_blank"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
          >
            <Github className="w-4 h-4" />
            Open an issue on GitHub
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
