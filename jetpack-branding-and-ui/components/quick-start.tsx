"use client"

import { Button } from "@/components/ui/button"
import { Copy, Check, Terminal, FolderTree } from "lucide-react"
import { useState, useRef, useEffect } from "react"

const prerequisites = [
  { name: "Node.js", version: ">= 20.0.0" },
  { name: "pnpm", version: ">= 9.0.0" },
  { name: "Claude Code CLI", version: "npm install -g @anthropic-ai/claude-code" },
  { name: "ANTHROPIC_API_KEY", version: "environment variable set" },
]

const initCreates = [
  { path: ".beads/", desc: "Task storage (git-tracked)" },
  { path: ".beads/tasks/", desc: "Drop .md files here to create tasks" },
  { path: ".cass/", desc: "Agent memory" },
  { path: ".jetpack/config.json", desc: "Project configuration" },
  { path: "CLAUDE.md", desc: "Updated with usage instructions" },
]

const startLaunches = [
  { icon: "🚀", name: "Orchestrator", desc: "coordinates agent work" },
  { icon: "🤖", name: "AI Agents", desc: "execute tasks (default: 3)" },
  { icon: "📺", name: "Web UI", desc: "http://localhost:3002" },
  { icon: "👀", name: "File watcher", desc: "monitors .beads/tasks/ for new task files" },
]

const codeBlocks = [
  {
    label: "Clone & Install",
    code: `# Clone the repository
git clone https://github.com/spencerthomas/Jetpack.git
cd Jetpack

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Verify installation
pnpm jetpack --help`,
  },
  {
    label: "Initialize Your Project",
    code: `cd /path/to/your/project
jetpack init`,
  },
  {
    label: "Start Jetpack",
    code: `jetpack start`,
  },
]

const taskCreationMethods = [
  {
    label: "Option A: Drop a file (recommended)",
    code: `# Create .beads/tasks/my-first-task.md:
---
title: Add a hello world endpoint
priority: medium
skills: [typescript, backend]
---

Create a simple GET /hello endpoint that returns "Hello, World!"`,
  },
  {
    label: "Option B: Use the CLI",
    code: `jetpack task -t "Add hello world endpoint" -p medium -s typescript,backend`,
  },
  {
    label: "Option C: Use the Web UI",
    code: `# Open http://localhost:3002
# Click "New Task" in the Kanban board`,
  },
]

export function QuickStart() {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)
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

  const copyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code)
    setCopiedIndex(key)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <section ref={sectionRef} id="quickstart" className="relative py-32 px-6 bg-background">
      <div className="max-w-4xl mx-auto">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Getting Started</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Quick Start (5 minutes)</h2>
          <p className="text-xl text-muted-foreground">Get up and running with Jetpack in just a few steps.</p>
        </div>

        {/* Prerequisites */}
        <div
          className={`mb-12 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-2xl font-semibold mb-6">Prerequisites</h3>
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
            <div className="grid md:grid-cols-2 gap-4">
              {prerequisites.map((prereq) => (
                <div key={prereq.name} className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-medium">{prereq.name}</span>
                  <span className="text-muted-foreground font-mono text-sm">{prereq.version}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Installation Steps */}
        <div className="space-y-6 mb-12">
          {codeBlocks.map((block, i) => (
            <div
              key={block.label}
              className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${(i + 2) * 100}ms` }}
            >
              <div className="relative bg-card rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-colors">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                      {i + 1}
                    </div>
                    <span className="text-sm font-medium">{block.label}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => copyCode(block.code, `install-${i}`)}
                  >
                    {copiedIndex === `install-${i}` ? (
                      <>
                        <Check className="w-3 h-3 mr-2" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-2" /> Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-4 font-mono text-sm">
                  <pre className="text-foreground/90 overflow-x-auto whitespace-pre-wrap">
                    <code>{block.code}</code>
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* What init creates */}
        <div
          className={`mb-12 transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <FolderTree className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">jetpack init creates:</h4>
            </div>
            <div className="space-y-2">
              {initCreates.map((item) => (
                <div key={item.path} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-primary">{item.path}</span>
                  <span className="text-muted-foreground">— {item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* What start launches */}
        <div
          className={`mb-12 transition-all duration-700 delay-600 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-primary" />
              <h4 className="font-semibold">jetpack start launches:</h4>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {startLaunches.map((item) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground text-sm">— {item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Task Creation Methods */}
        <div
          className={`transition-all duration-700 delay-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-2xl font-semibold mb-6">Creating Tasks</h3>
          <div className="space-y-4">
            {taskCreationMethods.map((method, i) => (
              <div
                key={method.label}
                className="relative bg-card rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                  <span className="text-sm font-medium">{method.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => copyCode(method.code, `task-${i}`)}
                  >
                    {copiedIndex === `task-${i}` ? (
                      <>
                        <Check className="w-3 h-3 mr-2" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-2" /> Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-4 font-mono text-sm">
                  <pre className="text-foreground/90 overflow-x-auto whitespace-pre-wrap">
                    <code>{method.code}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Watch the Magic */}
        <div
          className={`mt-12 transition-all duration-700 delay-800 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="bg-gradient-to-r from-primary/10 to-chart-2/10 rounded-2xl border border-primary/20 p-8 text-center">
            <h4 className="text-xl font-semibold mb-4">Watch the Magic</h4>
            <p className="text-muted-foreground mb-4">Agents will automatically:</p>
            <div className="flex flex-wrap justify-center gap-4">
              {["Detect your task", "Claim it based on skills", "Execute via Claude Code", "Mark as complete"].map(
                (step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-sm">{step}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
