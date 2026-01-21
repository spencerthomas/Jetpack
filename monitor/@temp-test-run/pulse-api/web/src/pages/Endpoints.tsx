import React, { useState, useEffect, FormEvent } from 'react';
import { Form, FormField, FormSelect, Alert, LoadingSpinner, EmptyState } from '../components/FormComponents';
import { StatusBadge } from '../components/StatusBadge';

interface Endpoint {
  id: string;
  name: string;
  url: string;
  interval_seconds: number;
  createdAt: string;
  status?: 'up' | 'down';
  lastChecked?: string;
}

interface EndpointFormData {
  name: string;
  url: string;
  interval_seconds: number;
}

const defaultFormData: EndpointFormData = {
  name: '',
  url: '',
  interval_seconds: 60,
};

const Endpoints: React.FC = () => {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EndpointFormData>(defaultFormData);

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/endpoints', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEndpoints(Array.isArray(data) ? data : []);
      } else if (response.status === 401) {
        setError('Unauthorized. Please log in.');
      } else {
        throw new Error('Failed to load endpoints');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load endpoints';
      setError(message);
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Endpoint name is required';
    }

    if (!formData.url.trim()) {
      newErrors.url = 'URL is required';
    } else {
      try {
        new URL(formData.url);
      } catch {
        newErrors.url = 'Invalid URL format';
      }
    }

    if (formData.interval_seconds < 10 || formData.interval_seconds > 3600) {
      newErrors.interval_seconds = 'Interval must be between 10 and 3600 seconds';
    }

    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setFormErrors({});
    setEditingId(null);
    setShowForm(false);
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

      const url = editingId ? `/api/endpoints/${editingId}` : '/api/endpoints';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${editingId ? 'update' : 'create'} endpoint`);
      }

      const result = await response.json();

      if (editingId) {
        setEndpoints(endpoints.map((ep) => (ep.id === editingId ? result : ep)));
        setSuccess('Endpoint updated successfully');
      } else {
        setEndpoints([...endpoints, result]);
        setSuccess('Endpoint created successfully');
      }

      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (endpoint: Endpoint) => {
    setFormData({
      name: endpoint.name,
      url: endpoint.url,
      interval_seconds: endpoint.interval_seconds,
    });
    setEditingId(endpoint.id);
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this endpoint?')) {
      return;
    }

    try {
      setDeleting(id);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/endpoints/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete endpoint');
      }

      setEndpoints(endpoints.filter((ep) => ep.id !== id));
      setSuccess('Endpoint deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete endpoint';
      setError(message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Monitored Endpoints</h1>
            <p className="text-gray-600 mt-1">Manage and monitor your endpoints</p>
          </div>
          {!showForm && (
            <button
              onClick={() => {
                setShowForm(true);
                resetForm();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              + Add Endpoint
            </button>
          )}
        </div>

        {/* Alerts */}
        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
        {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Section */}
          {showForm && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-6 sticky top-4">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {editingId ? 'Edit Endpoint' : 'Add New Endpoint'}
                </h2>

                <Form
                  onSubmit={handleSubmit}
                  isSubmitting={saving}
                  submitLabel={editingId ? 'Update' : 'Create'}
                  cancelLabel="Cancel"
                  onCancel={resetForm}
                >
                  <FormField
                    label="Endpoint Name"
                    name="name"
                    value={formData.name}
                    onChange={(value) => setFormData({ ...formData, name: value })}
                    placeholder="e.g., API Server, Website"
                    required
                    error={formErrors.name}
                  />

                  <FormField
                    label="URL"
                    name="url"
                    type="url"
                    value={formData.url}
                    onChange={(value) => setFormData({ ...formData, url: value })}
                    placeholder="https://example.com"
                    required
                    error={formErrors.url}
                  />

                  <FormField
                    label="Check Interval (seconds)"
                    name="interval_seconds"
                    type="number"
                    value={String(formData.interval_seconds)}
                    onChange={(value) =>
                      setFormData({ ...formData, interval_seconds: parseInt(value) || 60 })
                    }
                    placeholder="60"
                    required
                    error={formErrors.interval_seconds}
                  />
                  <p className="text-sm text-gray-500 -mt-3">
                    Check interval must be between 10 and 3600 seconds
                  </p>
                </Form>
              </div>
            </div>
          )}

          {/* Endpoints List Section */}
          <div className={showForm ? 'lg:col-span-2' : 'lg:col-span-3'}>
            {endpoints.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md">
                <EmptyState
                  icon="🔗"
                  title="No endpoints yet"
                  description="Add your first endpoint to start monitoring"
                  action={{
                    label: 'Add Endpoint',
                    onClick: () => {
                      setShowForm(true);
                      resetForm();
                    },
                  }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition overflow-hidden"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {endpoint.name}
                            </h3>
                            {endpoint.status && (
                              <StatusBadge status={endpoint.status} size="small" showPulse />
                            )}
                          </div>
                          <p className="text-gray-600 break-all text-sm">{endpoint.url}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                          <p className="text-gray-500">Check Interval</p>
                          <p className="font-medium text-gray-900">
                            {endpoint.interval_seconds}s
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Created</p>
                          <p className="font-medium text-gray-900">
                            {new Date(endpoint.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {endpoint.lastChecked && (
                        <div className="mb-4 text-sm">
                          <p className="text-gray-500">Last Checked</p>
                          <p className="font-medium text-gray-900">
                            {new Date(endpoint.lastChecked).toLocaleString()}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleEdit(endpoint)}
                          disabled={saving || deleting === endpoint.id}
                          className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(endpoint.id)}
                          disabled={saving || deleting === endpoint.id}
                          className="flex-1 px-3 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                        >
                          {deleting === endpoint.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Endpoints;
