'use client';

import { useState } from 'react';
import { SlidersHorizontal, AlertCircle, RefreshCw, X, Plus, Minus, Check, Info } from 'lucide-react';
import type { SubjectConfig } from '@/features/attendance/services/attendance-store';

interface ManualAttendanceModalProps {
  subject: SubjectConfig;
  currentAttended: number;
  currentConducted: number;
  onSave: (subjectId: string, attendedAdj: number, totalAdj: number) => void;
  onClose: () => void;
}

export default function ManualAttendanceModal({
  subject,
  currentAttended,
  currentConducted,
  onSave,
  onClose,
}: ManualAttendanceModalProps) {
  const initialAttendedAdj = subject.manualAttendedAdjustment || 0;
  const initialTotalAdj = subject.manualTotalAdjustment || 0;

  const [attendedAdj, setAttendedAdj] = useState(initialAttendedAdj);
  const [totalAdj, setTotalAdj] = useState(initialTotalAdj);

  // Computed values
  const baseAttended = Math.max(0, currentAttended - initialAttendedAdj);
  const baseConducted = Math.max(baseAttended, currentConducted - initialTotalAdj);

  const finalAttended = Math.max(0, baseAttended + attendedAdj);
  const finalConducted = Math.max(finalAttended, baseConducted + totalAdj);
  const finalPct = finalConducted > 0 ? (finalAttended / finalConducted) * 100 : null;

  const handleReset = () => {
    setAttendedAdj(0);
    setTotalAdj(0);
  };

  const handleSave = () => {
    onSave(subject.id, attendedAdj, totalAdj);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden text-foreground space-y-0">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Manual Attendance Adjustment</h3>
              <p className="text-xs text-muted-foreground">{subject.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-xs">
          
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2 text-blue-600 dark:text-blue-400">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>
              Manual attendance adjustments account for unrecorded classes, mid-semester entries, or parser errors without corrupting your lecture history.
            </p>
          </div>

          {/* Stepper 1: Attended Classes Adjustment */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-bold text-foreground">Attended Classes Adjustment</label>
              <span className="font-mono text-xs text-muted-foreground">
                Base: {baseAttended} | Final: <strong className="text-foreground">{finalAttended}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAttendedAdj(prev => prev - 1)}
                className="w-9 h-9 rounded-lg bg-secondary hover:bg-muted border border-border flex items-center justify-center font-bold text-foreground transition-colors"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                value={attendedAdj}
                onChange={(e) => setAttendedAdj(Number(e.target.value) || 0)}
                className="flex-1 h-9 px-3 text-center rounded-lg bg-secondary border border-border font-mono text-sm font-bold text-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setAttendedAdj(prev => prev + 1)}
                className="w-9 h-9 rounded-lg bg-secondary hover:bg-muted border border-border flex items-center justify-center font-bold text-foreground transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Stepper 2: Total Conducted Classes Adjustment */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-bold text-foreground">Total Conducted Classes Adjustment</label>
              <span className="font-mono text-xs text-muted-foreground">
                Base: {baseConducted} | Final: <strong className="text-foreground">{finalConducted}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTotalAdj(prev => prev - 1)}
                className="w-9 h-9 rounded-lg bg-secondary hover:bg-muted border border-border flex items-center justify-center font-bold text-foreground transition-colors"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                value={totalAdj}
                onChange={(e) => setTotalAdj(Number(e.target.value) || 0)}
                className="flex-1 h-9 px-3 text-center rounded-lg bg-secondary border border-border font-mono text-sm font-bold text-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setTotalAdj(prev => prev + 1)}
                className="w-9 h-9 rounded-lg bg-secondary hover:bg-muted border border-border flex items-center justify-center font-bold text-foreground transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl border border-border bg-secondary/50 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold">Adjusted Attendance</span>
              <span className={`font-bold font-mono text-sm ${
                finalPct === null ? 'text-muted-foreground' : finalPct >= (subject.theoryTarget || 75) ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                {finalPct === null ? 'N/A' : `${finalPct.toFixed(1)}%`}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              {finalAttended} attended out of {finalConducted} conducted classes
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={12} />
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-muted text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Check size={14} />
              Save Adjustment
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
