'use client';

import { Moon, Bell, Keyboard, Terminal } from 'lucide-react';
import { Button, Input } from '@/components/ui';

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="h-14 flex items-center px-6 border-b border-subtle shrink-0">
        <h1 className="text-lg font-semibold text-primary">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">
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
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-secondary">Go to inbox</span>
                <kbd className="px-2 py-1 text-xs font-mono bg-hover border border-default rounded text-muted">
                  G I
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
          <div className="pt-4 border-t border-subtle">
            <Button variant="primary">
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
