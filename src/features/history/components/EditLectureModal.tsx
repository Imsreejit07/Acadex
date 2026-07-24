'use client';

import { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Pencil, Clock, Calendar, BookOpen, FlaskConical, Layers, Info } from 'lucide-react';
import type {
  LectureInstance,
  ComponentType,
  LectureStatus,
  AttendanceStatus,
  LectureEditPayload,
  SubjectConfig,
} from '@/features/attendance/services/attendance-store';

interface EditLectureModalProps {
  lecture: LectureInstance;
  subjects: SubjectConfig[];
  onSave: (lectureId: string, edits: LectureEditPayload) => void;
  onClose: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'PRESENT', label: 'Present', color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'ABSENT', label: 'Absent', color: 'text-rose-600 dark:text-rose-400' },
  { value: 'MEDICAL_LEAVE', label: 'Medical Leave', color: 'text-blue-600 dark:text-blue-400' },
  { value: 'DUTY_LEAVE', label: 'Duty Leave', color: 'text-slate-500 dark:text-slate-400' },
];

const STATUS_OPTIONS: { value: LectureStatus; label: string; description: string }[] = [
  { value: 'CONDUCTED', label: 'Conducted', description: 'Class took place normally' },
  { value: 'CANCELLED', label: 'Cancelled', description: 'Class was cancelled' },
  { value: 'HOLIDAY', label: 'Holiday', description: 'Official holiday — not counted in attendance' },
];

export default function EditLectureModal({ lecture, subjects, onSave, onClose }: EditLectureModalProps) {
  const [subjectName, setSubjectName] = useState(lecture.subjectName);
  const [componentType, setComponentType] = useState<ComponentType>(lecture.componentType);
  const [date, setDate] = useState(lecture.date);
  const [startTime, setStartTime] = useState(lecture.startTime);
  const [endTime, setEndTime] = useState(lecture.endTime);
  const [status, setStatus] = useState<LectureStatus>(lecture.status === 'SCHEDULED' ? 'CONDUCTED' : lecture.status);
  const [attendance, setAttendance] = useState<AttendanceStatus | null>(lecture.attendance);
  const [notes, setNotes] = useState('');

  const [timeError, setTimeError] = useState('');
  const [dateChanged, setDateChanged] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Validate time range
  useEffect(() => {
    if (startTime && endTime && endTime <= startTime) {
      setTimeError('End time must be after start time.');
    } else {
      setTimeError('');
    }
  }, [startTime, endTime]);

  // Track changes
  useEffect(() => {
    const changed =
      subjectName !== lecture.subjectName ||
      componentType !== lecture.componentType ||
      date !== lecture.date ||
      startTime !== lecture.startTime ||
      endTime !== lecture.endTime ||
      status !== (lecture.status === 'SCHEDULED' ? 'CONDUCTED' : lecture.status) ||
      attendance !== lecture.attendance ||
      notes !== '';
    setIsDirty(changed);
    setDateChanged(date !== lecture.date);
  }, [subjectName, componentType, date, startTime, endTime, status, attendance, notes, lecture]);

  // Clear attendance when status is not CONDUCTED
  useEffect(() => {
    if (status !== 'CONDUCTED') {
      setAttendance(null);
    } else if (attendance === null) {
      setAttendance('PRESENT');
    }
  }, [status]);

  const handleSave = () => {
    if (timeError) return;

    const edits: LectureEditPayload = {};
    if (subjectName !== lecture.subjectName) edits.subjectName = subjectName;
    if (componentType !== lecture.componentType) edits.componentType = componentType;
    if (date !== lecture.date) edits.date = date;
    if (startTime !== lecture.startTime) edits.startTime = startTime;
    if (endTime !== lecture.endTime) edits.endTime = endTime;
    if (status !== (lecture.status === 'SCHEDULED' ? 'CONDUCTED' : lecture.status)) edits.status = status;
    if (attendance !== lecture.attendance) edits.attendance = attendance;
    if (notes.trim()) edits.notes = notes.trim();

    // Always include status/attendance as they are the primary data fields
    edits.status = status;
    edits.attendance = status === 'CONDUCTED' ? attendance : null;

    onSave(lecture.id, edits);
    onClose();
  };

  const isLab = componentType === 'LAB';
  const currentStatus = status;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Pencil size={15} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Edit Lecture Record</h2>
              <p className="text-[11px] text-muted-foreground">
                {fmtDate(lecture.date)} — {lecture.subjectName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Historical edit notice */}
        <div className="mx-6 mt-4 rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 flex items-start gap-2.5">
          <Info size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            You are editing a historical lecture record. Attendance percentages and analytics will
            <strong className="text-foreground"> recalculate automatically</strong> after saving.
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <BookOpen size={12} className="text-muted-foreground" />
              Subject
            </label>
            <select
              value={subjectName}
              onChange={e => setSubjectName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            >
              {subjects.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Component Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FlaskConical size={12} className="text-muted-foreground" />
              Component Type
            </label>
            <div className="flex gap-2">
              {(['THEORY', 'LAB'] as ComponentType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setComponentType(type)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    componentType === type
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-secondary text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                >
                  {type === 'LAB' ? '🧪 Lab' : '📖 Theory'}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar size={12} className="text-muted-foreground" />
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock size={12} className="text-muted-foreground" />
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock size={12} className="text-muted-foreground" />
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className={`w-full bg-secondary border rounded-xl px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 transition-all ${
                  timeError ? 'border-rose-500/60 focus:ring-rose-500/30' : 'border-border focus:ring-primary/30'
                }`}
              />
            </div>
          </div>

          {timeError && (
            <p className="text-xs text-rose-500 flex items-center gap-1.5 -mt-2">
              <AlertTriangle size={12} />
              {timeError}
            </p>
          )}

          {dateChanged && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-600 dark:text-amber-300">
                Changing the date creates a new record identity. The original date slot will revert to its unedited state.
              </p>
            </div>
          )}

          {/* Lecture Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Lecture Status</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                    currentStatus === opt.value
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-secondary text-muted-foreground border-border hover:border-foreground/30'
                  }`}
                  title={opt.description}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Attendance Status (only when CONDUCTED) */}
          {status === 'CONDUCTED' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Your Attendance</label>
              <div className="grid grid-cols-2 gap-2">
                {ATTENDANCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAttendance(opt.value)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      attendance === opt.value
                        ? `bg-primary text-primary-foreground border-primary shadow-sm`
                        : 'bg-secondary text-muted-foreground border-border hover:border-foreground/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Faculty replacement, topic covered, reason for edit..."
              rows={2}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-all"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/5">
          <div className="text-[11px] text-muted-foreground">
            {isDirty ? (
              <span className="text-amber-500 font-semibold">Unsaved changes</span>
            ) : (
              <span>No changes made</span>
            )}
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!!timeError || !isDirty}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Save size={13} />
              Save Changes
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
