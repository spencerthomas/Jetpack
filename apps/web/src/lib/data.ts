import { createLocalDataLayer, type DataLayer } from '@jetpack-agent/data';
import { DashboardProvider } from '@jetpack-agent/dashboard';
import path from 'path';
import fs from 'fs';

// Singleton instances
let dataLayer: DataLayer | null = null;
let dashboard: DashboardProvider | null = null;

/**
 * Get working directory from environment or default to project root
 */
function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || process.cwd();
}

/**
 * Get database path for the working directory
 */
function getDbPath(): string {
  const workDir = getWorkDir();
  const jetpackDir = path.join(workDir, '.jetpack');

  if (!fs.existsSync(jetpackDir)) {
    fs.mkdirSync(jetpackDir, { recursive: true });
  }

  return path.join(jetpackDir, 'swarm.db');
}

/**
 * Get or create the DataLayer singleton
 */
export async function getDataLayer(): Promise<DataLayer> {
  if (!dataLayer) {
    const dbPath = getDbPath();
    dataLayer = await createLocalDataLayer(dbPath);
  }
  return dataLayer;
}

/**
 * Get or create the DashboardProvider singleton
 */
export async function getDashboard(): Promise<DashboardProvider> {
  if (!dashboard) {
    const dl = await getDataLayer();
    dashboard = new DashboardProvider(dl, {
      pollingIntervalMs: 2000,
      enableStreaming: true,
    });
    await dashboard.start();
  }
  return dashboard;
}

/**
 * Get current working directory info
 */
export function getWorkDirInfo(): { path: string; source: string } {
  const envVar = process.env.JETPACK_WORK_DIR;
  return {
    path: envVar || process.cwd(),
    source: envVar ? 'JETPACK_WORK_DIR' : 'cwd',
  };
}
