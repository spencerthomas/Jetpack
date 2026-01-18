import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillDetector, DetectionResult } from './SkillDetector';

// Mock fs/promises
vi.mock('fs/promises');
const mockFs = fs as unknown as {
  access: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  readdir: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

// Mock @jetpack-agent/shared
vi.mock('@jetpack-agent/shared', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  getSkillRegistry: vi.fn().mockReturnValue({
    getAllSkills: vi.fn().mockReturnValue([
      {
        id: 'typescript',
        label: 'TypeScript',
        category: 'language',
        detectors: [
          { type: 'file_exists', pattern: 'tsconfig.json', weight: 1 },
          { type: 'package_json', pattern: 'devDependencies.typescript', weight: 1 },
        ],
      },
      {
        id: 'react',
        label: 'React',
        category: 'framework',
        detectors: [
          { type: 'package_json', pattern: 'dependencies.react', weight: 1 },
        ],
      },
      {
        id: 'python',
        label: 'Python',
        category: 'language',
        detectors: [
          { type: 'file_exists', pattern: 'requirements.txt', weight: 1 },
          { type: 'file_exists', pattern: 'pyproject.toml', weight: 1 },
        ],
      },
      {
        id: 'go',
        label: 'Go',
        category: 'language',
        detectors: [
          { type: 'file_exists', pattern: 'go.mod', weight: 1 },
        ],
      },
      {
        id: 'rust',
        label: 'Rust',
        category: 'language',
        detectors: [
          { type: 'file_exists', pattern: 'Cargo.toml', weight: 1 },
        ],
      },
      {
        id: 'docker',
        label: 'Docker',
        category: 'tool',
        detectors: [
          { type: 'file_exists', pattern: 'Dockerfile', weight: 1 },
        ],
      },
      {
        id: 'kubernetes',
        label: 'Kubernetes',
        category: 'tool',
        detectors: [],
      },
      {
        id: 'testing',
        label: 'Testing',
        category: 'domain',
        detectors: [
          { type: 'file_exists', pattern: 'jest.config.*', weight: 1 },
        ],
      },
      {
        id: 'api',
        label: 'API Development',
        category: 'domain',
        detectors: [],
      },
      {
        id: 'graphql',
        label: 'GraphQL',
        category: 'domain',
        detectors: [],
      },
      {
        id: 'database',
        label: 'Database',
        category: 'domain',
        detectors: [],
      },
      {
        id: 'sql',
        label: 'SQL',
        category: 'domain',
        detectors: [],
      },
      {
        id: 'nosql',
        label: 'NoSQL',
        category: 'domain',
        detectors: [],
      },
    ]),
  }),
}));

describe('SkillDetector', () => {
  let detector: SkillDetector;
  const workDir = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new SkillDetector(workDir);

    // Default mock implementations
    mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));
    mockFs.readFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
    mockFs.readdir = vi.fn().mockResolvedValue([]);
    mockFs.stat = vi.fn().mockRejectedValue(new Error('ENOENT'));
  });

  afterEach(() => {
    detector.clearCache();
  });

  describe('detectProjectSkills', () => {
    it('should return empty array when no skills detected', async () => {
      const skills = await detector.detectProjectSkills();
      expect(skills).toEqual([]);
    });

    it('should detect TypeScript from tsconfig.json', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const tsSkill = skills.find(s => s.skillId === 'typescript');

      expect(tsSkill).toBeDefined();
      expect(tsSkill!.confidence).toBe(1);
      expect(tsSkill!.detectedBy).toContain('file_exists:tsconfig.json');
    });

    it('should detect Python from requirements.txt', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'requirements.txt')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const pySkill = skills.find(s => s.skillId === 'python');

      expect(pySkill).toBeDefined();
      expect(pySkill!.confidence).toBe(1);
    });

    it('should detect Go from go.mod', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'go.mod')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const goSkill = skills.find(s => s.skillId === 'go');

      expect(goSkill).toBeDefined();
      expect(goSkill!.confidence).toBe(1);
    });

    it('should detect Rust from Cargo.toml', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'Cargo.toml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const rustSkill = skills.find(s => s.skillId === 'rust');

      expect(rustSkill).toBeDefined();
      expect(rustSkill!.confidence).toBe(1);
    });
  });

  describe('package.json detection', () => {
    it('should detect React from dependencies', async () => {
      const packageJson = {
        dependencies: { react: '^18.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const reactSkill = skills.find(s => s.skillId === 'react');

      expect(reactSkill).toBeDefined();
      expect(reactSkill!.confidence).toBe(1);
    });

    it('should detect TypeScript from devDependencies', async () => {
      const packageJson = {
        devDependencies: { typescript: '^5.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const tsSkill = skills.find(s => s.skillId === 'typescript');

      expect(tsSkill).toBeDefined();
    });
  });

  describe('enhanced testing detection', () => {
    it('should detect testing from vitest config file', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'vitest.config.ts')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const testingSkill = skills.find(s => s.skillId === 'testing');

      expect(testingSkill).toBeDefined();
      expect(testingSkill!.confidence).toBeGreaterThanOrEqual(1.0);
      expect(testingSkill!.detectedBy.some(d => d.includes('vitest'))).toBe(true);
    });

    it('should detect testing from jest package in devDependencies', async () => {
      const packageJson = {
        devDependencies: { jest: '^29.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const testingSkill = skills.find(s => s.skillId === 'testing');

      expect(testingSkill).toBeDefined();
      expect(testingSkill!.detectedBy.some(d => d.includes('jest'))).toBe(true);
    });

    it('should detect testing from pytest.ini', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'pytest.ini')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const testingSkill = skills.find(s => s.skillId === 'testing');

      expect(testingSkill).toBeDefined();
      expect(testingSkill!.detectedBy.some(d => d.includes('pytest'))).toBe(true);
    });

    it('should detect testing from test directories with test files', async () => {
      mockFs.stat = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, '__tests__')) {
          return { isDirectory: () => true, isFile: () => false };
        }
        throw new Error('ENOENT');
      });

      mockFs.readdir = vi.fn().mockImplementation(async (dirPath: string) => {
        if (dirPath === path.join(workDir, '__tests__')) {
          return ['example.test.ts', 'another.test.ts'];
        }
        return [];
      });

      const skills = await detector.detectProjectSkills();
      const testingSkill = skills.find(s => s.skillId === 'testing');

      expect(testingSkill).toBeDefined();
      expect(testingSkill!.confidence).toBeGreaterThan(0.7);
    });

    it('should boost confidence with multiple test indicators', async () => {
      const packageJson = {
        devDependencies: {
          vitest: '^1.0.0',
          '@testing-library/react': '^14.0.0',
        },
      };

      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'vitest.config.ts')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const testingSkill = skills.find(s => s.skillId === 'testing');

      expect(testingSkill).toBeDefined();
      // Multiple indicators should boost confidence
      expect(testingSkill!.detectedBy.length).toBeGreaterThan(1);
    });
  });

  describe('enhanced Docker detection', () => {
    it('should detect docker from Dockerfile', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'Dockerfile')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'Dockerfile')) {
          return 'FROM node:18\nRUN npm install';
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const dockerSkill = skills.find(s => s.skillId === 'docker');

      expect(dockerSkill).toBeDefined();
      expect(dockerSkill!.confidence).toBe(1);
    });

    it('should detect docker from docker-compose.yml', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'docker-compose.yml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const dockerSkill = skills.find(s => s.skillId === 'docker');

      expect(dockerSkill).toBeDefined();
      expect(dockerSkill!.confidence).toBe(1);
    });

    it('should detect multi-stage Dockerfile with higher confidence', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'Dockerfile')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'Dockerfile')) {
          return 'FROM node:18 as builder\nRUN npm install\nFROM node:18-slim\nCOPY --from=builder /app /app';
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const dockerSkill = skills.find(s => s.skillId === 'docker');

      expect(dockerSkill).toBeDefined();
      // Multi-stage builds get extra detection
      expect(dockerSkill!.detectedBy.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('enhanced Kubernetes detection', () => {
    it('should detect kubernetes from k8s directory', async () => {
      mockFs.stat = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'k8s')) {
          return { isDirectory: () => true, isFile: () => false };
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const k8sSkill = skills.find(s => s.skillId === 'kubernetes');

      expect(k8sSkill).toBeDefined();
      expect(k8sSkill!.confidence).toBe(1);
      expect(k8sSkill!.detectedBy.some(d => d.includes('k8s-dir'))).toBe(true);
    });

    it('should detect kubernetes from helm directory', async () => {
      mockFs.stat = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'helm')) {
          return { isDirectory: () => true, isFile: () => false };
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const k8sSkill = skills.find(s => s.skillId === 'kubernetes');

      expect(k8sSkill).toBeDefined();
      expect(k8sSkill!.confidence).toBe(0.9);
    });

    it('should detect kubernetes from Chart.yaml', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'Chart.yaml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const k8sSkill = skills.find(s => s.skillId === 'kubernetes');

      expect(k8sSkill).toBeDefined();
      expect(k8sSkill!.detectedBy.some(d => d.includes('Chart.yaml'))).toBe(true);
    });
  });

  describe('enhanced API detection', () => {
    it('should detect api from openapi.yaml', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'openapi.yaml')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const apiSkill = skills.find(s => s.skillId === 'api');

      expect(apiSkill).toBeDefined();
      expect(apiSkill!.confidence).toBe(1);
    });

    it('should detect api from src/api directory', async () => {
      mockFs.stat = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'src/api')) {
          return { isDirectory: () => true, isFile: () => false };
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const apiSkill = skills.find(s => s.skillId === 'api');

      expect(apiSkill).toBeDefined();
      expect(apiSkill!.confidence).toBe(0.7);
    });
  });

  describe('enhanced GraphQL detection', () => {
    it('should detect graphql from schema.graphql file', async () => {
      mockFs.stat = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'schema.graphql')) {
          return { isDirectory: () => false, isFile: () => true };
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const graphqlSkill = skills.find(s => s.skillId === 'graphql');

      expect(graphqlSkill).toBeDefined();
      expect(graphqlSkill!.confidence).toBe(1);
    });

    it('should detect graphql from @apollo/client package', async () => {
      const packageJson = {
        dependencies: { '@apollo/client': '^3.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const graphqlSkill = skills.find(s => s.skillId === 'graphql');

      expect(graphqlSkill).toBeDefined();
      expect(graphqlSkill!.confidence).toBe(0.9);
    });
  });

  describe('enhanced database detection', () => {
    it('should detect database from prisma package', async () => {
      const packageJson = {
        devDependencies: { prisma: '^5.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const dbSkill = skills.find(s => s.skillId === 'database');

      expect(dbSkill).toBeDefined();
      expect(dbSkill!.confidence).toBe(1);
    });

    it('should detect sql from pg package', async () => {
      const packageJson = {
        dependencies: { pg: '^8.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const sqlSkill = skills.find(s => s.skillId === 'sql');

      expect(sqlSkill).toBeDefined();
      expect(sqlSkill!.confidence).toBe(0.8);
    });

    it('should detect nosql from mongodb package', async () => {
      const packageJson = {
        dependencies: { mongodb: '^6.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const nosqlSkill = skills.find(s => s.skillId === 'nosql');

      expect(nosqlSkill).toBeDefined();
      expect(nosqlSkill!.confidence).toBe(0.9);
    });

    it('should detect database from migrations directory', async () => {
      mockFs.stat = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'migrations')) {
          return { isDirectory: () => true, isFile: () => false };
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const dbSkill = skills.find(s => s.skillId === 'database');

      expect(dbSkill).toBeDefined();
      expect(dbSkill!.confidence).toBe(0.85);
    });
  });

  describe('confidence scoring', () => {
    it('should boost confidence with multiple detections for same skill', async () => {
      // TypeScript detected from both tsconfig.json and devDependencies
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const packageJson = {
        devDependencies: { typescript: '^5.0.0' },
      };

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const tsSkill = skills.find(s => s.skillId === 'typescript');

      expect(tsSkill).toBeDefined();
      // Multiple detections should be recorded
      expect(tsSkill!.detectedBy.length).toBe(2);
      // Confidence is capped at 1.0, but the boost should still happen (1 + 1*0.2 = 1.2 -> capped to 1)
      expect(tsSkill!.confidence).toBe(1);
    });

    it('should cap confidence at 1.0', async () => {
      // Many test indicators
      const packageJson = {
        devDependencies: {
          vitest: '^1.0.0',
          '@testing-library/react': '^14.0.0',
          '@testing-library/jest-dom': '^6.0.0',
          cypress: '^13.0.0',
        },
      };

      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'vitest.config.ts') ||
            filePath === path.join(workDir, 'cypress.config.ts')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      mockFs.readFile = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'package.json')) {
          return JSON.stringify(packageJson);
        }
        throw new Error('ENOENT');
      });

      const skills = await detector.detectProjectSkills();
      const testingSkill = skills.find(s => s.skillId === 'testing');

      expect(testingSkill).toBeDefined();
      expect(testingSkill!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('getProjectProfile', () => {
    it('should return cached profile on subsequent calls', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const profile1 = await detector.getProjectProfile();
      const profile2 = await detector.getProjectProfile();

      expect(profile1).toBe(profile2); // Same object reference
    });

    it('should force refresh when requested', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const profile1 = await detector.getProjectProfile();
      const profile2 = await detector.getProjectProfile(true);

      expect(profile1).not.toBe(profile2); // Different object references
    });

    it('should include detection timestamp', async () => {
      const profile = await detector.getProjectProfile();

      expect(profile.detectedAt).toBeInstanceOf(Date);
      expect(profile.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('getDetectedSkillIds', () => {
    it('should return skill IDs above minimum confidence', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skillIds = await detector.getDetectedSkillIds(0.5);

      expect(skillIds).toContain('typescript');
    });

    it('should filter out low confidence skills', async () => {
      // Only .dockerignore which has low confidence (0.6)
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, '.dockerignore')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      const skillIds = await detector.getDetectedSkillIds(0.8);

      // Docker should not be included due to low confidence from just .dockerignore
      expect(skillIds).not.toContain('docker');
    });
  });

  describe('custom and disabled skills', () => {
    it('should add custom skills to profile', async () => {
      await detector.getProjectProfile();
      detector.addCustomSkills(['custom-skill-1', 'custom-skill-2']);

      const profile = await detector.getProjectProfile();
      expect(profile.customSkills).toContain('custom-skill-1');
      expect(profile.customSkills).toContain('custom-skill-2');
    });

    it('should disable skills from profile', async () => {
      await detector.getProjectProfile();
      detector.disableSkills(['typescript']);

      const profile = await detector.getProjectProfile();
      expect(profile.disabledSkills).toContain('typescript');
    });

    it('should exclude disabled skills from active skills', async () => {
      mockFs.access = vi.fn().mockImplementation(async (filePath: string) => {
        if (filePath === path.join(workDir, 'tsconfig.json')) {
          return undefined;
        }
        throw new Error('ENOENT');
      });

      await detector.getProjectProfile();
      detector.disableSkills(['typescript']);

      const activeSkills = await detector.getActiveSkills();
      expect(activeSkills).not.toContain('typescript');
    });
  });

  describe('clearCache', () => {
    it('should clear cached profile', async () => {
      await detector.getProjectProfile();
      detector.clearCache();

      // After clearing, the profile should be re-detected
      mockFs.access = vi.fn().mockRejectedValue(new Error('ENOENT'));

      const profile = await detector.getProjectProfile();
      expect(profile.detectedSkills).toEqual([]);
    });
  });
});
