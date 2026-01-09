"use client"

import { Button } from "@/components/ui/button"
import { Copy, Check, ArrowRight, Terminal } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"

const steps = [
  {
    label: "Clone & Install",
    code: "git clone https://github.com/spencerthomas/Jetpack.git && cd Jetpack && pnpm install && pnpm build",
  },
  { label: "Initialize", code: "cd /your/project && jetpack init" },
  { label: "Start", code: "jetpack start" },
]

export function QuickStartSummary() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
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

  const copyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <section ref={sectionRef} id="quickstart" className="relative py-32 px-6 bg-background">
      <div className="max-w-4xl mx-auto">
        <div
          className={`text-center mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Getting Started</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Quick Start</h2>
          <p className="text-xl text-muted-foreground">Get up and running in under 5 minutes.</p>
        </div>

        {/* Compact Steps */}
        <div
          className={`space-y-4 mb-10 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {steps.map((step, i) => (
            <div
              key={step.label}
              className="relative bg-card rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium">{step.label}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => copyCode(step.code, i)}
                >
                  {copiedIndex === i ? (
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
              <div className="px-4 pb-4 font-mono text-sm">
                <code className="text-foreground/80 text-xs">{step.code}</code>
              </div>
            </div>
          ))}
        </div>

        {/* What happens */}
        <div
          className={`bg-gradient-to-r from-primary/10 to-chart-2/10 rounded-2xl border border-primary/20 p-6 mb-10 transition-all duration-700 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="w-5 h-5 text-primary" />
            <h4 className="font-semibold">What happens next:</h4>
          </div>
          <div className="flex flex-wrap gap-4">
            {["Orchestrator starts", "AI Agents spawn", "Web UI opens at :3002", "Drop tasks in .beads/tasks/"].map(
              (step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-sm text-muted-foreground">{step}</span>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Link to full docs */}
        <div
          className={`text-center transition-all duration-700 delay-600 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2" asChild>
            <Link href="/docs">
              View Full Documentation
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            CLI reference, code examples, use cases, and API documentation
          </p>
        </div>
      </div>
    </section>
  )
}
