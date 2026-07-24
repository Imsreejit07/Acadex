'use client';

import { useState, useMemo } from 'react';
import { 
  Calendar, Clock, Trash2, Plus, Sparkles, BookOpen, 
  Award, ShieldCheck, HelpCircle, Layers, CalendarDays, RefreshCw, Info, ArrowLeftRight
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { 
  useHydratedStore, Holiday, ExtraClass, RescheduledClass, AttendanceCredit, ComponentType
} from '@/features/attendance/services/attendance-store';

export default function SemesterPage() {
  const { 
    onboarding, subjects, lectures, setOnboarding,
    activeTimetableEntries,
    holidays, setHolidays,
    extraClasses, setExtraClasses,
    rescheduledClasses, setRescheduledClasses,
    attendanceCredits, setAttendanceCredits,
    isFullyHydrated
  } = useHydratedStore();

  const [activeTab, setActiveTab] = useState<'HOLIDAYS' | 'EXTRA_CLASSES' | 'RESCHEDULE' | 'SWAP_SLOTS' | 'CREDITS'>('HOLIDAYS');

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
  const [rcMode, setRcMode] = useState<'TEMPORARY' | 'PERMANENT'>('TEMPORARY');
  const [rcOriginalId, setRcOriginalId] = useState('');
  const [rcNewDate, setRcNewDate] = useState('');
  const [rcNewStartTime, setRcNewStartTime] = useState('09:00');
  const [rcNewEndTime, setRcNewEndTime] = useState('10:00');
  const [rcReason, setRcReason] = useState('');
  const [rcAttendance, setRcAttendance] = useState<'PRESENT' | 'ABSENT' | 'CANCELLED'>('PRESENT');

  // Form states - Swap Slots
  const [swapSlotAIdx, setSwapSlotAIdx] = useState<string>('');
  const [swapSlotBIdx, setSwapSlotBIdx] = useState<string>('');

  // Form states - Credits
  const [cSubject, setCSubject] = useState('');
  const [cReason, setCReason] = useState('');
  const [cCredits, setCCredits] = useState(1);
  const [cDate, setCDate] = useState('');
  const [cApprovedBy, setCApprovedBy] = useState('');
  const [cNotes, setCNotes] = useState('');

  // Preload all available reschedule targets (Master timetable slots + generated lectures)
  const rescheduleOptions = useMemo(() => {
    const list: Array<{ id: string; label: string; subjectName: string; type: 'TT' | 'LEC'; entryIdx?: number }> = [];

    // Master recurring timetable slots (uses the active version's entries)
    (activeTimetableEntries || []).forEach((entry, idx) => {
      list.push({
        id: `tt|${idx}`,
        label: `[Timetable] ${entry.day}: ${entry.subjectName} (${entry.startTime} - ${entry.endTime})`,
        subjectName: entry.subjectName,
        type: 'TT',
        entryIdx: idx,
      });
    });

    // Generated lectures (past & upcoming)
    lectures.slice(0, 30).forEach(l => {
      list.push({
        id: `lec|${l.id}`,
        label: `[Lecture] ${l.date}: ${l.subjectName} (${l.startTime} - ${l.endTime})`,
        subjectName: l.subjectName,
        type: 'LEC',
      });
    });

    return list;
  }, [onboarding.timetableEntries, lectures]);

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
    if (!rcOriginalId) {
      toast.error('Please select an Original Lecture / Timetable Slot');
      return;
    }

    const selectedOpt = rescheduleOptions.find(o => o.id === rcOriginalId);
    if (!selectedOpt) {
      toast.error('Invalid lecture selection');
      return;
    }

    if (rcMode === 'PERMANENT') {
      // Permanent reschedule updates the master timetable entry
      if (selectedOpt.entryIdx === undefined || !onboarding.timetableEntries) {
        toast.error('Permanent reschedule can only be applied to master timetable slots');
        return;
      }

      const targetEntry = onboarding.timetableEntries[selectedOpt.entryIdx];
      const newDay = rcNewDate ? new Date(rcNewDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() : targetEntry.day;

      // Conflict check
      const conflict = (onboarding.timetableEntries || []).some((e, idx) => {
        if (idx === selectedOpt.entryIdx) return false;
        if (e.day.toUpperCase() !== newDay.toUpperCase()) return false;
        return rcNewStartTime < e.endTime && rcNewEndTime > e.startTime;
      });

      if (conflict) {
        toast.error(`Conflict Warning: Time slot ${rcNewStartTime}-${rcNewEndTime} overlaps with another class on ${newDay}`);
        return;
      }

      const updatedEntries = [...onboarding.timetableEntries];
      updatedEntries[selectedOpt.entryIdx] = {
        ...targetEntry,
        day: newDay,
        startTime: rcNewStartTime,
        endTime: rcNewEndTime,
      };

      setOnboarding({ ...onboarding, timetableEntries: updatedEntries });
      toast.success(`Master Timetable Updated! ${targetEntry.subjectName} permanently moved to ${newDay} (${rcNewStartTime} - ${rcNewEndTime}).`);
      setRcReason('');
      return;
    }

    // Temporary reschedule (single date occurrence exception)
    if (!rcNewDate) {
      toast.error('Please select a New Date for temporary reschedule');
      return;
    }

    const targetLectureId = selectedOpt.id.replace('lec|', '').replace('tt|', '');
    const newRescheduled: RescheduledClass = {
      id: Math.random().toString(36).substr(2, 9),
      originalLectureId: targetLectureId,
      newDate: rcNewDate,
      newStartTime: rcNewStartTime,
      newEndTime: rcNewEndTime,
      reason: rcReason || undefined,
      attendanceStatus: rcAttendance === 'CANCELLED' ? null : rcAttendance,
    };

    setRescheduledClasses([...rescheduledClasses, newRescheduled]);
    toast.success(`Single occurrence rescheduled to ${rcNewDate} (${rcNewStartTime} - ${rcNewEndTime})!`);
    setRcReason('');
  };

  const handleSwapSlots = (e: React.FormEvent) => {
    e.preventDefault();
    if (swapSlotAIdx === '' || swapSlotBIdx === '') {
      toast.error('Please select both Slot A and Slot B to swap');
      return;
    }

    const idxA = Number(swapSlotAIdx);
    const idxB = Number(swapSlotBIdx);

    if (idxA === idxB) {
      toast.error('Please select two different timetable slots to swap');
      return;
    }

    const entries = onboarding.timetableEntries || [];
    const slotA = entries[idxA];
    const slotB = entries[idxB];

    if (!slotA || !slotB) {
      toast.error('Invalid slot selection');
      return;
    }

    const updatedEntries = [...entries];
    // Swap day, startTime, and endTime
    updatedEntries[idxA] = {
      ...slotA,
      day: slotB.day,
      startTime: slotB.startTime,
      endTime: slotB.endTime,
    };

    updatedEntries[idxB] = {
      ...slotB,
      day: slotA.day,
      startTime: slotA.startTime,
      endTime: slotA.endTime,
    };

    setOnboarding({ ...onboarding, timetableEntries: updatedEntries });
    toast.success(`Master Timetable Swapped! ${slotA.subjectName} (${slotB.day} ${slotB.startTime}) ↔ ${slotB.subjectName} (${slotA.day} ${slotA.startTime}).`);
    setSwapSlotAIdx('');
    setSwapSlotBIdx('');
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
    if (!l) return 'Timetable Slot';
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
          Configure holidays, log extra sessions, reschedule timetabled classes, or swap master slots permanently.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form Section */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          {/* Tab selector */}
          <div className="grid grid-cols-3 gap-1 bg-secondary p-1 rounded-xl">
            {(['HOLIDAYS', 'EXTRA_CLASSES', 'RESCHEDULE', 'SWAP_SLOTS', 'CREDITS'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-1.5 px-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all text-center ${
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
                <label className="text-xs text-muted-foreground font-medium block mb-1">Reason / Description</label>
                <input
                  type="text"
                  value={hReason}
                  onChange={e => setHReason(e.target.value)}
                  placeholder="e.g. Official University Holiday"
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

          {/* Tab Form: Extra Class */}
          {activeTab === 'EXTRA_CLASSES' && (
            <form onSubmit={handleAddExtraClass} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Log Extra Session</h2>
              
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Select Subject</label>
                <select
                  value={ecSubject}
                  onChange={e => setEcSubject(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Choose Subject --</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Date</label>
                  <input
                    type="date"
                    value={ecDate}
                    onChange={e => setEcDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Component</label>
                  <select
                    value={ecCompType}
                    onChange={e => setEcCompType(e.target.value as any)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    <option value="THEORY">Theory</option>
                    <option value="LAB">Practical / Lab</option>
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
              
              {/* Reschedule Type Toggle */}
              <div className="grid grid-cols-2 gap-1 bg-secondary p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setRcMode('TEMPORARY')}
                  className={`py-1 rounded-md font-semibold transition-all ${rcMode === 'TEMPORARY' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
                >
                  Single Occurrence
                </button>
                <button
                  type="button"
                  onClick={() => setRcMode('PERMANENT')}
                  className={`py-1 rounded-md font-semibold transition-all ${rcMode === 'PERMANENT' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
                >
                  Permanent Master Update
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Select Slot / Lecture to Reschedule</label>
                <select
                  value={rcOriginalId}
                  onChange={e => setRcOriginalId(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Select Original Lecture / Timetable Slot --</option>
                  {rescheduleOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">
                  {rcMode === 'PERMANENT' ? 'Effective Date (Determines Day of Week)' : 'New Date'}
                </label>
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

              {rcMode === 'TEMPORARY' && (
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
              )}

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
                {rcMode === 'PERMANENT' ? 'Update Master Timetable' : 'Log Single Reschedule'}
              </button>
            </form>
          )}

          {/* Tab Form: Swap Slots */}
          {activeTab === 'SWAP_SLOTS' && (
            <form onSubmit={handleSwapSlots} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                Permanent Slot Swap
              </h2>
              <p className="text-xs text-muted-foreground">
                Swap the recurring day and time slots between any two master timetable entries permanently.
              </p>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Select Timetable Slot A</label>
                <select
                  value={swapSlotAIdx}
                  onChange={e => setSwapSlotAIdx(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Choose Slot A --</option>
                  {(onboarding.timetableEntries || []).map((entry, idx) => (
                    <option key={idx} value={idx}>
                      {entry.subjectName} ({entry.day} {entry.startTime} - {entry.endTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Select Timetable Slot B</label>
                <select
                  value={swapSlotBIdx}
                  onChange={e => setSwapSlotBIdx(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Choose Slot B --</option>
                  {(onboarding.timetableEntries || []).map((entry, idx) => (
                    <option key={idx} value={idx}>
                      {entry.subjectName} ({entry.day} {entry.startTime} - {entry.endTime})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                Swap Master Timetable Slots
              </button>
            </form>
          )}

          {/* Tab Form: Credits */}
          {activeTab === 'CREDITS' && (
            <form onSubmit={handleAddCredit} className="space-y-4">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Log Attendance Credit</h2>
              
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Select Subject</label>
                <select
                  value={cSubject}
                  onChange={e => setCSubject(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="">-- Choose Subject --</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Credit Amount</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={cCredits}
                    onChange={e => setCCredits(Number(e.target.value))}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={cDate}
                    onChange={e => setCDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Reason / Purpose</label>
                <input
                  type="text"
                  value={cReason}
                  onChange={e => setCReason(e.target.value)}
                  placeholder="e.g. Technical Fest Duty, Sports Representative"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Approved By (Faculty/Dept)</label>
                <input
                  type="text"
                  value={cApprovedBy}
                  onChange={e => setCApprovedBy(e.target.value)}
                  placeholder="e.g. Dr. A. Sharma (HOD)"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
              >
                Log Attendance Credit
              </button>
            </form>
          )}

        </div>

        {/* Right Column: Active Adjustment Logs */}
        <div className="lg:col-span-2 space-y-6">

          {/* Section: Logged Holidays */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Configured Holidays / Breaks ({holidays.length})</span>
            </h2>

            {holidays.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No holidays logged yet.</p>
            ) : (
              <div className="space-y-2">
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{h.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {h.type} &middot; {h.startDate} to {h.endDate} {h.subjectName ? `(${h.subjectName})` : ''}
                      </p>
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

          {/* Section: Logged Extra Classes */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Logged Extra Sessions ({extraClasses.length})</span>
            </h2>

            {extraClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No extra classes logged yet.</p>
            ) : (
              <div className="space-y-2">
                {extraClasses.map(ec => (
                  <div key={ec.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{ec.subjectName} ({ec.componentType})</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {ec.date} at {ec.startTime} - {ec.endTime} {ec.reason ? `(${ec.reason})` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteExtraClass(ec.id)}
                      className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Logged Reschedules */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Logged Reschedules ({rescheduledClasses.length})</span>
            </h2>

            {rescheduledClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No rescheduled classes logged yet.</p>
            ) : (
              <div className="space-y-2">
                {rescheduledClasses.map(rc => (
                  <div key={rc.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{getLectureLabel(rc.originalLectureId)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Rescheduled to {rc.newDate} at {rc.newStartTime} - {rc.newEndTime} {rc.reason ? `(${rc.reason})` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteReschedule(rc.id)}
                      className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Logged Credits */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Granted Attendance Credits ({attendanceCredits.length})</span>
            </h2>

            {attendanceCredits.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No custom attendance credits granted yet.</p>
            ) : (
              <div className="space-y-2">
                {attendanceCredits.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{c.subjectName} (+{c.credits} Credits)</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {c.date} &middot; Reason: {c.reason} {c.approvedBy ? `(Approved: ${c.approvedBy})` : ''}
                      </p>
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
