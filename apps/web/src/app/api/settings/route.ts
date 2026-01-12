import { NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';

// Settings file structure
export interface JetpackSettings {
  cass: {
    autoGenerateEmbeddings: boolean;
    embeddingConfig: {
      apiKey?: string;
      model: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
      dimensions: number;
    };
    compactionThreshold: number;
    maxEntries: number;
  };
}

// Default settings
const DEFAULT_SETTINGS: JetpackSettings = {
  cass: {
    autoGenerateEmbeddings: false,
    embeddingConfig: {
      apiKey: '',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },
    compactionThreshold: 0.3,
    maxEntries: 10000,
  },
};

function getSettingsPath(): string {
  return path.join(process.cwd(), '../..', '.jetpack', 'settings.json');
}

// Mask API key for GET responses (show only last 4 chars)
function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 8) return '';
  return '***' + key.slice(-4);
}

// Load settings from file, falling back to defaults
async function loadSettings(): Promise<JetpackSettings> {
  const settingsPath = getSettingsPath();

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as JetpackSettings;

    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      cass: {
        ...DEFAULT_SETTINGS.cass,
        ...settings.cass,
        embeddingConfig: {
          ...DEFAULT_SETTINGS.cass.embeddingConfig,
          ...settings.cass?.embeddingConfig,
        },
      },
    };
  } catch {
    // File doesn't exist - return defaults
    return DEFAULT_SETTINGS;
  }
}

// Save settings to file
async function saveSettings(settings: JetpackSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });

  // Write settings
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

// Resolve API key: file setting overrides env var
function resolveApiKey(fileKey: string | undefined): string {
  if (fileKey && fileKey.length > 0) {
    return fileKey;
  }
  return process.env.OPENAI_API_KEY || '';
}

// GET - Read current settings (with masked API key)
export async function GET() {
  try {
    const settings = await loadSettings();

    // For response, mask the API key and indicate source
    const resolvedKey = resolveApiKey(settings.cass.embeddingConfig.apiKey);
    const hasFileKey = !!(settings.cass.embeddingConfig.apiKey && settings.cass.embeddingConfig.apiKey.length > 0);
    const hasEnvKey = !!process.env.OPENAI_API_KEY;

    return NextResponse.json({
      cass: {
        ...settings.cass,
        embeddingConfig: {
          ...settings.cass.embeddingConfig,
          apiKey: maskApiKey(resolvedKey),
          apiKeySource: hasFileKey ? 'file' : hasEnvKey ? 'env' : 'none',
          hasApiKey: resolvedKey.length > 0,
        },
      },
    });
  } catch (error) {
    console.error('Failed to load settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// POST - Update settings
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Load current settings
    const current = await loadSettings();

    // Merge with updates (deep merge for cass settings)
    const updated: JetpackSettings = {
      ...current,
      cass: {
        ...current.cass,
        ...body.cass,
        embeddingConfig: {
          ...current.cass.embeddingConfig,
          ...body.cass?.embeddingConfig,
        },
      },
    };

    // Save to file
    await saveSettings(updated);

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
