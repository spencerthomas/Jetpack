"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Zap, Shield, Brain } from "lucide-react"

export function WhatIsJetpack() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.2 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const highlights = [
    { icon: Brain, label: "AI-Powered", value: "34+ Stacks" },
    { icon: Zap, label: "Concurrent", value: "Unlimited Agents" },
    { icon: Shield, label: "Safe", value: "Zero Conflicts" },
  ]

  return (
    <section ref={sectionRef} className="relative py-32 px-6 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/30 to-transparent" />

      <div className="max-w-6xl mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div
            className={`transition-all duration-1000 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}
          >
            <p className="text-sm font-medium text-primary mb-4">Made for modern product teams</p>
            <h2 className="text-4xl md:text-5xl font-semibold text-foreground mb-6 leading-tight tracking-tight">
              What is Jetpack?
            </h2>

            <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
              <p>
                Jetpack is a <span className="text-foreground font-medium">multi-agent orchestration system</span> that
                coordinates AI agents to work together on software development tasks.
              </p>
              <p>
                It combines the Agentic Coding Tooling Flywheel from Jeffrey Emanuel with Steve Yegge's Beads memory
                system—creating a comprehensive development environment where agents autonomously claim tasks, share
                knowledge, and build software at unprecedented scale.
              </p>
            </div>

            <div className="mt-10 flex gap-6">
              {highlights.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="text-sm font-semibold text-foreground">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 via-chart-2/10 to-chart-5/10 rounded-2xl blur-2xl" />
              <div className="relative bg-card rounded-xl border border-border overflow-hidden">
                <Image
                  src="/minimal-illustration-of-ai-agents-collaborating-on.jpg"
                  alt="Multi-agent collaboration"
                  width={600}
                  height={500}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
