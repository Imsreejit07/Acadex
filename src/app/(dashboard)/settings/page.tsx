'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, RefreshCw, Cpu } from 'lucide-react';
import { useAttendanceStore } from '@/features/attendance/services/attendance-store';

function OllamaSettings() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    const tauriActive = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
    setIsTauri(tauriActive);

    const saved = localStorage.getItem('selected_ollama_model') || '';
    setSelectedModel(saved);

    if (tauriActive) {
      loadModels();
    }
  }, []);

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const modelList = await invoke<string[]>('get_ollama_models');
      setModels(modelList);
      
      // If nothing is selected yet, default to the first one available
      const saved = localStorage.getItem('selected_ollama_model') || '';
      if (!saved && modelList.length > 0) {
        handleModelChange(modelList[0]);
      }
    } catch (err: any) {
      setError(err?.toString() || 'Failed to detect local Ollama instance');
    } finally {
      setLoading(false);
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem('selected_ollama_model', model);
    
    // Also save as env-override for the API parser
    localStorage.setItem('OLLAMA_MODEL', model);
    window.dispatchEvent(new Event('attendance-tool-store-change'));
  };

  if (!isTauri) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Cpu size={16} /> Local AI Configuration
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Local Ollama model selector is only available inside the Acadex Desktop app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Cpu size={16} /> Local AI Configuration (Ollama)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose which locally running Ollama model should parse your schedules
          </p>
        </div>
        <button
          onClick={loadModels}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors border border-border"
          title="Refresh models list"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="px-5 py-5 space-y-4">
        {error ? (
          <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
            <p className="font-semibold">Ollama Connection Status: Offline</p>
            <p className="mt-1 text-muted-foreground">
              Please ensure Ollama is installed and running at <code>http://127.0.0.1:11434</code>. 
            </p>
          </div>
        ) : models.length === 0 ? (
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
            <p className="font-semibold">No models detected</p>
            <p className="mt-1 text-muted-foreground">
              Please run <code>ollama pull &lt;model-name&gt;</code> to download a model (e.g. qwen2.5:14b).
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">
              Installed Models
            </label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-foreground"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { onboarding, setOnboarding } = useAttendanceStore();

  const [userName, setUserName] = useState(onboarding.userName || '');
  const [semesterName, setSemesterName] = useState(onboarding.semesterName || '');
  const [academicYear, setAcademicYear] = useState(onboarding.academicYear || '');
  const [startDate, setStartDate] = useState(onboarding.startDate || '');
  const [saved, setSaved] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Sync state when onboarding data changes (e.g., from store events)
  useEffect(() => {
    setUserName(onboarding.userName || '');
    setSemesterName(onboarding.semesterName || '');
    setAcademicYear(onboarding.academicYear || '');
    setStartDate(onboarding.startDate || '');
  }, [onboarding.userName, onboarding.semesterName, onboarding.academicYear, onboarding.startDate]);

  // Track unsaved changes
  useEffect(() => {
    const changed =
      userName !== (onboarding.userName || '') ||
      semesterName !== (onboarding.semesterName || '') ||
      academicYear !== (onboarding.academicYear || '') ||
      startDate !== (onboarding.startDate || '');
    setHasUnsavedChanges(changed);
    if (changed) setSaved(false);
  }, [userName, semesterName, academicYear, startDate, onboarding]);

  const handleSave = () => {
    // Save via the store (which writes to localStorage and dispatches event)
    setOnboarding({ ...onboarding, userName, semesterName, academicYear, startDate });

    // Also directly persist to localStorage for redundancy to ensure cross-tab sync
    try {
      const existing = JSON.parse(localStorage.getItem('onboarding_data') || '{}');
      localStorage.setItem(
        'onboarding_data',
        JSON.stringify({ ...existing, userName, semesterName, academicYear, startDate })
      );
      window.dispatchEvent(new Event('attendance-tool-store-change'));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }

    setSaved(true);
    setHasUnsavedChanges(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const fields = [
    { label: 'Full Name', value: userName, setter: setUserName, type: 'text', placeholder: 'Enter your full name' },
    { label: 'Semester Name', value: semesterName, setter: setSemesterName, type: 'text', placeholder: 'e.g., Semester VI' },
    { label: 'Academic Year', value: academicYear, setter: setAcademicYear, type: 'text', placeholder: 'e.g., 2025-2026' },
    { label: 'Start Date', value: startDate, setter: setStartDate, type: 'date', placeholder: '' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your profile and semester configuration</p>
      </div>

      {/* Profile & Semester card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Profile &amp; Semester</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            These values appear throughout the app and affect attendance calculations.
          </p>
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.label}>
                <label className="block text-xs text-muted-foreground mb-1.5 font-medium">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.setter(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
                />
              </div>
            ))}
          </div>

          {/* Status indicators */}
          <div className="mt-4 space-y-2">
            {saved && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle size={13} />
                Settings saved successfully
              </div>
            )}
            {!saved && hasUnsavedChanges && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle size={13} />
                Unsaved changes
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className="mt-4 w-full py-2.5 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {hasUnsavedChanges ? 'Save Changes' : '✓ Saved'}
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-secondary/50 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">How attendance is calculated</h3>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p>
            &bull; <span className="text-foreground font-medium">Minimum Required:</span>{' '}
            Classes attended ≥ ⌈0.75 × Total⌉
          </p>
          <p>
            &bull; <span className="text-foreground font-medium">Bunk Budget:</span>{' '}
            Max safe absences = ⌊0.25 × Total⌋
          </p>
          <p>
            &bull; History is the single source of truth — all stats are computed live from your lecture records.
          </p>
        </div>
      </div>

      {/* Ollama Local AI Settings */}
      <OllamaSettings />

      {/* Data management */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Data Management</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground font-medium">Export Data</p>
              <p className="text-xs text-muted-foreground">Download your attendance records as JSON</p>
            </div>
            <button
              className="px-4 py-1.5 text-sm font-medium text-foreground rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
              onClick={() => {
                const data = {
                  onboarding: JSON.parse(localStorage.getItem('onboarding_data') || '{}'),
                  overrides: JSON.parse(localStorage.getItem('attendance_overrides') || '[]'),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'academicos-backup.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export
            </button>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">Reset All Data</p>
              <p className="text-xs text-muted-foreground">Clear all attendance records and settings</p>
            </div>
            <button
              className="px-4 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 transition-colors"
              onClick={() => {
                if (confirm('This will permanently delete all your attendance data. Are you sure?')) {
                  localStorage.removeItem('onboarding_data');
                  localStorage.removeItem('attendance_overrides');
                  window.dispatchEvent(new Event('attendance-tool-store-change'));
                }
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}