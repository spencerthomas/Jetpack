"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Showcase() {
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
    <section ref={sectionRef} className="relative py-32 px-6 bg-background overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-gradient-radial from-primary/10 via-transparent to-transparent" />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <div
          className={`text-center mb-16 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-sm font-medium text-primary mb-4">See it in action</p>
          <h2 className="text-4xl md:text-5xl font-semibold text-foreground tracking-tight mb-4">
            Watch agents work together
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Real-time visualization of multi-agent coordination. See tasks being claimed, executed, and completed.
          </p>
        </div>

        <div
          className={`relative transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        >
          <div className="relative group">
            {/* Glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-chart-2/20 to-chart-5/20 rounded-2xl blur-2xl opacity-50" />

            <div className="relative bg-card rounded-xl border border-border overflow-hidden">
              {/* Video thumbnail */}
              <div className="relative aspect-video w-full">
                <Image
                  src="/dark-control-room-dashboard-showing-multiple-ai-ag.jpg"
                  alt="Jetpack agent orchestration in action"
                  fill
                  className="object-cover"
                />

                {/* Play button overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                  <Button size="lg" className="rounded-full w-16 h-16 bg-white hover:bg-white/90 text-black">
                    <Play className="w-6 h-6 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
                <div className="flex items-center gap-6 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className="w-2 h-2 rounded-full bg-chart-2 animate-pulse" />5 agents active
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />2 idle
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">23 tasks</span> completed ·{" "}
                  <span className="text-foreground font-medium">12</span> in queue
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
