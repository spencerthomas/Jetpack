"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Github } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"

export function Footer() {
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

  return (
    <footer ref={sectionRef} className="relative py-32 px-6 bg-background overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-radial from-primary/20 via-primary/5 to-transparent blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto text-center relative">
        <div
          className={`space-y-6 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-sm font-medium text-primary">The future is here</p>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground tracking-tight">
            Ready to build the future?
          </h2>

          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Join the next generation of software development. Let your agents do the building.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-12 px-8"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto gap-2 rounded-lg h-12 px-8 border-border hover:bg-accent bg-transparent"
            >
              <Github className="w-4 h-4" />
              Star on GitHub
            </Button>
          </div>
        </div>

        <div className={`pt-24 transition-all duration-1000 delay-500 ${isVisible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground border-t border-border pt-8">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 relative">
                <Image
                  src="/images/jetpack-boy.png"
                  alt="Jetpack logo"
                  fill
                  className="object-contain brightness-0 invert"
                />
              </div>
              <span className="font-semibold text-foreground">Jetpack</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/docs" className="hover:text-foreground transition-colors">
                Docs
              </Link>
              <Link
                href="https://github.com/spencerthomas/Jetpack"
                className="hover:text-foreground transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </Link>
            </div>
            <span>MIT License</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
