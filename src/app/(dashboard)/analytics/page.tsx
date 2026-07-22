'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, 
  Legend, Line, BarChart, Bar, Cell, PieChart, Pie 
} from 'recharts';
import { 
  TrendingUp, Calendar, AlertCircle, Award, Hourglass, 
  CheckSquare, Activity, CalendarDays
} from 'lucide-react';
import { useAttendanceStore } from '@/features/attendance/services/attendance-store';
import { getLectureMultiplier } from '@/features/attendance/services/attendance-engine';
import type { SubjectConfig } from '@/features/attendance/services/attendance-store';

// ─── Helpers ───────────────────────────────────────────────────────────

function attColor(pct: number | null, target: number): string {
  if (pct === null) return '#64748b';
  if (pct >= 85) return '#10b981';
  if (pct >= target) return 'var(--foreground)';
  if (pct >= target - 5) return '#f59e0b';
  return '#f43f5e';
}

const SUBJECT_COLORS = [
  '#475569', '#64748b', '#94a3b8', '#334155', '#475569', '#1e293b',
  '#0f172a', '#52525b', '#71717a', '#a1a1aa'
];

function getSubjectColor(subject: SubjectConfig, index: number): string {
  return subject.color || SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  borderColor: 'var(--border)',
  borderRadius: '8px',
  color: 'var(--foreground)',
};

// ─── Analytics Page ────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { 
    onboarding, lectures, subjectSummaries, overallStats, isBeforeStartDate, 
    events, holidays, extraClasses, attendanceCredits, isHydrated 
  } = useAttendanceStore();

  const conductedCount = useMemo(() => lectures.filter(l => l.status === 'CONDUCTED').length, [lectures]);

  // ── Weekly chart data ──
  const weeklyData = useMemo(() => {
    if (!onboarding.startDate || lectures.length === 0) return [];

    const sorted = [...lectures].sort((a, b) => a.date.localeCompare(b.date));
    const weeksMap: Record<string, typeof lectures> = {};

    sorted.forEach((l) => {
      const d = new Date(l.date);
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const w = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      const key = `W${w} (${d.getFullYear()})`;
      if (!weeksMap[key]) weeksMap[key] = [];
      weeksMap[key].push(l);
    });

    let cumPresent = 0;
    let cumTotal = 0;

    return Object.entries(weeksMap).map(([week, weekLectures]) => {
      let weeklyPresent = 0;
      let weeklyTotal = 0;

      weekLectures.forEach((l) => {
        const mult = getLectureMultiplier(l.componentType, l.startTime, l.endTime);
        if (l.status === 'CONDUCTED') {
          weeklyTotal += mult;
          if (l.attendance === 'PRESENT') weeklyPresent += mult;
        }
      });

      cumPresent += weeklyPresent;
      cumTotal += weeklyTotal;

      return {
        week,
        weekly: weeklyTotal > 0 ? Math.round((weeklyPresent / weeklyTotal) * 1000) / 10 : 0,
        cumulative: cumTotal > 0 ? Math.round((cumPresent / cumTotal) * 1000) / 10 : 0,
      };
    });
  }, [lectures, onboarding.startDate]);

  const hasSubjects = (onboarding.subjects?.length ?? 0) > 0 || (onboarding.timetableEntries?.length ?? 0) > 0 || subjectSummaries.length > 0;

  if (!mounted || !isHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto">
        <div className="h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-semibold">Loading Analytics Data...</p>
      </div>
    );
  }

  if (!hasSubjects) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center text-muted-foreground">
          <Activity className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">No Analytics Available</h1>
          <p className="text-sm text-muted-foreground">
            Configure your semester subjects and timetable to unlock detailed attendance insights.
          </p>
        </div>
        <a
          href="/analyze"
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm"
        >
          Import Timetable PDF
        </a>
      </div>
    );
  }

  // ── Subject bar chart data ──
  const subjectBarData = subjectSummaries.map(({ subject, overallStats: stats }, idx) => ({
    name: subject.code || subject.name.slice(0, 6),
    percentage: stats.attendancePercentage ?? 0,
    color: getSubjectColor(subject, idx),
  }));

  // ── Theory vs Lab pie data — distinguish by component type ──
  const theoryLectures = lectures.filter((l) => l.componentType !== 'LAB' && l.status === 'CONDUCTED');
  const labLectures = lectures.filter((l) => l.componentType === 'LAB' && l.status === 'CONDUCTED');

  let theoryAtt = 0;
  let theoryTotal = 0;
  for (const l of theoryLectures) {
    const mult = getLectureMultiplier(l.componentType, l.startTime, l.endTime);
    theoryTotal += mult;
    if (l.attendance === 'PRESENT') theoryAtt += mult;
  }

  let labAtt = 0;
  let labTotal = 0;
  for (const l of labLectures) {
    const mult = getLectureMultiplier(l.componentType, l.startTime, l.endTime);
    labTotal += mult;
    if (l.attendance === 'PRESENT') labAtt += mult;
  }

  const tvlData = [
    {
      name: 'Theory',
      value: theoryAtt,
      total: theoryTotal,
      pct: theoryTotal > 0 ? Math.round((theoryAtt / theoryTotal) * 100) : 0,
      fill: '#475569',
    },
    {
      name: 'Lab',
      value: labAtt,
      total: labTotal,
      pct: labTotal > 0 ? Math.round((labAtt / labTotal) * 100) : 0,
      fill: '#94a3b8',
    },
  ].filter((d) => d.total > 0);

  // ── Calculations for modules ──
  const assignmentsCompleted = events.filter(e => e.type === 'Assignment' && e.status === 'Completed').length;
  const assignmentsPending = events.filter(e => e.type === 'Assignment' && e.status === 'Pending').length;
  const upcomingExams = events.filter(e => (e.type === 'Mid Semester Exam' || e.type === 'End Semester Exam') && e.status === 'Pending').length;
  const extraClassesAttended = extraClasses.filter(e => e.status === 'CONDUCTED' && e.attendanceStatus === 'PRESENT').length;
  const creditsEarned = attendanceCredits.reduce((sum, c) => sum + c.credits, 0);
  const totalHolidayDays = holidays.filter(h => h.type === 'GLOBAL' || h.type === 'SINGLE_DAY').length;
  const subjectHolidaysCount = holidays.filter(h => h.type === 'SUBJECT').length;

  return (
    <div className="space-y-6 text-foreground max-w-7xl mx-auto p-1">
      {isBeforeStartDate && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300 text-xs flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span>Semester start date is set in the future ({onboarding.startDate}). Displaying projected schedule metrics and target analysis.</span>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Activity className="text-muted-foreground" />
          Analytics Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Detailed metrics showing attendance trends, component distributions, and academic tasks performance.
        </p>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Overall Average</p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {overallStats.attendancePercentage !== null ? `${overallStats.attendancePercentage.toFixed(1)}%` : '--'}
          </p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Across all registered subjects</span>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Conducted Lectures</p>
          <p className="text-2xl font-bold text-foreground mt-1">{conductedCount}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{overallStats.conducted} Total Attendance Units</span>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Duty Credits Earned</p>
          <p className="text-2xl font-bold text-foreground mt-1">+{creditsEarned}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Added directly to present counts</span>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-sm">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Assignments Completed</p>
          <p className="text-2xl font-bold text-foreground mt-1">{assignmentsCompleted}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{assignmentsPending} Pending / Overdue</span>
        </div>

      </div>

      {/* Main Charts block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Over Time */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Weekly Attendance Trend</h3>
            <p className="text-xs text-muted-foreground">Comparative trajectory of weekly vs cumulative averages</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="weekly" name="Weekly Avg" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cumulative" name="Cumulative Avg" stroke="var(--foreground)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Component breakdown (Theory vs Lab) */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4 flex flex-col">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Component Distribution</h3>
            <p className="text-xs text-muted-foreground">Attendance split by lecture component type</p>
          </div>
          
          {tvlData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              No component data recorded yet.
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center space-y-4">
              <div className="h-40 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tvlData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                    >
                      {tvlData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Ratio</span>
                  <span className="text-lg font-bold text-foreground">
                    {Math.round((tvlData[0]?.value / ((tvlData[0]?.value + tvlData[1]?.value) || 1)) * 100)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs border-t border-border pt-4">
                {tvlData.map(d => (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                      <span>{d.name} Component</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {d.pct}% ({d.value}/{d.total} units)
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Subject Targets Compare */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Subject Standings Bar Chart */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Subject Wise Breakdown</h3>
            <p className="text-xs text-muted-foreground">Compare attendance standings against targets</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="percentage" name="Attendance %" radius={[4, 4, 0, 0]}>
                  {subjectBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Modules statistics summary */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Academic OS Metrics</h3>
            <p className="text-xs text-muted-foreground">Consolidated logs of secondary modules</p>
          </div>

          <div className="space-y-3.5 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Assignments Completed</span>
              <span className="font-bold text-foreground">{assignmentsCompleted} logs</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Upcoming Exams Scheduled</span>
              <span className="font-bold text-foreground">{upcomingExams} events</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Extra Classes Attended</span>
              <span className="font-bold text-foreground">{extraClassesAttended} lectures</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Semester Holidays Logged</span>
              <span className="font-bold text-foreground">{totalHolidayDays} days</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Subject Specific Holidays</span>
              <span className="font-bold text-foreground">{subjectHolidaysCount} events</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
