import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { AgentMailVisualizer } from "@/components/agent-mail-visualizer"
import { Mail, ArrowLeft } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "MCP Mail - Agent Communication | Jetpack",
  description: "Pub/sub messaging system for real-time agent coordination and event broadcasting.",
}

export default function MCPMailPage() {
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
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">MCP Mail</h1>
              <p className="text-xl text-muted-foreground">Agent Communication</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground max-w-3xl mb-12">
            MCP Mail provides pub/sub messaging between agents. Agents subscribe to events and publish their own events
            for coordination, with memorable identities, inbox/outbox, and voluntary file leases.
          </p>

          <AgentMailVisualizer />

          {/* Technical Details */}
          <div className="mt-16 space-y-12">
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h2 className="text-2xl font-semibold mb-6">Message Types</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { type: "task_created", desc: "New task added to queue" },
                  { type: "task_claimed", desc: "Agent claimed a task" },
                  { type: "task_completed", desc: "Task finished successfully" },
                  { type: "task_failed", desc: "Task execution failed" },
                  { type: "file_lease_requested", desc: "Agent wants file access" },
                  { type: "file_lease_granted", desc: "File access approved" },
                  { type: "context_shared", desc: "Agent sharing knowledge" },
                  { type: "help_requested", desc: "Agent needs assistance" },
                ].map((msg) => (
                  <div key={msg.type} className="bg-background/50 rounded-xl p-4 border border-border/30">
                    <code className="text-primary text-sm">{msg.type}</code>
                    <p className="text-sm text-muted-foreground mt-1">{msg.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Agent Identities</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Each agent gets a memorable identity for easy tracking:
                </p>
                <div className="space-y-2">
                  {["swift-falcon", "clever-otter", "brave-eagle", "wise-owl"].map((name) => (
                    <div key={name} className="bg-background/50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-primary font-mono">{name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">File Leasing</h3>
                <p className="text-muted-foreground text-sm mb-4">Voluntary file leases prevent conflicts:</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Agents request leases before editing files</li>
                  <li>• Other agents see which files are locked</li>
                  <li>• Leases auto-expire after timeout</li>
                  <li>• Conflicts detected before they happen</li>
                </ul>
              </div>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h3 className="text-lg font-semibold mb-4">Storage Location</h3>
              <p className="text-muted-foreground mb-4">MCP Mail stores all messages in a local SQLite database:</p>
              <div className="bg-background/50 rounded-xl p-4">
                <code className="text-primary">data/mcp-mail.db</code>
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
                href="/features/cass"
                className="group bg-card/50 border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-all"
              >
                <p className="font-semibold group-hover:text-primary transition-colors">CASS</p>
                <p className="text-sm text-muted-foreground">Shared Memory</p>
              </Link>
              <Link
                href="/features/agent-controller"
                className="group bg-card/50 border border-border/50 rounded-xl p-4 hover:border-primary/50 transition-all"
              >
                <p className="font-semibold group-hover:text-primary transition-colors">Agent Controller</p>
                <p className="text-sm text-muted-foreground">Worker Execution</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
