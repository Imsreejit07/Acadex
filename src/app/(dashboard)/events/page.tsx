'use client';

import { useState, useMemo } from 'react';
import { 
  Calendar, Clock, AlertCircle, CheckCircle2, Circle, 
  Trash2, Plus, Sparkles, Filter, Check, ListTodo,
  TrendingUp, CalendarDays, BookOpen, AlertOctagon
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useHydratedStore, AcademicEvent } from '@/features/attendance/services/attendance-store';

function fmtTime12(time: string): string {
  if (!time) return '';
  try {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, '0')} ${period}`;
  } catch (e) {
    return time;
  }
}

function fmtShortDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch (e) {
    return dateStr;
  }
}

export default function AcademicEventsPage() {
  const { onboarding, subjects, events, setEvents, isFullyHydrated } = useHydratedStore();
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  
  // Add Event Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [scope, setScope] = useState<'Subject Specific' | 'Semester Wide'>('Subject Specific');
  const [subjectName, setSubjectName] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<AcademicEvent['type']>('Assignment');
  const [dueDate, setDueDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dueTime, setDueTime] = useState('23:59');
  const [examStartTime, setExamStartTime] = useState('10:00');
  const [examEndTime, setExamEndTime] = useState('13:00');
  const [priority, setPriority] = useState<AcademicEvent['priority']>('Medium');
  const [notes, setNotes] = useState('');

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (scope === 'Subject Specific' && !subjectName) {
      toast.error('Please select a Subject');
      return;
    }
    if (!title || !dueDate) {
      toast.error('Please fill in Title and Start / Due Date');
      return;
    }

    const isExam = type === 'Mid Semester Exam' || type === 'End Semester Exam';
    const newEvent: AcademicEvent = {
      id: Math.random().toString(36).substr(2, 9),
      subjectName: scope === 'Semester Wide' ? 'Semester-wide' : subjectName,
      title,
      type,
      dueDate,
      endDate: endDate || undefined,
      dueTime: isExam ? examStartTime : dueTime,
      startTime: isExam ? examStartTime : undefined,
      endTime: isExam ? examEndTime : undefined,
      priority,
      status: 'Pending',
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setEvents([...events, newEvent]);
    toast.success('Academic Event added successfully!');
    
    // Clear form
    setTitle('');
    setNotes('');
    setEndDate('');
    setShowAddForm(false);
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(events.filter(e => e.id !== id));
    toast.success('Event deleted');
  };

  const handleToggleStatus = (id: string, currentStatus: AcademicEvent['status']) => {
    const nextStatus: AcademicEvent['status'] = 
      currentStatus === 'Pending' ? 'Completed' : 
      currentStatus === 'Completed' ? 'Missed' : 'Pending';

    setEvents(events.map(e => 
      e.id === id ? { ...e, status: nextStatus, updatedAt: new Date().toISOString() } : e
    ));
    toast.success(`Event status updated to ${nextStatus}`);
  };

  const filteredEvents = events.filter(e => {
    const matchType = filterType === 'ALL' || e.type === filterType;
    const matchPriority = filterPriority === 'ALL' || e.priority === filterPriority;
    return matchType && matchPriority;
  }).sort((a, b) => `${a.dueDate} ${a.dueTime}`.localeCompare(`${b.dueDate} ${b.dueTime}`));

  const overdueCount = events.filter(e => e.status === 'Pending' && new Date(`${e.dueDate}T${e.dueTime}`) < new Date()).length;
  const pendingCount = events.filter(e => e.status === 'Pending').length;
  const completedCount = events.filter(e => e.status === 'Completed').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1 text-foreground">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListTodo className="text-muted-foreground" />
            Academic Events
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage assignments, quizzes, mid-semester, and end-semester examinations.
          </p>
        </div>
        <button
          onClick={() => {
            if (subjects.length === 0 && scope === 'Subject Specific') {
              toast.error('Please configure subjects in onboarding first!');
              return;
            }
            if (subjects.length > 0 && !subjectName) setSubjectName(subjects[0].name);
            setShowAddForm(!showAddForm);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm"
        >
          <Plus size={16} />
          Add Academic Event
        </button>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-4 shadow-sm">
          <div className="p-3 rounded-lg bg-secondary text-muted-foreground border border-border">
            <CalendarDays size={20} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Pending Tasks</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{pendingCount}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-4 shadow-sm">
          <div className="p-3 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertCircle size={20} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Overdue Deadlines</p>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">{overdueCount}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-4 shadow-sm">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Completed Activities</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{completedCount}</p>
          </div>
        </div>
      </div>

      {/* Add Form Accordion */}
      {showAddForm && (
        <form onSubmit={handleAddEvent} className="p-6 rounded-xl bg-card border border-border space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Create New Academic Activity</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Event Scope</label>
              <select
                value={scope}
                onChange={e => {
                  const val = e.target.value as any;
                  setScope(val);
                  if (val === 'Semester Wide') {
                    setSubjectName('Semester-wide');
                  } else {
                    setSubjectName(subjects[0]?.name || '');
                  }
                }}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
              >
                <option value="Subject Specific">Subject Specific</option>
                <option value="Semester Wide">Semester Wide</option>
              </select>
            </div>

            {scope === 'Subject Specific' ? (
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Subject</label>
                <select
                  value={subjectName}
                  onChange={e => setSubjectName(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col justify-end pb-2">
                <span className="text-[11px] text-muted-foreground font-medium italic">Global Semester event</span>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Title / Description</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Lab Report 3, Orientation Ceremony"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Event Type</label>
              <select
                value={type}
                onChange={e => {
                  const val = e.target.value as any;
                  setType(val);
                  const semesterWideTypes = [
                    'Mid Semester Exam', 'End Semester Exam', 'Holiday', 
                    'Semester Break', 'Registration', 'Orientation', 'Other Global Events'
                  ];
                  if (semesterWideTypes.includes(val)) {
                    setScope('Semester Wide');
                    setSubjectName('Semester-wide');
                  } else {
                    setScope('Subject Specific');
                    setSubjectName(subjects[0]?.name || '');
                  }
                }}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
              >
                <option value="Assignment">Assignment</option>
                <option value="Quiz">Quiz</option>
                <option value="Mid Semester Exam">Mid Semester Exam</option>
                <option value="End Semester Exam">End Semester Exam</option>
                <option value="Lab Evaluation">Lab Evaluation</option>
                <option value="Viva">Viva</option>
                <option value="Project">Project</option>
                <option value="Presentation">Presentation</option>
                <option value="Holiday">Holiday</option>
                <option value="Semester Break">Semester Break</option>
                <option value="Registration">Registration</option>
                <option value="Orientation">Orientation</option>
                <option value="Other Global Events">Other Global Events</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Start / Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
              />
            </div>

            {scope === 'Semester Wide' && (
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">End Date (Optional)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>
            )}

            {type === 'Mid Semester Exam' || type === 'End Semester Exam' ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={examStartTime}
                    onChange={e => setExamStartTime(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">End Time</label>
                  <input
                    type="time"
                    value={examEndTime}
                    onChange={e => setExamEndTime(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Due Time</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add details, links, or task breakdowns..."
              rows={2}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none resize-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-95 transition-opacity"
            >
              Add Event
            </button>
          </div>
        </form>
      )}

      {/* Filter and Events List */}
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-card border border-border shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mr-2 font-semibold">
            <Filter size={14} />
            Filters:
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-secondary border border-border rounded-full px-4 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="Assignment">Assignment</option>
            <option value="Quiz">Quiz</option>
            <option value="Mid Semester Exam">Mid Semester Exam</option>
            <option value="End Semester Exam">End Semester Exam</option>
            <option value="Lab Evaluation">Lab Evaluation</option>
            <option value="Viva">Viva</option>
            <option value="Project">Project</option>
            <option value="Presentation">Presentation</option>
            <option value="Holiday">Holiday</option>
            <option value="Semester Break">Semester Break</option>
            <option value="Registration">Registration</option>
            <option value="Orientation">Orientation</option>
            <option value="Other Global Events">Other Global Events</option>
            <option value="Other">Other</option>
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="bg-secondary border border-border rounded-full px-4 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {/* Events Table/List */}
        {filteredEvents.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-border text-muted-foreground text-sm bg-card shadow-sm">
            No academic events match your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(e => {
              const isOverdue = e.status === 'Pending' && new Date(`${e.dueDate}T${e.dueTime}`) < new Date();

              return (
                <div 
                  key={e.id} 
                  className={`p-4 rounded-xl bg-card border border-border hover:shadow-sm transition-all flex flex-wrap items-center justify-between gap-4 ${
                    e.status === 'Completed' ? 'opacity-65' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Status circle */}
                    <button
                      onClick={() => handleToggleStatus(e.id, e.status)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {e.status === 'Completed' ? (
                        <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={18} />
                      ) : e.status === 'Missed' ? (
                        <AlertOctagon className="text-rose-600 dark:text-rose-400" size={18} />
                      ) : (
                        <Circle size={18} />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.subjectName === 'Semester-wide' ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                            Semester-wide
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-foreground">
                            {e.subjectName}
                          </span>
                        )}
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          {e.type}
                        </span>
                        {isOverdue && (
                          <span className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded uppercase">
                            Overdue
                          </span>
                        )}
                        {e.priority === 'High' && (
                          <span className="text-[9px] bg-rose-500/10 text-rose-600 dark:text-rose-400 font-extrabold px-1.5 py-0.5 rounded-full uppercase">
                            High Priority
                          </span>
                        )}
                      </div>
                      <p className={`text-sm font-semibold text-foreground mt-1.5 ${e.status === 'Completed' ? 'line-through text-muted-foreground' : ''}`}>
                        {e.title}
                      </p>
                      {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end text-xs text-muted-foreground">
                        <Calendar size={12} />
                        <span>
                          {e.endDate 
                            ? `${fmtShortDate(e.dueDate)} – ${fmtShortDate(e.endDate)}` 
                            : fmtShortDate(e.dueDate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 justify-end text-[10px] text-muted-foreground mt-0.5">
                        <Clock size={11} />
                        <span>
                          {e.startTime && e.endTime 
                            ? `${fmtTime12(e.startTime)} – ${fmtTime12(e.endTime)}` 
                            : fmtTime12(e.dueTime)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteEvent(e.id)}
                      className="text-muted-foreground hover:text-rose-500 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
