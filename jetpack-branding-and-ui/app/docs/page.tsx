import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { QuickStart } from "@/components/quick-start"
import { CLIReference } from "@/components/cli-reference"
import { Examples } from "@/components/examples"
import { UseCases } from "@/components/use-cases"
import { ProgrammaticUsage } from "@/components/programmatic-usage"

export const metadata = {
  title: "Documentation | Jetpack",
  description: "Complete documentation for Jetpack - the multi-agent development stack",
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground dark">
      <Header />
      {/* Hero for docs page */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Documentation</p>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6">Learn Jetpack</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to get started with Jetpack, from installation to advanced usage patterns.
          </p>

          {/* Quick nav */}
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            {[
              { label: "Quick Start", href: "#quickstart" },
              { label: "CLI Reference", href: "#cli" },
              { label: "Examples", href: "#examples" },
              { label: "Use Cases", href: "#usecases" },
              { label: "API Reference", href: "#api" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-card/50 border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <QuickStart />
      <CLIReference />
      <Examples />
      <UseCases />
      <ProgrammaticUsage />
      <Footer />
    </main>
  )
}
