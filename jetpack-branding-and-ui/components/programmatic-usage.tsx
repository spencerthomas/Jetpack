"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

const codeExample = `import { JetpackOrchestrator } from '@jetpack/orchestrator';

const jetpack = new JetpackOrchestrator({
  workDir: process.cwd(),
  autoStart: true,
});

// Initialize
await jetpack.initialize();

// Start agents
await jetpack.startAgents(5);

// Create tasks
const task1 = await jetpack.createTask({
  title: 'Implement feature X',
  priority: 'high',
  requiredSkills: ['typescript', 'backend'],
  estimatedMinutes: 30,
});

const task2 = await jetpack.createTask({
  title: 'Test feature X',
  priority: 'medium',
  requiredSkills: ['testing'],
  dependencies: [task1.id],
  estimatedMinutes: 15,
});

// Monitor status
const status = await jetpack.getStatus();
console.log('Agents:', status.agents);
console.log('Tasks:', status.tasks);

// Shutdown gracefully
await jetpack.shutdown();`

const advancedExamples = [
  {
    title: "Skill-Based Task Assignment",
    code: `// Create a backend-specific task
await jetpack.createTask({
  title: 'Optimize database queries',
  requiredSkills: ['database', 'backend'],
  priority: 'critical',
});

// Only agents with 'database' or 'backend' skills will claim it`,
  },
  {
    title: "Task Priority & Dependencies",
    code: `// High-priority task that must complete first
const setupTask = await jetpack.createTask({
  title: 'Initialize project',
  priority: 'critical',
});

// Dependent task waits for setup
const buildTask = await jetpack.createTask({
  title: 'Build application',
  dependencies: [setupTask.id],
  priority: 'high',
});`,
  },
  {
    title: "Memory Queries",
    code: `const cass = jetpack.getCASSAdapter();

// Search for relevant memories
const memories = await cass.search('authentication', 10);

// Semantic search with embeddings
const similar = await cass.semanticSearch(embedding, 5);

// Get recent learnings
const recent = await cass.getRecentMemories(20);`,
  },
  {
    title: "Task Statistics",
    code: `const beads = jetpack.getBeadsAdapter();
const stats = await beads.getStats();

console.log('Total tasks:', stats.total);
console.log('By status:', stats.byStatus);
console.log('Avg completion time:', stats.avgCompletionTime, 'minutes');`,
  },
  {
    title: "Memory Statistics",
    code: `const cass = jetpack.getCASSAdapter();
const stats = await cass.getStats();

console.log('Total memories:', stats.total);
console.log('By type:', stats.byType);
console.log('Avg importance:', stats.avgImportance);`,
  },
]

export function ProgrammaticUsage() {
  const [isVisible, setIsVisible] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
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

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <section ref={sectionRef} id="api" className="py-32 relative">
      <div className="max-w-5xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">API Reference</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Programmatic Usage</h2>
          <p className="text-xl text-muted-foreground">Use Jetpack directly in your TypeScript/JavaScript code.</p>
        </div>

        {/* Main Example */}
        <div
          className={`mb-16 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/50">
              <h3 className="font-semibold">TypeScript Example</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCode(codeExample)}
                className="text-muted-foreground hover:text-foreground"
              >
                {copiedCode === codeExample ? (
                  <>
                    <Check className="w-4 h-4 mr-2" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="p-6 overflow-x-auto">
              <pre className="font-mono text-sm text-foreground/90">
                <code>{codeExample}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Advanced Examples */}
        <div
          className={`transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h3 className="text-2xl font-semibold mb-8">Advanced Usage</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {advancedExamples.map((example, index) => (
              <div
                key={example.title}
                className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50">
                  <h4 className="text-sm font-semibold">{example.title}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyCode(example.code)}
                    className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
                  >
                    {copiedCode === example.code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="p-4 overflow-x-auto">
                  <pre className="font-mono text-xs text-foreground/90">
                    <code>{example.code}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
