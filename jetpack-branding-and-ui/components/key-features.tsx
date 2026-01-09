"use client"

import { useEffect, useRef, useState } from "react"
import { Brain, HardDrive, Lock, BarChart3, Layers } from "lucide-react"

const features = [
  {
    icon: Brain,
    title: "Swarm Intelligence",
    description: "Agents autonomously claim tasks based on skills and availability",
    details: [
      "Coordinate through message passing to prevent duplicate work",
      "Share knowledge through a collective memory system",
      "Skill-based task assignment for optimal matching",
    ],
  },
  {
    icon: HardDrive,
    title: "Persistent Memory",
    description: "Beads stores task history and dependencies (git-backed)",
    details: [
      "CASS stores semantic memory and learned patterns",
      "Agents learn from past work to improve over time",
      "Memory decay and compaction strategies",
    ],
  },
  {
    icon: Lock,
    title: "Safe Execution",
    description: "File leasing prevents concurrent modification conflicts",
    details: [
      "Task dependencies ensure proper execution order",
      "Automatic rollback on failures",
      "Command verification before execution",
    ],
  },
  {
    icon: BarChart3,
    title: "Visual Oversight",
    description: "Real-time task graph visualization",
    details: ["Agent status monitoring", "Progress tracking and metrics", "Kanban board with drag-and-drop"],
  },
  {
    icon: Layers,
    title: "Multi-Stack Support",
    description: "34+ tech stacks supported",
    details: [
      "Language-specific agents (TypeScript, Python, Rust, Go)",
      "Extensible adapter architecture",
      "Language-specific linting via Bug Scanner",
    ],
  },
]

export function KeyFeatures() {
  const [visibleItems, setVisibleItems] = useState<number[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"))
            setVisibleItems((prev) => [...new Set([...prev, index])])
          }
        })
      },
      { threshold: 0.2 },
    )

    const items = containerRef.current?.querySelectorAll("[data-index]")
    items?.forEach((item) => observer.observe(item))

    return () => observer.disconnect()
  }, [])

  return (
    <section id="features" className="py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

      <div className="max-w-6xl mx-auto px-6 relative" ref={containerRef}>
        <div className="text-center mb-20">
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Features</p>
          <h2 className="text-4xl md:text-5xl font-semibold mb-6 tracking-tight">Key Features</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to orchestrate a swarm of AI agents for software development at scale.
          </p>
        </div>

        <div className="grid gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              data-index={index}
              className={`group p-8 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm
                transition-all duration-700 hover:border-primary/30 hover:bg-card/50
                ${visibleItems.includes(index) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground mb-4">{feature.description}</p>
                  <ul className="space-y-2">
                    {feature.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-1">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
