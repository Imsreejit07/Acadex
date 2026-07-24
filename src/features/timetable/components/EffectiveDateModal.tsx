'use client';

import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, ChevronRight, X, Clock, History } from 'lucide-react';
import type { TimetableVersion } from '@/features/attendance/services/attendance-store';

interface EffectiveDateModalProps {
  /** The list of existing timetable versions. */
  currentVersions: TimetableVersion[];
  /** Called when the user confirms. Receives the chosen effective-from date. */
  onConfirm: (effectiveFrom: string) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
  /** Optional: number of new timetable entries being applied (for info display). */
  newEntryCount?: number;
}

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EffectiveDateModal({
  currentVersions,
  onConfirm,
  onCancel,
  newEntryCount,
}: EffectiveDateModalProps) {
  const isFirstVersion = currentVersions.length === 0;
  const latestVersion = currentVersions.length > 0
    ? currentVersions.reduce((a, b) => a.effectiveFrom > b.effectiveFrom ? a : b)
    : null;

  // Default to tomorrow for revisions (today is already covered by existing version)
  const defaultDate = isFirstVersion ? todayStr() : tomorrowStr();
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [error, setError] = useState('');

  // Calculate which version would be affected / closed
  const currentActiveVersion = currentVersions.find(v => v.status === 'ACTIVE' && v.effectiveUntil === null);

  // Validate: effective date must not be before the latest version's effectiveFrom
  useEffect(() => {
    if (!latestVersion) { setError(''); return; }
    if (selectedDate <= latestVersion.effectiveFrom) {
      setError(`Effective date must be after Version ${latestVersion.versionNumber}'s start date (${formatDisplayDate(latestVersion.effectiveFrom)}).`);
    } else {
      setError('');
    }
  }, [selectedDate, latestVersion]);

  const handleConfirm = () => {
    if (error) return;
    onConfirm(selectedDate);
  };

  const newVersionNumber = (currentVersions.length > 0
    ? Math.max(...currentVersions.map(v => v.versionNumber)) + 1
    : 1);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Calendar size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Apply Timetable Changes</h2>
              <p className="text-[11px] text-muted-foreground">
                {isFirstVersion ? 'Setting up Version 1' : `Creating Version ${newVersionNumber}`}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Context info */}
          {!isFirstVersion && currentActiveVersion && (
            <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Version Timeline</p>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1 rounded-lg bg-secondary border border-border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Current (v{currentActiveVersion.versionNumber})</p>
                  <p className="font-semibold text-foreground mt-0.5">{formatDisplayDate(currentActiveVersion.effectiveFrom)} → <span className="text-amber-500">closes at selected date</span></p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 rounded-lg bg-primary/8 border border-primary/20 px-3 py-2">
                  <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">New (v{newVersionNumber})</p>
                  <p className="font-semibold text-foreground mt-0.5">{selectedDate ? formatDisplayDate(selectedDate) : '—'} → ∞</p>
                </div>
              </div>
            </div>
          )}

          {/* Date picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock size={13} className="text-muted-foreground" />
              From which date should these changes take effect?
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className={`w-full bg-secondary border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 transition-all ${
                error
                  ? 'border-rose-500/60 focus:ring-rose-500/30'
                  : 'border-border focus:ring-primary/30'
              }`}
            />
            {error && (
              <p className="text-xs text-rose-500 flex items-center gap-1.5 mt-1">
                <AlertTriangle size={12} />
                {error}
              </p>
            )}
          </div>

          {/* Guarantee banner */}
          <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3 flex items-start gap-2.5">
            <History size={14} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Historical Integrity Guaranteed</p>
              <p className="text-[11px] text-muted-foreground">
                Lectures before <strong className="text-foreground">{selectedDate ? formatDisplayDate(selectedDate) : 'this date'}</strong> will
                remain exactly as they are. No historical attendance records will be modified.
                {newEntryCount !== undefined && (
                  <> The new timetable ({newEntryCount} slot{newEntryCount !== 1 ? 's' : ''}) applies only to future dates.</>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-border bg-muted/5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!!error || !selectedDate}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isFirstVersion ? (
              <>Create Version 1 <ChevronRight size={13} /></>
            ) : (
              <>Create Version {newVersionNumber} <ChevronRight size={13} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
