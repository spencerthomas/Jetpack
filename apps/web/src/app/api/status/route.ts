import { NextResponse } from 'next/server';
import { getDataLayer, getDashboard, getWorkDirInfo } from '@/lib/data';

export async function GET() {
  try {
    const dataLayer = await getDataLayer();
    const dashboard = await getDashboard();
    const workDirInfo = getWorkDirInfo();

    const [swarmStatus, metrics] = await Promise.all([
      dataLayer.getSwarmStatus(),
      dashboard.getMetrics(),
    ]);

    return NextResponse.json({
      workDir: workDirInfo,
      swarm: swarmStatus,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: 'Failed to get status', details: String(error) },
      { status: 500 }
    );
  }
}
