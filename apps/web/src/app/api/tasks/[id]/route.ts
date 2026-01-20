import { NextRequest, NextResponse } from 'next/server';
import { getDataLayer } from '@/lib/data';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataLayer = await getDataLayer();
    const task = await dataLayer.tasks.get(id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Task get error:', error);
    return NextResponse.json(
      { error: 'Failed to get task', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataLayer = await getDataLayer();
    const body = await request.json();

    const task = await dataLayer.tasks.update(id, body);
    return NextResponse.json({ task });
  } catch (error) {
    console.error('Task update error:', error);
    return NextResponse.json(
      { error: 'Failed to update task', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataLayer = await getDataLayer();

    await dataLayer.tasks.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Task delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete task', details: String(error) },
      { status: 500 }
    );
  }
}
