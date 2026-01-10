import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Read directly from tasks.jsonl to stay in sync with CLI orchestrator
async function loadTasksFromFile() {
  const beadsDir = path.join(process.cwd(), '../..', '.beads');
  const tasksFile = path.join(beadsDir, 'tasks.jsonl');

  try {
    const content = await fs.readFile(tasksFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      const task = JSON.parse(line);
      return {
        ...task,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
        completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      };
    });
  } catch (error) {
    // File doesn't exist or is empty
    return [];
  }
}

export async function GET() {
  try {
    const tasks = await loadTasksFromFile();

    // Convert Date objects to ISO strings for JSON serialization
    const serializedTasks = tasks.map(task => ({
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }));

    return NextResponse.json({ tasks: serializedTasks });
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ tasks: [], error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// Generate a short unique ID
function generateTaskId(): string {
  const chars = '0123456789abcdef';
  let id = 'bd-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const beadsDir = path.join(process.cwd(), '../..', '.beads');
    const tasksFile = path.join(beadsDir, 'tasks.jsonl');

    const now = new Date();
    const task = {
      id: generateTaskId(),
      title: body.title,
      description: body.description || '',
      status: 'pending',
      priority: body.priority || 'medium',
      dependencies: [],
      blockers: [],
      requiredSkills: body.requiredSkills || [],
      estimatedMinutes: body.estimatedMinutes,
      tags: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // Append to tasks.jsonl
    await fs.appendFile(tasksFile, JSON.stringify(task) + '\n');

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
