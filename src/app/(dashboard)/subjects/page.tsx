'use client';

import { Plus, Pencil, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useAttendanceStore } from '@/features/attendance/services/attendance-store';
import { calculateNeedClasses } from '@/features/attendance/services/attendance-engine';
import type { SubjectConfig } from '@/features/attendance/services/attendance-store';

// ─── Helpers ───────────────────────────────────────────────────────────

function attColor(pct: number | null, target: number): string {
  if (pct === null) return '#64748b';
  if (pct >= 85) return '#10b981';
  if (pct >= target) return '#0ea5e9';
  if (pct >= target - 5) return '#f59e0b';
  return '#f43f5e';
}

const SUBJECT_COLORS = [
  '#0ea5e9', '#06b6d4', '#f43f5e', '#10b981', '#8b5cf6', '#f59e0b',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

function getSubjectColor(subject: SubjectConfig, index: number): string {
  return subject.color || SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

// ─── Subjects Page ─────────────────────────────────────────────────────

export default function SubjectsPage() {
  const { onboarding, subjectSummaries } = useAttendanceStore();
  const semesterName = onboarding.semesterName || 'Semester';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Subjects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subjectSummaries.length} subjects &middot; {semesterName}
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          onClick={() => alert('Add Subject — wire up your onboarding flow here.')}
        >
          <Plus size={15} />
          Add Subject
        </button>
      </div>

      {subjectSummaries.length === 0 ? (
        <div className="rounded-xl p-12 text-center bg-card border border-border flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="text-muted-foreground text-sm max-w-sm">
            No subjects found. Import your timetable or add subjects manually.
          </p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Import Timetable PDF
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {subjectSummaries.map(({ subject, theoryStats, labStats, overallStats, target, labTarget, missableClasses }, idx) => {
            const pct = overallStats.attendancePercentage;
            const color = getSubjectColor(subject, idx);
            const need =
              pct !== null && pct < target
                ? calculateNeedClasses(overallStats.present, overallStats.conducted, target).needed
                : 0;

            return (
              <div
                key={subject.id || subject.name}
                className="rounded-xl overflow-hidden border border-border bg-card transition-all hover:shadow-md flex flex-col justify-between"
              >
                {/* Card header */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-border">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold"
                      style={{
                        backgroundColor: color + '20',
                        color,
                        fontFamily: 'var(--font-jetbrains), monospace',
                      }}
                    >
                      {subject.hasLab ? 'L+T' : 'T'}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{subject.name}</p>
                      <p className="text-xs text-muted-foreground">{subject.code || 'SUBJ'}</p>
                    </div>
                  </div>
                  <button
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
                    onClick={() => alert(`Edit ${subject.name} — wire up subject edit modal here.`)}
                  >
                    <Pencil size={14} />
                  </button>
                </div>

                {/* Card body */}
                <div className="px-5 py-4 space-y-4">
                  {/* Faculty & Credits */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="text-muted-foreground block">Faculty</span>
                      <span className="font-medium text-foreground truncate block">{subject.faculty || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Credits</span>
                      <span className="font-medium text-foreground block font-mono">{subject.credits != null ? String(subject.credits) : '—'}</span>
                    </div>
                  </div>

                  {subject.hasLab ? (
                    <div className="space-y-3 pt-2 border-t border-border">
                      {/* Theory Stats */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Theory ({theoryStats.present}/{theoryStats.conducted})</span>
                          <span className="font-semibold text-muted-foreground">Target: {target}%</span>
                          <span style={{ color: attColor(theoryStats.attendancePercentage, target) }} className="font-bold">
                            {theoryStats.attendancePercentage !== null ? `${theoryStats.attendancePercentage.toFixed(1)}%` : '--'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full overflow-hidden bg-secondary">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(theoryStats.attendancePercentage ?? 0, 100)}%`,
                              backgroundColor: attColor(theoryStats.attendancePercentage, target)
                            }}
                          />
                        </div>
                      </div>

                      {/* Lab Stats */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Lab ({labStats.present}/{labStats.conducted})</span>
                          <span className="font-semibold text-muted-foreground">Target: {labTarget}%</span>
                          <span style={{ color: attColor(labStats.attendancePercentage, labTarget) }} className="font-bold">
                            {labStats.attendancePercentage !== null ? `${labStats.attendancePercentage.toFixed(1)}%` : '--'}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full overflow-hidden bg-secondary">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(labStats.attendancePercentage ?? 0, 100)}%`,
                              backgroundColor: attColor(labStats.attendancePercentage, labTarget)
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Theory ({theoryStats.present}/{theoryStats.conducted})</span>
                        <span className="font-semibold text-muted-foreground">Target: {target}%</span>
                        <span style={{ color: attColor(theoryStats.attendancePercentage, target) }} className="font-bold">
                          {theoryStats.attendancePercentage !== null ? `${theoryStats.attendancePercentage.toFixed(1)}%` : '--'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden bg-secondary">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(theoryStats.attendancePercentage ?? 0, 100)}%`,
                            backgroundColor: attColor(theoryStats.attendancePercentage, target)
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Skip / Need footer */}
                  <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                    <span style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
                      Overall: {overallStats.present}/{overallStats.conducted} ({pct !== null ? `${pct.toFixed(1)}%` : '--'})
                    </span>
                    {need > 0 ? (
                      <span className="text-rose-500 dark:text-rose-400">Need {need} more</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Can skip {missableClasses}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
