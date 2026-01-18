import {
  Plan,
  PlanItem,
  PlanPriority,
  PlanStatus,
  generatePlanId,
  generatePlanItemId,
} from '@jetpack-agent/shared';

/**
 * PlanParser - Converts markdown to Plan structure
 *
 * Supports Claude Code-style markdown format:
 *
 * ```markdown
 * # Plan: Build User Authentication
 *
 * ## Overview
 * Description of the plan goes here.
 *
 * ## Tasks
 *
 * ### 1. Set up database schema [high] [database, backend]
 * Create user table with password hashing.
 * - Dependencies: none
 * - Estimate: 30m
 *
 * ### 2. Implement auth API [high] [typescript, backend]
 * REST endpoints for login/logout/refresh.
 * - Dependencies: 1
 * - Estimate: 45m
 *
 *   #### 2.1 Login endpoint [high]
 *   POST /api/auth/login
 *
 *   #### 2.2 Logout endpoint [medium]
 *   POST /api/auth/logout
 * ```
 */
export class PlanParser {
  /**
   * Parse markdown into a Plan structure
   */
  static parse(markdown: string, userRequest?: string): Plan {
    const lines = markdown.split('\n');
    let title = '';
    let description = '';
    const items: PlanItem[] = [];
    let currentSection = '';
    let currentItem: PlanItem | null = null;
    let descriptionBuffer: string[] = [];
    const itemNumberToId: Map<string, string> = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Parse title: # Plan: Title
      if (trimmedLine.startsWith('# ')) {
        const titleMatch = trimmedLine.match(/^#\s+(?:Plan:\s*)?(.+)$/);
        if (titleMatch) {
          title = titleMatch[1].trim();
        }
        continue;
      }

      // Parse sections: ## Overview, ## Tasks
      if (trimmedLine.startsWith('## ')) {
        // Save description if we were in overview
        if (currentSection === 'overview' && descriptionBuffer.length > 0) {
          description = descriptionBuffer.join('\n').trim();
          descriptionBuffer = [];
        }

        // Save current item if any
        if (currentItem) {
          if (descriptionBuffer.length > 0) {
            currentItem.description = descriptionBuffer.join('\n').trim();
            descriptionBuffer = [];
          }
          items.push(currentItem);
          currentItem = null;
        }

        currentSection = trimmedLine.slice(3).toLowerCase().trim();
        continue;
      }

      // Parse tasks: ### 1. Task title [priority] [skills]
      if (trimmedLine.startsWith('### ')) {
        // Save current item
        if (currentItem) {
          if (descriptionBuffer.length > 0) {
            currentItem.description = descriptionBuffer.join('\n').trim();
            descriptionBuffer = [];
          }
          items.push(currentItem);
        }

        currentItem = this.parseTaskLine(trimmedLine.slice(4), itemNumberToId);
        continue;
      }

      // Parse sub-tasks: #### 2.1 Sub-task title [priority]
      if (trimmedLine.startsWith('#### ') && currentItem) {
        // Save description to current item
        if (descriptionBuffer.length > 0) {
          currentItem.description = descriptionBuffer.join('\n').trim();
          descriptionBuffer = [];
        }

        const subItem = this.parseTaskLine(trimmedLine.slice(5), itemNumberToId);
        if (!currentItem.children) {
          currentItem.children = [];
        }
        currentItem.children.push(subItem);
        continue;
      }

      // Parse metadata lines: - Dependencies: 1, 2
      if (trimmedLine.startsWith('- Dependencies:') && currentItem) {
        const deps = this.parseDependencies(trimmedLine, itemNumberToId);
        currentItem.dependencies = deps;
        continue;
      }

      // Parse estimate: - Estimate: 30m
      if (trimmedLine.startsWith('- Estimate:') && currentItem) {
        currentItem.estimatedMinutes = this.parseEstimate(trimmedLine);
        continue;
      }

      // Accumulate description/content
      if (currentSection === 'overview' || currentItem) {
        if (trimmedLine || descriptionBuffer.length > 0) {
          descriptionBuffer.push(trimmedLine);
        }
      }
    }

    // Save last item
    if (currentItem) {
      if (descriptionBuffer.length > 0) {
        currentItem.description = descriptionBuffer.join('\n').trim();
      }
      items.push(currentItem);
    }

    // If no title found, use first line or generate default
    if (!title) {
      const firstLine = lines.find(l => l.trim().length > 0);
      title = firstLine?.replace(/^#+\s*/, '').trim() || 'Untitled Plan';
    }

    const now = new Date().toISOString();
    return {
      id: generatePlanId(),
      title,
      description: description || undefined,
      userRequest: userRequest || title,
      status: 'draft' as PlanStatus,
      items,
      createdAt: now,
      updatedAt: now,
      estimatedTotalMinutes: this.calculateTotalEstimate(items),
      tags: [],
      isTemplate: false,
      source: 'import',
      sourceMarkdown: markdown,
    };
  }

  /**
   * Parse a task line: "1. Task title [high] [typescript, backend]"
   */
  private static parseTaskLine(
    line: string,
    itemNumberToId: Map<string, string>
  ): PlanItem {
    // Extract number prefix: "1." or "2.1"
    const numberMatch = line.match(/^([\d.]+)\.\s*/);
    const taskNumber = numberMatch ? numberMatch[1] : '';
    let rest = numberMatch ? line.slice(numberMatch[0].length) : line;

    // Extract priority: [high], [medium], [low], [critical]
    let priority: PlanPriority = 'medium';
    const priorityMatch = rest.match(/\[(low|medium|high|critical)\]/i);
    if (priorityMatch) {
      priority = priorityMatch[1].toLowerCase() as PlanPriority;
      rest = rest.replace(priorityMatch[0], '').trim();
    }

    // Extract skills: [typescript, backend]
    const skills: string[] = [];
    const skillsMatch = rest.match(/\[([^\]]+)\]/);
    if (skillsMatch) {
      const skillsStr = skillsMatch[1];
      // Don't parse if it looks like priority
      if (!['low', 'medium', 'high', 'critical'].includes(skillsStr.toLowerCase())) {
        skills.push(...skillsStr.split(',').map(s => s.trim().toLowerCase()));
        rest = rest.replace(skillsMatch[0], '').trim();
      }
    }

    const title = rest.trim();
    const id = generatePlanItemId();

    // Store mapping for dependency resolution
    if (taskNumber) {
      itemNumberToId.set(taskNumber, id);
    }

    return {
      id,
      title,
      status: 'pending',
      priority,
      skills,
      dependencies: [],
    };
  }

  /**
   * Parse dependencies line: "- Dependencies: 1, 2, 3"
   */
  private static parseDependencies(
    line: string,
    itemNumberToId: Map<string, string>
  ): string[] {
    const match = line.match(/- Dependencies:\s*(.+)/i);
    if (!match) return [];

    const depsStr = match[1].trim().toLowerCase();
    if (depsStr === 'none' || depsStr === '-') return [];

    return depsStr
      .split(/[,\s]+/)
      .map(d => d.trim())
      .filter(d => d)
      .map(d => itemNumberToId.get(d) || d) // Resolve number to ID
      .filter(d => d);
  }

  /**
   * Parse estimate line: "- Estimate: 30m" or "- Estimate: 1h"
   */
  private static parseEstimate(line: string): number {
    const match = line.match(/- Estimate:\s*(\d+)\s*(m|min|h|hr|hour)?/i);
    if (!match) return 30; // Default 30 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase() || 'm';

    if (unit.startsWith('h')) {
      return value * 60;
    }
    return value;
  }

  /**
   * Calculate total estimated minutes for all items
   */
  private static calculateTotalEstimate(items: PlanItem[]): number {
    let total = 0;

    function traverse(items: PlanItem[]) {
      for (const item of items) {
        total += item.estimatedMinutes || 0;
        if (item.children) {
          traverse(item.children);
        }
      }
    }

    traverse(items);
    return total;
  }

  /**
   * Convert a Plan back to markdown format
   */
  static toMarkdown(plan: Plan): string {
    const lines: string[] = [];

    lines.push(`# Plan: ${plan.title}`);
    lines.push('');

    if (plan.description) {
      lines.push('## Overview');
      lines.push(plan.description);
      lines.push('');
    }

    lines.push('## Tasks');
    lines.push('');

    let taskNum = 1;

    function renderItem(item: PlanItem, prefix: string, level: number) {
      const headerLevel = level === 0 ? '###' : '####';
      const priorityTag = `[${item.priority}]`;
      const skillsTag = item.skills.length > 0 ? ` [${item.skills.join(', ')}]` : '';

      lines.push(`${headerLevel} ${prefix} ${item.title} ${priorityTag}${skillsTag}`);

      if (item.description) {
        lines.push(item.description);
      }

      if (item.dependencies.length > 0) {
        lines.push(`- Dependencies: ${item.dependencies.join(', ')}`);
      } else {
        lines.push('- Dependencies: none');
      }

      if (item.estimatedMinutes) {
        const estimate = item.estimatedMinutes >= 60
          ? `${Math.floor(item.estimatedMinutes / 60)}h${item.estimatedMinutes % 60 ? ` ${item.estimatedMinutes % 60}m` : ''}`
          : `${item.estimatedMinutes}m`;
        lines.push(`- Estimate: ${estimate}`);
      }

      lines.push('');

      // Render children
      if (item.children) {
        let subNum = 1;
        for (const child of item.children) {
          renderItem(child, `${prefix}.${subNum}`, level + 1);
          subNum++;
        }
      }
    }

    for (const item of plan.items) {
      renderItem(item, `${taskNum}.`, 0);
      taskNum++;
    }

    return lines.join('\n');
  }
}
