"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import Image from "next/image"

export function Hero() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden bg-background pt-16">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-radial from-primary/20 via-primary/5 to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-radial from-chart-2/10 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-radial from-chart-5/10 to-transparent blur-3xl" />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px]" />

      <div className="relative z-10 max-w-5xl mx-auto text-center space-y-8">
        <div
          className={`transition-all duration-1000 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="relative w-full max-w-lg mx-auto h-[200px] md:h-[280px]">
            <Image
              src="/images/jetpack-woman.png"
              alt="Person flying with jetpack - representing accelerated development"
              fill
              className="object-contain brightness-0 invert drop-shadow-[0_0_30px_rgba(94,106,210,0.3)]"
              priority
            />
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary transition-all duration-1000 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Introducing Multi-Agent Development</span>
          <ArrowRight className="w-3 h-3" />
        </div>

        <h1
          className={`text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-foreground leading-[1.1] transition-all duration-1000 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <span className="block">As promised.</span>
          
        </h1>

        <p
          className={`text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed transition-all duration-1000 delay-400 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          Jetpack coordinates AI agents to build software together—autonomously, safely, at scale. Meet the system for
          modern software development.
        </p>

        <div
          className={`flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 transition-all duration-1000 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <Button
            size="lg"
            className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-12 px-6"
          >
            Start building
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto gap-2 rounded-lg h-12 px-6 border-border hover:bg-accent bg-transparent"
          >
            View documentation
          </Button>
        </div>

        <div
          className={`pt-8 transition-all duration-1000 delay-600 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div className="relative group">
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-chart-2/20 to-chart-5/20 rounded-2xl blur-2xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />

            <div className="relative bg-card rounded-xl border border-border overflow-hidden shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-chart-3/60" />
                  <div className="w-3 h-3 rounded-full bg-chart-2/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 rounded-md bg-background/50 text-xs text-muted-foreground">
                    jetpack.dev/dashboard
                  </div>
                </div>
              </div>

              {/* Screenshot */}
              <div className="relative aspect-[16/9] w-full max-w-4xl">
                <Image
                  src="/modern-dark-dashboard-showing-ai-agents-working-on.jpg"
                  alt="Jetpack dashboard showing multi-agent orchestration"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        
      </div>
    </section>
  )
}
