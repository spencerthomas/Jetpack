"use client"

import { Button } from "@/components/ui/button"
import { Github, Menu, X, ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"

const navItems = [
  {
    label: "Product",
    items: [
      { label: "Features", href: "/#features" },
      { label: "Architecture", href: "/#architecture" },
    ],
  },
  {
    label: "Components",
    items: [
      { label: "Beads", href: "/features/beads" },
      { label: "MCP Mail", href: "/features/mcp-mail" },
      { label: "CASS", href: "/features/cass" },
      { label: "Agent Controller", href: "/features/agent-controller" },
    ],
  },
  {
    label: "Docs",
    items: [
      { label: "All Documentation", href: "/docs" },
      { label: "Quick Start", href: "/docs#quickstart" },
      { label: "CLI Reference", href: "/docs#cli" },
      { label: "API Reference", href: "/docs#api" },
      { label: "Examples", href: "/docs#examples" },
      { label: "Use Cases", href: "/docs#usecases" },
    ],
  },
  { label: "Roadmap", href: "/#roadmap" },
  { label: "Credits", href: "/#credits" },
]

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 relative">
            <Image
              src="/images/jetpack-boy.png"
              alt="Jetpack logo"
              fill
              className="object-contain brightness-0 invert"
            />
          </div>
          <span className="text-lg font-semibold text-foreground tracking-tight">Jetpack</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) =>
            "items" in item ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setOpenDropdown(item.label)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
                  {item.label}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {openDropdown === item.label && (
                  <div className="absolute top-full left-0 pt-2">
                    <div className="bg-card border border-border rounded-xl shadow-lg py-2 min-w-[180px]">
                      {item.items.map((subItem) => (
                        <Link
                          key={subItem.label}
                          href={subItem.href}
                          className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          {subItem.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex gap-2 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="https://github.com/spencerthomas/Jetpack" target="_blank">
              <Github className="w-4 h-4" />
              GitHub
            </Link>
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg" asChild>
            <Link href="/docs">Get Started</Link>
          </Button>

          {/* Mobile menu button */}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden glass border-t border-border max-h-[80vh] overflow-y-auto">
          <nav className="flex flex-col p-4 gap-1">
            {navItems.map((item) =>
              "items" in item ? (
                <div key={item.label}>
                  <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {item.label}
                  </p>
                  {item.items.map((subItem) => (
                    <Link
                      key={subItem.label}
                      href={subItem.href}
                      className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent ml-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {subItem.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
