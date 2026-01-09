import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { WhatIsJetpack } from "@/components/what-is-jetpack"
import { Architecture } from "@/components/architecture"
import { KeyFeatures } from "@/components/key-features"
import { QuickStartSummary } from "@/components/quickstart-summary"
import { Roadmap } from "@/components/roadmap"
import { Credits } from "@/components/credits"
import { Footer } from "@/components/footer"

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground dark">
      <Header />
      <Hero />
      <WhatIsJetpack />
      <Architecture />
      <KeyFeatures />
      <QuickStartSummary />
      <Roadmap />
      <Credits />
      <Footer />
    </main>
  )
}
