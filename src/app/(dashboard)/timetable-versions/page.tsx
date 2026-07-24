'use client';

import { useState, useMemo } from 'react';
import {
  Layers, Clock, CheckCircle2, History, CalendarDays,
  ChevronRight, Eye, Trash2, Copy, AlertTriangle, Info,
  ArrowRight, GitBranch, Download, Plus
} from 'lucide-react';
import { useHydratedStore } from '@/features/attendance/services/attendance-store';
import type { TimetableVersion, TimetableEntry } from '@/features/attendance/services/attendance-store';
import { isVersionReferenced, getActiveVersion } from '@/features/timetable/services/timetable-version-store';
import EffectiveDateModal from '@/features/timetable/components/EffectiveDateModal';

function formatDisplayDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

const WEEKDAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const WEEKDAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

function StatusBadge({ status }: { status: TimetableVersion['status'] }) {
  const configs = {
    ACTIVE: { label: 'Active', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' },
    HISTORICAL: { label: 'Historical', className: 'bg-muted/50 text-muted-foreground border-border' },
    SCHEDULED: { label: 'Scheduled', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25' },
  };
  const cfg = configs[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.className}`}>
      {status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />}
      {cfg.label}
    </span>
  );
}

function TimetableGrid({ entries }: { entries: TimetableEntry[] }) {
  const grouped = useMemo(() => {
    const map: Record<string, TimetableEntry[]> = {};
    for (const entry of entries) {
      const day = entry.day.toUpperCase();
      if (!map[day]) map[day] = [];
      map[day].push(entry);
    }
    return map;
  }, [entries]);

  const activeDays = WEEKDAY_ORDER.filter(d => grouped[d]?.length);

  if (activeDays.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No timetable entries found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeDays.map(day => (
        <div key={day}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{day}</p>
          <div className="space-y-1.5">
            {(grouped[day] || [])
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                    entry.componentType === 'LAB'
                      ? 'bg-violet-500/5 border-violet-500/20'
                      : 'bg-secondary border-border'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      entry.componentType === 'LAB'
                        ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {entry.componentType === 'LAB' ? 'LAB' : 'TH'}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{entry.subjectName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {fmtTime(entry.startTime)} – {fmtTime(entry.endTime)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TimetableVersionsPage() {
  const { timetableVersions, overrides, onboarding, applyNewTimetableVersion, setOnboarding, isFullyHydrated } = useHydratedStore();
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [showEffectiveDateModal, setShowEffectiveDateModal] = useState(false);
  const [duplicatingVersion, setDuplicatingVersion] = useState<TimetableVersion | null>(null);

  const overrideKeys = useMemo(() => overrides.map(o => o.lectureId), [overrides]);
  const activeVersion = useMemo(() => getActiveVersion(timetableVersions), [timetableVersions]);

  const sortedVersions = useMemo(
    () => [...timetableVersions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [timetableVersions]
  );

  const handleDeleteVersion = (version: TimetableVersion) => {
    if (version.status === 'ACTIVE') {
      alert('Cannot delete the currently active version.');
      return;
    }
    if (isVersionReferenced(version.id, overrideKeys)) {
      alert(
        `Version ${version.versionNumber} has historical lecture records referencing it and cannot be deleted.\n\n` +
        'Historical versions that are referenced by attendance data are permanently protected to guarantee data integrity.'
      );
      return;
    }
    if (confirm(`Delete Version ${version.versionNumber}? This action cannot be undone.`)) {
      const updated = timetableVersions.filter(v => v.id !== version.id);
      setOnboarding({ ...onboarding, timetableVersions: updated });
    }
  };

  const handleDuplicateAndApply = (version: TimetableVersion) => {
    setDuplicatingVersion(version);
    setShowEffectiveDateModal(true);
  };

  const handleEffectiveDateConfirm = (effectiveFrom: string) => {
    const entries = duplicatingVersion ? duplicatingVersion.entries : [];
    applyNewTimetableVersion(entries, effectiveFrom);
    setShowEffectiveDateModal(false);
    setDuplicatingVersion(null);
  };

  const handleExportVersion = (version: TimetableVersion) => {
    const data = {
      versionNumber: version.versionNumber,
      effectiveFrom: version.effectiveFrom,
      effectiveUntil: version.effectiveUntil,
      status: version.status,
      createdAt: version.createdAt,
      entries: version.entries,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable_v${version.versionNumber}_${version.effectiveFrom}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isFullyHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
        <div className="h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-semibold">Loading Timetable Versions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground max-w-5xl mx-auto p-1">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="text-muted-foreground" />
            Timetable Versions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete history of all timetable revisions. Historical records are permanently protected.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch size={14} />
          <span>{timetableVersions.length} version{timetableVersions.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Empty state */}
      {timetableVersions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-secondary border border-border">
            <Layers size={20} className="text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground">No Timetable Versions Yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Set up your timetable through the Onboarding page. Your first timetable will automatically become Version 1.
          </p>
        </div>
      )}

      {/* Architecture notice */}
      {timetableVersions.length > 0 && (
        <div className="rounded-xl bg-muted/20 border border-border px-4 py-3 flex items-start gap-3">
          <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Historical Integrity:</strong> Each version is immutable once lecture history references it.
            Creating a new version never modifies past attendance records.
            The system automatically resolves the correct version for each lecture date.
          </p>
        </div>
      )}

      {/* Version list */}
      <div className="space-y-3">
        {sortedVersions.map((version, idx) => {
          const isExpanded = expandedVersionId === version.id;
          const isReferenced = isVersionReferenced(version.id, overrideKeys);
          const entryCount = version.entries.length;

          return (
            <div
              key={version.id}
              className={`rounded-2xl border bg-card shadow-sm overflow-hidden transition-all ${
                version.status === 'ACTIVE'
                  ? 'border-emerald-500/30'
                  : 'border-border'
              }`}
            >
              {/* Version header row */}
              <div className="flex flex-wrap items-center gap-4 px-5 py-4">

                {/* Version badge */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border ${
                    version.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                      : 'bg-secondary border-border text-muted-foreground'
                  }`}>
                    v{version.versionNumber}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">Version {version.versionNumber}</span>
                      <StatusBadge status={version.status} />
                      {isReferenced && (
                        <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">
                          Referenced by history
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                      <CalendarDays size={11} />
                      <span>
                        {formatDisplayDate(version.effectiveFrom)}
                        {' → '}
                        {version.effectiveUntil ? formatDisplayDate(version.effectiveUntil) : <span className="text-emerald-500 font-semibold">Present</span>}
                      </span>
                      <span className="text-border mx-1">·</span>
                      <span>{entryCount} slot{entryCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setExpandedVersionId(isExpanded ? null : version.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-muted-foreground/15 text-foreground transition-colors border border-border"
                  >
                    <Eye size={13} />
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                  <button
                    onClick={() => handleDuplicateAndApply(version)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-muted-foreground/15 text-foreground transition-colors border border-border"
                    title="Duplicate this version as a new revision"
                  >
                    <Copy size={13} />
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleExportVersion(version)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-muted-foreground/15 text-foreground transition-colors border border-border"
                    title="Export as JSON"
                  >
                    <Download size={13} />
                    Export
                  </button>
                  {version.status !== 'ACTIVE' && (
                    <button
                      onClick={() => handleDeleteVersion(version)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 transition-colors"
                      title={isReferenced ? 'Cannot delete — referenced by history' : 'Delete version'}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Meta footer */}
              <div className="px-5 pb-3 text-[11px] text-muted-foreground flex items-center gap-3 border-t border-border/50 pt-2.5">
                <Clock size={10} />
                <span>Created {formatDateTime(version.createdAt)}</span>
                <span className="text-border">·</span>
                <span>ID: <span className="font-mono">{version.id.slice(0, 8)}…</span></span>
              </div>

              {/* Expanded timetable grid */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/10 px-5 py-4">
                  <TimetableGrid entries={version.entries} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Version timeline visualization */}
      {sortedVersions.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Version Timeline</h2>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {[...sortedVersions].reverse().map((version, idx) => (
              <div key={version.id} className="flex items-center">
                <div className={`shrink-0 rounded-xl border px-3 py-2.5 text-center min-w-[120px] ${
                  version.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-secondary border-border'
                }`}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">v{version.versionNumber}</p>
                  <p className="text-xs font-semibold text-foreground mt-0.5">{formatDisplayDate(version.effectiveFrom)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {version.effectiveUntil ? `→ ${formatDisplayDate(version.effectiveUntil)}` : '→ Present'}
                  </p>
                </div>
                {idx < sortedVersions.length - 1 && (
                  <ArrowRight size={14} className="text-muted-foreground mx-1 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Effective Date Modal */}
      {showEffectiveDateModal && (
        <EffectiveDateModal
          currentVersions={timetableVersions}
          newEntryCount={duplicatingVersion?.entries.length}
          onConfirm={handleEffectiveDateConfirm}
          onCancel={() => {
            setShowEffectiveDateModal(false);
            setDuplicatingVersion(null);
          }}
        />
      )}
    </div>
  );
}
