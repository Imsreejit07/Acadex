'use client';

import { useState } from 'react';
import { 
  Calendar, Clock, Trash2, Plus, Sparkles, BookOpen, 
  Award, ShieldCheck, HelpCircle, Layers, CalendarDays, RefreshCw, Info
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { 
  useHydratedStore, Holiday, ExtraClass, RescheduledClass, AttendanceCredit, ComponentType
} from '@/features/attendance/services/attendance-store';

export default function SemesterPage() {
  const { 
    onboarding, subjects, lectures,
    holidays, setHolidays,
    extraClasses, setExtraClasses,
    rescheduledClasses, setRescheduledClasses,
    attendanceCredits, setAttendanceCredits,
    isFullyHydrated
  } = useHydratedStore();

  const [activeTab, setActiveTab] = useState<'HOLIDAYS' | 'EXTRA_CLASSES' | 'RESCHEDULE' | 'CREDITS'>('HOLIDAYS');

  // Form states - Holiday
  const [hTitle, setHTitle] = useState('');
  const [hType, setHType] = useState<Holiday['type']>('GLOBAL');
  const [hStartDate, setHStartDate] = useState('');
  const [hEndDate, setHEndDate] = useState('');
  const [hSubject, setHSubject] = useState('');
  const [hReason, setHReason] = useState('');

  // Form states - Extra Class
  const [ecSubject, setEcSubject] = useState('');
  const [ecFaculty, setEcFaculty] = useState('');
  const [ecDate, setEcDate] = useState('');
  const [ecStartTime, setEcStartTime] = useState('09:00');
  const [ecEndTime, setEcEndTime] = useState('10:00');
  const [ecCompType, setEcCompType] = useState<ComponentType>('THEORY');
  const [ecReason, setEcReason] = useState('');
  const [ecIsMandatory, setEcIsMandatory] = useState(true);
  const [ecAttendance, setEcAttendance] = useState<'PRESENT' | 'ABSENT' | 'CANCELLED'>('PRESENT');

  // Form states - Reschedule
  const [rcOriginalId, setRcOriginalId] = useState('');
  const [rcNewDate, setRcNewDate] = useState('');
  const [rcNewStartTime, setRcNewStartTime] = useState('09:00');
  const [rcNewEndTime, setRcNewEndTime] = useState('10:00');
  const [rcReason, setRcReason] = useState('');
  const [rcAttendance, setRcAttendance] = useState<'PRESENT' | 'ABSENT' | 'CANCELLED'>('PRESENT');

  // Form states - Credits
  const [cSubject, setCSubject] = useState('');
  const [cReason, setCReason] = useState('');
  const [cCredits, setCCredits] = useState(1);
  const [cDate, setCDate] = useState('');
  const [cApprovedBy, setCApprovedBy] = useState('');
  const [cNotes, setCNotes] = useState('');

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hTitle || !hStartDate || !hEndDate) {
      toast.error('Please fill in Title, Start Date, and End Date');
      return;
    }

    const newHoliday: Holiday = {
      id: Math.random().toString(36).substr(2, 9),
      title: hTitle,
      type: hType,
      startDate: hStartDate,
      endDate: hEndDate,
      subjectName: hType === 'SUBJECT' ? hSubject : undefined,
      reason: hReason || undefined,
    };

    setHolidays([...holidays, newHoliday]);
    toast.success('Holiday successfully added!');
    setHTitle('');
    setHReason('');
  };

  const handleAddExtraClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ecSubject || !ecDate) {
      toast.error('Please select Subject and Date');
      return;
    }

    const newExtra: ExtraClass = {
      id: Math.random().toString(36).substr(2, 9),
      subjectName: ecSubject,
      faculty: ecFaculty || undefined,
      date: ecDate,
      startTime: ecStartTime,
      endTime: ecEndTime,
      componentType: ecCompType,
      reason: ecReason || undefined,
      isMandatory: ecIsMandatory,
      attendanceStatus: ecAttendance === 'CANCELLED' ? null : ecAttendance,
      status: ecAttendance === 'CANCELLED' ? 'CANCELLED' : 'CONDUCTED',
    };

    setExtraClasses([...extraClasses, newExtra]);
    toast.success('Extra Class added successfully!');
    setEcReason('');
  };

  const handleAddReschedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rcOriginalId || !rcNewDate) {
      toast.error('Please select Original Lecture and New Date');
      return;
    }

    const newRescheduled: RescheduledClass = {
      id: Math.random().toString(36).substr(2, 9),
      originalLectureId: rcOriginalId,
      newDate: rcNewDate,
      newStartTime: rcNewStartTime,
      newEndTime: rcNewEndTime,
      reason: rcReason || undefined,
      attendanceStatus: rcAttendance === 'CANCELLED' ? null : rcAttendance,
    };

    setRescheduledClasses([...rescheduledClasses, newRescheduled]);
    toast.success('Reschedule logged successfully!');
    setRcReason('');
  };

  const handleAddCredit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cSubject || !cCredits || !cDate) {
      toast.error('Please select Subject, Date, and Credits amount');
      return;
    }

    const newCredit: AttendanceCredit = {
      id: Math.random().toString(36).substr(2, 9),
      subjectName: cSubject,
      credits: Number(cCredits),
      date: cDate,
      approvedBy: cApprovedBy || undefined,
      reason: cReason,
      notes: cNotes || undefined,
    };

    setAttendanceCredits([...attendanceCredits, newCredit]);
    toast.success('Attendance Credit successfully logged!');
    setCReason('');
    setCApprovedBy('');
    setCNotes('');
  };

  const handleDeleteHoliday = (id: string) => {
    setHolidays(holidays.filter(h => h.id !== id));
    toast.success('Holiday log deleted');
  };

  const handleDeleteExtraClass = (id: string) => {
    setExtraClasses(extraClasses.filter(ec => ec.id !== id));
    toast.success('Extra Class log deleted');
  };

  const handleDeleteReschedule = (id: string) => {
    setRescheduledClasses(rescheduledClasses.filter(rc => rc.id !== id));
    toast.success('Reschedule log deleted');
  };

  const handleDeleteCredit = (id: string) => {
    setAttendanceCredits(attendanceCredits.filter(c => c.id !== id));
    toast.success('Attendance Credit deleted');
  };

  // Helper to find original lecture details
  const getLectureLabel = (id: string) => {
    const l = lectures.find(lec => lec.id === id);
    if (!l) return 'Unknown Lecture';
    return `${l.subjectName} (${l.date} at ${l.startTime})`;
  };

  if (!isFullyHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
        <div className="h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-semibold">Loading Semester Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1 text-foreground">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Layers className="text-muted-foreground" />
          Semester Adjustments
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure holidays, log extra sessions, reschedule timetabled classes, or add custom attendance credits.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          {/* Tab selector */}
          <div className="grid grid-cols-2 gap-1 bg-secondary p-1 rounded-xl">
            {(['HOLIDAYS', 'EXTRA_CLASSES', 'RESCHEDULE', 'CREDITS'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all text-center ${
                  activeTab === tab 
                    ? 'bg-card text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Tab Form: Holidays */}
          {activeTab === 'HOLIDAYS' && (
            <form onSubmit={handleAddHoliday} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Log Holiday / Break</h2>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Holiday Title</label>
                <input
                  type="text"
                  value={hTitle}
                  onChange={e => setHTitle(e.target.value)}
                  placeholder="e.g. Diwali Break, Sports Day"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Holiday Type</label>
                <select
                  value={hType}
                  onChange={e => {
                    setHType(e.target.value as any);
                    if (e.target.value === 'SUBJECT' && subjects.length > 0) setHSubject(subjects[0].name);
                  }}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="GLOBAL">Global (Every Subject)</option>
                  <option value="SUBJECT">Subject Specific</option>
                  <option value="SINGLE_DAY">Single Day (Global)</option>
                </select>
              </div>

              {hType === 'SUBJECT' && (
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Select Subject</label>
                  <select
                    value={hSubject}
                    onChange={e => setHSubject(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={hStartDate}
                    onChange={e => setHStartDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">End Date</label>
                  <input
                    type="date"
                    value={hEndDate}
                    onChange={e => setHEndDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={hReason}
                  onChange={e => setHReason(e.target.value)}
                  placeholder="e.g. Festival Leave"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                Log Holiday
              </button>
            </form>
          )}

          {/* Tab Form: Extra Classes */}
          {activeTab === 'EXTRA_CLASSES' && (
            <form onSubmit={handleAddExtraClass} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Log Extra Class</h2>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Subject</label>
                <select
                  value={ecSubject}
                  onChange={e => setEcSubject(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Select Subject --</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Faculty Name</label>
                <input
                  type="text"
                  value={ecFaculty}
                  onChange={e => setEcFaculty(e.target.value)}
                  placeholder="e.g. Dr. Vinay"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Date</label>
                  <input
                    type="date"
                    value={ecDate}
                    onChange={e => setEcDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Session Type</label>
                  <select
                    value={ecCompType}
                    onChange={e => setEcCompType(e.target.value as any)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option value="THEORY">Theory</option>
                    <option value="LAB">Lab</option>
                    <option value="TUTORIAL">Tutorial</option>
                    <option value="WORKSHOP">Workshop</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={ecStartTime}
                    onChange={e => setEcStartTime(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">End Time</label>
                  <input
                    type="time"
                    value={ecEndTime}
                    onChange={e => setEcEndTime(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Attendance Log</label>
                <select
                  value={ecAttendance}
                  onChange={e => setEcAttendance(e.target.value as any)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="PRESENT">Conducted & Present</option>
                  <option value="ABSENT">Conducted & Absent</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={ecReason}
                  onChange={e => setEcReason(e.target.value)}
                  placeholder="e.g. Syllabus Recovery"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                Log Extra Class
              </button>
            </form>
          )}

          {/* Tab Form: Reschedule */}
          {activeTab === 'RESCHEDULE' && (
            <form onSubmit={handleAddReschedule} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Reschedule Lecture</h2>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Select Lecture to Reschedule</label>
                <select
                  value={rcOriginalId}
                  onChange={e => setRcOriginalId(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Select Original Lecture --</option>
                  {lectures.filter(l => l.status === 'SCHEDULED').slice(0, 15).map(l => (
                    <option key={l.id} value={l.id}>
                      {l.subjectName} ({l.date} at {l.startTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">New Date</label>
                <input
                  type="date"
                  value={rcNewDate}
                  onChange={e => setRcNewDate(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">New Start Time</label>
                  <input
                    type="time"
                    value={rcNewStartTime}
                    onChange={e => setRcNewStartTime(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">New End Time</label>
                  <input
                    type="time"
                    value={rcNewEndTime}
                    onChange={e => setRcNewEndTime(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Attendance Log</label>
                <select
                  value={rcAttendance}
                  onChange={e => setRcAttendance(e.target.value as any)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="PRESENT">Conducted & Present</option>
                  <option value="ABSENT">Conducted & Absent</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={rcReason}
                  onChange={e => setRcReason(e.target.value)}
                  placeholder="e.g. Faculty Rescheduled"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                Log Reschedule
              </button>
            </form>
          )}

          {/* Tab Form: Credits */}
          {activeTab === 'CREDITS' && (
            <form onSubmit={handleAddCredit} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Log Attendance Credit</h2>
              
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs text-muted-foreground flex gap-2">
                <Info size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  Credits automatically increase your attendance percentage for the chosen subject without adding physical class records. Use for authorized duty leaves.
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Subject</label>
                <select
                  value={cSubject}
                  onChange={e => setCSubject(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Select Subject --</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Credits Amount</label>
                  <input
                    type="number"
                    value={cCredits}
                    onChange={e => setCCredits(Number(e.target.value))}
                    min={1}
                    max={10}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Date Approved</label>
                  <input
                    type="date"
                    value={cDate}
                    onChange={e => setCDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Reason for Credit</label>
                <input
                  type="text"
                  value={cReason}
                  onChange={e => setCReason(e.target.value)}
                  placeholder="e.g. Sports Fest Organizer, Hackathon"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Approved By (Faculty/HOD)</label>
                <input
                  type="text"
                  value={cApprovedBy}
                  onChange={e => setCApprovedBy(e.target.value)}
                  placeholder="e.g. Dr. Satish"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                Grant Credit
              </button>
            </form>
          )}

        </div>

        {/* Right Column: Active Adjustments Lists */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Holidays list */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-muted-foreground" />
              Configured Holidays / Breaks ({holidays.length})
            </h3>
            
            {holidays.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No holidays logged yet.</p>
            ) : (
              <div className="space-y-2">
                {holidays.map(h => (
                  <div key={h.id} className="flex justify-between items-center text-xs p-3 rounded-lg bg-secondary/40 border border-border">
                    <div>
                      <span className="text-foreground font-bold">{h.title}</span>
                      <span className="text-muted-foreground block text-[10px] mt-0.5">
                        {h.startDate === h.endDate ? h.startDate : `${h.startDate} to ${h.endDate}`} &middot;{' '}
                        {h.type === 'GLOBAL' ? 'Global Break' : `Subject Specific (${h.subjectName})`}
                      </span>
                      {h.reason && <span className="text-[10px] text-muted-foreground italic block mt-0.5">Note: {h.reason}</span>}
                    </div>
                    <button
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extra Classes list */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Plus size={14} className="text-muted-foreground" />
              Logged Extra Sessions ({extraClasses.length})
            </h3>
            
            {extraClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No extra classes logged yet.</p>
            ) : (
              <div className="space-y-2">
                {extraClasses.map(ec => (
                  <div key={ec.id} className="flex justify-between items-center text-xs p-3 rounded-lg bg-secondary/40 border border-border">
                    <div>
                      <span className="text-foreground font-bold">{ec.subjectName}</span>
                      <span className="text-muted-foreground block text-[10px] mt-0.5">
                        {ec.date} at {ec.startTime}-{ec.endTime} &middot; {ec.componentType}{' '}
                        {ec.faculty ? `(Faculty: ${ec.faculty})` : ''}
                      </span>
                      {ec.reason && <span className="text-[10px] text-muted-foreground block mt-0.5">Reason: {ec.reason}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        ec.status === 'CANCELLED' ? 'bg-secondary text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {ec.status === 'CANCELLED' ? 'Cancelled' : 'Conducted'}
                      </span>
                      <button
                        onClick={() => handleDeleteExtraClass(ec.id)}
                        className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rescheduled Classes list */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <RefreshCw size={14} className="text-muted-foreground" />
              Logged Reschedules ({rescheduledClasses.length})
            </h3>
            
            {rescheduledClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No rescheduled classes logged yet.</p>
            ) : (
              <div className="space-y-2">
                {rescheduledClasses.map(rc => (
                  <div key={rc.id} className="flex justify-between items-center text-xs p-3 rounded-lg bg-secondary/40 border border-border">
                    <div>
                      <span className="text-foreground font-bold">Rescheduled Lecture</span>
                      <span className="text-muted-foreground block text-[10px] mt-0.5">
                        Original: {getLectureLabel(rc.originalLectureId)}
                      </span>
                      <span className="text-muted-foreground block text-[10px]">
                        New Slot: {rc.newDate} at {rc.newStartTime}-{rc.newEndTime}
                      </span>
                      {rc.reason && <span className="text-[10px] text-muted-foreground block mt-0.5">Reason: {rc.reason}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        rc.attendanceStatus === null ? 'bg-secondary text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {rc.attendanceStatus === null ? 'Not Attended' : 'Attended'}
                      </span>
                      <button
                        onClick={() => handleDeleteReschedule(rc.id)}
                        className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendance Credits list */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Award size={14} className="text-muted-foreground" />
              Granted Attendance Credits ({attendanceCredits.length})
            </h3>
            
            {attendanceCredits.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No custom attendance credits granted yet.</p>
            ) : (
              <div className="space-y-2">
                {attendanceCredits.map(c => (
                  <div key={c.id} className="flex justify-between items-center text-xs p-3 rounded-lg bg-secondary/40 border border-border">
                    <div>
                      <span className="text-foreground font-bold">{c.subjectName}</span>
                      <span className="text-muted-foreground block text-[10px] mt-0.5">
                        Amount: <strong className="text-foreground">+{c.credits} Credits</strong> &middot; Granted {c.date}
                      </span>
                      <span className="text-muted-foreground block text-[10px]">Reason: {c.reason}</span>
                      {c.approvedBy && <span className="text-[10px] text-muted-foreground block">Approved by: {c.approvedBy}</span>}
                    </div>
                    <button
                      onClick={() => handleDeleteCredit(c.id)}
                      className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
