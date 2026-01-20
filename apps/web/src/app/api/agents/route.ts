import { NextRequest, NextResponse } from 'next/server';
import { getDataLayer } from '@/lib/data';
import type { AgentFilter } from '@jetpack-agent/data';

export async function GET(request: NextRequest) {
  try {
    const dataLayer = await getDataLayer();
    const searchParams = request.nextUrl.searchParams;

    const filter: AgentFilter = {};

    const status = searchParams.get('status');
    if (status) {
      filter.status = status as AgentFilter['status'];
    }

    const agents = await dataLayer.agents.list(filter);
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Agents list error:', error);
    return NextResponse.json(
      { error: 'Failed to list agents', details: String(error) },
      { status: 500 }
    );
  }
}
