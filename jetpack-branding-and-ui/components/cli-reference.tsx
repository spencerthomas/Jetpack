"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

const cliCommands = [
  {
    category: "Initialization",
    commands: [
      {
        command: "jetpack init",
        description: "Initialize Jetpack in your project",
        options: [
          { flag: "-a, --agents <number>", desc: "Number of agents (default: 3)" },
          { flag: "-p, --port <number>", desc: "Web UI port (default: 3002)" },
        ],
        example: "jetpack init -a 5 -p 3005",
      },
    ],
  },
  {
    category: "Starting",
    commands: [
      {
        command: "jetpack start",
        description: "Start the orchestrator, agents, and web UI",
        options: [
          { flag: "-a, --agents <number>", desc: "Override number of agents" },
          { flag: "-d, --dir <path>", desc: "Project directory" },
          { flag: "--no-browser", desc: "Don't auto-open browser" },
          { flag: "--no-ui", desc: "CLI-only mode (no web UI)" },
        ],
        example: "jetpack start -a 5 --no-browser",
      },
    ],
  },
  {
    category: "Task Management",
    commands: [
      {
        command: "jetpack task",
        description: "Create a new task",
        options: [
          { flag: "-t, --title <string>", desc: "Task title (required)" },
          { flag: "-d, --description <string>", desc: "Task description" },
          { flag: "-p, --priority <level>", desc: "critical | high | medium | low" },
          { flag: "-s, --skills <list>", desc: "Comma-separated skills" },
          { flag: "-e, --estimate <minutes>", desc: "Estimated time in minutes" },
        ],
        example: 'jetpack task -t "Fix login bug" -p high -s typescript,backend',
      },
      {
        command: "jetpack status",
        description: "View current status of agents and tasks",
        options: [],
        example: "jetpack status",
      },
    ],
  },
  {
    category: "Supervisor Mode",
    commands: [
      {
        command: "jetpack supervise",
        description: "AI-powered task decomposition and orchestration",
        options: [
          { flag: "--llm <provider>", desc: "claude | openai | ollama" },
          { flag: "--model <name>", desc: "Model name (e.g., gpt-4-turbo)" },
          { flag: "-a, --agents <number>", desc: "Number of agents" },
        ],
        example: 'jetpack supervise "Build user authentication" --llm claude -a 5',
      },
    ],
  },
  {
    category: "Demo",
    commands: [
      {
        command: "jetpack demo",
        description: "Run a guided demo with interconnected tasks",
        options: [{ flag: "--agents <number>", desc: "Number of agents for demo" }],
        example: "jetpack demo --agents 5",
      },
    ],
  },
]

export function CLIReference() {
  const [isVisible, setIsVisible] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
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

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopiedCommand(cmd)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  return (
    <section ref={sectionRef} id="cli" className="py-32 relative bg-card/20">
      <div className="max-w-5xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Reference</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">CLI Commands</h2>
          <p className="text-xl text-muted-foreground">Complete reference for all Jetpack CLI commands.</p>
        </div>

        <div className="space-y-12">
          {cliCommands.map((category, catIndex) => (
            <div
              key={category.category}
              className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${catIndex * 100}ms` }}
            >
              <h3 className="text-xl font-semibold mb-6 text-primary">{category.category}</h3>
              <div className="space-y-6">
                {category.commands.map((cmd) => (
                  <div
                    key={cmd.command}
                    className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden"
                  >
                    {/* Command Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/50">
                      <code className="font-mono text-lg font-semibold text-foreground">{cmd.command}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyCommand(cmd.example)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedCommand === cmd.example ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>

                    <div className="p-6">
                      <p className="text-muted-foreground mb-4">{cmd.description}</p>

                      {cmd.options.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold mb-2">Options:</h4>
                          <div className="space-y-2">
                            {cmd.options.map((opt) => (
                              <div key={opt.flag} className="flex items-start gap-4 text-sm">
                                <code className="font-mono text-primary whitespace-nowrap">{opt.flag}</code>
                                <span className="text-muted-foreground">{opt.desc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-background/50 rounded-xl p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2">Example:</h4>
                        <code className="font-mono text-sm text-foreground">{cmd.example}</code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
