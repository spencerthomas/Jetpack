import React, { useState, useEffect, FormEvent } from 'react';
import { Form, FormField, FormSelect, Alert, LoadingSpinner } from '../components/FormComponents';

interface UserSettings {
  name: string;
  email: string;
  notificationEmail?: string;
  theme: 'light' | 'dark';
  checkInterval: number;
  alertThreshold: number;
}

const defaultSettings: UserSettings = {
  name: '',
  email: '',
  notificationEmail: '',
  theme: 'light',
  checkInterval: 60,
  alertThreshold: 90,
};

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch user settings from the backend
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else if (response.status === 404 || response.status === 401) {
        // Use default settings if not found or unauthorized
        setSettings(defaultSettings);
      } else {
        throw new Error('Failed to load settings');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      setError(message);
      // Fall back to default settings on error
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!settings.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!settings.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (settings.notificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.notificationEmail)) {
      newErrors.notificationEmail = 'Invalid email format';
    }

    if (settings.checkInterval < 10 || settings.checkInterval > 3600) {
      newErrors.checkInterval = 'Check interval must be between 10 and 3600 seconds';
    }

    if (settings.alertThreshold < 0 || settings.alertThreshold > 100) {
      newErrors.alertThreshold = 'Alert threshold must be between 0 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Manage your preferences and account settings</p>
          </div>

          {/* Content */}
          <div className="p-6">
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <Form onSubmit={handleSubmit} isSubmitting={saving} submitLabel="Save Settings">
              {/* User Information Section */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">User Information</h2>

                <FormField
                  label="Full Name"
                  name="name"
                  value={settings.name}
                  onChange={(value) => setSettings({ ...settings, name: value })}
                  placeholder="Your full name"
                  required
                  error={errors.name}
                />

                <FormField
                  label="Email Address"
                  name="email"
                  type="email"
                  value={settings.email}
                  onChange={(value) => setSettings({ ...settings, email: value })}
                  placeholder="your@email.com"
                  required
                  error={errors.email}
                />
              </div>

              {/* Notification Settings Section */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h2>

                <FormField
                  label="Notification Email"
                  name="notificationEmail"
                  type="email"
                  value={settings.notificationEmail || ''}
                  onChange={(value) =>
                    setSettings({ ...settings, notificationEmail: value || undefined })
                  }
                  placeholder="alerts@email.com (optional)"
                  error={errors.notificationEmail}
                />
                <p className="text-sm text-gray-500 -mt-3 mb-4">
                  Leave empty to use your primary email
                </p>
              </div>

              {/* Preferences Section */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h2>

                <FormSelect
                  label="Theme"
                  name="theme"
                  value={settings.theme}
                  onChange={(value) =>
                    setSettings({ ...settings, theme: value as 'light' | 'dark' })
                  }
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />

                <FormField
                  label="Default Check Interval (seconds)"
                  name="checkInterval"
                  type="number"
                  value={String(settings.checkInterval)}
                  onChange={(value) =>
                    setSettings({ ...settings, checkInterval: parseInt(value) || 60 })
                  }
                  placeholder="60"
                  required
                  error={errors.checkInterval}
                />
                <p className="text-sm text-gray-500 -mt-3 mb-4">
                  How often to check endpoints (10-3600 seconds)
                </p>

                <FormField
                  label="Alert Threshold (%)"
                  name="alertThreshold"
                  type="number"
                  value={String(settings.alertThreshold)}
                  onChange={(value) =>
                    setSettings({ ...settings, alertThreshold: parseInt(value) || 90 })
                  }
                  placeholder="90"
                  required
                  error={errors.alertThreshold}
                />
                <p className="text-sm text-gray-500 -mt-3 mb-4">
                  Alert when uptime drops below this percentage
                </p>
              </div>
            </Form>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
            <p className="text-sm text-gray-500">
              Changes are saved to the server and will apply to all your monitored endpoints.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
