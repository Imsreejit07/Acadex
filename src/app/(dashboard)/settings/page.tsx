'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, RefreshCw, Cpu, Eye, EyeOff, Key, ShieldCheck, XCircle } from 'lucide-react';
import { useAttendanceStore, savePreference, showNativeNotification } from '@/features/attendance/services/attendance-store';
import { toast, Toaster } from 'sonner';

function GeminiKeyCard() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
    setApiKey(savedKey);
  }, []);

  const handleValidateKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key to validate.');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setValidationResult({ success: true, message: data.message });
        toast.success('Gemini API Key validated successfully!');
      } else {
        setValidationResult({ success: false, message: data.error || 'Validation failed.' });
        toast.error(data.error || 'Validation failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setValidationResult({ success: false, message: msg });
      toast.error(`Validation error: ${msg}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveKey = () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      toast.error('Please enter a valid API key.');
      return;
    }

    localStorage.setItem('custom_gemini_api_key', cleanKey);
    window.dispatchEvent(new Event('attendance-tool-store-change'));

    // Force sync to Supabase metadata
    import('@/shared/lib/supabase-service').then(({ saveStateToSupabase }) => {
      const savedOnboarding = JSON.parse(localStorage.getItem('onboarding_data') || '{}');
      const overrides = JSON.parse(localStorage.getItem('attendance_overrides') || '[]');
      const events = JSON.parse(localStorage.getItem('academic_events') || '[]');
      const holidays = JSON.parse(localStorage.getItem('holidays_list') || '[]');
      const extraClasses = JSON.parse(localStorage.getItem('extra_classes') || '[]');
      const rescheduledClasses = JSON.parse(localStorage.getItem('rescheduled_classes') || '[]');
      const attendanceCredits = JSON.parse(localStorage.getItem('attendance_credits') || '[]');
      saveStateToSupabase({
        onboarding: savedOnboarding,
        overrides,
        events,
        holidays,
        extraClasses,
        rescheduledClasses,
        attendanceCredits,
      });
    });

    toast.success('Custom Gemini API Key saved and activated!');
  };

  const handleResetToDefault = () => {
    localStorage.removeItem('custom_gemini_api_key');
    setApiKey('');
    setValidationResult(null);
    window.dispatchEvent(new Event('attendance-tool-store-change'));

    // Force sync to Supabase metadata
    import('@/shared/lib/supabase-service').then(({ saveStateToSupabase }) => {
      const savedOnboarding = JSON.parse(localStorage.getItem('onboarding_data') || '{}');
      const overrides = JSON.parse(localStorage.getItem('attendance_overrides') || '[]');
      const events = JSON.parse(localStorage.getItem('academic_events') || '[]');
      const holidays = JSON.parse(localStorage.getItem('holidays_list') || '[]');
      const extraClasses = JSON.parse(localStorage.getItem('extra_classes') || '[]');
      const rescheduledClasses = JSON.parse(localStorage.getItem('rescheduled_classes') || '[]');
      const attendanceCredits = JSON.parse(localStorage.getItem('attendance_credits') || '[]');
      saveStateToSupabase({
        onboarding: savedOnboarding,
        overrides,
        events,
        holidays,
        extraClasses,
        rescheduledClasses,
        attendanceCredits,
      });
    });

    toast.success('Reset to App Default Gemini API Key.');
  };

  const isCustomKeyActive = Boolean(apiKey.trim());

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Key size={16} className="text-primary" />
            Bring Your Own API Key (BYOK)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use your personal Google Gemini API key for timetable parsing.
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 ${
          isCustomKeyActive
            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20'
        }`}>
          <ShieldCheck size={12} />
          {isCustomKeyActive ? 'BYOK Custom Key Active' : 'App Default Active'}
        </span>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 font-medium">
            Google Gemini API Key
          </label>
          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setValidationResult(null);
              }}
              placeholder="AIzaSy..."
              className="w-full pl-3 pr-10 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
              title={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Get your free Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">Google AI Studio</a>.
          </p>
        </div>

        {validationResult && (
          <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
            validationResult.success
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300'
              : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-300'
          }`}>
            {validationResult.success ? (
              <CheckCircle size={14} className="shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <XCircle size={14} className="shrink-0 mt-0.5 text-red-500" />
            )}
            <span>{validationResult.message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleValidateKey}
            disabled={isValidating || !apiKey.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isValidating ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Validating...
              </>
            ) : (
              'Validate Key'
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveKey}
            disabled={!apiKey.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Save Key
          </button>

          {isCustomKeyActive && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 transition-colors ml-auto"
            >
              Reset to App Default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

      {/* Bring Your Own API Key (BYOK) Card */}
      <GeminiKeyCard />

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