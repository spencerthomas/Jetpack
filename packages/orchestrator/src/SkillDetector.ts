import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger, getSkillRegistry, DetectedSkill, ProjectSkillProfile } from '@jetpack-agent/shared';

/**
 * Detailed detection result with source tracking
 */
export interface DetectionResult {
  matched: boolean;
  source: string | null;
  confidence: number;
  details?: string;
}

/**
 * SkillDetector auto-detects skills from a project directory
 * by analyzing config files, package.json dependencies, devDependencies,
 * Dockerfiles, test directories, and file patterns.
 *
 * Enhanced detection capabilities:
 * - Scans both dependencies and devDependencies in package.json
 * - Detects testing frameworks (jest, vitest, pytest, mocha)
 * - Recognizes containerization (Docker, docker-compose, Kubernetes)
 * - Identifies API patterns (GraphQL, REST/OpenAPI)
 * - Detects additional languages (Python, Go, Rust)
 * - Provides confidence scores based on detection strength
 */
export class SkillDetector {
  private logger = new Logger('SkillDetector');
  private workDir: string;
  private cachedProfile: ProjectSkillProfile | null = null;
  private packageJsonCache: Record<string, unknown> | null = null;

  constructor(workDir: string) {
    this.workDir = workDir;
  }

  /**
   * Clear cached data (useful for testing or when project changes)
   */
  clearCache(): void {
    this.cachedProfile = null;
    this.packageJsonCache = null;
  }

  /**
   * Detect all skills for the project
   */
  async detectProjectSkills(): Promise<DetectedSkill[]> {
    this.logger.info(`Detecting skills in ${this.workDir}`);
    const detected: Map<string, DetectedSkill> = new Map();

    const registry = getSkillRegistry();
    const allSkills = registry.getAllSkills();

    // Run standard detectors from skill registry
    for (const skill of allSkills) {
      for (const detector of skill.detectors || []) {
        try {
          const result = await this.runDetectorWithConfidence(detector.type, detector.pattern, detector.weight);
          if (result.matched && result.source) {
            const existing = detected.get(skill.id);
            if (existing) {
              // Add to existing detection with boosted confidence
              existing.detectedBy.push(`${detector.type}:${detector.pattern}`);
              existing.confidence = Math.min(1, existing.confidence + result.confidence * 0.2);
            } else {
              detected.set(skill.id, {
                skillId: skill.id,
                confidence: result.confidence,
                detectedBy: [`${detector.type}:${detector.pattern}`],
                source: result.source,
              });
            }
          }
        } catch (error) {
          this.logger.debug(`Detector failed for ${skill.id}: ${error}`);
        }
      }
    }

    // Run enhanced detection for additional skills not in registry
    await this.runEnhancedDetection(detected);

    const results = Array.from(detected.values());
    this.logger.info(`Detected ${results.length} skills: ${results.map(d => d.skillId).join(', ')}`);

    return results;
  }

  /**
   * Run enhanced detection for skills that may not be fully covered by registry
   * This includes test frameworks, containerization, and additional patterns
   */
  private async runEnhancedDetection(detected: Map<string, DetectedSkill>): Promise<void> {
    // Detect testing frameworks by scanning test directories and config
    await this.detectTestingSkills(detected);

    // Detect containerization skills
    await this.detectContainerizationSkills(detected);

    // Detect API skills with enhanced patterns
    await this.detectApiSkills(detected);

    // Detect database skills with enhanced patterns
    await this.detectDatabaseSkills(detected);
  }

  /**
   * Detect testing frameworks (jest, vitest, pytest, mocha, etc.)
   */
  private async detectTestingSkills(detected: Map<string, DetectedSkill>): Promise<void> {
    const testDetections: { source: string; framework: string; confidence: number }[] = [];

    // Check for test config files
    const testConfigs = [
      { file: 'jest.config.js', framework: 'jest', confidence: 1.0 },
      { file: 'jest.config.ts', framework: 'jest', confidence: 1.0 },
      { file: 'jest.config.json', framework: 'jest', confidence: 1.0 },
      { file: 'vitest.config.js', framework: 'vitest', confidence: 1.0 },
      { file: 'vitest.config.ts', framework: 'vitest', confidence: 1.0 },
      { file: 'pytest.ini', framework: 'pytest', confidence: 1.0 },
      { file: 'pyproject.toml', framework: 'pytest', confidence: 0.6 }, // Could have pytest config
      { file: 'setup.cfg', framework: 'pytest', confidence: 0.5 },
      { file: '.mocharc.js', framework: 'mocha', confidence: 1.0 },
      { file: '.mocharc.json', framework: 'mocha', confidence: 1.0 },
      { file: 'cypress.config.js', framework: 'cypress', confidence: 1.0 },
      { file: 'cypress.config.ts', framework: 'cypress', confidence: 1.0 },
      { file: 'playwright.config.ts', framework: 'playwright', confidence: 1.0 },
      { file: 'playwright.config.js', framework: 'playwright', confidence: 1.0 },
    ];

    for (const config of testConfigs) {
      const filePath = path.join(this.workDir, config.file);
      try {
        await fs.access(filePath);
        testDetections.push({
          source: filePath,
          framework: config.framework,
          confidence: config.confidence,
        });
      } catch {
        // File doesn't exist
      }
    }

    // Check devDependencies for test frameworks
    const pkg = await this.loadPackageJson();
    if (pkg) {
      const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
      const deps = (pkg.dependencies || {}) as Record<string, string>;
      const allDeps = { ...deps, ...devDeps };

      const testPackages = [
        { pkg: 'jest', framework: 'jest', confidence: 0.9 },
        { pkg: 'vitest', framework: 'vitest', confidence: 0.9 },
        { pkg: 'mocha', framework: 'mocha', confidence: 0.9 },
        { pkg: 'pytest', framework: 'pytest', confidence: 0.9 },
        { pkg: '@testing-library/react', framework: 'testing-library', confidence: 0.8 },
        { pkg: '@testing-library/jest-dom', framework: 'jest', confidence: 0.7 },
        { pkg: 'cypress', framework: 'cypress', confidence: 0.9 },
        { pkg: '@playwright/test', framework: 'playwright', confidence: 0.9 },
        { pkg: 'supertest', framework: 'api-testing', confidence: 0.7 },
      ];

      for (const testPkg of testPackages) {
        if (testPkg.pkg in allDeps) {
          testDetections.push({
            source: 'package.json',
            framework: testPkg.framework,
            confidence: testPkg.confidence,
          });
        }
      }
    }

    // Check for test directories
    const testDirs = ['__tests__', 'test', 'tests', 'spec', 'specs'];
    for (const dir of testDirs) {
      const testDir = path.join(this.workDir, dir);
      try {
        const stat = await fs.stat(testDir);
        if (stat.isDirectory()) {
          const files = await fs.readdir(testDir);
          const testFiles = files.filter(f =>
            f.endsWith('.test.ts') || f.endsWith('.test.js') ||
            f.endsWith('.spec.ts') || f.endsWith('.spec.js') ||
            f.endsWith('_test.py') || f.endsWith('_test.go')
          );
          if (testFiles.length > 0) {
            testDetections.push({
              source: testDir,
              framework: 'testing',
              confidence: 0.7 + Math.min(0.2, testFiles.length * 0.02), // Boost for more test files
            });
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Aggregate testing skill
    if (testDetections.length > 0) {
      const existing = detected.get('testing');
      const maxConfidence = Math.max(...testDetections.map(d => d.confidence));
      const boostedConfidence = Math.min(1, maxConfidence + (testDetections.length - 1) * 0.05);

      if (existing) {
        existing.detectedBy.push(...testDetections.map(d => `enhanced:${d.framework}`));
        existing.confidence = Math.min(1, Math.max(existing.confidence, boostedConfidence));
      } else {
        detected.set('testing', {
          skillId: 'testing',
          confidence: boostedConfidence,
          detectedBy: testDetections.map(d => `enhanced:${d.framework}`),
          source: testDetections[0].source,
        });
      }
    }
  }

  /**
   * Detect containerization skills (Docker, Kubernetes)
   */
  private async detectContainerizationSkills(detected: Map<string, DetectedSkill>): Promise<void> {
    // Docker detection with enhanced patterns
    const dockerFiles = [
      { file: 'Dockerfile', confidence: 1.0 },
      { file: 'docker-compose.yml', confidence: 1.0 },
      { file: 'docker-compose.yaml', confidence: 1.0 },
      { file: 'docker-compose.dev.yml', confidence: 0.9 },
      { file: 'docker-compose.prod.yml', confidence: 0.9 },
      { file: 'docker-compose.override.yml', confidence: 0.8 },
      { file: '.dockerignore', confidence: 0.6 },
      { file: 'Dockerfile.dev', confidence: 0.9 },
      { file: 'Dockerfile.prod', confidence: 0.9 },
    ];

    const dockerDetections: { source: string; confidence: number }[] = [];

    for (const df of dockerFiles) {
      const filePath = path.join(this.workDir, df.file);
      try {
        await fs.access(filePath);
        dockerDetections.push({ source: filePath, confidence: df.confidence });
      } catch {
        // File doesn't exist
      }
    }

    // Check for multi-stage Dockerfile (higher confidence)
    const dockerfilePath = path.join(this.workDir, 'Dockerfile');
    try {
      const content = await fs.readFile(dockerfilePath, 'utf-8');
      const fromCount = (content.match(/^FROM\s+/gm) || []).length;
      if (fromCount > 1) {
        // Multi-stage build indicates advanced Docker knowledge
        dockerDetections.push({ source: dockerfilePath, confidence: 1.0 });
      }
    } catch {
      // File doesn't exist or can't be read
    }

    if (dockerDetections.length > 0) {
      const maxConfidence = Math.max(...dockerDetections.map(d => d.confidence));
      const existing = detected.get('docker');
      if (existing) {
        existing.detectedBy.push('enhanced:docker-files');
        existing.confidence = Math.min(1, Math.max(existing.confidence, maxConfidence));
      } else {
        detected.set('docker', {
          skillId: 'docker',
          confidence: maxConfidence,
          detectedBy: ['enhanced:docker-files'],
          source: dockerDetections[0].source,
        });
      }
    }

    // Kubernetes detection with enhanced patterns
    const k8sPatterns = [
      { pattern: 'k8s', confidence: 1.0 },
      { pattern: 'kubernetes', confidence: 1.0 },
      { pattern: 'helm', confidence: 0.9 },
      { pattern: 'charts', confidence: 0.7 },
      { pattern: 'manifests', confidence: 0.6 },
    ];

    for (const k8s of k8sPatterns) {
      const dirPath = path.join(this.workDir, k8s.pattern);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          const existing = detected.get('kubernetes');
          if (existing) {
            existing.detectedBy.push(`enhanced:${k8s.pattern}-dir`);
            existing.confidence = Math.min(1, Math.max(existing.confidence, k8s.confidence));
          } else {
            detected.set('kubernetes', {
              skillId: 'kubernetes',
              confidence: k8s.confidence,
              detectedBy: [`enhanced:${k8s.pattern}-dir`],
              source: dirPath,
            });
          }
          break;
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Check for kubectl/k8s config files
    const k8sFiles = ['skaffold.yaml', 'kustomization.yaml', 'Chart.yaml'];
    for (const file of k8sFiles) {
      const filePath = path.join(this.workDir, file);
      try {
        await fs.access(filePath);
        const existing = detected.get('kubernetes');
        if (existing) {
          existing.detectedBy.push(`enhanced:${file}`);
          existing.confidence = Math.min(1, existing.confidence + 0.1);
        } else {
          detected.set('kubernetes', {
            skillId: 'kubernetes',
            confidence: 0.9,
            detectedBy: [`enhanced:${file}`],
            source: filePath,
          });
        }
      } catch {
        // File doesn't exist
      }
    }
  }

  /**
   * Detect API skills (GraphQL, REST, OpenAPI)
   */
  private async detectApiSkills(detected: Map<string, DetectedSkill>): Promise<void> {
    const pkg = await this.loadPackageJson();

    // GraphQL detection
    const graphqlIndicators = [
      { type: 'file', pattern: 'schema.graphql', confidence: 1.0 },
      { type: 'file', pattern: 'schema.gql', confidence: 1.0 },
      { type: 'dir', pattern: 'graphql', confidence: 0.8 },
    ];

    for (const indicator of graphqlIndicators) {
      const fullPath = path.join(this.workDir, indicator.pattern);
      try {
        const stat = await fs.stat(fullPath);
        if ((indicator.type === 'file' && stat.isFile()) ||
            (indicator.type === 'dir' && stat.isDirectory())) {
          const existing = detected.get('graphql');
          if (existing) {
            existing.detectedBy.push(`enhanced:${indicator.pattern}`);
            existing.confidence = Math.min(1, Math.max(existing.confidence, indicator.confidence));
          } else {
            detected.set('graphql', {
              skillId: 'graphql',
              confidence: indicator.confidence,
              detectedBy: [`enhanced:${indicator.pattern}`],
              source: fullPath,
            });
          }
        }
      } catch {
        // Path doesn't exist
      }
    }

    // Check for GraphQL packages
    if (pkg) {
      const allDeps = { ...((pkg.dependencies || {}) as Record<string, string>), ...((pkg.devDependencies || {}) as Record<string, string>) };
      const graphqlPackages = ['graphql', '@apollo/server', '@apollo/client', 'graphql-yoga', 'type-graphql', 'nexus'];

      for (const gqlPkg of graphqlPackages) {
        if (gqlPkg in allDeps) {
          const existing = detected.get('graphql');
          if (existing) {
            existing.detectedBy.push(`enhanced:pkg-${gqlPkg}`);
            existing.confidence = Math.min(1, existing.confidence + 0.1);
          } else {
            detected.set('graphql', {
              skillId: 'graphql',
              confidence: 0.9,
              detectedBy: [`enhanced:pkg-${gqlPkg}`],
              source: 'package.json',
            });
          }
          break;
        }
      }
    }

    // REST/API detection
    const apiFiles = [
      { file: 'openapi.yaml', confidence: 1.0 },
      { file: 'openapi.yml', confidence: 1.0 },
      { file: 'openapi.json', confidence: 1.0 },
      { file: 'swagger.yaml', confidence: 1.0 },
      { file: 'swagger.yml', confidence: 1.0 },
      { file: 'swagger.json', confidence: 1.0 },
      { file: 'api-spec.yaml', confidence: 0.8 },
    ];

    for (const apiFile of apiFiles) {
      const filePath = path.join(this.workDir, apiFile.file);
      try {
        await fs.access(filePath);
        const existing = detected.get('api');
        if (existing) {
          existing.detectedBy.push(`enhanced:${apiFile.file}`);
          existing.confidence = Math.min(1, Math.max(existing.confidence, apiFile.confidence));
        } else {
          detected.set('api', {
            skillId: 'api',
            confidence: apiFile.confidence,
            detectedBy: [`enhanced:${apiFile.file}`],
            source: filePath,
          });
        }
      } catch {
        // File doesn't exist
      }
    }

    // Check for API directories
    const apiDirs = ['src/api', 'api', 'routes', 'src/routes', 'endpoints'];
    for (const dir of apiDirs) {
      const dirPath = path.join(this.workDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          const existing = detected.get('api');
          if (existing) {
            existing.detectedBy.push(`enhanced:${dir}-dir`);
            existing.confidence = Math.min(1, existing.confidence + 0.1);
          } else {
            detected.set('api', {
              skillId: 'api',
              confidence: 0.7,
              detectedBy: [`enhanced:${dir}-dir`],
              source: dirPath,
            });
          }
          break;
        }
      } catch {
        // Directory doesn't exist
      }
    }
  }

  /**
   * Detect database skills with enhanced patterns
   */
  private async detectDatabaseSkills(detected: Map<string, DetectedSkill>): Promise<void> {
    const pkg = await this.loadPackageJson();

    // ORM and database client detection
    if (pkg) {
      const allDeps = { ...((pkg.dependencies || {}) as Record<string, string>), ...((pkg.devDependencies || {}) as Record<string, string>) };

      const dbPackages = [
        { pkg: 'prisma', skill: 'database', confidence: 1.0 },
        { pkg: '@prisma/client', skill: 'database', confidence: 1.0 },
        { pkg: 'drizzle-orm', skill: 'database', confidence: 1.0 },
        { pkg: 'typeorm', skill: 'database', confidence: 1.0 },
        { pkg: 'sequelize', skill: 'database', confidence: 1.0 },
        { pkg: 'knex', skill: 'database', confidence: 0.9 },
        { pkg: 'pg', skill: 'sql', confidence: 0.8 },
        { pkg: 'mysql2', skill: 'sql', confidence: 0.8 },
        { pkg: 'better-sqlite3', skill: 'sql', confidence: 0.8 },
        { pkg: 'mongodb', skill: 'nosql', confidence: 0.9 },
        { pkg: 'mongoose', skill: 'nosql', confidence: 0.9 },
        { pkg: 'redis', skill: 'nosql', confidence: 0.8 },
        { pkg: 'ioredis', skill: 'nosql', confidence: 0.8 },
      ];

      for (const dbPkg of dbPackages) {
        if (dbPkg.pkg in allDeps) {
          const existing = detected.get(dbPkg.skill);
          if (existing) {
            existing.detectedBy.push(`enhanced:pkg-${dbPkg.pkg}`);
            existing.confidence = Math.min(1, Math.max(existing.confidence, dbPkg.confidence));
          } else {
            detected.set(dbPkg.skill, {
              skillId: dbPkg.skill,
              confidence: dbPkg.confidence,
              detectedBy: [`enhanced:pkg-${dbPkg.pkg}`],
              source: 'package.json',
            });
          }
        }
      }
    }

    // Check for migrations directories
    const migrationDirs = ['migrations', 'db/migrations', 'prisma/migrations', 'drizzle'];
    for (const dir of migrationDirs) {
      const dirPath = path.join(this.workDir, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          const existing = detected.get('database');
          if (existing) {
            existing.detectedBy.push(`enhanced:${dir}`);
            existing.confidence = Math.min(1, existing.confidence + 0.15);
          } else {
            detected.set('database', {
              skillId: 'database',
              confidence: 0.85,
              detectedBy: [`enhanced:${dir}`],
              source: dirPath,
            });
          }
          break;
        }
      } catch {
        // Directory doesn't exist
      }
    }
  }

  /**
   * Load and cache package.json
   */
  private async loadPackageJson(): Promise<Record<string, unknown> | null> {
    if (this.packageJsonCache !== null) {
      return this.packageJsonCache;
    }

    const packagePath = path.join(this.workDir, 'package.json');
    try {
      const content = await fs.readFile(packagePath, 'utf-8');
      this.packageJsonCache = JSON.parse(content);
      return this.packageJsonCache;
    } catch {
      this.packageJsonCache = null;
      return null;
    }
  }

  /**
   * Run a detector with enhanced confidence scoring
   */
  private async runDetectorWithConfidence(
    type: string,
    pattern: string,
    baseWeight: number = 1
  ): Promise<DetectionResult> {
    const source = await this.runDetector(type, pattern);
    if (source) {
      return {
        matched: true,
        source,
        confidence: baseWeight,
      };
    }
    return { matched: false, source: null, confidence: 0 };
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
