'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, RefreshCw, Cpu } from 'lucide-react';
import { useAttendanceStore, savePreference, showNativeNotification } from '@/features/attendance/services/attendance-store';
import { toast, Toaster } from 'sonner';

// Local settings are handled via web client.

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
    const updatedOnboarding = { ...onboarding, userName, semesterName, academicYear, startDate };
    setOnboarding(updatedOnboarding);
    savePreference('onboarding_data', JSON.stringify(updatedOnboarding));

    setSaved(true);
    setHasUnsavedChanges(false);
    showNativeNotification('Settings Saved', 'Your Acadex profile details were successfully updated.');
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
      <Toaster position="top-center" richColors />
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

       {/* Data management */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Data Management</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Export */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground font-medium">Export Backup</p>
              <p className="text-xs text-muted-foreground">Download complete academic & attendance backup JSON</p>
            </div>
            <button
              className="px-4 py-1.5 text-sm font-medium text-foreground rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
              onClick={() => {
                try {
                  const data = {
                    onboarding_data: JSON.parse(localStorage.getItem('onboarding_data') || '{}'),
                    attendance_overrides: JSON.parse(localStorage.getItem('attendance_overrides') || '[]'),
                    academic_events: JSON.parse(localStorage.getItem('academic_events') || '[]'),
                    holidays_list: JSON.parse(localStorage.getItem('holidays_list') || '[]'),
                    extra_classes: JSON.parse(localStorage.getItem('extra_classes') || '[]'),
                    rescheduled_classes: JSON.parse(localStorage.getItem('rescheduled_classes') || '[]'),
                    attendance_credits: JSON.parse(localStorage.getItem('attendance_credits') || '[]'),
                    theme: localStorage.getItem('theme') || 'dark',
                    selected_ollama_model: localStorage.getItem('selected_ollama_model') || '',
                    OLLAMA_MODEL: localStorage.getItem('OLLAMA_MODEL') || '',
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'acadex-academicos-backup.json';
                  a.click();
                  URL.revokeObjectURL(url);
                  showNativeNotification('Export Complete', 'Your Acadex data backup was successfully exported.');
                  toast.success('Backup exported successfully!');
                } catch (e: any) {
                  toast.error('Failed to export backup: ' + e.message);
                }
              }}
            >
              Export
            </button>
          </div>
          
          <div className="h-px bg-border" />

          {/* Import */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground font-medium">Import Backup</p>
              <p className="text-xs text-muted-foreground">Restore complete academic & attendance backup JSON</p>
            </div>
            <div>
              <input
                type="file"
                id="import-backup-file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    try {
                      const text = event.target?.result as string;
                      const parsed = JSON.parse(text);
                      
                      if (!parsed || (typeof parsed !== 'object')) {
                        throw new Error('Invalid backup file structure.');
                      }
                      
                      const keysToRestore = [
                        'onboarding_data',
                        'attendance_overrides',
                        'academic_events',
                        'holidays_list',
                        'extra_classes',
                        'rescheduled_classes',
                        'attendance_credits',
                        'theme',
                        'selected_ollama_model',
                        'OLLAMA_MODEL'
                      ];

                      for (const key of keysToRestore) {
                        if (parsed[key] !== undefined) {
                          const valStr = typeof parsed[key] === 'string' ? parsed[key] : JSON.stringify(parsed[key]);
                          savePreference(key, valStr);
                        }
                      }

                      showNativeNotification('Import Success', 'Your Acadex configurations and schedules have been restored.');
                      toast.success('Backup imported successfully! Reloading...');
                      setTimeout(() => {
                        window.location.reload();
                      }, 1500);
                    } catch (err: any) {
                      toast.error('Failed to parse backup: ' + err.message);
                    }
                  };
                  reader.readAsText(file);
                }}
              />
              <button
                className="px-4 py-1.5 text-sm font-medium text-foreground rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
                onClick={() => document.getElementById('import-backup-file')?.click()}
              >
                Import
              </button>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Reset */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">Reset All Data</p>
              <p className="text-xs text-muted-foreground">Clear all attendance records and settings</p>
            </div>
            <button
              className="px-4 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 transition-colors"
              onClick={() => {
                if (confirm('This will permanently delete all your attendance data. Are you sure?')) {
                  const keysToRemove = [
                    'onboarding_data',
                    'attendance_overrides',
                    'academic_events',
                    'holidays_list',
                    'extra_classes',
                    'rescheduled_classes',
                    'attendance_credits',
                    'theme',
                    'supabase_semester_id'
                  ];
                  
                  for (const key of keysToRemove) {
                    localStorage.removeItem(key);
                  }
                  
                  window.dispatchEvent(new Event('attendance-tool-store-change'));
                  showNativeNotification('App Reset Completed', 'All local data was successfully purged.');
                  toast.success('App data successfully reset!');
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
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