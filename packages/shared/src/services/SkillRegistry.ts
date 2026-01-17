import { SkillDefinition } from '../types/skill';
import defaultSkillsData from '../data/default-skills.json';

/**
 * SkillRegistry manages the skill ecosystem:
 * - Loads and validates skill definitions
 * - Resolves skill aliases to canonical IDs
 * - Validates skill names
 * - Provides skill metadata
 */
export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private aliases: Map<string, string> = new Map();  // alias -> canonical ID
  private customSkills: Set<string> = new Set();

  constructor() {
    this.loadDefaultSkills();
  }

  /**
   * Load bundled skill definitions
   */
  private loadDefaultSkills(): void {
    const skillsArray = defaultSkillsData.skills as SkillDefinition[];

    for (const skill of skillsArray) {
      this.registerSkill(skill);
    }
  }

  /**
   * Register a skill definition
   */
  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);

    // Register aliases
    for (const alias of skill.aliases || []) {
      this.aliases.set(alias.toLowerCase(), skill.id);
    }
  }

  /**
   * Register a custom skill (just an ID, no full definition)
   */
  registerCustomSkill(skillId: string): void {
    if (!this.skills.has(skillId) && !this.customSkills.has(skillId)) {
      this.customSkills.add(skillId);
    }
  }

  /**
   * Resolve a skill name to its canonical ID
   * Handles aliases and case-insensitive matching
   */
  resolve(skillName: string): string | null {
    const normalized = skillName.toLowerCase().trim();

    // Direct match
    if (this.skills.has(normalized)) {
      return normalized;
    }

    // Alias match
    if (this.aliases.has(normalized)) {
      return this.aliases.get(normalized)!;
    }

    // Custom skill match
    if (this.customSkills.has(normalized)) {
      return normalized;
    }

    // Case-insensitive search through all skills
    for (const [id] of this.skills) {
      if (id.toLowerCase() === normalized) {
        return id;
      }
    }

    return null;
  }

  /**
   * Check if a skill is valid (registered or custom)
   */
  isValid(skillName: string): boolean {
    return this.resolve(skillName) !== null;
  }

  /**
   * Get skill definition by ID
   */
  getSkill(skillId: string): SkillDefinition | undefined {
    const resolved = this.resolve(skillId);
    return resolved ? this.skills.get(resolved) : undefined;
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all skill IDs (including custom)
   */
  getAllSkillIds(): string[] {
    return [
      ...Array.from(this.skills.keys()),
      ...Array.from(this.customSkills),
    ];
  }

  /**
   * Get skills by category
   */
  getSkillsByCategory(category: string): SkillDefinition[] {
    return Array.from(this.skills.values()).filter(
      s => s.category === category
    );
  }

  /**
   * Check if acquiring a skill is possible (prerequisites met)
   */
  canAcquire(skillId: string, currentSkills: string[]): boolean {
    const skill = this.getSkill(skillId);
    if (!skill) {
      // Unknown skills can always be "acquired" (custom skills)
      return true;
    }

    // Check prerequisites
    for (const prereq of skill.prerequisites || []) {
      const hasPrereq = currentSkills.some(s => {
        const resolved = this.resolve(s);
        return resolved === prereq;
      });
      if (!hasPrereq) {
        return false;
      }
    }

    return true;
  }

  /**
   * Normalize a list of skill names to canonical IDs
   * Filters out invalid skills
   */
  normalizeSkills(skillNames: string[]): string[] {
    const normalized: string[] = [];

    for (const name of skillNames) {
      const resolved = this.resolve(name);
      if (resolved && !normalized.includes(resolved)) {
        normalized.push(resolved);
      }
    }

    return normalized;
  }

  /**
   * Get related skills for a given skill
   */
  getRelatedSkills(skillId: string): string[] {
    const skill = this.getSkill(skillId);
    return skill?.relatedSkills || [];
  }

  /**
   * Check if an agent's skills match task requirements
   */
  matchesRequirements(
    agentSkills: string[],
    requiredSkills: string[]
  ): boolean {
    const normalizedAgent = this.normalizeSkills(agentSkills);
    const normalizedRequired = this.normalizeSkills(requiredSkills);

    // All required skills must be present
    for (const required of normalizedRequired) {
      if (!normalizedAgent.includes(required)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate skill match score (0-1)
   * Used for task assignment prioritization
   */
  calculateMatchScore(
    agentSkills: string[],
    requiredSkills: string[]
  ): number {
    if (requiredSkills.length === 0) {
      return 1;  // No requirements = full match
    }

    const normalizedAgent = this.normalizeSkills(agentSkills);
    const normalizedRequired = this.normalizeSkills(requiredSkills);

    let matchedCount = 0;
    let relatedBonus = 0;

    for (const required of normalizedRequired) {
      if (normalizedAgent.includes(required)) {
        matchedCount++;
      } else {
        // Check for related skills (partial credit)
        const relatedSkills = this.getRelatedSkills(required);
        const hasRelated = relatedSkills.some(r => normalizedAgent.includes(r));
        if (hasRelated) {
          relatedBonus += 0.3;  // 30% credit for related skills
        }
      }
    }

    const baseScore = matchedCount / normalizedRequired.length;
    const bonusScore = relatedBonus / normalizedRequired.length;

    return Math.min(1, baseScore + bonusScore);
  }

  /**
   * Suggest skills an agent should acquire for a task
   */
  suggestSkillsToAcquire(
    agentSkills: string[],
    requiredSkills: string[]
  ): string[] {
    const normalizedAgent = this.normalizeSkills(agentSkills);
    const normalizedRequired = this.normalizeSkills(requiredSkills);

    return normalizedRequired.filter(
      r => !normalizedAgent.includes(r) && this.canAcquire(r, normalizedAgent)
    );
  }
}

// Singleton instance for shared use
let registryInstance: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!registryInstance) {
    registryInstance = new SkillRegistry();
  }
  return registryInstance;
}

/**
 * Validate a skill name (backwards compatibility helper)
 */
export function isValidSkill(skillName: string): boolean {
  return getSkillRegistry().isValid(skillName);
}

/**
 * Resolve skill aliases to canonical ID
 */
export function resolveSkill(skillName: string): string | null {
  return getSkillRegistry().resolve(skillName);
}
