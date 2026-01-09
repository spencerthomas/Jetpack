"use client"

import { useEffect, useState } from "react"

interface Task {
  id: string
  label: string
  priority: "high" | "medium" | "low"
  skill: string
}

interface Skill {
  name: string
  active: boolean
}

const TASKS: Task[] = [
  { id: "t1", label: "refactor_auth_module", priority: "high", skill: "typescript" },
  { id: "t2", label: "add_user_dashboard", priority: "medium", skill: "react" },
  { id: "t3", label: "optimize_db_queries", priority: "high", skill: "database" },
  { id: "t4", label: "write_api_tests", priority: "low", skill: "testing" },
  { id: "t5", label: "setup_ci_pipeline", priority: "medium", skill: "devops" },
]

const SKILLS: Skill[] = [
  { name: "typescript", active: true },
  { name: "react", active: true },
  { name: "database", active: true },
  { name: "testing", active: false },
  { name: "devops", active: false },
  { name: "python", active: true },
]

type Phase = "idle" | "looking" | "claiming" | "retrieving" | "executing" | "storing" | "publishing" | "complete"

const PHASE_LABELS: Record<Phase, string> = {
  idle: "awaiting work",
  looking: "scanning task queue",
  claiming: "claiming task",
  retrieving: "fetching context from CASS",
  executing: "spawning Claude Code",
  storing: "storing learnings",
  publishing: "publishing completion",
  complete: "task complete",
}

export function AgentControllerVisualizer() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [currentTask, setCurrentTask] = useState<Task | null>(null)
  const [heartbeat, setHeartbeat] = useState(0)
  const [cliOutput, setCliOutput] = useState<string[]>([])
  const [typedText, setTypedText] = useState("")

  const fullText =
    "Each agent is an autonomous worker that claims and executes tasks using Claude Code CLI. The AgentController manages the lifecycle—subscribing to events, maintaining heartbeat, and spawning real code processes."

  // Typewriter effect
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < fullText.length) {
        setTypedText(fullText.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
      }
    }, 25)
    return () => clearInterval(interval)
  }, [])

  // Heartbeat animation
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeat((h) => h + 1)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Main lifecycle animation
  useEffect(() => {
    const runCycle = () => {
      setCliOutput([])
      setPhase("looking")

      setTimeout(() => {
        setPhase("claiming")
        const task = TASKS[Math.floor(Math.random() * 3)]
        setCurrentTask(task)
      }, 1200)

      setTimeout(() => {
        setPhase("retrieving")
        setCliOutput(["[CASS] Querying semantic memory..."])
      }, 2200)

      setTimeout(() => {
        setCliOutput((prev) => [...prev, "[CASS] Retrieved 3 relevant contexts"])
      }, 2800)

      setTimeout(() => {
        setPhase("executing")
        setCliOutput((prev) => [...prev, "", "$ claude --print --dangerously-skip-permissions"])
      }, 3400)

      setTimeout(() => {
        setCliOutput((prev) => [...prev, "[Claude] Analyzing task requirements..."])
      }, 4200)

      setTimeout(() => {
        setCliOutput((prev) => [...prev, "[Claude] Generating code changes..."])
      }, 5000)

      setTimeout(() => {
        setCliOutput((prev) => [...prev, "[Claude] ✓ Changes applied successfully"])
      }, 6000)

      setTimeout(() => {
        setPhase("storing")
        setCliOutput((prev) => [...prev, "", "[CASS] Storing learnings as embeddings..."])
      }, 7000)

      setTimeout(() => {
        setPhase("publishing")
        setCliOutput((prev) => [...prev, "[MCP Mail] Publishing completion event"])
      }, 8000)

      setTimeout(() => {
        setPhase("complete")
      }, 8800)

      setTimeout(() => {
        setPhase("idle")
        setCurrentTask(null)
        setCliOutput([])
      }, 11000)
    }

    runCycle()
    const interval = setInterval(runCycle, 13000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 border border-border/50 p-6 bg-card/50 backdrop-blur-sm rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-muted-foreground">[</span>
          <span className="text-foreground tracking-widest text-sm">AGENT CONTROLLER</span>
          <span className="text-muted-foreground">]</span>
        </div>
        <h3 className="text-2xl font-semibold text-foreground mb-2">Autonomous Task Worker</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {typedText}
          <span className="animate-pulse text-primary">_</span>
        </p>
      </div>

      {/* Main Visualization */}
      <div className="relative border border-border/50 bg-background/50 backdrop-blur-sm rounded-2xl overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative grid md:grid-cols-3 gap-px bg-border/30">
          {/* Left Panel - Agent Status */}
          <div className="bg-background/80 p-5 min-h-[320px]">
            <div className="text-xs text-muted-foreground mb-4 tracking-wide">AGENT STATUS</div>

            {/* Heartbeat indicator */}
            <div className="flex items-center gap-2 mb-6">
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  phase === "idle" ? "bg-muted-foreground/50" : "bg-primary"
                }`}
                style={{
                  boxShadow: phase !== "idle" ? "0 0 10px hsl(var(--primary) / 0.5)" : "none",
                }}
              />
              <span className="text-xs text-muted-foreground">heartbeat #{heartbeat}</span>
            </div>

            {/* Lifecycle visualization */}
            <div className="space-y-2">
              {(
                [
                  "idle",
                  "looking",
                  "claiming",
                  "retrieving",
                  "executing",
                  "storing",
                  "publishing",
                  "complete",
                ] as Phase[]
              ).map((p, i) => (
                <div key={p} className="flex items-center gap-2 text-xs">
                  <div
                    className={`h-px transition-all duration-300 ${phase === p ? "bg-primary w-6" : "bg-border w-4"}`}
                  />
                  <span
                    className={`transition-colors duration-300 ${phase === p ? "text-foreground" : "text-muted-foreground/50"}`}
                  >
                    {i + 1}. {p}
                  </span>
                  {phase === p && <span className="text-primary animate-pulse">●</span>}
                </div>
              ))}
            </div>

            {/* Skills */}
            <div className="mt-6">
              <div className="text-xs text-muted-foreground mb-2 tracking-wide">SKILLS</div>
              <div className="flex flex-wrap gap-1">
                {SKILLS.map((skill) => (
                  <span
                    key={skill.name}
                    className={`text-xs px-2 py-0.5 border rounded transition-all duration-300 ${
                      skill.active
                        ? currentTask?.skill === skill.name
                          ? "border-primary text-primary bg-primary/10"
                          : "border-border text-muted-foreground"
                        : "border-border/30 text-muted-foreground/30"
                    }`}
                  >
                    {skill.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Middle Panel - Task Queue */}
          <div className="bg-background/80 p-5 min-h-[320px]">
            <div className="text-xs text-muted-foreground mb-4 tracking-wide">TASK QUEUE (BEADS)</div>

            <div className="space-y-2">
              {TASKS.map((task) => {
                const isCurrent = currentTask?.id === task.id
                const isClaimable = SKILLS.find((s) => s.name === task.skill)?.active

                return (
                  <div
                    key={task.id}
                    className={`
                      relative border rounded-lg p-3 transition-all duration-500
                      ${isCurrent ? "border-primary bg-primary/5" : "border-border/50"}
                      ${!isClaimable && !isCurrent ? "opacity-40" : ""}
                    `}
                  >
                    {/* Claiming animation */}
                    {isCurrent && phase === "claiming" && (
                      <div className="absolute inset-0 border border-primary rounded-lg animate-ping" />
                    )}

                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs text-muted-foreground">&lt;</span>
                        <span className={`text-xs ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                          {task.label}
                        </span>
                        <span className="text-xs text-muted-foreground">/&gt;</span>
                      </div>
                      <span
                        className={`text-xs px-1 ${
                          task.priority === "high"
                            ? "text-primary"
                            : task.priority === "medium"
                              ? "text-muted-foreground"
                              : "text-muted-foreground/50"
                        }`}
                      >
                        {task.priority === "high" ? "▲" : task.priority === "medium" ? "●" : "▽"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-1">{task.skill}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Panel - CLI Output */}
          <div className="bg-background/80 p-5 min-h-[320px]">
            <div className="text-xs text-muted-foreground mb-4 tracking-wide">CLAUDE CODE CLI</div>

            <div className="bg-card/50 border border-border/50 rounded-xl p-4 h-[260px] overflow-hidden">
              <div className="space-y-1">
                {cliOutput.map((line, i) => (
                  <div
                    key={i}
                    className={`text-xs ${
                      line.startsWith("$")
                        ? "text-muted-foreground"
                        : line.includes("✓")
                          ? "text-green-400"
                          : line.startsWith("[Claude]")
                            ? "text-foreground"
                            : line.startsWith("[CASS]")
                              ? "text-primary/80"
                              : line.startsWith("[MCP")
                                ? "text-chart-2"
                                : "text-muted-foreground"
                    }`}
                  >
                    {line}
                  </div>
                ))}
                {phase === "executing" && <span className="text-xs text-primary animate-pulse">█</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="bg-card/50 border-t border-border/50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">status:</span>
            <span className="text-foreground">{PHASE_LABELS[phase]}</span>
          </div>
          {currentTask && (
            <div className="text-xs text-muted-foreground">
              task: <span className="text-primary">{currentTask.label}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer explanation */}
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="border border-border/50 p-4 bg-card/30 backdrop-blur-sm rounded-xl hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2">01 / START</div>
          <p className="text-muted-foreground">Subscribe to MCP Mail, start heartbeat every 30s, begin work loop.</p>
        </div>
        <div className="border border-border/50 p-4 bg-card/30 backdrop-blur-sm rounded-xl hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2">02 / CLAIM</div>
          <p className="text-muted-foreground">
            Get ready tasks, filter by skills, sort by priority, claim highest match.
          </p>
        </div>
        <div className="border border-border/50 p-4 bg-card/30 backdrop-blur-sm rounded-xl hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2">03 / EXECUTE</div>
          <p className="text-muted-foreground">Retrieve CASS context, spawn Claude Code CLI, capture output.</p>
        </div>
        <div className="border border-border/50 p-4 bg-card/30 backdrop-blur-sm rounded-xl hover:border-primary/30 transition-colors">
          <div className="text-primary mb-2">04 / COMPLETE</div>
          <p className="text-muted-foreground">Store learnings in CASS, publish completion via MCP Mail.</p>
        </div>
      </div>
    </div>
  )
}
