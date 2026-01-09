"use client"

import { Brain, Database, Shield, Eye, Layers, Zap, ArrowRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"

const features = [
  {
    icon: Brain,
    title: "Swarm Intelligence",
    description:
      "Agents autonomously claim tasks based on skills. Coordinate through message passing. Share knowledge collectively.",
    color: "from-primary/20 to-primary/5",
    image: "/neural-network-visualization-with-glowing-nodes-an.jpg",
  },
  {
    icon: Database,
    title: "Persistent Memory",
    description:
      "Beads stores task history (git-backed). CASS stores semantic patterns. Agents learn and improve over time.",
    color: "from-chart-2/20 to-chart-2/5",
    image: "/abstract-database-structure-with-interconnected-st.jpg",
  },
  {
    icon: Shield,
    title: "Safe Execution",
    description: "File leasing prevents conflicts. Task dependencies ensure order. Automatic rollback on failures.",
    color: "from-chart-3/20 to-chart-3/5",
    image: "/shield-icon-with-secure-lock-and-protection-barrie.jpg",
  },
  {
    icon: Eye,
    title: "Visual Oversight",
    description: "Real-time task graph visualization. Agent status monitoring. Progress tracking and metrics.",
    color: "from-chart-5/20 to-chart-5/5",
    image: "/monitoring-dashboard-with-real-time-graphs-and-met.jpg",
  },
  {
    icon: Layers,
    title: "Multi-Stack Support",
    description: "34+ tech stacks supported. Language-specific agents. Extensible adapter architecture.",
    color: "from-chart-4/20 to-chart-4/5",
    image: "/layered-stack-of-technology-icons-representing-mul.jpg",
  },
  {
    icon: Zap,
    title: "Instant Coordination",
    description: "MCP Mail for agent communication. Publish/subscribe messaging. Heartbeat monitoring.",
    color: "from-primary/20 to-chart-2/5",
    image: "/lightning-bolt-with-connecting-signals-representin.jpg",
  },
]

export function Features() {
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
    <section ref={sectionRef} id="features" className="relative py-32 px-6 bg-background">
      <div className="max-w-7xl mx-auto">
        <div
          className={`text-center mb-20 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-sm font-medium text-primary mb-4">Capabilities</p>
          <h2 className="text-4xl md:text-5xl font-semibold text-foreground tracking-tight">
            Everything you need.
            <br />
            <span className="text-muted-foreground">Nothing you don't.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, i) => (
            <Link
              href="#"
              key={i}
              className={`group relative bg-card rounded-xl border border-border p-6 transition-all duration-500 hover:border-primary/50 hover:shadow-lg ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {/* Gradient background on hover */}
              <div
                className={`absolute inset-0 rounded-xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
              />

              <div className="relative">
                {/* Image */}
                <div className="relative h-32 mb-6 rounded-lg overflow-hidden bg-muted">
                  <Image
                    src={feature.image || "/placeholder.svg"}
                    alt={feature.title}
                    fill
                    className="object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                  />
                </div>

                {/* Icon */}
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>

                {/* Arrow */}
                <div className="mt-4 flex items-center text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Learn more</span>
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
