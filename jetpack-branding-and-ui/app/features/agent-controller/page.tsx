import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { AgentControllerVisualizer } from "@/components/agent-controller-visualizer"
import { Bot, ArrowLeft } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Agent Controller - Worker Execution | Jetpack",
  description: "Autonomous worker agents that claim and execute tasks using Claude Code CLI.",
}

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

export default function AgentControllerPage() {
  return (
    <main className="min-h-screen bg-background text-foreground dark">
      <Header />

      <section className="pt-32 pb-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

        <div className="max-w-6xl mx-auto px-6 relative">
          <Link
            href="/#architecture"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Overview
          </Link>

          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Agent Controller</h1>
              <p className="text-xl text-muted-foreground">Worker Execution</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground max-w-3xl mb-12">
            Each agent is an autonomous worker that claims and executes tasks using Claude Code CLI. The controller
            manages the agent lifecycle from spawning through task completion.
          </p>

          <AgentControllerVisualizer />

          {/* Technical Details */}
          <div className="mt-16 space-y-12">
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h2 className="text-2xl font-semibold mb-6">Agent Lifecycle</h2>
              <div className="flex flex-wrap gap-4 items-center justify-center">
                {["Spawn", "Claim Task", "Get Context", "Execute", "Report", "Loop/Exit"].map((step, i) => (
                  <div key={step} className="flex items-center gap-4">
                    <div className="bg-primary/10 rounded-xl px-4 py-2 text-primary font-medium">{step}</div>
                    {i < 5 && <span className="text-muted-foreground">→</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Claude Code Execution</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Each agent spawns a Claude Code process to do real work:
                </p>
                <div className="bg-background/50 rounded-xl p-4 overflow-x-auto">
                  <pre className="text-sm text-primary">
                    {`claude --print --dangerously-skip-permissions "<task prompt>"`}
                  </pre>
                </div>
                <p className="text-muted-foreground text-xs mt-4">
                  The agent captures stdout/stderr, monitors for completion, and reports results back through MCP Mail.
                </p>
              </div>

              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Supported Skills</h3>
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

            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h3 className="text-lg font-semibold mb-6">Scaling Agents</h3>
              <div className="grid md:grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-4xl font-bold text-primary mb-2">1-N</p>
                  <p className="text-muted-foreground text-sm">Worker agents per session</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-primary mb-2">34+</p>
                  <p className="text-muted-foreground text-sm">Tech stacks supported</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-primary mb-2">∞</p>
                  <p className="text-muted-foreground text-sm">Tasks per session</p>
                </div>
              </div>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h3 className="text-lg font-semibold mb-4">Configuration</h3>
              <p className="text-muted-foreground mb-4">Agent configuration is stored in YAML format:</p>
              <div className="bg-background/50 rounded-xl p-4 overflow-x-auto">
                <pre className="text-sm text-muted-foreground">{`agents:
  - name: swift-falcon
    skills: [typescript, react, frontend]
    max_concurrent_tasks: 3
  - name: clever-otter
    skills: [python, backend, database]
    max_concurrent_tasks: 2`}</pre>
              </div>
            </div>
          </div>

          {/* Navigation to other features */}
          <div className="mt-16 pt-8 border-t border-border/50">
            <h3 className="text-lg font-semibold mb-6">Explore Other Components</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <Link
                href="/features/beads"
                className="group bg-card/50 border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-all"
              >
                <p className="font-semibold group-hover:text-primary transition-colors">Beads</p>
                <p className="text-sm text-muted-foreground">Task Queue</p>
              </Link>
              <Link
                href="/features/mcp-mail"
                className="group bg-card/50 border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-all"
              >
                <p className="font-semibold group-hover:text-primary transition-colors">MCP Mail</p>
                <p className="text-sm text-muted-foreground">Agent Communication</p>
              </Link>
              <Link
                href="/features/cass"
                className="group bg-card/50 border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-all"
              >
                <p className="font-semibold group-hover:text-primary transition-colors">CASS</p>
                <p className="text-sm text-muted-foreground">Shared Memory</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
