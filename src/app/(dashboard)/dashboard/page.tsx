'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, CheckCircle, XCircle, Clock, Sparkles, 
  CalendarDays, BookOpen, AlertCircle, Award, Hourglass, Calendar, 
  ArrowRight, ShieldCheck, CheckSquare, CalendarRange
} from 'lucide-react';
import { useAttendanceStore } from '@/features/attendance/services/attendance-store';
import { getAttendanceHealth, calculateSafeSkip } from '@/features/attendance/services/attendance-engine';
import type { SubjectConfig } from '@/features/attendance/services/attendance-store';

// ─── Helpers ───────────────────────────────────────────────────────────

function attColor(pct: number | null, target: number): string {
  if (pct === null) return '#64748b';
  if (pct >= 85) return '#10b981';
  if (pct >= target) return 'var(--foreground)';
  if (pct >= target - 5) return '#f59e0b';
  return '#f43f5e';
}

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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── CircularRing ──────────────────────────────────────────────────────

function CircularRing({
  value,
  size = 80,
  strokeWidth = 8,
  color = 'var(--foreground)',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  const c = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} style={{ opacity: 0.3 }} />
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

// ─── Subject color helper (Premium Monochromatic/Muted neutrals) ───────

const SUBJECT_COLORS = [
  '#475569', '#64748b', '#94a3b8', '#334155', '#475569', '#1e293b',
  '#0f172a', '#52525b', '#71717a', '#a1a1aa'
];

function getSubjectColor(subject: SubjectConfig, index: number): string {
  return subject.color || SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

export default function DashboardPage() {
  const {
    onboarding,
    lectures,
    subjectSummaries,
    overallStats,
    isBeforeStartDate,
    setLectureStatus,
    events,
  } = useAttendanceStore();

  const now = new Date();
  const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const todayDay = DAYS[now.getDay()];
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const todayLectures = useMemo(
    () =>
      lectures
        .filter((l) => l.date === todayDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [lectures, todayDate]
  );

  const recentLectures = useMemo(
    () => lectures.filter((l) => l.status !== 'SCHEDULED').slice(0, 5),
    [lectures]
  );

  const semesterName = onboarding.semesterName || 'Semester';
  const userName = onboarding.userName || 'Student';
  const target = subjectSummaries[0]?.target ?? 75;
  const overallPct = overallStats.attendancePercentage;
  const overallColor = attColor(overallPct, target);

  const atRisk = subjectSummaries.filter(
    ({ stats, target: t }) => stats.attendancePercentage !== null && stats.attendancePercentage < t
  );
  const onTrack = subjectSummaries.filter(
    ({ stats, target: t }) => stats.attendancePercentage !== null && stats.attendancePercentage >= t
  );

  const dashboardStats = useMemo(() => {
    let conductedEvents = 0;
    let presentEvents = 0;

    lectures.forEach((l) => {
      if (l.status === 'CONDUCTED') {
        conductedEvents++;
        if (l.attendance === 'PRESENT' || l.attendance === 'MEDICAL_LEAVE' || l.attendance === 'DUTY_LEAVE') {
          presentEvents++;
        }
      }
    });

    return {
      conductedEvents,
      presentEvents,
    };
  }, [lectures]);

  const todayFormatted = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Calculate Semester Progress
  const semesterProgress = useMemo(() => {
    if (!onboarding.startDate) return 0;
    const start = new Date(`${onboarding.startDate}T00:00:00`).getTime();
    
    // Find End Semester Exam date as end date, or fallback to 120 days from start date
    const endExam = events.find(e => e.type === 'End Semester Exam');
    const end = endExam 
      ? new Date(`${endExam.dueDate}T23:59:59`).getTime()
      : start + (120 * 24 * 60 * 60 * 1000);

    const current = Date.now();
    if (current < start) return 0;
    if (current > end) return 100;
    return Math.round(((current - start) / (end - start)) * 100);
  }, [onboarding.startDate, events]);

  // Countdowns
  const countdowns = useMemo(() => {
    const todayTime = new Date().setHours(0, 0, 0, 0);

    const midExam = events
      .filter(e => e.type === 'Mid Semester Exam' && new Date(e.dueDate).getTime() >= todayTime)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

    const endExam = events
      .filter(e => e.type === 'End Semester Exam' && new Date(e.dueDate).getTime() >= todayTime)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

    const nextEvent = events
      .filter(e => e.status === 'Pending' && new Date(e.dueDate).getTime() >= todayTime)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

    const getDaysDiff = (targetDateStr?: string) => {
      if (!targetDateStr) return null;
      const targetTime = new Date(`${targetDateStr}T00:00:00`).getTime();
      const diffTime = targetTime - todayTime;
      return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    };

    return {
      midSemester: getDaysDiff(midExam?.dueDate),
      endSemester: getDaysDiff(endExam?.dueDate),
      nextEventDays: getDaysDiff(nextEvent?.dueDate),
      nextEventTitle: nextEvent?.title || null
    };
  }, [events]);

  // Filtered upcoming Academic Events
  const upcomingAssignments = useMemo(() => 
    events.filter(e => e.type === 'Assignment' && e.status === 'Pending').slice(0, 3),
    [events]
  );
  
  const upcomingQuizzes = useMemo(() => 
    events.filter(e => e.type === 'Quiz' && e.status === 'Pending').slice(0, 3),
    [events]
  );

  const overdueEvents = useMemo(() => 
    events.filter(e => e.status === 'Pending' && new Date(`${e.dueDate}T${e.dueTime}`) < new Date()),
    [events]
  );

  if (subjectSummaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center text-muted-foreground">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Welcome to Acadex</h1>
          <p className="text-sm text-muted-foreground">
            Upload your timetable to configure your classes.
          </p>
        </div>
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm"
        >
          Import Timetable PDF
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {getGreeting()}{userName ? `, ${userName.split(' ')[0]}` : ''}
            <Sparkles className="h-4.5 w-4.5 text-foreground/40" />
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {todayFormatted} &middot; {semesterName}
          </p>
        </div>
        
        {/* Semester Progress */}
        <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2 text-xs">
          <div className="text-right">
            <span className="text-muted-foreground block font-medium">Semester Progress</span>
            <span className="text-foreground font-bold">{semesterProgress}%</span>
          </div>
          <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-foreground rounded-full" style={{ width: `${semesterProgress}%` }} />
          </div>
        </div>
      </div>

      {/* Countdowns & Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Midterm countdown */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Mid Semester Exam</span>
            <p className="text-lg font-bold text-foreground mt-1">
              {countdowns.midSemester !== null ? `${countdowns.midSemester} Days Left` : 'Not Scheduled'}
            </p>
          </div>
          <Hourglass className="h-8 w-8 text-muted-foreground opacity-30" />
        </div>

        {/* Endterm countdown */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">End Semester Exam</span>
            <p className="text-lg font-bold text-foreground mt-1">
              {countdowns.endSemester !== null ? `${countdowns.endSemester} Days Left` : 'Not Scheduled'}
            </p>
          </div>
          <CalendarDays className="h-8 w-8 text-muted-foreground opacity-30" />
        </div>

        {/* Next deadline countdown */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Next Deadline</span>
            <p className="text-sm font-semibold text-foreground mt-1 truncate max-w-[180px]">
              {countdowns.nextEventTitle || 'No Pending Tasks'}
            </p>
            {countdowns.nextEventDays !== null && (
              <span className="text-xs text-muted-foreground font-medium">{countdowns.nextEventDays} days remaining</span>
            )}
          </div>
          <CalendarRange className="h-8 w-8 text-muted-foreground opacity-30" />
        </div>
      </div>

      {/* At-risk alert */}
      {atRisk.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3.5 border bg-rose-500/5 border-rose-500/20"
        >
          <AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-500 dark:text-rose-300">Attendance Warning</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="text-foreground font-semibold">
                {atRisk.map(({ subject }) => subject.name).join(', ')}
              </span>{' '}
              {atRisk.length === 1 ? 'is' : 'are'} below the target threshold. Plan recovery classes or utilize attendance credits.
            </p>
          </div>
        </div>
      )}

      {/* Main 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Schedule & Event Lists */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Today's Schedule */}
          <div className="rounded-xl overflow-hidden border border-border bg-card">
            <div className="px-5 py-4 flex items-center justify-between border-b border-border bg-muted/20">
              <h3 className="font-semibold text-foreground text-sm">Today&apos;s Class Schedule</h3>
              <span className="text-xs text-muted-foreground">{todayDay}</span>
            </div>
            
            <div className="divide-y divide-border">
              {todayLectures.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No lectures scheduled for today.
                </div>
              ) : (
                todayLectures.map((lecture, idx) => {
                  const subjectConfig = onboarding.subjects?.find((s) => s.name === lecture.subjectName);
                  const color = getSubjectColor(subjectConfig || { id: idx.toString(), name: lecture.subjectName }, idx);

                  return (
                    <div key={lecture.id} className="px-5 py-4 flex items-center gap-4 hover:bg-secondary/40 transition-colors">
                      <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm">{lecture.subjectName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {subjectConfig?.code || ''}{subjectConfig?.code ? ' · ' : ''}
                          {fmtTime(lecture.startTime)}–{fmtTime(lecture.endTime)} &middot;{' '}
                          {lecture.componentType}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Present Button */}
                        <button
                          onClick={() => {
                            const isCurrent = lecture.status === 'CONDUCTED' && lecture.attendance === 'PRESENT';
                            setLectureStatus(lecture.id, isCurrent ? 'SCHEDULED' : 'CONDUCTED', isCurrent ? null : 'PRESENT');
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            lecture.status === 'CONDUCTED' && lecture.attendance === 'PRESENT'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25'
                          }`}
                        >
                          Present
                        </button>
                        
                        {/* Absent Button */}
                        <button
                          onClick={() => {
                            const isCurrent = lecture.status === 'CONDUCTED' && lecture.attendance === 'ABSENT';
                            setLectureStatus(lecture.id, isCurrent ? 'SCHEDULED' : 'CONDUCTED', isCurrent ? null : 'ABSENT');
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            lecture.status === 'CONDUCTED' && lecture.attendance === 'ABSENT'
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/25'
                          }`}
                        >
                          Absent
                        </button>

                        {/* Cancelled Button */}
                        <button
                          onClick={() => {
                            const isCurrent = lecture.status === 'CANCELLED';
                            setLectureStatus(lecture.id, isCurrent ? 'SCHEDULED' : 'CANCELLED', null);
                          }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            lecture.status === 'CANCELLED'
                              ? 'bg-foreground text-background border-foreground shadow-sm'
                              : 'bg-secondary text-muted-foreground border-border hover:bg-muted-foreground/10'
                          }`}
                        >
                          Cancelled
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Academic Deadlines & Workloads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Assignments & Quizzes Card */}
            <div className="p-5 rounded-xl border border-border bg-card space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare size={13} className="text-muted-foreground" />
                Pending Deadlines
              </h3>

              {upcomingAssignments.length === 0 && upcomingQuizzes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No upcoming assignments or quizzes.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingAssignments.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-xs p-2 rounded bg-secondary/50 border border-border">
                      <span className="text-foreground font-medium truncate max-w-[130px]">{a.title}</span>
                      <span className="text-muted-foreground">Due {a.dueDate}</span>
                    </div>
                  ))}
                  {upcomingQuizzes.map(q => (
                    <div key={q.id} className="flex justify-between items-center text-xs p-2 rounded bg-secondary/50 border border-border">
                      <span className="text-foreground font-medium truncate max-w-[130px]">Quiz: {q.title}</span>
                      <span className="text-muted-foreground">{q.dueDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overdue Deadlines */}
            <div className="p-5 rounded-xl border border-border bg-card space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle size={13} className="text-rose-500" />
                Overdue Tasks ({overdueEvents.length})
              </h3>

              {overdueEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">You are caught up on all tasks!</p>
              ) : (
                <div className="space-y-2">
                  {overdueEvents.slice(0, 3).map(o => (
                    <div key={o.id} className="flex justify-between items-center text-xs p-2 rounded bg-rose-500/5 border border-rose-500/10">
                      <span className="text-rose-600 dark:text-rose-400 font-medium truncate max-w-[130px]">{o.title}</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{o.dueDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Recent Attendance Activity */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Recent Activity</h3>
            {recentLectures.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attendance activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {recentLectures.map(l => {
                  let pill = null;
                  if (l.status === 'CANCELLED') {
                    pill = <span className="text-[10px] font-semibold text-muted-foreground">Cancelled</span>;
                  } else if (l.status === 'HOLIDAY') {
                    pill = <span className="text-[10px] font-semibold text-muted-foreground">Holiday</span>;
                  } else if (l.attendance === 'PRESENT') {
                    pill = <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Present</span>;
                  } else if (l.attendance === 'ABSENT') {
                    pill = <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">Absent</span>;
                  } else if (l.attendance === 'MEDICAL_LEAVE') {
                    pill = <span className="text-[10px] font-semibold text-blue-600">Med. Leave</span>;
                  } else if (l.attendance === 'DUTY_LEAVE') {
                    pill = <span className="text-[10px] font-semibold text-slate-500">Duty Leave</span>;
                  }

                  return (
                    <div key={l.id} className="flex justify-between items-center text-xs p-2 rounded bg-secondary/40 border border-border">
                      <div>
                        <span className="text-foreground font-semibold">{l.subjectName}</span>
                        <span className="text-muted-foreground block text-[10px] mt-0.5">{fmtDate(l.date)} &middot; {l.startTime}</span>
                      </div>
                      {pill}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Attendance Overview & Targets */}
        <div className="space-y-6">
          
          {/* Overall Stats Card */}
          <div className="rounded-xl p-5 border border-border bg-card flex items-center gap-4 shadow-sm">
            <div className="relative flex items-center justify-center shrink-0">
              <CircularRing value={overallPct ?? 0} size={85} strokeWidth={8} color={overallColor} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                {overallPct !== null ? `${Math.round(overallPct)}%` : '--'}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Overall Attendance</p>
              <p className="text-xl font-bold text-foreground mt-1">
                {dashboardStats.presentEvents}/{dashboardStats.conductedEvents}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Class sessions attended ({overallStats.present}/{overallStats.conducted} units)
              </p>
            </div>
          </div>

          {/* Subject Breakdown list */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-4 shadow-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Subject Targets</h3>
              <Link href="/subjects" className="text-xs text-muted-foreground hover:text-foreground hover:underline font-semibold">Edit Subjects</Link>
            </div>

            <div className="space-y-3">
              {subjectSummaries.map(({ subject, overallStats: stats, target: t, labTarget, labStats, theoryStats }, idx) => {
                const color = getSubjectColor(subject, idx);
                const hasBoth = subject.hasLab;

                return (
                  <div key={subject.id || subject.name} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground truncate max-w-[150px]">{subject.name}</span>
                      <span className="font-bold text-foreground">
                        {stats.attendancePercentage !== null ? `${stats.attendancePercentage.toFixed(0)}%` : '--'}
                      </span>
                    </div>

                    {/* Progress bars */}
                    {!hasBoth ? (
                      <div className="space-y-1">
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden border border-border/10">
                          <div 
                            className="h-full rounded-full transition-all" 
                            style={{ 
                              width: `${stats.attendancePercentage ?? 0}%`, 
                              backgroundColor: attColor(stats.attendancePercentage, t) 
                            }} 
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground">
                          <span>Target: {t}%</span>
                          <span>{stats.present}/{stats.conducted} lectures</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pl-2 border-l border-border">
                        {/* Theory track */}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span>Theory Component</span>
                            <span>{theoryStats.attendancePercentage !== null ? `${theoryStats.attendancePercentage.toFixed(0)}%` : '--'}</span>
                          </div>
                          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full" 
                              style={{ 
                                width: `${theoryStats.attendancePercentage ?? 0}%`, 
                                backgroundColor: attColor(theoryStats.attendancePercentage, t) 
                              }} 
                            />
                          </div>
                        </div>
                        {/* Lab track */}
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span>Lab Component</span>
                            <span>{labStats.attendancePercentage !== null ? `${labStats.attendancePercentage.toFixed(0)}%` : '--'}</span>
                          </div>
                          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full" 
                              style={{ 
                                width: `${labStats.attendancePercentage ?? 0}%`, 
                                backgroundColor: attColor(labStats.attendancePercentage, labTarget) 
                              }} 
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
