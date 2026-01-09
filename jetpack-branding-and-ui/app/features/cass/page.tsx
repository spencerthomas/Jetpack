import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { CassVisualizer } from "@/components/cass-visualizer"
import { Brain, ArrowLeft } from "lucide-react"
import Link from "next/link"

export const metadata = {
  title: "CASS - Shared Memory | Jetpack",
  description: "Context-Aware Semantic Storage for vector embeddings and semantic search across agent knowledge.",
}

const memoryTypes = [
  { type: "codebase_knowledge", description: "Understanding of project structure, patterns, and conventions" },
  { type: "agent_learning", description: "Patterns and techniques learned from completed tasks" },
  { type: "conversation_history", description: "Past interactions and decisions for context" },
  { type: "decision_rationale", description: "Why certain architectural choices were made" },
]

export default function CASSPage() {
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
              <Brain className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">CASS</h1>
              <p className="text-xl text-muted-foreground">Context-Aware Semantic Storage</p>
            </div>
          </div>

          <p className="text-xl text-muted-foreground max-w-3xl mb-12">
            CASS stores vector embeddings for semantic search. Agents use it to retrieve relevant context from past
            work, preserving institutional knowledge without losing important learnings.
          </p>

          <CassVisualizer />

          {/* Technical Details */}
          <div className="mt-16 space-y-12">
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h2 className="text-2xl font-semibold mb-6">Memory Types</h2>
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

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">How Semantic Search Works</h3>
                <ol className="space-y-3 text-muted-foreground text-sm">
                  <li className="flex gap-3">
                    <span className="text-primary font-semibold">1.</span>
                    Agent queries CASS with natural language
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary font-semibold">2.</span>
                    Query converted to vector embedding
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary font-semibold">3.</span>
                    Nearest neighbors found via cosine similarity
                  </li>
                  <li className="flex gap-3">
                    <span className="text-primary font-semibold">4.</span>
                    Relevant context returned to agent
                  </li>
                </ol>
              </div>

              <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Key Operations</h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">store()</span>
                    <span className="text-sm">Add knowledge with embeddings</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">search()</span>
                    <span className="text-sm">Semantic search for relevant context</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">update()</span>
                    <span className="text-sm">Refresh stale knowledge</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-primary font-mono text-sm">prune()</span>
                    <span className="text-sm">Remove outdated entries</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8">
              <h3 className="text-lg font-semibold mb-4">Storage Location</h3>
              <p className="text-muted-foreground mb-4">
                CASS stores vector embeddings in a local SQLite database with vector extensions:
              </p>
              <div className="bg-background/50 rounded-xl p-4">
                <code className="text-primary">data/cass.db</code>
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
