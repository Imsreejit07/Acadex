'use client';

import { useSyncExternalStore } from 'react';
import {
  aggregateAttendanceStats,
  calculateAttendance,
  calculateSafeSkip,
  type AttendanceStats,
} from './attendance-engine';

export type ComponentType = 'THEORY' | 'LAB' | 'TUTORIAL' | 'WORKSHOP' | 'SEMINAR' | 'OTHER';
type LectureStatus = 'SCHEDULED' | 'CONDUCTED' | 'CANCELLED' | 'HOLIDAY';
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'MEDICAL_LEAVE' | 'DUTY_LEAVE';

export interface AcademicEvent {
  id: string;
  subjectName: string;
  title: string;
  type: 'Assignment' | 'Quiz' | 'Mid Semester Exam' | 'End Semester Exam' | 'Lab Evaluation' | 'Viva' | 'Project' | 'Presentation' | 'Holiday' | 'Semester Break' | 'Registration' | 'Orientation' | 'Other Global Events' | 'Other';
  dueDate: string;
  endDate?: string;
  dueTime: string;
  startTime?: string;
  endTime?: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'Completed' | 'Missed';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holiday {
  id: string;
  title: string;
  type: 'GLOBAL' | 'SUBJECT' | 'SINGLE_DAY';
  startDate: string;
  endDate: string;
  subjectName?: string;
  reason?: string;
}

export interface ExtraClass {
  id: string;
  subjectName: string;
  faculty?: string;
  date: string;
  startTime: string;
  endTime: string;
  componentType: ComponentType;
  reason?: string;
  isMandatory: boolean;
  attendanceStatus: AttendanceStatus | null;
  status: LectureStatus;
}

export interface RescheduledClass {
  id: string;
  originalLectureId: string;
  newDate: string;
  newStartTime: string;
  newEndTime: string;
  reason?: string;
  attendanceStatus: AttendanceStatus | null;
}

export interface AttendanceCredit {
  id: string;
  subjectName: string;
  reason: string;
  credits: number;
  date: string;
  approvedBy?: string;
  notes?: string;
}

export interface SubjectConfig {
  id: string;
  name: string;
  code?: string;
  faculty?: string;
  credits?: number | null;
  color?: string;
  hasLab?: boolean;
  theoryTarget?: number;
  labTarget?: number;
}

export interface TimetableEntry {
  day: string;
  subjectName: string;
  componentType: ComponentType;
  startTime: string;
  endTime: string;
  manualOverrideType?: string;
}

export interface OnboardingData {
  userName?: string;
  semesterName?: string;
  academicYear?: string;
  startDate?: string;
  subjects?: SubjectConfig[];
  timetableEntries?: TimetableEntry[];
  /** Date when the user completed onboarding (mid-semester). Defaults to startDate when not set. */
  onboardingCompletedAt?: string;
  /** Whether mid-semester backfill has been applied (ensures it only runs once). */
  midSemesterBackfilled?: boolean;
}

export interface AttendanceOverride {
  lectureId: string;
  status: LectureStatus;
  attendance: AttendanceStatus | null;
}

export interface LectureInstance {
  id: string;
  subjectName: string;
  componentType: ComponentType;
  date: string;
  startTime: string;
  endTime: string;
  status: LectureStatus;
  attendance: AttendanceStatus | null;
}

export interface SubjectAttendanceSummary {
  subject: SubjectConfig;
  stats: AttendanceStats;
  target: number;
  missableClasses: number;
}

const ONBOARDING_KEY = 'onboarding_data';
const ATTENDANCE_KEY = 'attendance_overrides';
const STORE_EVENT = 'attendance-tool-store-change';

const defaultData: Required<Pick<OnboardingData, 'semesterName' | 'academicYear' | 'subjects' | 'timetableEntries'>> & OnboardingData = {
  semesterName: '',
  academicYear: '',
  startDate: '',
  subjects: [],
  timetableEntries: [],
  onboardingCompletedAt: '',
  midSemesterBackfilled: false,
};

const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  const value = window.localStorage.getItem(key);
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(STORE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(STORE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getSnapshot() {
  const saved = readJson<OnboardingData>(ONBOARDING_KEY, {});
  const onboarding = {
    ...defaultData,
    ...saved,
    subjects: saved.subjects?.length ? saved.subjects : defaultData.subjects,
    timetableEntries: saved.timetableEntries?.length ? saved.timetableEntries : defaultData.timetableEntries,
  };
  const overrides = readJson<AttendanceOverride[]>(ATTENDANCE_KEY, []);
  
  const events = readJson<AcademicEvent[]>('academic_events', []);
  const holidays = readJson<Holiday[]>('holidays_list', []);
  const extraClasses = readJson<ExtraClass[]>('extra_classes', []);
  const rescheduledClasses = readJson<RescheduledClass[]>('rescheduled_classes', []);
  const attendanceCredits = readJson<AttendanceCredit[]>('attendance_credits', []);

  return JSON.stringify({ onboarding, overrides, events, holidays, extraClasses, rescheduledClasses, attendanceCredits });
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getResolvedComponentType(
  entry: { startTime: string; endTime: string; componentType?: string; manualOverrideType?: string; subjectName: string },
  subjects: Array<{ name: string; hasLab?: boolean }>
): string {
  if (entry.manualOverrideType) {
    return entry.manualOverrideType;
  }
  const subject = subjects?.find((s) => s.name === entry.subjectName);
  if (subject?.hasLab) {
    try {
      const [startH, startM] = entry.startTime.split(':').map(Number);
      const [endH, endM] = entry.endTime.split(':').map(Number);
      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (durationMinutes >= 100) {
        return 'LAB';
      }
    } catch (e) {}
  }
  return entry.componentType || 'THEORY';
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function buildLectureId(entry: TimetableEntry, date: string, resolvedType: string) {
  return [
    date,
    entry.day.toUpperCase(),
    entry.subjectName,
    resolvedType,
    entry.startTime,
    entry.endTime,
  ].join('|');
}

function getLectures(
  onboarding: OnboardingData, 
  overrides: AttendanceOverride[], 
  holidays: Holiday[],
  extraClasses: ExtraClass[],
  rescheduledClasses: RescheduledClass[],
  today = new Date()
): LectureInstance[] {
  if (!onboarding.startDate) return [];

  const start = dateOnly(onboarding.startDate);
  const end = dateOnly(formatDate(today));
  if (end < start) return [];

  const todayDateStr = formatDate(today);

  const overrideMap = new Map(overrides.map((override) => [override.lectureId, override]));
  const rescheduleMap = new Map(rescheduledClasses.map((rc) => [rc.originalLectureId, rc]));
  const lectures: LectureInstance[] = [];

  // Determine the onboarding completion date for mid-semester backfill
  const onboardingDate = onboarding.onboardingCompletedAt
    ? dateOnly(onboarding.onboardingCompletedAt)
    : null;
  const isMidSemester = onboardingDate && onboardingDate > start;

  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateString = formatDate(date);
    const day = dayNames[date.getDay()];

    const globalHoliday = holidays.find(h => 
      (h.type === 'GLOBAL' || h.type === 'SINGLE_DAY') && 
      dateString >= h.startDate && dateString <= h.endDate
    );

    for (const entry of onboarding.timetableEntries || []) {
      if (entry.day.toUpperCase() !== day) continue;

      const resolvedType = getResolvedComponentType(entry, onboarding.subjects || []);
      const id = buildLectureId(entry, dateString, resolvedType);
      
      const subjectHoliday = holidays.find(h =>
        h.type === 'SUBJECT' &&
        h.subjectName === entry.subjectName &&
        dateString >= h.startDate && dateString <= h.endDate
      );

      const isHoliday = !!globalHoliday || !!subjectHoliday;
      const reschedule = rescheduleMap.get(id);

      if (isHoliday) {
        lectures.push({
          id,
          subjectName: entry.subjectName,
          componentType: resolvedType as any,
          date: dateString,
          startTime: entry.startTime,
          endTime: entry.endTime,
          status: 'HOLIDAY',
          attendance: null,
        });
        continue;
      }

      if (reschedule) {
        lectures.push({
          id,
          subjectName: entry.subjectName,
          componentType: resolvedType as any,
          date: dateString,
          startTime: entry.startTime,
          endTime: entry.endTime,
          status: 'CANCELLED',
          attendance: null,
        });
        continue;
      }

      const override = overrideMap.get(id);

      // If an override exists, use it (user has already made a decision)
      if (override) {
        lectures.push({
          id,
          subjectName: entry.subjectName,
          componentType: resolvedType as any,
          date: dateString,
          startTime: entry.startTime,
          endTime: entry.endTime,
          status: override?.status || 'SCHEDULED',
          attendance: override?.attendance || null,
        });
        continue;
      }

      // Mid-semester onboarding: Mark all lectures before onboarding date as PRESENT
      if (isMidSemester && date <= onboardingDate) {
        lectures.push({
          id,
          subjectName: entry.subjectName,
          componentType: resolvedType as any,
          date: dateString,
          startTime: entry.startTime,
          endTime: entry.endTime,
          status: 'CONDUCTED',
          attendance: 'PRESENT',
        });
        continue;
      }

      // Default: if class date is strictly in the past (before today), default to Conducted & Present
      const isPast = dateString < todayDateStr;
      lectures.push({
        id,
        subjectName: entry.subjectName,
        componentType: resolvedType as any,
        date: dateString,
        startTime: entry.startTime,
        endTime: entry.endTime,
        status: isPast ? 'CONDUCTED' : 'SCHEDULED',
        attendance: isPast ? 'PRESENT' : null,
      });
    }
  }

  // Append Extra Classes
  for (const ec of extraClasses) {
    const ecDate = dateOnly(ec.date);
    if (ecDate <= end) {
      lectures.push({
        id: `extra|${ec.id}`,
        subjectName: ec.subjectName,
        componentType: ec.componentType,
        date: ec.date,
        startTime: ec.startTime,
        endTime: ec.endTime,
        status: ec.status,
        attendance: ec.attendanceStatus,
      });
    }
  }

  // Append Rescheduled Makeup Classes
  for (const rc of rescheduledClasses) {
    const rcDate = dateOnly(rc.newDate);
    if (rcDate <= end) {
      const originalParts = rc.originalLectureId.split('|');
      const subjectName = originalParts[2] || 'Rescheduled Class';
      const compType = (originalParts[3] || 'THEORY') as ComponentType;
      
      lectures.push({
        id: `rescheduled|${rc.id}`,
        subjectName,
        componentType: compType,
        date: rc.newDate,
        startTime: rc.newStartTime,
        endTime: rc.newEndTime,
        status: 'CONDUCTED',
        attendance: rc.attendanceStatus,
      });
    }
  }

  return lectures.sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
}

function toEngineLecture(lecture: LectureInstance) {
  return {
    id: lecture.id,
    semester_id: '',
    component_id: '',
    lecture_date: lecture.date,
    start_time: lecture.startTime,
    end_time: lecture.endTime,
    component_type: lecture.componentType,
    status: lecture.status,
    generated_from_timetable: true,
    original_timetable_slot: null,
    notes: null,
    created_at: '',
    updated_at: '',
    attendance: lecture.attendance ? {
      id: lecture.id,
      lecture_occurrence_id: lecture.id,
      attendance_status: lecture.attendance,
      remarks: null,
      created_at: '',
      updated_at: '',
    } : null,
  };
}

export function useAttendanceStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => JSON.stringify({ 
    onboarding: defaultData, 
    overrides: [],
    events: [],
    holidays: [],
    extraClasses: [],
    rescheduledClasses: [],
    attendanceCredits: []
  }));
  
  const parsed = JSON.parse(snapshot) as { 
    onboarding: OnboardingData; 
    overrides: AttendanceOverride[];
    events: AcademicEvent[];
    holidays: Holiday[];
    extraClasses: ExtraClass[];
    rescheduledClasses: RescheduledClass[];
    attendanceCredits: AttendanceCredit[];
  };

  const lectures = getLectures(
    parsed.onboarding, 
    parsed.overrides,
    parsed.holidays,
    parsed.extraClasses,
    parsed.rescheduledClasses
  );

  const isBeforeStartDate = Boolean(parsed.onboarding.startDate) && dateOnly(formatDate(new Date())) < dateOnly(parsed.onboarding.startDate || '');

  const bySubject = (parsed.onboarding.subjects || []).map((subject) => {
    const subjectLectures = lectures.filter((lecture) => lecture.subjectName === subject.name);
    
    const theoryLectures = subjectLectures.filter((l) => l.componentType !== 'LAB');
    const labLectures = subjectLectures.filter((l) => l.componentType === 'LAB');

    const theoryStats = calculateAttendance(theoryLectures.map(toEngineLecture));
    const labStats = calculateAttendance(labLectures.map(toEngineLecture));
    const overallStats = calculateAttendance(subjectLectures.map(toEngineLecture));

    // Incorporate Attendance Credits: adds to PRESENT count without increasing CONDUCTED count!
    const subjectCredits = parsed.attendanceCredits
      .filter(c => c.subjectName === subject.name)
      .reduce((sum, c) => sum + c.credits, 0);

    if (subjectCredits > 0) {
      theoryStats.present += subjectCredits;
      theoryStats.attendancePercentage = theoryStats.conducted > 0 
        ? Math.min(100, (theoryStats.present / theoryStats.conducted) * 100) 
        : null;

      overallStats.present += subjectCredits;
      overallStats.attendancePercentage = overallStats.conducted > 0 
        ? Math.min(100, (overallStats.present / overallStats.conducted) * 100) 
        : null;
    }

    const theoryTarget = subject.theoryTarget ?? 75;
    const labTarget = subject.labTarget ?? 75;

    return {
      subject,
      theoryStats,
      labStats,
      overallStats,
      stats: overallStats, // backwards compatibility
      target: theoryTarget,
      labTarget,
      missableClasses: calculateSafeSkip(overallStats.present, overallStats.conducted, theoryTarget).safeSkips,
    };
  });

  const theoryLectures = lectures.filter((l) => l.componentType !== 'LAB');
  const labLectures = lectures.filter((l) => l.componentType === 'LAB');

  const totalTheoryStats = calculateAttendance(theoryLectures.map(toEngineLecture));
  const totalLabStats = calculateAttendance(labLectures.map(toEngineLecture));
  const overallStats = calculateAttendance(lectures.map(toEngineLecture));

  const totalCredits = parsed.attendanceCredits.reduce((sum, c) => sum + c.credits, 0);
  if (totalCredits > 0) {
    totalTheoryStats.present += totalCredits;
    totalTheoryStats.attendancePercentage = totalTheoryStats.conducted > 0
      ? Math.min(100, (totalTheoryStats.present / totalTheoryStats.conducted) * 100)
      : null;

    overallStats.present += totalCredits;
    overallStats.attendancePercentage = overallStats.conducted > 0
      ? Math.min(100, (overallStats.present / overallStats.conducted) * 100)
      : null;
  }

  return {
    onboarding: parsed.onboarding,
    overrides: parsed.overrides,
    events: parsed.events,
    holidays: parsed.holidays,
    extraClasses: parsed.extraClasses,
    rescheduledClasses: parsed.rescheduledClasses,
    attendanceCredits: parsed.attendanceCredits,
    lectures,
    isBeforeStartDate,
    subjectSummaries: bySubject,
    overallStats,
    totalTheoryStats,
    totalLabStats,
    
    setOnboarding(data: OnboardingData) {
      writeJson(ONBOARDING_KEY, data);
    },
    setLectureStatus(lectureId: string, status: LectureStatus, attendance: AttendanceStatus | null) {
      const next = parsed.overrides.filter((override) => override.lectureId !== lectureId);
      next.push({ lectureId, status, attendance: status === 'CONDUCTED' ? attendance : null });
      writeJson(ATTENDANCE_KEY, next);
    },
    
    setEvents(nextEvents: AcademicEvent[]) {
      writeJson('academic_events', nextEvents);
    },
    setHolidays(nextHolidays: Holiday[]) {
      writeJson('holidays_list', nextHolidays);
    },
    setExtraClasses(nextExtra: ExtraClass[]) {
      writeJson('extra_classes', nextExtra);
    },
    setRescheduledClasses(nextRescheduled: RescheduledClass[]) {
      writeJson('rescheduled_classes', nextRescheduled);
    },
    setAttendanceCredits(nextCredits: AttendanceCredit[]) {
      writeJson('attendance_credits', nextCredits);
    },
    deleteLecture(lectureId: string) {
      // For extra classes: remove from extra_classes list
      if (lectureId.startsWith('extra|')) {
        const extraId = lectureId.replace('extra|', '');
        const next = parsed.extraClasses.filter(ec => ec.id !== extraId);
        writeJson('extra_classes', next);
        return;
      }
      // For rescheduled classes: remove from rescheduled_classes list
      if (lectureId.startsWith('rescheduled|')) {
        const rcId = lectureId.replace('rescheduled|', '');
        const next = parsed.rescheduledClasses.filter(rc => rc.id !== rcId);
        writeJson('rescheduled_classes', next);
        return;
      }
      // For regular lectures: remove the override (resets to default computed state)
      const next = parsed.overrides.filter(o => o.lectureId !== lectureId);
      writeJson(ATTENDANCE_KEY, next);
    }
  };
}