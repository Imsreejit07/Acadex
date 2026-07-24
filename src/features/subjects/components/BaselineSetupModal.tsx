'use client';

import { useState } from 'react';
import { Sparkles, Check, X, Info, Calculator, RotateCcw } from 'lucide-react';
import type { SubjectConfig } from '@/features/attendance/services/attendance-store';

interface BaselineSetupModalProps {
  subjects: SubjectConfig[];
  onSave: (baselines: Array<{ subjectId: string; attended: number; missed: number }>) => void;
  onClose: () => void;
}

export default function BaselineSetupModal({
  subjects,
  onSave,
  onClose,
}: BaselineSetupModalProps) {
  const [values, setValues] = useState<Record<string, { attended: number; missed: number }>>(() => {
    const initial: Record<string, { attended: number; missed: number }> = {};
    for (const s of subjects) {
      initial[s.id] = {
        attended: s.baselineAttended || 0,
        missed: s.baselineMissed || 0,
      };
    }
    return initial;
  });

  const handleChange = (subjectId: string, field: 'attended' | 'missed', val: number) => {
    setValues(prev => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        [field]: Math.max(0, val),
      },
    }));
  };

  const handleSave = () => {
    const baselines = subjects.map(s => ({
      subjectId: s.id,
      attended: values[s.id]?.attended || 0,
      missed: values[s.id]?.missed || 0,
    }));
    onSave(baselines);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden text-foreground flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Calculator size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">Initialize Baseline Attendance</h3>
              <p className="text-xs text-muted-foreground">Set your starting attended and missed class counts for each subject.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — Scrollable form */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5 text-blue-600 dark:text-blue-400">
            <Info size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs">Fresh Start Baseline</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                These values become your starting attendance. Historical lecture logs from previous weeks remain empty, and upcoming scheduled lectures will automatically add to these baseline numbers.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {subjects.map((subject) => {
              const val = values[subject.id] || { attended: 0, missed: 0 };
              const conducted = val.attended + val.missed;
              const pct = conducted > 0 ? (val.attended / conducted) * 100 : null;
              const target = subject.theoryTarget || 75;

              return (
                <div
                  key={subject.id}
                  className="p-4 rounded-xl border border-border bg-secondary/30 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Subject Title */}
                  <div className="min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: subject.color || '#3b82f6' }}
                      />
                      <h4 className="font-bold text-sm text-foreground truncate">{subject.name}</h4>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{subject.code || 'SUBJ'}</p>
                  </div>

                  {/* Inputs */}
                  <div className="flex items-center gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Attended</label>
                      <input
                        type="number"
                        min="0"
                        value={val.attended}
                        onChange={(e) => handleChange(subject.id, 'attended', parseInt(e.target.value) || 0)}
                        className="w-20 h-9 px-3 text-center rounded-lg bg-background border border-border font-mono text-sm font-bold text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 block">Missed</label>
                      <input
                        type="number"
                        min="0"
                        value={val.missed}
                        onChange={(e) => handleChange(subject.id, 'missed', parseInt(e.target.value) || 0)}
                        className="w-20 h-9 px-3 text-center rounded-lg bg-background border border-border font-mono text-sm font-bold text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Calculated summary */}
                  <div className="text-right min-w-[120px]">
                    <span className="text-[10px] text-muted-foreground block">Starting Stats</span>
                    <div className="font-mono text-sm font-bold mt-0.5">
                      <span className={pct === null ? 'text-muted-foreground' : pct >= target ? 'text-emerald-500' : 'text-rose-500'}>
                        {pct === null ? '--%' : `${pct.toFixed(1)}%`}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono block">
                      {val.attended} / {conducted} Conducted
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <button
            type="button"
            onClick={() => {
              const resetValues: Record<string, { attended: number; missed: number }> = {};
              for (const s of subjects) resetValues[s.id] = { attended: 0, missed: 0 };
              setValues(resetValues);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={14} />
            Reset All
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-secondary hover:bg-muted text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Check size={16} />
              Save Starting Baseline
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
