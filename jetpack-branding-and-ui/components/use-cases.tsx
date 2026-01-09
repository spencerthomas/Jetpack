"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, Bug, RefreshCw, FileText } from "lucide-react"

const useCases = [
  {
    icon: Sparkles,
    title: "Feature Development",
    scenario: "Build a complete feature with multiple components",
    command: 'jetpack supervise "Add user profile page with avatar upload" --agents 5',
    steps: [
      "Supervisor breaks into: API endpoint, file upload, UI component, tests",
      "Backend agent handles API while frontend agent waits",
      "Once API ready, frontend agent builds UI",
      "Test agent writes integration tests last",
      "All coordinated automatically",
    ],
  },
  {
    icon: Bug,
    title: "Bug Investigation & Fix",
    scenario: "Fix a bug that spans multiple files",
    command: 'jetpack supervise "Fix the race condition in checkout flow" --agents 3',
    steps: [
      "Supervisor creates investigation task first",
      "Agent retrieves context from CASS about checkout code",
      "Creates fix tasks based on investigation",
      "Assigns to agents with relevant skills",
      "Monitors until fix verified",
    ],
  },
  {
    icon: RefreshCw,
    title: "Parallel Refactoring",
    scenario: "Large-scale code refactoring",
    command: 'jetpack supervise "Migrate all class components to hooks" --agents 10',
    steps: [
      "Supervisor identifies all class components",
      "Creates parallel tasks (no dependencies between files)",
      "10 agents work simultaneously",
      "File locking prevents conflicts",
      "Progress tracked in real-time",
    ],
  },
  {
    icon: FileText,
    title: "Manual Task Queue",
    scenario: "Fine-grained control over tasks",
    command: "jetpack start -a 5",
    steps: [
      "Web UI opens automatically at localhost:3002",
      'Create tasks manually: jetpack task -t "Set up database schema" -p critical -s database',
      'Add more: jetpack task -t "Create API routes" -p high -s backend',
      'And more: jetpack task -t "Build dashboard UI" -p medium -s react,frontend',
      "Check progress via CLI: jetpack status",
    ],
  },
]

export function UseCases() {
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
    <section ref={sectionRef} id="usecases" className="py-32 relative bg-card/20">
      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Workflows</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Use Cases</h2>
          <p className="text-xl text-muted-foreground">Real-world scenarios where Jetpack shines.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {useCases.map((useCase, index) => (
            <div
              key={useCase.title}
              className={`bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 
                transition-all duration-700 hover:border-primary/30
                ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <useCase.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{useCase.title}</h3>
                  <p className="text-sm text-muted-foreground">{useCase.scenario}</p>
                </div>
              </div>

              <div className="bg-background/50 rounded-xl p-4 mb-6 overflow-x-auto">
                <code className="font-mono text-sm text-primary">{useCase.command}</code>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">What happens:</p>
                {useCase.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{step}</span>
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
