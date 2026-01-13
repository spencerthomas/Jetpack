import { NextResponse } from 'next/server';
import { JetpackOrchestrator } from '@jetpack/orchestrator';
import * as fs from 'fs/promises';
import path from 'path';

let orchestrator: JetpackOrchestrator | null = null;
let currentWorkDir: string | null = null;

function getWorkDir(): string {
  return process.env.JETPACK_WORK_DIR || path.join(process.cwd(), '../..');
}

async function getOrchestrator() {
  const workDir = getWorkDir();
  if (!orchestrator || currentWorkDir !== workDir) {
    orchestrator = new JetpackOrchestrator({
      workDir,
      autoStart: false,
    });
    await orchestrator.initialize();
    currentWorkDir = workDir;
  }
  return orchestrator;
}

// Load settings from file
async function loadSettings() {
  const settingsPath = path.join(process.cwd(), '../..', '.jetpack', 'settings.json');

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// POST - Apply CASS configuration from settings file
export async function POST() {
  try {
    const settings = await loadSettings();

    if (!settings?.cass) {
      return NextResponse.json(
        { error: 'No CASS settings found in settings file' },
        { status: 400 }
      );
    }

    const jetpack = await getOrchestrator();

    // Resolve API key: file setting overrides env var
    const apiKey = settings.cass.embeddingConfig?.apiKey || process.env.OPENAI_API_KEY || '';

    // Build config for reconfiguration
    const cassConfig = {
      compactionThreshold: settings.cass.compactionThreshold,
      maxEntries: settings.cass.maxEntries,
      autoGenerateEmbeddings: settings.cass.autoGenerateEmbeddings,
      embeddingConfig: apiKey
        ? {
            apiKey,
            model: settings.cass.embeddingConfig?.model || 'text-embedding-3-small',
            dimensions: settings.cass.embeddingConfig?.dimensions || 1536,
          }
        : undefined,
    };

    // Apply configuration
    await jetpack.reconfigureCASS(cassConfig);

    // Get updated config to return
    const updatedConfig = jetpack.getCASSConfig();

    return NextResponse.json({
      success: true,
      message: 'CASS configuration applied',
      config: updatedConfig,
    });
  } catch (error) {
    console.error('Failed to reconfigure CASS:', error);
    return NextResponse.json(
      { error: 'Failed to reconfigure CASS' },
      { status: 500 }
    );
  }
}
