'use client';

import { useState, useMemo } from 'react';
import { 
  Trash2, AlertCircle, CheckCircle, XCircle, Search, 
  Filter, Calendar, RefreshCcw, FileSpreadsheet, Plus, Info, SlidersHorizontal, Pencil
} from 'lucide-react';
import { useHydratedStore } from '@/features/attendance/services/attendance-store';
import type { LectureInstance, ComponentType, ExtraClass, LectureEditPayload } from '@/features/attendance/services/attendance-store';
import EditLectureModal from '@/features/history/components/EditLectureModal';

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export default function HistoryPage() {
  const { lectures, onboarding, subjects, deleteLecture, setLectureStatus, editLectureRecord, clearAllLogs, extraClasses, setExtraClasses, isFullyHydrated } = useHydratedStore();
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [editingLecture, setEditingLecture] = useState<LectureInstance | null>(null);
  
  // Custom manual record add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customComponent, setCustomComponent] = useState<ComponentType>('THEORY');
  const [customDate, setCustomDate] = useState('');
  const [customStart, setCustomStart] = useState('09:00');
  const [customEnd, setCustomEnd] = useState('10:00');
  const [customStatus, setCustomStatus] = useState<'CONDUCTED' | 'CANCELLED' | 'HOLIDAY'>('CONDUCTED');
  const [customAttendance, setCustomAttendance] = useState<'PRESENT' | 'ABSENT' | 'MEDICAL_LEAVE' | 'DUTY_LEAVE'>('PRESENT');

  // Filtered lectures list (excluding scheduled future classes)
  const conductedLectures = useMemo(() => {
    return lectures.filter(l => l.status !== 'SCHEDULED');
  }, [lectures]);

  // Statistics counters (Event-level stats)
  const stats = useMemo(() => {
    let conducted = 0;
    let present = 0;
    let absent = 0;
    let cancelled = 0;
    let holiday = 0;

    // Unit-level counters
    let conductedUnits = 0;
    let presentUnits = 0;
    let absentUnits = 0;
    let cancelledUnits = 0;

    conductedLectures.forEach(l => {
      const isLab = l.componentType === 'LAB';
      const weight = isLab ? 2 : 1;

      if (l.status === 'CONDUCTED') {
        conducted++;
        conductedUnits += weight;

        if (l.attendance === 'PRESENT' || l.attendance === 'MEDICAL_LEAVE' || l.attendance === 'DUTY_LEAVE') {
          present++;
          presentUnits += weight;
        } else if (l.attendance === 'ABSENT') {
          absent++;
          absentUnits += weight;
        }
      } else if (l.status === 'CANCELLED') {
        cancelled++;
        cancelledUnits += weight;
      } else if (l.status === 'HOLIDAY') {
        holiday++;
      }
    });

    return {
      conducted,
      present,
      absent,
      cancelled,
      holiday,
      conductedUnits,
      presentUnits,
      absentUnits,
      cancelledUnits
    };
  }, [conductedLectures]);

  // Handle manual addition of an event
  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSubject || !customDate) {
      alert('Please select Subject and Date');
      return;
    }

    // Create new extra class record via the extra classes mechanism
    const newExtra: ExtraClass = {
      id: Math.random().toString(36).substr(2, 9),
      subjectName: customSubject,
      date: customDate,
      startTime: customStart,
      endTime: customEnd,
      componentType: customComponent,
      status: customStatus,
      attendanceStatus: customStatus === 'CONDUCTED' ? customAttendance : null,
      isMandatory: false,
    };

    setExtraClasses([...extraClasses, newExtra]);
    setShowAddModal(false);
    
    // Clear state
    setCustomSubject('');
    setCustomDate('');
  };

  // Filtered results
  const filteredList = useMemo(() => {
    return conductedLectures.filter(l => {
      const matchSearch = l.subjectName.toLowerCase().includes(search.toLowerCase());
      const matchSubject = filterSubject === 'ALL' || l.subjectName === filterSubject;
      
      let matchStatus = true;
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'PRESENT') {
          matchStatus = l.status === 'CONDUCTED' && (l.attendance === 'PRESENT' || l.attendance === 'MEDICAL_LEAVE' || l.attendance === 'DUTY_LEAVE');
        } else if (filterStatus === 'ABSENT') {
          matchStatus = l.status === 'CONDUCTED' && l.attendance === 'ABSENT';
        } else if (filterStatus === 'CANCELLED') {
          matchStatus = l.status === 'CANCELLED';
        } else if (filterStatus === 'HOLIDAY') {
          matchStatus = l.status === 'HOLIDAY';
        }
      }

      return matchSearch && matchSubject && matchStatus;
    }).sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  }, [conductedLectures, search, filterSubject, filterStatus]);

  if (!isFullyHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
        <div className="h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-semibold">Loading Lecture History...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground max-w-7xl mx-auto p-1">
      {/* Header section */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="text-muted-foreground" />
            Lecture History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            The single source of truth for the attendance engine. View or modify past lecture events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to DELETE ALL LECTURE LOGS?\n\nThis will permanently delete all attendance overrides, extra classes, rescheduled classes, credits, and manual adjustments.')) {
                clearAllLogs();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all"
            title="Delete all attendance overrides and historical logs"
          >
            <Trash2 size={14} />
            Delete All Logs
          </button>
          <button
            onClick={() => {
              if (subjects.length > 0) setCustomSubject(subjects[0].name);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm"
          >
            <Plus size={16} />
            Log Manual Class
          </button>
        </div>
      </div>

      {/* Stats Cards grid (Event count-focused, with unit subtexts) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        
        {/* Conducted */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Conducted Events</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.conducted}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{stats.conductedUnits} Units</span>
        </div>

        {/* Present */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">Present Events</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.present}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{stats.presentUnits} Units</span>
        </div>

        {/* Absent */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 tracking-wider">Absent Events</p>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{stats.absent}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{stats.absentUnits} Units</span>
        </div>

        {/* Cancelled */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Cancelled Events</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.cancelled}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{stats.cancelledUnits} Units</span>
        </div>

        {/* Holiday */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm col-span-2 md:col-span-1">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Holiday Events</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.holiday}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Not calculated in percentage</span>
        </div>

      </div>

      {/* Filter and Table Card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        
        {/* Controls header */}
        <div className="p-4 border-b border-border bg-muted/10 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search subjects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            
            {/* Subject Selector */}
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal size={13} className="text-muted-foreground" />
              <select
                value={filterSubject}
                onChange={e => setFilterSubject(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none"
              >
                <option value="ALL">All Subjects</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Attendance Status Selector */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="HOLIDAY">Holiday</option>
            </select>

          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Time range</th>
                <th className="px-5 py-3">Component</th>
                <th className="px-5 py-3 text-center">Units</th>
                <th className="px-5 py-3">Record Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    No conducted history logs found.
                  </td>
                </tr>
              ) : (
                filteredList.map(lecture => {
                  let badge = null;
                  if (lecture.status === 'CANCELLED') {
                    badge = <span className="px-2 py-0.5 rounded bg-secondary border border-border text-muted-foreground font-semibold">Cancelled</span>;
                  } else if (lecture.status === 'HOLIDAY') {
                    badge = <span className="px-2 py-0.5 rounded bg-secondary border border-border text-muted-foreground font-semibold">Holiday</span>;
                  } else if (lecture.attendance === 'PRESENT') {
                    badge = <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">Present</span>;
                  } else if (lecture.attendance === 'ABSENT') {
                    badge = <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">Absent</span>;
                  } else if (lecture.attendance === 'MEDICAL_LEAVE') {
                    badge = <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold">Med. Leave</span>;
                  } else if (lecture.attendance === 'DUTY_LEAVE') {
                    badge = <span className="px-2 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 font-semibold">Duty Leave</span>;
                  }

                  const units = lecture.componentType === 'LAB' ? 2 : 1;

                  return (
                    <tr key={lecture.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground whitespace-nowrap">
                        {fmtDate(lecture.date)}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">
                        {lecture.subjectName}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                        {fmtTime(lecture.startTime)} – {fmtTime(lecture.endTime)}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {lecture.componentType}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-foreground">
                        {units}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {badge}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          {/* Full Edit — opens modal */}
                          <button
                            onClick={() => setEditingLecture(lecture)}
                            className="px-2.5 py-1 rounded bg-secondary hover:bg-primary/15 text-foreground font-medium transition-colors flex items-center gap-1 text-xs"
                            title="Edit this lecture record"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                          {/* Quick toggle — rapid attendance flip */}
                          {lecture.status === 'CONDUCTED' && (
                            <button
                              onClick={() => setLectureStatus(lecture.id, 'CONDUCTED', lecture.attendance === 'PRESENT' ? 'ABSENT' : 'PRESENT')}
                              className="px-2.5 py-1 rounded bg-secondary hover:bg-muted-foreground/15 text-foreground font-medium transition-colors text-xs"
                              title="Quick toggle Present ↔ Absent"
                            >
                              Toggle
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm('Delete this attendance record?')) {
                                deleteLecture(lecture.id);
                              }
                            }}
                            className="p-1 rounded text-muted-foreground hover:text-rose-500 transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Manual log Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleManualAdd} className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-lg text-foreground">
            <h3 className="font-bold text-sm uppercase tracking-wider text-foreground">Log Manual Class Activity</h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Subject</label>
                <select
                  value={customSubject}
                  onChange={e => setCustomSubject(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Component Type</label>
                  <select
                    value={customComponent}
                    onChange={e => setCustomComponent(e.target.value as any)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option value="THEORY">Theory</option>
                    <option value="LAB">Lab</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Date</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">End Time</label>
                  <input
                    type="time"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Record Status</label>
                <select
                  value={customStatus}
                  onChange={e => setCustomStatus(e.target.value as any)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="CONDUCTED">Conducted (Class Took Place)</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="HOLIDAY">Holiday</option>
                </select>
              </div>

              {customStatus === 'CONDUCTED' && (
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Your Attendance</label>
                  <select
                    value={customAttendance}
                    onChange={e => setCustomAttendance(e.target.value as any)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="MEDICAL_LEAVE">Medical Leave</option>
                    <option value="DUTY_LEAVE">Duty Leave</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-95 transition-opacity"
              >
                Save Log
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Lecture Modal */}
      {editingLecture && (
        <EditLectureModal
          lecture={editingLecture}
          subjects={subjects}
          onSave={(lectureId, edits) => {
            editLectureRecord(lectureId, edits);
          }}
          onClose={() => setEditingLecture(null)}
        />
      )}
    </div>
  );
}
