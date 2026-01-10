import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Security: only allow valid bead IDs (bd-* format)
  if (!id.match(/^bd-[a-f0-9]+$/)) {
    return NextResponse.json({ error: 'Invalid bead ID' }, { status: 400 });
  }

  // The .beads directory is at the project root (Jetpack)
  // Web app is at apps/web, so we need to go up 2 levels
  const beadsFile = path.join(process.cwd(), '../../.beads/tasks.jsonl');

  try {
    const content = fs.readFileSync(beadsFile, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      try {
        const task = JSON.parse(line);
        if (task.id === id) {
          // Return as formatted JSON
          return new NextResponse(JSON.stringify(task, null, 2), {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          });
        }
      } catch {
        // Skip invalid JSON lines
        continue;
      }
    }

    return NextResponse.json({ error: 'Bead not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Failed to read beads file' }, { status: 500 });
  }
}
