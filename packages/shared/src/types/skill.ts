import { z } from 'zod';

/**
 * Skill Categories for organization and filtering
 */
export const SkillCategorySchema = z.enum([
  'language',    // Programming languages (typescript, python, rust)
  'framework',   // Frameworks (react, vue, nextjs, fastapi)
  'domain',      // Domain expertise (backend, frontend, devops)
  'tool',        // Tools (docker, kubernetes, git)
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

/**
 * How a skill can be auto-detected from a project
 */
export const SkillDetectorTypeSchema = z.enum([
  'file_exists',     // Check if a file exists (e.g., "tsconfig.json")
  'package_json',    // Check package.json dependencies (e.g., "dependencies.react")
  'file_content',    // Check file content for patterns
  'command',         // Run a command and check output
]);
export type SkillDetectorType = z.infer<typeof SkillDetectorTypeSchema>;

export const SkillDetectorSchema = z.object({
  type: SkillDetectorTypeSchema,
  pattern: z.string(),  // File name, package path, regex, or command
  weight: z.number().optional().default(1),  // Confidence weight (0-1)
});
export type SkillDetector = z.infer<typeof SkillDetectorSchema>;

/**
 * Full skill definition with metadata and detection rules
 */
export const SkillDefinitionSchema = z.object({
  id: z.string(),                              // "typescript", "react", "fastapi"
  label: z.string(),                           // Human-readable: "TypeScript"
  category: SkillCategorySchema,
  description: z.string(),
  aliases: z.array(z.string()).default([]),    // Alternative names: ["ts", "TS"]
  detectors: z.array(SkillDetectorSchema).default([]),  // Auto-detection rules
  prerequisites: z.array(z.string()).default([]),       // Skills needed first
  relatedSkills: z.array(z.string()).default([]),       // Often used together
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

/**
 * Detected skill with confidence score
 */
export const DetectedSkillSchema = z.object({
  skillId: z.string(),
  confidence: z.number().min(0).max(1),  // 0-1 confidence score
  detectedBy: z.array(z.string()),       // Which detectors matched
  source: z.string().optional(),         // File/config that triggered detection
});
export type DetectedSkill = z.infer<typeof DetectedSkillSchema>;

/**
 * Project skill profile (cached detection results)
 */
export const ProjectSkillProfileSchema = z.object({
  projectPath: z.string(),
  detectedSkills: z.array(DetectedSkillSchema),
  customSkills: z.array(z.string()).default([]),    // User-added skills
  disabledSkills: z.array(z.string()).default([]),  // User-disabled skills
  detectedAt: z.date(),
  expiresAt: z.date().optional(),  // When to re-detect
});
export type ProjectSkillProfile = z.infer<typeof ProjectSkillProfileSchema>;

// Note: AgentSkill type is exported from agent.ts for backwards compatibility

/**
 * Default skills that are always available (core set)
 */
export const CORE_SKILLS = [
  // Languages
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'ruby', 'php', 'csharp',
  // Frameworks
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'express', 'fastapi', 'django', 'rails',
  // Domains
  'backend', 'frontend', 'fullstack', 'devops', 'database', 'testing', 'documentation',
  // Tools
  'docker', 'kubernetes', 'git', 'ci-cd', 'aws', 'gcp', 'azure',
  // Specialized
  'sql', 'nosql', 'data', 'ml', 'api', 'security', 'mobile', 'graphql', 'rest',
] as const;

export type CoreSkill = (typeof CORE_SKILLS)[number];
