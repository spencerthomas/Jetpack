'use client';

import { useState, useEffect } from 'react';
import { Moon, Bell, Keyboard, Terminal, Brain, Loader2, Check, AlertCircle, Users, Plus, X, Play, Clock, Target, Repeat, Globe, Shield } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { JetpackSettings, RuntimeSettings } from '@jetpack-agent/shared';

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

// Agent skills and presets
const ALL_SKILLS = [
  'typescript', 'python', 'rust', 'go', 'java',
  'react', 'vue',
  'backend', 'frontend', 'devops', 'database', 'testing', 'documentation',
  'sql', 'data', 'ml', 'api', 'security', 'mobile',
] as const;

type AgentSkill = typeof ALL_SKILLS[number];

interface AgentPreset {
  name: string;
  skills: AgentSkill[];
}

const DEFAULT_PRESETS: Record<string, AgentSkill[]> = {
  'Frontend Developer': ['typescript', 'react', 'vue', 'frontend', 'testing'],
  'Backend Developer': ['typescript', 'python', 'backend', 'database', 'devops'],
  'Full Stack': ['typescript', 'react', 'backend', 'database', 'testing'],
  'Data Engineer': ['python', 'sql', 'database', 'data'],
  'ML Engineer': ['python', 'data', 'ml', 'testing'],
  'DevOps Engineer': ['go', 'devops', 'backend', 'security'],
  'QA Engineer': ['typescript', 'python', 'testing', 'documentation'],
  'Custom': [],
};

interface AgentConfig {
  defaultCount: number;
  presets: AgentPreset[];
}

// Default Jetpack settings for initial state
const DEFAULT_JETPACK_SETTINGS: JetpackSettings = {
  runtime: {
    mode: 'iteration-limit',
    maxIterations: 100,
    idleTimeoutMs: 300000,
    objectiveCheckIntervalMs: 60000,
  },
  agents: {
    workPollingIntervalMs: 30000,
    timeoutMultiplier: 2.0,
    minTimeoutMs: 300000,
    maxTimeoutMs: 7200000,
    gracefulShutdownMs: 30000,
  },
  browserValidation: {
    enabled: false,
    devServerUrl: 'http://localhost:3000',
    pageLoadTimeoutMs: 30000,
    captureScreenshots: true,
  },
  quality: {
    enabled: true,
    checkBuild: true,
    checkTests: true,
    checkLint: false,
    detectRegressions: true,
  },
  supervisor: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    enableFailureAnalysis: true,
    autoDecompose: true,
  },
  agentCount: 3,
};

export default function SettingsPage() {
  // CASS settings state
  const [cassSettings, setCassSettings] = useState<CASSSettings | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Jetpack runtime settings state (Enhancement 9)
  const [jetpackSettings, setJetpackSettings] = useState<JetpackSettings>(DEFAULT_JETPACK_SETTINGS);

  // Agent config state
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    defaultCount: 3,
    presets: [
      { name: 'Frontend Developer', skills: ['typescript', 'react', 'vue', 'frontend', 'testing'] },
      { name: 'Backend Developer', skills: ['typescript', 'python', 'backend', 'database', 'devops'] },
      { name: 'Full Stack', skills: ['typescript', 'react', 'backend', 'database', 'testing'] },
    ],
  });

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setCassSettings(data.cass);
          if (data.agents) {
            setAgentConfig(data.agents);
          }
          // Load Jetpack runtime settings (Enhancement 9)
          if (data.jetpack) {
            setJetpackSettings(data.jetpack);
          }
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
        agents: agentConfig,
        // Include Jetpack runtime settings (Enhancement 9)
        jetpack: jetpackSettings,
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

          {/* Agent Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Agent Configuration</h2>
            </div>
            <div className="space-y-4 pl-7">
              {/* Default Agent Count */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Default Agent Count</p>
                <Input
                  type="number"
                  value={agentConfig.defaultCount}
                  onChange={(e) =>
                    setAgentConfig((prev) => ({
                      ...prev,
                      defaultCount: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                    }))
                  }
                  min="1"
                  max="10"
                  className="w-24"
                />
                <p className="text-xs text-muted mt-1.5">
                  Number of agents to spawn when starting Jetpack (1-10)
                </p>
              </div>

              {/* Agent Skill Presets */}
              <div>
                <p className="text-sm font-medium text-primary mb-3">Agent Skill Presets</p>
                <div className="space-y-3">
                  {agentConfig.presets.map((preset, index) => (
                    <div
                      key={index}
                      className="p-3 bg-hover rounded-lg border border-default"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs text-muted font-medium">Agent {index + 1}:</span>
                        <select
                          value={preset.name}
                          onChange={(e) => {
                            const newPresets = [...agentConfig.presets];
                            const newName = e.target.value;
                            newPresets[index] = {
                              name: newName,
                              skills: newName === 'Custom'
                                ? preset.skills
                                : [...(DEFAULT_PRESETS[newName] || [])],
                            };
                            setAgentConfig((prev) => ({ ...prev, presets: newPresets }));
                          }}
                          className="flex-1 px-2 py-1 text-sm bg-surface border border-default rounded text-primary focus:outline-none focus:ring-1 focus:ring-accent-purple"
                        >
                          {Object.keys(DEFAULT_PRESETS).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        {agentConfig.presets.length > 1 && (
                          <button
                            onClick={() => {
                              const newPresets = agentConfig.presets.filter((_, i) => i !== index);
                              setAgentConfig((prev) => ({ ...prev, presets: newPresets }));
                            }}
                            className="p-1 text-muted hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {preset.skills.map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 text-[10px] font-medium bg-accent-purple/20 text-accent-purple rounded"
                          >
                            {skill}
                          </span>
                        ))}
                        {preset.skills.length === 0 && (
                          <span className="text-xs text-muted">No skills selected</span>
                        )}
                      </div>
                      {/* Custom skill selection */}
                      {preset.name === 'Custom' && (
                        <div className="mt-2 pt-2 border-t border-default">
                          <p className="text-xs text-muted mb-2">Select skills:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ALL_SKILLS.map((skill) => (
                              <button
                                key={skill}
                                onClick={() => {
                                  const newPresets = [...agentConfig.presets];
                                  const hasSkill = preset.skills.includes(skill);
                                  newPresets[index] = {
                                    ...preset,
                                    skills: hasSkill
                                      ? preset.skills.filter((s) => s !== skill)
                                      : [...preset.skills, skill],
                                  };
                                  setAgentConfig((prev) => ({ ...prev, presets: newPresets }));
                                }}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                  preset.skills.includes(skill)
                                    ? 'bg-accent-purple/20 text-accent-purple'
                                    : 'bg-hover text-muted hover:text-primary'
                                }`}
                              >
                                {skill}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Agent Slot */}
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (agentConfig.presets.length < 10) {
                        setAgentConfig((prev) => ({
                          ...prev,
                          presets: [
                            ...prev.presets,
                            { name: 'Full Stack', skills: [...DEFAULT_PRESETS['Full Stack']] },
                          ],
                        }));
                      }
                    }}
                    disabled={agentConfig.presets.length >= 10}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Agent Slot
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAgentConfig({
                        defaultCount: 3,
                        presets: [
                          { name: 'Frontend Developer', skills: [...DEFAULT_PRESETS['Frontend Developer']] },
                          { name: 'Backend Developer', skills: [...DEFAULT_PRESETS['Backend Developer']] },
                          { name: 'Full Stack', skills: [...DEFAULT_PRESETS['Full Stack']] },
                        ],
                      });
                    }}
                  >
                    Reset to Defaults
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Runtime Mode (Enhancement 9) */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Play className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Runtime Mode</h2>
            </div>
            <div className="space-y-4 pl-7">
              {/* Mode Selection */}
              <div>
                <p className="text-sm font-medium text-primary mb-3">Operation Mode</p>
                <div className="space-y-2">
                  {[
                    { value: 'infinite', label: 'Infinite', desc: 'Run continuously until manually stopped', icon: Repeat },
                    { value: 'idle-pause', label: 'Idle-Pause', desc: 'Pause when no work available, resume on new tasks', icon: Clock },
                    { value: 'objective-based', label: 'Objective-Based', desc: 'Run until a specific goal is achieved', icon: Target },
                    { value: 'iteration-limit', label: 'Iteration Limit', desc: 'Stop after a set number of iterations (default)', icon: Play },
                  ].map(({ value, label, desc, icon: Icon }) => (
                    <label
                      key={value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        jetpackSettings.runtime.mode === value
                          ? 'border-accent-purple bg-accent-purple/10'
                          : 'border-default hover:border-subtle'
                      }`}
                    >
                      <input
                        type="radio"
                        name="runtimeMode"
                        value={value}
                        checked={jetpackSettings.runtime.mode === value}
                        onChange={(e) =>
                          setJetpackSettings((prev) => ({
                            ...prev,
                            runtime: { ...prev.runtime, mode: e.target.value as RuntimeSettings['mode'] },
                          }))
                        }
                        className="mt-1 w-4 h-4 text-accent-purple focus:ring-accent-purple"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-secondary" />
                          <span className="text-sm font-medium text-primary">{label}</span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Iteration Limit (shown only for iteration-limit mode) */}
              {jetpackSettings.runtime.mode === 'iteration-limit' && (
                <div>
                  <p className="text-sm font-medium text-primary mb-2">Max Iterations</p>
                  <Input
                    type="number"
                    value={jetpackSettings.runtime.maxIterations}
                    onChange={(e) =>
                      setJetpackSettings((prev) => ({
                        ...prev,
                        runtime: { ...prev.runtime, maxIterations: parseInt(e.target.value) || 100 },
                      }))
                    }
                    min="1"
                    max="10000"
                    className="w-32"
                  />
                  <p className="text-xs text-muted mt-1.5">
                    Supervisor will stop after this many iterations
                  </p>
                </div>
              )}

              {/* Idle Timeout (shown only for idle-pause mode) */}
              {jetpackSettings.runtime.mode === 'idle-pause' && (
                <div>
                  <p className="text-sm font-medium text-primary mb-2">Idle Timeout (seconds)</p>
                  <Input
                    type="number"
                    value={Math.round(jetpackSettings.runtime.idleTimeoutMs / 1000)}
                    onChange={(e) =>
                      setJetpackSettings((prev) => ({
                        ...prev,
                        runtime: { ...prev.runtime, idleTimeoutMs: (parseInt(e.target.value) || 300) * 1000 },
                      }))
                    }
                    min="30"
                    max="3600"
                    className="w-32"
                  />
                  <p className="text-xs text-muted mt-1.5">
                    How long to wait before pausing when no work is available
                  </p>
                </div>
              )}

              {/* Objective (shown only for objective-based mode) */}
              {jetpackSettings.runtime.mode === 'objective-based' && (
                <div>
                  <p className="text-sm font-medium text-primary mb-2">Objective</p>
                  <textarea
                    value={jetpackSettings.runtime.objective || ''}
                    onChange={(e) =>
                      setJetpackSettings((prev) => ({
                        ...prev,
                        runtime: { ...prev.runtime, objective: e.target.value },
                      }))
                    }
                    placeholder="Describe the goal to achieve..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-surface border border-default rounded-md text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple resize-none"
                  />
                  <p className="text-xs text-muted mt-1.5">
                    The LLM will periodically check if this objective has been achieved
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Agent Execution Settings (Enhancement 9) */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Agent Execution</h2>
            </div>
            <div className="space-y-4 pl-7">
              {/* Work Polling Interval */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Work Polling Interval (seconds)</p>
                <Input
                  type="number"
                  value={Math.round(jetpackSettings.agents.workPollingIntervalMs / 1000)}
                  onChange={(e) =>
                    setJetpackSettings((prev) => ({
                      ...prev,
                      agents: { ...prev.agents, workPollingIntervalMs: (parseInt(e.target.value) || 30) * 1000 },
                    }))
                  }
                  min="5"
                  max="300"
                  className="w-32"
                />
                <p className="text-xs text-muted mt-1.5">
                  How often agents check for new work (fixes BUG-5)
                </p>
              </div>

              {/* Timeout Multiplier */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Timeout Multiplier</p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.5"
                    value={jetpackSettings.agents.timeoutMultiplier}
                    onChange={(e) =>
                      setJetpackSettings((prev) => ({
                        ...prev,
                        agents: { ...prev.agents, timeoutMultiplier: parseFloat(e.target.value) },
                      }))
                    }
                    className="flex-1 h-2 bg-hover rounded-lg appearance-none cursor-pointer accent-accent-purple"
                  />
                  <span className="text-sm font-mono text-secondary w-12 text-right">
                    {jetpackSettings.agents.timeoutMultiplier.toFixed(1)}x
                  </span>
                </div>
                <p className="text-xs text-muted mt-1.5">
                  Task timeout = estimatedMinutes × multiplier (fixes BUG-6)
                </p>
              </div>

              {/* Graceful Shutdown */}
              <div>
                <p className="text-sm font-medium text-primary mb-2">Graceful Shutdown (seconds)</p>
                <Input
                  type="number"
                  value={Math.round(jetpackSettings.agents.gracefulShutdownMs / 1000)}
                  onChange={(e) =>
                    setJetpackSettings((prev) => ({
                      ...prev,
                      agents: { ...prev.agents, gracefulShutdownMs: (parseInt(e.target.value) || 30) * 1000 },
                    }))
                  }
                  min="5"
                  max="120"
                  className="w-32"
                />
                <p className="text-xs text-muted mt-1.5">
                  Time to wait for graceful termination (fixes BUG-7)
                </p>
              </div>
            </div>
          </section>

          {/* Browser Validation (Enhancement 9) */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Browser Validation</h2>
            </div>
            <div className="space-y-4 pl-7">
              {/* Enable Toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary">Enable browser validation</p>
                  <p className="text-xs text-muted mt-0.5">
                    Validate UI changes with headless browser tests
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={jetpackSettings.browserValidation.enabled}
                  onChange={(e) =>
                    setJetpackSettings((prev) => ({
                      ...prev,
                      browserValidation: { ...prev.browserValidation, enabled: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                />
              </label>

              {jetpackSettings.browserValidation.enabled && (
                <>
                  {/* Dev Server URL */}
                  <div>
                    <p className="text-sm font-medium text-primary mb-2">Dev Server URL</p>
                    <Input
                      type="url"
                      value={jetpackSettings.browserValidation.devServerUrl}
                      onChange={(e) =>
                        setJetpackSettings((prev) => ({
                          ...prev,
                          browserValidation: { ...prev.browserValidation, devServerUrl: e.target.value },
                        }))
                      }
                      placeholder="http://localhost:3000"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted mt-1.5">
                      URL of the development server to validate against
                    </p>
                  </div>

                  {/* Capture Screenshots */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-primary">Capture screenshots</p>
                      <p className="text-xs text-muted mt-0.5">
                        Save screenshots during validation
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={jetpackSettings.browserValidation.captureScreenshots}
                      onChange={(e) =>
                        setJetpackSettings((prev) => ({
                          ...prev,
                          browserValidation: { ...prev.browserValidation, captureScreenshots: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                    />
                  </label>
                </>
              )}
            </div>
          </section>

          {/* Quality Checks (Enhancement 9) */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-secondary" />
              <h2 className="text-base font-medium text-primary">Quality Checks</h2>
            </div>
            <div className="space-y-4 pl-7">
              {/* Enable Toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary">Enable quality metrics</p>
                  <p className="text-xs text-muted mt-0.5">
                    Collect quality metrics after task completion
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={jetpackSettings.quality.enabled}
                  onChange={(e) =>
                    setJetpackSettings((prev) => ({
                      ...prev,
                      quality: { ...prev.quality, enabled: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                />
              </label>

              {jetpackSettings.quality.enabled && (
                <>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-primary">Check build</p>
                      <p className="text-xs text-muted mt-0.5">Run build after task completion</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={jetpackSettings.quality.checkBuild}
                      onChange={(e) =>
                        setJetpackSettings((prev) => ({
                          ...prev,
                          quality: { ...prev.quality, checkBuild: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-primary">Check tests</p>
                      <p className="text-xs text-muted mt-0.5">Run tests after task completion</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={jetpackSettings.quality.checkTests}
                      onChange={(e) =>
                        setJetpackSettings((prev) => ({
                          ...prev,
                          quality: { ...prev.quality, checkTests: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-primary">Check lint</p>
                      <p className="text-xs text-muted mt-0.5">Run linter after task completion</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={jetpackSettings.quality.checkLint}
                      onChange={(e) =>
                        setJetpackSettings((prev) => ({
                          ...prev,
                          quality: { ...prev.quality, checkLint: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-primary">Detect regressions</p>
                      <p className="text-xs text-muted mt-0.5">Compare metrics to detect quality regressions</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={jetpackSettings.quality.detectRegressions}
                      onChange={(e) =>
                        setJetpackSettings((prev) => ({
                          ...prev,
                          quality: { ...prev.quality, detectRegressions: e.target.checked },
                        }))
                      }
                      className="w-4 h-4 rounded border-default bg-surface checked:bg-accent-purple focus:ring-accent-purple focus:ring-offset-base"
                    />
                  </label>
                </>
              )}
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
