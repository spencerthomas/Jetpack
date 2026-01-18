import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger, getSkillRegistry, DetectedSkill, ProjectSkillProfile } from '@jetpack-agent/shared';

/**
 * SkillDetector auto-detects skills from a project directory
 * by analyzing config files, package.json dependencies, and file patterns.
 */
export class SkillDetector {
  private logger = new Logger('SkillDetector');
  private workDir: string;
  private cachedProfile: ProjectSkillProfile | null = null;

  constructor(workDir: string) {
    this.workDir = workDir;
  }

  /**
   * Detect all skills for the project
   */
  async detectProjectSkills(): Promise<DetectedSkill[]> {
    this.logger.info(`Detecting skills in ${this.workDir}`);
    const detected: Map<string, DetectedSkill> = new Map();

    const registry = getSkillRegistry();
    const allSkills = registry.getAllSkills();

    for (const skill of allSkills) {
      for (const detector of skill.detectors || []) {
        try {
          const matches = await this.runDetector(detector.type, detector.pattern);
          if (matches) {
            const existing = detected.get(skill.id);
            if (existing) {
              // Add to existing detection
              existing.detectedBy.push(`${detector.type}:${detector.pattern}`);
              existing.confidence = Math.min(1, existing.confidence + detector.weight * 0.2);
            } else {
              detected.set(skill.id, {
                skillId: skill.id,
                confidence: detector.weight,
                detectedBy: [`${detector.type}:${detector.pattern}`],
                source: matches,
              });
            }
          }
        } catch (error) {
          this.logger.debug(`Detector failed for ${skill.id}: ${error}`);
        }
      }
    }

    const results = Array.from(detected.values());
    this.logger.info(`Detected ${results.length} skills: ${results.map(d => d.skillId).join(', ')}`);

    return results;
  }

  /**
   * Run a single detector and return the matched source (or null)
   */
  private async runDetector(
    type: string,
    pattern: string
  ): Promise<string | null> {
    switch (type) {
      case 'file_exists':
        return this.detectFileExists(pattern);
      case 'package_json':
        return this.detectPackageJson(pattern);
      case 'file_content':
        return this.detectFileContent(pattern);
      default:
        return null;
    }
  }

  /**
   * Check if a file matching the pattern exists
   */
  private async detectFileExists(pattern: string): Promise<string | null> {
    // Handle glob-like patterns
    if (pattern.includes('*')) {
      // Simple glob matching for common patterns
      const parts = pattern.split('/');
      let currentDir = this.workDir;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part === '**') {
          // Recursive search - check if any matching file exists
          const remaining = parts.slice(i + 1).join('/');
          const found = await this.findMatchingFile(currentDir, remaining, true);
          return found;
        } else if (part.includes('*')) {
          // Simple wildcard
          const regex = new RegExp('^' + part.replace(/\*/g, '.*') + '$');
          try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              if (regex.test(entry.name)) {
                if (i === parts.length - 1) {
                  return path.join(currentDir, entry.name);
                }
                currentDir = path.join(currentDir, entry.name);
                break;
              }
            }
          } catch {
            return null;
          }
        } else {
          currentDir = path.join(currentDir, part);
        }
      }

      return null;
    }

    // Direct file check
    const filePath = path.join(this.workDir, pattern);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /**
   * Recursively search for matching files
   */
  private async findMatchingFile(
    dir: string,
    pattern: string,
    recursive: boolean
  ): Promise<string | null> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile() && regex.test(entry.name)) {
          return fullPath;
        }

        if (recursive && entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const found = await this.findMatchingFile(fullPath, pattern, true);
          if (found) {
            return found;
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return null;
  }

  /**
   * Check package.json dependencies
   * Pattern format: "dependencies.react" or "devDependencies.typescript"
   */
  private async detectPackageJson(pattern: string): Promise<string | null> {
    const packagePath = path.join(this.workDir, 'package.json');

    try {
      const content = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      // Parse pattern like "dependencies.react"
      const parts = pattern.split('.');
      let current: Record<string, unknown> = pkg;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part] as Record<string, unknown>;
        } else {
          return null;
        }
      }

      // If we got here, the dependency exists
      return packagePath;
    } catch {
      return null;
    }
  }

  /**
   * Check file content for patterns
   * Pattern format: "requirements.txt:fastapi" or "from fastapi import"
   */
  private async detectFileContent(pattern: string): Promise<string | null> {
    // File-specific pattern: "filename:content"
    if (pattern.includes(':')) {
      const [filename, searchPattern] = pattern.split(':');
      const filePath = path.join(this.workDir, filename);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.toLowerCase().includes(searchPattern.toLowerCase())) {
          return filePath;
        }
      } catch {
        return null;
      }
    } else {
      // Global content search (limited - just check common files)
      const filesToCheck = [
        'requirements.txt',
        'package.json',
        'Gemfile',
        'Cargo.toml',
        'go.mod',
      ];

      for (const file of filesToCheck) {
        const filePath = path.join(this.workDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          if (content.toLowerCase().includes(pattern.toLowerCase())) {
            return filePath;
          }
        } catch {
          // File doesn't exist
        }
      }
    }

    return null;
  }

  /**
   * Get or create project skill profile with caching
   */
  async getProjectProfile(forceRefresh = false): Promise<ProjectSkillProfile> {
    if (this.cachedProfile && !forceRefresh) {
      // Check if cache is still valid (1 hour expiry)
      if (this.cachedProfile.expiresAt && new Date() < this.cachedProfile.expiresAt) {
        return this.cachedProfile;
      }
    }

    const detected = await this.detectProjectSkills();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);  // 1 hour

    this.cachedProfile = {
      projectPath: this.workDir,
      detectedSkills: detected,
      customSkills: [],
      disabledSkills: [],
      detectedAt: now,
      expiresAt,
    };

    return this.cachedProfile;
  }

  /**
   * Get simple list of detected skill IDs
   */
  async getDetectedSkillIds(minConfidence = 0.5): Promise<string[]> {
    const profile = await this.getProjectProfile();
    return profile.detectedSkills
      .filter(d => d.confidence >= minConfidence)
      .map(d => d.skillId);
  }

  /**
   * Add custom skills to the profile
   */
  addCustomSkills(skills: string[]): void {
    if (this.cachedProfile) {
      this.cachedProfile.customSkills = [
        ...new Set([...this.cachedProfile.customSkills, ...skills])
      ];
    }
  }

  /**
   * Disable skills from detection
   */
  disableSkills(skills: string[]): void {
    if (this.cachedProfile) {
      this.cachedProfile.disabledSkills = [
        ...new Set([...this.cachedProfile.disabledSkills, ...skills])
      ];
    }
  }

  /**
   * Get all active skills (detected + custom - disabled)
   */
  async getActiveSkills(): Promise<string[]> {
    const profile = await this.getProjectProfile();
    const detected = profile.detectedSkills.map(d => d.skillId);
    const all = [...new Set([...detected, ...profile.customSkills])];
    return all.filter(s => !profile.disabledSkills.includes(s));
  }
}
