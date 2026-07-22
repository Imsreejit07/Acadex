'use client';

import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { useHydratedStore } from '@/features/attendance/services/attendance-store';
import {
  calculateSafeSkip,
  calculateNeedClasses,
  projectAttendance,
} from '@/features/attendance/services/attendance-engine';
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

// ─── CircularRing ──────────────────────────────────────────────────────

function CircularRing({
  value,
  size = 100,
  strokeWidth = 10,
  color = '#0ea5e9',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  const c = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-secondary" />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

// ─── Calculator Page ───────────────────────────────────────────────────

export default function CalculatorPage() {
  const { subjectSummaries, isFullyHydrated } = useHydratedStore();

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeComponent, setActiveComponent] = useState<'THEORY' | 'LAB'>('THEORY');
  const [simFuture, setSimFuture] = useState(10);
  const [simAttend, setSimAttend] = useState(8);

  // Also expose a manual mode for standalone calculations
  const [manualMode, setManualMode] = useState(false);
  const [manualPresent, setManualPresent] = useState(35);
  const [manualConducted, setManualConducted] = useState(42);
  const [manualTarget, setManualTarget] = useState(75);

  const selectedSummary = subjectSummaries[selectedIdx];
  const hasLab = selectedSummary?.subject.hasLab ?? false;
  const currentComponent = hasLab ? activeComponent : 'THEORY';

  // Use either real subject component data or manual inputs
  const activePresent = manualMode
    ? manualPresent
    : currentComponent === 'THEORY'
    ? (selectedSummary?.theoryStats.present ?? 0)
    : (selectedSummary?.labStats.present ?? 0);

  const activeConducted = manualMode
    ? manualConducted
    : currentComponent === 'THEORY'
    ? (selectedSummary?.theoryStats.conducted ?? 0)
    : (selectedSummary?.labStats.conducted ?? 0);

  const activeTarget = manualMode
    ? manualTarget
    : currentComponent === 'THEORY'
    ? (selectedSummary?.target ?? 75)
    : (selectedSummary?.subject.labTarget ?? 75);

  const activePct = activeConducted > 0 ? (activePresent / activeConducted) * 100 : 0;
  const activeColor = attColor(activeConducted > 0 ? activePct : null, activeTarget);

  const safeSkips = calculateSafeSkip(activePresent, activeConducted, activeTarget).safeSkips;
  const needClasses = calculateNeedClasses(activePresent, activeConducted, activeTarget).needed;

  const clampedSimAttend = Math.min(simAttend, simFuture);
  const simPct = activeConducted + simFuture > 0
    ? projectAttendance(activePresent, activeConducted, clampedSimAttend, simFuture - clampedSimAttend)
        .projectedPercentage
    : 0;

  if (!isFullyHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
        <div className="h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-semibold">Loading Calculator Data...</p>
      </div>
    );
  }

  if (subjectSummaries.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Attendance Calculator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Project attendance requirements and safety buffer</p>
        </div>
        <div className="rounded-xl p-12 text-center border border-border bg-card">
          <p className="text-muted-foreground text-sm">Attendance calculator will be available once your first lectures are recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Attendance Calculator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Plan ahead with mathematically precise projections</p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setManualMode(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            !manualMode
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground border-border bg-card hover:text-foreground hover:bg-secondary'
          }`}
        >
          My Subjects
        </button>
        <button
          onClick={() => setManualMode(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            manualMode
              ? 'bg-primary text-primary-foreground border-primary'
              : 'text-muted-foreground border-border bg-card hover:text-foreground hover:bg-secondary'
          }`}
        >
          Manual Entry
        </button>
      </div>

      {/* Subject selector pills (only in subject mode) */}
      {!manualMode && subjectSummaries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subjectSummaries.map(({ subject, stats, target }, idx) => {
            const pct = stats.attendancePercentage;
            const isActive = idx === selectedIdx;
            const color = attColor(pct, target);
            return (
              <button
                key={subject.id || subject.name}
                onClick={() => setSelectedIdx(idx)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                  isActive
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <span style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
                  {subject.code || subject.name}
                </span>
                <span className="ml-2 text-xs" style={{ color }}>
                  {pct !== null ? `${pct.toFixed(1)}%` : '--'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Component Selector (if subject has lab) */}
      {!manualMode && hasLab && (
        <div className="flex gap-1.5 p-1 rounded-xl bg-secondary w-fit border border-border mt-2">
          <button
            onClick={() => setActiveComponent('THEORY')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentComponent === 'THEORY'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Theory Component
          </button>
          <button
            onClick={() => setActiveComponent('LAB')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentComponent === 'LAB'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Lab Component
          </button>
        </div>
      )}

      {/* Manual inputs */}
      {manualMode && (
        <div className="rounded-xl p-5 border border-border bg-card">
          <h3 className="font-semibold text-foreground mb-4">Manual Input</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Present</label>
              <input
                type="number"
                value={manualPresent}
                min={0}
                onChange={(e) => setManualPresent(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-foreground transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Conducted</label>
              <input
                type="number"
                value={manualConducted}
                min={0}
                onChange={(e) => setManualConducted(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-foreground transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Target %</label>
              <input
                type="number"
                value={manualTarget}
                min={0}
                max={100}
                onChange={(e) => setManualTarget(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-foreground transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Status panel */}
        <div className="rounded-xl p-6 border border-border bg-card">
          {!manualMode && selectedSummary && (
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-2 h-8 rounded-full"
                style={{ backgroundColor: getSubjectColor(selectedSummary.subject, selectedIdx) }}
              />
              <div>
                <h3 className="font-semibold text-foreground">{selectedSummary.subject.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedSummary.subject.code}{selectedSummary.subject.faculty ? ` · ${selectedSummary.subject.faculty}` : ''}
                </p>
              </div>
            </div>
          )}
          {manualMode && (
            <h3 className="font-semibold text-foreground mb-5">Manual Calculation</h3>
          )}

          <div className="flex items-center gap-6 mb-6">
            <div className="relative shrink-0">
              <CircularRing
                value={activeConducted > 0 ? activePct : 0}
                size={100}
                strokeWidth={10}
                color={activeColor}
              />
              <span
                className="absolute inset-0 flex items-center justify-center text-base font-bold"
                style={{ fontFamily: 'var(--font-jetbrains), monospace', color: activeColor }}
              >
                {activeConducted > 0 ? `${activePct.toFixed(1)}%` : '--'}
              </span>
            </div>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs text-muted-foreground">Attended</p>
                <p className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
                  {activePresent} / {activeConducted}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Target</p>
                <p className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-jetbrains), monospace' }}>
                  {activeTarget}%
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Can skip */}
            <div
              className="rounded-xl p-4 border"
              style={{
                backgroundColor: safeSkips > 0 ? 'rgba(16,185,129,0.06)' : 'rgba(244,63,94,0.06)',
                borderColor: safeSkips > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)',
              }}
            >
              <p className="text-xs font-semibold text-muted-foreground mb-1">Can safely skip</p>
              <p
                className="text-2xl font-bold"
                style={{
                  fontFamily: 'var(--font-jetbrains), monospace',
                  color: safeSkips > 0 ? '#10b981' : '#f43f5e',
                }}
              >
                {safeSkips} lecture{safeSkips !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1">while staying above {activeTarget}%</p>
            </div>

            {/* Need to attend */}
            {needClasses > 0 && (
              <div
                className="rounded-xl p-4 border"
                style={{
                  backgroundColor: 'rgba(245,158,11,0.06)',
                  borderColor: 'rgba(245,158,11,0.2)',
                }}
              >
                <p className="text-xs font-semibold text-muted-foreground mb-1">Must attend consecutively</p>
                <p
                  className="text-2xl font-bold text-amber-500 dark:text-amber-400"
                  style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
                >
                  {needClasses} lecture{needClasses !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">to recover to {activeTarget}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Simulator */}
        <div className="rounded-xl p-6 border border-border bg-card">
          <h3 className="font-semibold text-foreground mb-5">Future Scenario Simulator</h3>

          <div className="space-y-6">
            {/* Upcoming lectures slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-muted-foreground">Upcoming lectures</label>
                <span
                  className="font-semibold text-foreground"
                  style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
                >
                  {simFuture}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                value={simFuture}
                onChange={(e) => setSimFuture(Number(e.target.value))}
                className="w-full h-1"
              />
            </div>

            {/* Attend count slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm text-muted-foreground">Of those, attend</label>
                <span
                  className="font-semibold text-foreground"
                  style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
                >
                  {clampedSimAttend}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={simFuture}
                value={clampedSimAttend}
                onChange={(e) => setSimAttend(Number(e.target.value))}
                className="w-full h-1"
              />
            </div>

            {/* Projection result */}
            <div className="rounded-xl p-5 text-center border border-border bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-medium">Projected</p>
              <p
                className="text-4xl font-bold"
                style={{
                  fontFamily: 'var(--font-jetbrains), monospace',
                  color: attColor(simPct, activeTarget),
                }}
              >
                {simPct.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {activePresent + clampedSimAttend} / {activeConducted + simFuture} total
              </p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs">
                {simPct >= activeTarget ? (
                  <>
                    <CheckCircle size={12} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400">Above target</span>
                  </>
                ) : (
                  <>
                    <XCircle size={12} className="text-rose-600 dark:text-rose-400" />
                    <span className="text-rose-600 dark:text-rose-400">Below target</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* All subjects summary table */}
      {subjectSummaries.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border bg-card">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">All Subjects Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Subject', 'Attended', 'Current %', 'Can Skip', 'Need'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs text-muted-foreground font-semibold uppercase tracking-widest ${
                        i > 0 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjectSummaries.map(({ subject, stats, target: subTarget, missableClasses }, idx) => {
                  const pct = stats.attendancePercentage;
                  const need = pct !== null && pct < subTarget
                    ? calculateNeedClasses(stats.present, stats.conducted, subTarget).needed
                    : 0;
                  const color = getSubjectColor(subject, idx);
                  const c = attColor(pct, subTarget);
                  return (
                    <tr
                      key={subject.id || subject.name}
                      className="border-b border-border hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-foreground">{subject.name}</span>
                          <span className="text-xs text-muted-foreground">{subject.code || ''}</span>
                        </div>
                      </td>
                      <td
                        className="px-5 py-3.5 text-right text-muted-foreground"
                        style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
                      >
                        {stats.present}/{stats.conducted}
                      </td>
                      <td
                        className="px-5 py-3.5 text-right font-semibold"
                        style={{ fontFamily: 'var(--font-jetbrains), monospace', color: c }}
                      >
                        {pct !== null ? `${pct.toFixed(1)}%` : '--'}
                      </td>
                      <td
                        className="px-5 py-3.5 text-right text-emerald-600 dark:text-emerald-400"
                        style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
                      >
                        {missableClasses > 0 ? missableClasses : '–'}
                      </td>
                      <td
                        className="px-5 py-3.5 text-right text-rose-600 dark:text-rose-400"
                        style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
                      >
                        {need > 0 ? need : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}