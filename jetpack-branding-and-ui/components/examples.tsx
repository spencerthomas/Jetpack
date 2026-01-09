"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

const examples = [
  {
    id: "basic",
    title: "Basic Workflow",
    description: "Simple task execution with multiple agents",
    code: `# Start Jetpack
jetpack start --agents 2

# Create a simple task
jetpack task \\
  --title "Add logging to API endpoints" \\
  --priority medium \\
  --skills typescript,backend

# Monitor progress
jetpack status

# Create several independent tasks (agents work in parallel)
jetpack task --title "Update README" --skills documentation
jetpack task --title "Fix TypeScript warnings" --skills typescript
jetpack task --title "Add unit tests" --skills testing`,
  },
  {
    id: "feature",
    title: "Feature Development",
    description: "Complex feature with dependencies using TypeScript API",
    code: `import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function developFeature() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  await jetpack.startAgents(5);

  // Step 1: Design & Planning
  const designTask = await jetpack.createTask({
    title: 'Design user profile feature',
    description: 'Create API spec and UI mockups',
    priority: 'high',
    requiredSkills: ['documentation'],
    estimatedMinutes: 20,
  });

  // Step 2: Database Schema (depends on design)
  const schemaTask = await jetpack.createTask({
    title: 'Create user profile database schema',
    description: 'Add tables for user profiles and preferences',
    priority: 'high',
    requiredSkills: ['database'],
    dependencies: [designTask.id],
    estimatedMinutes: 15,
  });

  // Step 3: Backend API (depends on schema)
  const apiTask = await jetpack.createTask({
    title: 'Implement user profile API endpoints',
    description: 'CRUD operations for user profiles',
    priority: 'high',
    requiredSkills: ['backend', 'typescript'],
    dependencies: [schemaTask.id],
    estimatedMinutes: 45,
  });

  // Step 4: Frontend Component (depends on design, parallel with API)
  const uiTask = await jetpack.createTask({
    title: 'Build user profile UI component',
    description: 'React component with form and validation',
    priority: 'medium',
    requiredSkills: ['frontend', 'react'],
    dependencies: [designTask.id],
    estimatedMinutes: 60,
  });

  // Step 5: Integration (depends on both API and UI)
  const integrationTask = await jetpack.createTask({
    title: 'Integrate profile UI with API',
    description: 'Connect frontend to backend endpoints',
    priority: 'medium',
    requiredSkills: ['frontend', 'backend'],
    dependencies: [apiTask.id, uiTask.id],
    estimatedMinutes: 30,
  });

  // Step 6: Testing (depends on integration)
  await jetpack.createTask({
    title: 'Write tests for user profile feature',
    description: 'Unit and integration tests',
    priority: 'high',
    requiredSkills: ['testing'],
    dependencies: [integrationTask.id],
    estimatedMinutes: 45,
  });

  console.log('Feature development pipeline created!');
  await jetpack.shutdown();
}`,
  },
  {
    id: "bugfix",
    title: "Bug Fixing Swarm",
    description: "Parallel bug resolution with many agents",
    code: `import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function fixBugs() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  
  // Start many agents for parallel bug fixing
  await jetpack.startAgents(8);

  // List of bugs from issue tracker
  const bugs = [
    { title: 'Login fails on Safari', skills: ['frontend'], priority: 'critical' },
    { title: 'Memory leak in WebSocket handler', skills: ['backend'], priority: 'high' },
    { title: 'Database query timeout on large datasets', skills: ['database', 'backend'], priority: 'high' },
    { title: 'UI flickering on mobile devices', skills: ['frontend', 'react'], priority: 'medium' },
    { title: 'TypeScript errors in build', skills: ['typescript'], priority: 'high' },
    { title: 'API rate limiting not working', skills: ['backend'], priority: 'medium' },
    { title: 'Broken links in documentation', skills: ['documentation'], priority: 'low' },
    { title: 'Test flakiness in CI/CD', skills: ['testing', 'devops'], priority: 'medium' },
  ];

  // Create all bug fix tasks
  for (const bug of bugs) {
    await jetpack.createTask({
      title: bug.title,
      priority: bug.priority,
      requiredSkills: bug.skills,
      estimatedMinutes: 30,
    });
  }

  console.log(\`Created \${bugs.length} bug fix tasks\`);
  console.log('Agents are working in parallel...');

  await jetpack.shutdown();
}`,
  },
  {
    id: "memory",
    title: "Using Memory System",
    description: "Storing and retrieving agent learnings with CASS",
    code: `import { JetpackOrchestrator } from '@jetpack/orchestrator';

async function memoryExample() {
  const jetpack = new JetpackOrchestrator({
    workDir: process.cwd(),
  });

  await jetpack.initialize();
  const cass = jetpack.getCASSAdapter();

  // Store knowledge about the codebase
  await cass.store({
    type: 'codebase_knowledge',
    content: 'The authentication system uses JWT tokens with 24-hour expiry',
    importance: 0.9,
    metadata: {
      module: 'auth',
      technology: 'jwt',
    },
  });

  await cass.store({
    type: 'pattern_recognition',
    content: 'All API endpoints follow RESTful conventions with /api/v1 prefix',
    importance: 0.8,
    metadata: {
      pattern: 'api-design',
    },
  });

  // Search for relevant memories
  const authMemories = await cass.search('authentication', 5);
  console.log('Auth-related memories:', authMemories);

  // Get memories by type
  const patterns = await cass.getByType('pattern_recognition', 10);
  console.log('Recognized patterns:', patterns);

  // Memory compaction (remove low-importance entries)
  const removed = await cass.compact(0.4); // Remove entries with importance < 0.4
  console.log(\`Removed \${removed} low-importance memories\`);

  await jetpack.shutdown();
}`,
  },
  {
    id: "filelease",
    title: "File Leasing for Concurrent Safety",
    description: "Preventing edit conflicts between agents",
    code: `import { MCPMailAdapter } from '@jetpack/mcp-mail-adapter';

async function fileLeasingExample() {
  const agent1Mail = new MCPMailAdapter({
    mailDir: './.jetpack/mail',
    agentId: 'agent-1',
  });

  const agent2Mail = new MCPMailAdapter({
    mailDir: './.jetpack/mail',
    agentId: 'agent-2',
  });

  await agent1Mail.initialize();
  await agent2Mail.initialize();

  // Agent 1 tries to lease a file
  const leased1 = await agent1Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 1 lease:', leased1); // true

  // Agent 2 tries to lease the same file
  const leased2 = await agent2Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 2 lease:', leased2); // false - already leased

  // Check lease status
  const status = await agent1Mail.isLeased('src/utils/auth.ts');
  console.log('Lease status:', status); // { leased: true, agentId: 'agent-1' }

  // Agent 1 does work...
  console.log('Agent 1 is editing the file...');

  // Agent 1 releases the lease
  await agent1Mail.releaseLease('src/utils/auth.ts');

  // Now Agent 2 can lease it
  const leased2Again = await agent2Mail.acquireLease('src/utils/auth.ts', 60000);
  console.log('Agent 2 lease (retry):', leased2Again); // true

  await agent1Mail.shutdown();
  await agent2Mail.shutdown();
}`,
  },
]

export function Examples() {
  const [isVisible, setIsVisible] = useState(false)
  const [activeExample, setActiveExample] = useState("basic")
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
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

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const currentExample = examples.find((e) => e.id === activeExample) || examples[0]

  return (
    <section ref={sectionRef} id="examples" className="py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <p className="text-primary font-medium mb-4 tracking-wide uppercase text-sm">Code Examples</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Usage Examples</h2>
          <p className="text-xl text-muted-foreground">
            Comprehensive examples for using Jetpack in various scenarios.
          </p>
        </div>

        <div
          className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {/* Example Tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {examples.map((example) => (
              <button
                key={example.id}
                onClick={() => setActiveExample(example.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                  ${activeExample === example.id ? "bg-primary text-primary-foreground" : "bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground"}`}
              >
                {example.title}
              </button>
            ))}
          </div>

          {/* Example Content */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/50">
              <div>
                <h3 className="font-semibold">{currentExample.title}</h3>
                <p className="text-sm text-muted-foreground">{currentExample.description}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCode(currentExample.code)}
                className="text-muted-foreground hover:text-foreground"
              >
                {copiedCode === currentExample.code ? (
                  <>
                    <Check className="w-4 h-4 mr-2" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="p-6 overflow-x-auto max-h-[600px] overflow-y-auto">
              <pre className="font-mono text-sm text-foreground/90">
                <code>{currentExample.code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
