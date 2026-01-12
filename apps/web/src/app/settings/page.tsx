'use client';

import { useState, useEffect } from 'react';
import { Moon, Bell, Keyboard, Terminal, Brain, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';

interface CASSSettings {
  autoGenerateEmbeddings: boolean;
  embeddingConfig: {
    apiKey: string;
    apiKeySource: 'file' | 'env' | 'none';
    hasApiKey: boolean;
    model: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
    dimensions: number;
  };
  compactionThreshold: number;
  maxEntries: number;
}

export default function SettingsPage() {
  // CASS settings state
  const [cassSettings, setCassSettings] = useState<CASSSettings | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setCassSettings(data.cass);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
    loadSettings();
  }, []);

  // Handle save
  async function handleSave() {
    if (!cassSettings) return;

    setIsSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      // Build settings payload
      const payload = {
        cass: {
          autoGenerateEmbeddings: cassSettings.autoGenerateEmbeddings,
          embeddingConfig: {
            // Only include new API key if user entered one
            ...(newApiKey ? { apiKey: newApiKey } : {}),
            model: cassSettings.embeddingConfig.model,
            dimensions: cassSettings.embeddingConfig.dimensions,
          },
          compactionThreshold: cassSettings.compactionThreshold,
          maxEntries: cassSettings.maxEntries,
        },
      };

      // Save settings
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!saveRes.ok) throw new Error('Failed to save settings');

      // Apply settings via reconfigure
      const reconfigRes = await fetch('/api/cass/reconfigure', {
        method: 'POST',
      });

      if (!reconfigRes.ok) {
        console.warn('Settings saved but failed to apply immediately');
      }

      // Reload settings to get updated state
      const reloadRes = await fetch('/api/settings');
      if (reloadRes.ok) {
        const data = await reloadRes.json();
        setCassSettings(data.cass);
      }

      setNewApiKey('');
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="h-14 flex items-center px-6 border-b border-subtle shrink-0">
        <h1 className="text-lg font-semibold text-primary">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">
          {/* Memory & Embeddings */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Memory & Embeddings</h2>
            </div>
            <div className="space-y-4 pl-7">
              {/* Auto-generate embeddings toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary">Auto-generate embeddings</p>
                  <p className="text-xs text-muted mt-0.5">
                    Automatically create embeddings when storing new memories
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={cassSettings?.autoGenerateEmbeddings ?? false}
                  onChange={(e) =>
                    setCassSettings((prev) =>
                      prev ? { ...prev, autoGenerateEmbeddings: e.target.checked } : prev
                    )
                  }
                  className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                />
              </label>

              {/* OpenAI API Key */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-medium text-primary">OpenAI API Key</p>
                  {cassSettings?.embeddingConfig.apiKeySource === 'env' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded">
                      ENV
                    </span>
                  )}
                  {cassSettings?.embeddingConfig.apiKeySource === 'file' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded">
                      FILE
                    </span>
                  )}
                  {cassSettings?.embeddingConfig.hasApiKey && (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  )}
                </div>
                <Input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={
                    cassSettings?.embeddingConfig.hasApiKey
                      ? `Current: ${cassSettings.embeddingConfig.apiKey}`
                      : 'sk-...'
                  }
                  className="font-mono"
                />
                <p className="text-xs text-muted mt-1.5">
                  {cassSettings?.embeddingConfig.apiKeySource === 'env'
                    ? 'Using OPENAI_API_KEY environment variable. Enter a key here to override.'
                    : cassSettings?.embeddingConfig.apiKeySource === 'file'
                    ? 'Using key from settings file. Enter a new key to update.'
                    : 'Required for semantic search. Leave blank to use OPENAI_API_KEY env var.'}
                </p>
              </div>

              {/* Embedding Model */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Embedding Model</p>
                <select
                  value={cassSettings?.embeddingConfig.model ?? 'text-embedding-3-small'}
                  onChange={(e) =>
                    setCassSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            embeddingConfig: {
                              ...prev.embeddingConfig,
                              model: e.target.value as CASSSettings['embeddingConfig']['model'],
                              dimensions:
                                e.target.value === 'text-embedding-3-large' ? 3072 : 1536,
                            },
                          }
                        : prev
                    )
                  }
                  className="w-full px-3 py-2 text-sm bg-surface border border-default rounded-md text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                >
                  <option value="text-embedding-3-small">text-embedding-3-small (1536 dims, recommended)</option>
                  <option value="text-embedding-3-large">text-embedding-3-large (3072 dims)</option>
                  <option value="text-embedding-ada-002">text-embedding-ada-002 (legacy)</option>
                </select>
                <p className="text-xs text-muted mt-1.5">
                  Changing models will make existing embeddings incompatible
                </p>
              </div>

              {/* Max Entries */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Max Memory Entries</p>
                <Input
                  type="number"
                  value={cassSettings?.maxEntries ?? 10000}
                  onChange={(e) =>
                    setCassSettings((prev) =>
                      prev ? { ...prev, maxEntries: parseInt(e.target.value) || 10000 } : prev
                    )
                  }
                  min="100"
                  max="100000"
                  className="w-32"
                />
                <p className="text-xs text-muted mt-1.5">
                  Compaction runs automatically when this limit is exceeded
                </p>
              </div>

              {/* Compaction Threshold */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Compaction Threshold</p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={cassSettings?.compactionThreshold ?? 0.3}
                    onChange={(e) =>
                      setCassSettings((prev) =>
                        prev ? { ...prev, compactionThreshold: parseFloat(e.target.value) } : prev
                      )
                    }
                    className="flex-1 h-2 bg-hover rounded-lg appearance-none cursor-pointer accent-accent-purple"
                  />
                  <span className="text-sm font-mono text-secondary w-12 text-right">
                    {cassSettings?.compactionThreshold?.toFixed(1) ?? '0.3'}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1.5">
                  Memories with importance below this value will be removed during compaction
                  (except codebase_knowledge)
                </p>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Moon className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Appearance</h2>
            </div>
            <div className="space-y-4 pl-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-primary">Theme</p>
                  <p className="text-xs text-muted mt-0.5">Select your preferred color scheme</p>
                </div>
                <select className="px-3 py-1.5 text-sm bg-surface border border-default rounded-md text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          </section>

          {/* Notifications */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Notifications</h2>
            </div>
            <div className="space-y-4 pl-7">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary">Desktop notifications</p>
                  <p className="text-xs text-muted mt-0.5">Show notifications for new messages</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary">Sound alerts</p>
                  <p className="text-xs text-muted mt-0.5">Play a sound when tasks complete</p>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                />
              </label>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Keyboard Shortcuts</h2>
            </div>
            <div className="space-y-3 pl-7">
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <span className="text-sm text-secondary">Open command palette</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-hover border border-default rounded text-muted">
                  Cmd + K
                </kbd>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <span className="text-sm text-secondary">Toggle chat</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-hover border border-default rounded text-muted">
                  Cmd + /
                </kbd>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <span className="text-sm text-secondary">New task</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-hover border border-default rounded text-muted">
                  N
                </kbd>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-subtle">
                <span className="text-sm text-secondary">Go to inbox</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-hover border border-default rounded text-muted">
                  G I
                </kbd>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-secondary">Go to memory</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-hover border border-default rounded text-muted">
                  G M
                </kbd>
              </div>
            </div>
          </section>

          {/* CLI Integration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">CLI Integration</h2>
            </div>
            <div className="space-y-4 pl-7">
              <div>
                <p className="text-sm font-medium text-primary mb-2">Beads Directory</p>
                <Input
                  defaultValue=".beads"
                  placeholder="Path to beads directory"
                  className="font-mono"
                />
                <p className="text-xs text-muted mt-1.5">
                  Directory where task files are stored
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-primary mb-2">Default Agent Count</p>
                <Input
                  type="number"
                  defaultValue="3"
                  min="1"
                  max="10"
                  className="w-24"
                />
                <p className="text-xs text-muted mt-1.5">
                  Number of agents to spawn by default
                </p>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="pt-4 border-t border-subtle flex items-center gap-3">
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
            {saveStatus === 'success' && (
              <span className="text-sm text-green-400 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Settings saved and applied
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errorMessage}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
