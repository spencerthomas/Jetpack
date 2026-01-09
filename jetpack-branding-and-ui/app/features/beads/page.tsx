import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { BeadsVisualizer } from "@/components/beads-visualizer"
import { Database, ArrowLeft } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "Beads - Task Queue | Jetpack",
  description: "Persistent task storage system with dependency tracking and hierarchical IDs for atomic task claiming.",
}

export default function BeadsPage() {
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
              <Database className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Beads</h1>
              <p className="text-xl text-muted-foreground">Task Queue</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground max-w-3xl mb-12">
            Beads is the persistent task storage system that manages task lifecycle and dependency tracking. It replaces
            messy markdown with a dependency-aware graph using hierarchical IDs for atomic claiming.
          </p>

          <BeadsVisualizer />

          {/* Technical Details */}
          <div className="mt-16 space-y-12">
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h2 className="text-2xl font-semibold mb-6">How It Works</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Beads uses a SQLite database to store tasks with full dependency tracking. Each task gets a
                  hierarchical ID like{" "}
                  <code className="text-primary bg-primary/10 px-2 py-0.5 rounded">bd-a3f8.1.1</code> that encodes its
                  position in the task tree.
                </p>
                <p>
                  Tasks flow through states: <span className="text-primary">pending</span> →{" "}
                  <span className="text-primary">claimed</span> → <span className="text-primary">running</span> →{" "}
                  <span className="text-primary">done</span> or <span className="text-primary">failed</span>. Agents
                  claim tasks atomically using SQL transactions to prevent conflicts.
                </p>
                <p>
                  The dependency graph ensures tasks execute in the correct order. Parent tasks can spawn subtasks, and
                  the system tracks which agent claimed each task for debugging and metrics.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Task Structure</h3>
                <div className="bg-background/50 rounded-xl p-4 overflow-x-auto">
                  <pre className="text-sm text-muted-foreground">{`{
  "id": "bd-a3f8.1.1",
  "parent_id": "bd-a3f8.1",
  "title": "Implement auth flow",
  "description": "Add OAuth2 login",
  "status": "pending",
  "priority": 1,
  "dependencies": ["bd-a3f8.1.0"],
  "claimed_by": null,
  "created_at": "2024-01-15T10:00:00Z"
}`}</pre>
                </div>
              </div>

              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Key Operations</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">claim_task()</span>
                    <span className="text-sm">Atomically claim an available task</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">complete_task()</span>
                    <span className="text-sm">Mark task done with results</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">add_subtask()</span>
                    <span className="text-sm">Create child tasks with dependencies</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">get_ready_tasks()</span>
                    <span className="text-sm">Query tasks with satisfied deps</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h3 className="text-lg font-semibold mb-4">Storage Location</h3>
              <p className="text-muted-foreground mb-4">
                Beads stores all data in a local SQLite database for persistence across sessions:
              </p>
              <div className="bg-background/50 rounded-xl p-4">
                <code className="text-primary">data/beads.db</code>
              </div>
            </div>
          </div>

          {/* Navigation to other features */}
          <div className="mt-16 pt-8 border-t border-border/50">
            <h3 className="text-lg font-semibold mb-6">Explore Other Components</h3>
            <div className="grid md:grid-cols-3 gap-4">
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
