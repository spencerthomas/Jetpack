import { NextRequest, NextResponse } from 'next/server';
import { getDataLayer } from '@/lib/data';
import type { TaskFilter, TaskCreate } from '@jetpack-agent/data';

export async function GET(request: NextRequest) {
  try {
    const dataLayer = await getDataLayer();
    const searchParams = request.nextUrl.searchParams;

    const filter: TaskFilter = {};

    const status = searchParams.get('status');
    if (status) {
      filter.status = status as TaskFilter['status'];
    }

    const priority = searchParams.get('priority');
    if (priority) {
      filter.priority = priority as TaskFilter['priority'];
    }

    const limit = searchParams.get('limit');
    if (limit) {
      filter.limit = parseInt(limit, 10);
    }

    const tasks = await dataLayer.tasks.list(filter);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Tasks list error:', error);
    return NextResponse.json(
      { error: 'Failed to list tasks', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const dataLayer = await getDataLayer();
    const body = await request.json();

    const taskData: TaskCreate = {
      title: body.title,
      description: body.description,
      priority: body.priority || 'medium',
      type: body.type || 'development',
      requiredSkills: body.requiredSkills || [],
      dependencies: body.dependencies || [],
    };

    const task = await dataLayer.tasks.create(taskData);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Task create error:', error);
    return NextResponse.json(
      { error: 'Failed to create task', details: String(error) },
      { status: 500 }
    );
  }
}
