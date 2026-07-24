'use client';

import { useSyncExternalStore, useState, useEffect } from 'react';
import {
  aggregateAttendanceStats,
  calculateAttendance,
  calculateSafeSkip,
  type AttendanceStats,
} from './attendance-engine';
import { saveStateToSupabase } from '@/shared/lib/supabase-service';
import {
  resolveVersionForDate,
  migrateFromLegacy,
  migrateOverrideKeys,
  buildVersionedLectureId,
  createNewVersion as createNewVersionUtil,
  getActiveVersion,
  validateVersionIntegrity,
} from '@/features/timetable/services/timetable-version-store';

export type ComponentType = 'THEORY' | 'LAB' | 'TUTORIAL' | 'WORKSHOP' | 'SEMINAR' | 'OTHER';
export type LectureStatus = 'SCHEDULED' | 'CONDUCTED' | 'CANCELLED' | 'HOLIDAY';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'MEDICAL_LEAVE' | 'DUTY_LEAVE';

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
  /** Baseline Attendance: user-entered starting attended count when starting mid-semester or after reset */
  baselineAttended?: number;
  /** Baseline Attendance: user-entered starting missed count when starting mid-semester or after reset */
  baselineMissed?: number;
  /** Manual Attendance Fallback System: user-specified attended class delta/adjustment */
  manualAttendedAdjustment?: number;
  /** Manual Attendance Fallback System: user-specified total conducted class delta/adjustment */
  manualTotalAdjustment?: number;
}

export interface TimetableEntry {
  day: string;
  subjectName: string;
  componentType: ComponentType;
  startTime: string;
  endTime: string;
  manualOverrideType?: string;
}

/**
 * A single versioned timetable. The timetable is active from `effectiveFrom`
 * until `effectiveUntil` (null = currently active, open-ended).
 * Historical versions are immutable once referenced by lecture logs.
 */
export interface TimetableVersion {
  id: string;
  versionNumber: number;
  effectiveFrom: string;  // ISO date YYYY-MM-DD
  effectiveUntil: string | null; // null = currently active
  status: 'ACTIVE' | 'HISTORICAL' | 'SCHEDULED';
  createdAt: string;
  entries: TimetableEntry[];
}

export interface OnboardingData {
  userName?: string;
  semesterName?: string;
  academicYear?: string;
  startDate?: string;
  subjects?: SubjectConfig[];
  /**
   * @deprecated Use timetableVersions instead.
   * Kept for migration purposes only — will be consumed once on first boot
   * and converted into timetableVersions[0] (Version 1).
   */
  timetableEntries?: TimetableEntry[];
  /**
   * All timetable versions for this semester, ordered by effectiveFrom.
   * This replaces the legacy flat timetableEntries array.
   */
  timetableVersions?: TimetableVersion[];
  /** Date when the user completed onboarding (mid-semester). Defaults to startDate when not set. */
  onboardingCompletedAt?: string;
  /** Whether mid-semester backfill has been applied (ensures it only runs once). */
  midSemesterBackfilled?: boolean;
  /** Tracks whether override keys have been migrated to the 7-part versioned format. */
  overrideKeysMigrated?: boolean;
  /** Cutoff date for historical lecture generation. Dates prior to this generate NO automatic lectures. */
  historyClearedAt?: string;
}

/**
 * An override record for a single lecture occurrence.
 * Supports full field editing — not just status/attendance.
 */
export interface AttendanceOverride {
  lectureId: string;
  status: LectureStatus;
  attendance: AttendanceStatus | null;
  // Optional editable field overrides (non-null = user has manually changed this field)
  subjectNameOverride?: string;
  componentTypeOverride?: ComponentType;
  dateOverride?: string;
  startTimeOverride?: string;
  endTimeOverride?: string;
  notesOverride?: string;
}

/** Payload for the editLectureRecord() store mutation */
export interface LectureEditPayload {
  subjectName?: string;
  componentType?: ComponentType;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: LectureStatus;
  attendance?: AttendanceStatus | null;
  notes?: string;
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

const defaultData: OnboardingData = {
  semesterName: '',
  academicYear: '',
  startDate: '',
  subjects: [],
  timetableEntries: [],
  timetableVersions: [],
  onboardingCompletedAt: '',
  midSemesterBackfilled: false,
  overrideKeysMigrated: false,
};

const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ─── Supabase sync debounce ──────────────────────────────────────────────────
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncToSupabase() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const parsed = JSON.parse(getSnapshot()) as {
      onboarding: OnboardingData;
      overrides: AttendanceOverride[];
      events: AcademicEvent[];
      holidays: Holiday[];
      extraClasses: ExtraClass[];
      rescheduledClasses: RescheduledClass[];
      attendanceCredits: AttendanceCredit[];
    };
    saveStateToSupabase(parsed).catch(err =>
      console.warn('Background Supabase sync failed:', err)
    );
  }, 1500);
}

// ─── Notification helper ─────────────────────────────────────────────────────
export function showNativeNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  const trigger = () => {
    try { new window.Notification(title, { body }); } catch (e) { console.warn(e); }
  };
  if (window.Notification.permission === 'granted') {
    trigger();
  } else if (window.Notification.permission !== 'denied') {
    window.Notification.requestPermission().then(p => { if (p === 'granted') trigger(); });
  }
}

// ─── Preference helper ───────────────────────────────────────────────────────
export function savePreference(key: string, value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(STORE_EVENT));
}

// ─── Supabase cloud load ─────────────────────────────────────────────────────
let cloudInitialized = false;
let cloudHydrated = false;

export async function initializeSqliteState(force = false) {
  if (typeof window === 'undefined') return;
  if (cloudInitialized && !force) return;
  cloudInitialized = true;

  try {
    const { loadStateFromSupabase } = await import('@/shared/lib/supabase-service');
    await loadStateFromSupabase();
    cloudHydrated = true;
    window.dispatchEvent(new Event(STORE_EVENT));
  } catch (err) {
    cloudHydrated = true;
    console.warn('Could not load from Supabase (user may not be logged in):', err);
  }
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────
function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function writeJson(key: string, value: unknown) {
  const jsonStr = JSON.stringify(value);
  window.localStorage.setItem(key, jsonStr);
  window.dispatchEvent(new Event(STORE_EVENT));
  scheduleSyncToSupabase();
}

function subscribe(callback: () => void) {
  const handleStorageChange = (e: StorageEvent) => {
    // Ignore non-app-state keys like theme
    if (e.key && ['theme', 'supabase_semester_id'].includes(e.key)) return;
    // Ignore empty onboarding payloads dispatched by unhydrated tabs
    if (e.key === ONBOARDING_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (!parsed.subjects || parsed.subjects.length === 0) return;
      } catch {}
    }
    callback();
  };

  window.addEventListener(STORE_EVENT, callback);
  window.addEventListener('storage', handleStorageChange);
  return () => {
    window.removeEventListener(STORE_EVENT, callback);
    window.removeEventListener('storage', handleStorageChange);
  };
}

// ─── AUTO-MIGRATIONS ──────────────────────────────────────────────────────────
// Run migrations synchronously on script load, BEFORE React hydrates.
// This prevents hydration mismatches because getSnapshot will read the already-migrated data.
if (typeof window !== 'undefined') {
  try {
    const rawOnboarding = window.localStorage.getItem(ONBOARDING_KEY);
    if (rawOnboarding) {
      const parsed = JSON.parse(rawOnboarding) as OnboardingData;
      let changed = false;

      // 1. Timetable versioning migration
      const needsVersionMigration =
        (!parsed.timetableVersions || parsed.timetableVersions.length === 0) &&
        (parsed.timetableEntries && parsed.timetableEntries.length > 0);

      if (needsVersionMigration) {
        parsed.timetableVersions = migrateFromLegacy(parsed.timetableEntries, parsed.startDate, []);
        changed = true;
        console.info('[Acadex Migration] Wrapped legacy timetableEntries as TimetableVersion 1:', parsed.timetableVersions[0]?.id);
      }

      // 2. Attendance override keys migration (6-part -> 7-part)
      const rawOverrides = window.localStorage.getItem(ATTENDANCE_KEY);
      if (rawOverrides) {
        const overrides = JSON.parse(rawOverrides) as AttendanceOverride[];
        const versions = parsed.timetableVersions || [];
        
        if (!parsed.overrideKeysMigrated && versions.length > 0 && overrides.length > 0) {
          const migratedOverrides = migrateOverrideKeys(overrides, versions);
          if (migratedOverrides.some((o, i) => o.lectureId !== overrides[i]?.lectureId)) {
            window.localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(migratedOverrides));
          }
          parsed.overrideKeysMigrated = true;
          changed = true;
          console.info('[Acadex Migration] Migrated attendance override keys to versioned format.');
        }
      }

      if (changed) {
        window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(parsed));
      }
    }
  } catch (err) {
    console.error('Failed to run Acadex auto-migrations:', err);
  }
}

function getSnapshot() {
  const saved = readJson<OnboardingData>(ONBOARDING_KEY, {});
  let onboarding: OnboardingData = {
    ...defaultData,
    ...saved,
    subjects: saved.subjects?.length ? saved.subjects : defaultData.subjects,
    timetableEntries: saved.timetableEntries?.length ? saved.timetableEntries : defaultData.timetableEntries,
  };

  let overrides = readJson<AttendanceOverride[]>(ATTENDANCE_KEY, []);

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
  if (entry.manualOverrideType) return entry.manualOverrideType;
  const subject = subjects?.find(s => s.name === entry.subjectName);
  if (subject?.hasLab) {
    try {
      const [startH, startM] = entry.startTime.split(':').map(Number);
      const [endH, endM] = entry.endTime.split(':').map(Number);
      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (durationMinutes >= 100) return 'LAB';
    } catch {}
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

export function getLectures(
  onboarding: OnboardingData,
  overrides: AttendanceOverride[],
  holidays: Holiday[],
  extraClasses: ExtraClass[],
  rescheduledClasses: RescheduledClass[],
  today = new Date()
): LectureInstance[] {
  const defaultPastStart = formatDate(new Date(today.getTime() - 30 * 86400000));
  // Effective start date for generating automatic timetable lectures.
  // If the user cleared history and set a baseline, historyClearedAt becomes the cutoff.
  const effectiveStartStr = onboarding.historyClearedAt || onboarding.startDate || defaultPastStart;

  const start = dateOnly(effectiveStartStr);
  const futureDate = new Date(today.getTime() + 14 * 86400000);
  const end = dateOnly(formatDate(futureDate));

  const todayDateStr = formatDate(today);
  // Build override map — keyed by lectureId
  const overrideMap = new Map(overrides.map(override => [override.lectureId, override]));
  const rescheduleMap = new Map(rescheduledClasses.map(rc => [rc.originalLectureId, rc]));
  const lectures: LectureInstance[] = [];

  const onboardingDate = onboarding.onboardingCompletedAt
    ? dateOnly(onboarding.onboardingCompletedAt)
    : null;
  const isMidSemester = onboardingDate && onboardingDate > start;

  // ── Version-aware timetable resolution ──────────────────────────────────────
  // Use timetableVersions if available, otherwise fall back to flat timetableEntries.
  // The fallback ensures backward compatibility during the migration window.
  const versions = onboarding.timetableVersions;
  const hasVersions = versions && versions.length > 0;

  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateString = formatDate(date);
    const day = dayNames[date.getDay()];

    const globalHoliday = holidays.find(h =>
      (h.type === 'GLOBAL' || h.type === 'SINGLE_DAY') &&
      dateString >= h.startDate && dateString <= h.endDate
    );

    // Resolve the correct timetable entries for this specific date
    let dateEntries: TimetableEntry[];
    let activeVersionId: string | null = null;
    if (hasVersions) {
      const version = resolveVersionForDate(versions!, dateString);
      dateEntries = version ? version.entries : [];
      activeVersionId = version ? version.id : null;
    } else {
      // Legacy flat path — no version ID in the lecture ID
      dateEntries = onboarding.timetableEntries || [];
    }

    for (const entry of dateEntries) {
      if (entry.day.toUpperCase() !== day) continue;

      const resolvedType = getResolvedComponentType(entry, onboarding.subjects || []);

      // Build lecture ID — use versioned format if versions exist, legacy format otherwise
      const id = activeVersionId
        ? buildVersionedLectureId(activeVersionId, dateString, day, entry.subjectName, resolvedType, entry.startTime, entry.endTime)
        : buildLectureId(entry, dateString, resolvedType);

      const subjectHoliday = holidays.find(h =>
        h.type === 'SUBJECT' &&
        h.subjectName === entry.subjectName &&
        dateString >= h.startDate && dateString <= h.endDate
      );

      const isHoliday = !!globalHoliday || !!subjectHoliday;
      const reschedule = rescheduleMap.get(id);

      if (isHoliday) {
        lectures.push({ id, subjectName: entry.subjectName, componentType: resolvedType as ComponentType, date: dateString, startTime: entry.startTime, endTime: entry.endTime, status: 'HOLIDAY', attendance: null });
        continue;
      }

      if (reschedule) {
        lectures.push({ id, subjectName: entry.subjectName, componentType: resolvedType as ComponentType, date: dateString, startTime: entry.startTime, endTime: entry.endTime, status: 'CANCELLED', attendance: null });
        continue;
      }

      // Multi-tier override matching:
      // 1. Exact 7-part versioned key match
      // 2. Unversioned legacy 6-part key match
      // 3. Date + Subject fallback match
      let override = overrideMap.get(id);
      if (!override && id.includes('|')) {
        const legacy6PartId = buildLectureId(entry, dateString, resolvedType);
        override = overrideMap.get(legacy6PartId);
      }
      if (!override) {
        override = overrides.find(o => {
          const parts = o.lectureId.split('|');
          const oDate = parts.length === 7 ? parts[1] : parts[0];
          const oSubj = o.subjectNameOverride || (parts.length === 7 ? parts[3] : parts[2]);
          return oDate === dateString && oSubj?.toLowerCase() === entry.subjectName.toLowerCase();
        });
      }

      if (override) {
        // Apply all field-level overrides from the edit payload
        lectures.push({
          id,
          subjectName: override.subjectNameOverride ?? entry.subjectName,
          componentType: (override.componentTypeOverride ?? resolvedType) as ComponentType,
          date: override.dateOverride ?? dateString,
          startTime: override.startTimeOverride ?? entry.startTime,
          endTime: override.endTimeOverride ?? entry.endTime,
          status: override.status ?? 'SCHEDULED',
          attendance: override.attendance ?? null,
        });
        continue;
      }

      if (isMidSemester && date <= onboardingDate) {
        lectures.push({ id, subjectName: entry.subjectName, componentType: resolvedType as ComponentType, date: dateString, startTime: entry.startTime, endTime: entry.endTime, status: 'CONDUCTED', attendance: 'PRESENT' });
        continue;
      }

      const isPast = dateString < todayDateStr;
      lectures.push({ id, subjectName: entry.subjectName, componentType: resolvedType as ComponentType, date: dateString, startTime: entry.startTime, endTime: entry.endTime, status: isPast ? 'CONDUCTED' : 'SCHEDULED', attendance: isPast ? 'PRESENT' : null });
    }
  }

  // Append Extra Classes
  for (const ec of extraClasses) {
    const ecDate = dateOnly(ec.date);
    if (ecDate <= end) {
      lectures.push({ id: `extra|${ec.id}`, subjectName: ec.subjectName, componentType: ec.componentType, date: ec.date, startTime: ec.startTime, endTime: ec.endTime, status: ec.status, attendance: ec.attendanceStatus });
    }
  }

  // Append Rescheduled Makeup Classes
  for (const rc of rescheduledClasses) {
    const rcDate = dateOnly(rc.newDate);
    if (rcDate <= end) {
      // Parse subject/type from the originalLectureId (supports both 6-part and 7-part formats)
      const parts = rc.originalLectureId.split('|');
      const subjectName = parts.length === 7 ? parts[3] : (parts[2] || 'Rescheduled Class');
      const compType = (parts.length === 7 ? parts[4] : (parts[3] || 'THEORY')) as ComponentType;
      lectures.push({ id: `rescheduled|${rc.id}`, subjectName, componentType: compType, date: rc.newDate, startTime: rc.newStartTime, endTime: rc.newEndTime, status: 'CONDUCTED', attendance: rc.attendanceStatus });
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

  const rawSubjects: SubjectConfig[] = (parsed.onboarding.subjects && parsed.onboarding.subjects.length > 0)
    ? parsed.onboarding.subjects
    : Array.from(new Set((parsed.onboarding.timetableEntries || []).map(e => e.subjectName).filter(Boolean))).map((name, idx) => ({
        id: `auto_${idx}_${name}`,
        name,
        code: name.length <= 6 ? name.toUpperCase() : name.slice(0, 6).toUpperCase(),
        faculty: '',
        credits: 3,
        color: '#0ea5e9',
        hasLab: (parsed.onboarding.timetableEntries || []).some(e => e.subjectName === name && e.componentType === 'LAB'),
        theoryTarget: 75,
        labTarget: 75,
        manualAttendedAdjustment: 0,
        manualTotalAdjustment: 0,
      }));

  const bySubject = rawSubjects.map(subject => {
    const subjectLectures = lectures.filter(l => l.subjectName === subject.name);
    const theoryLectures = subjectLectures.filter(l => l.componentType !== 'LAB');
    const labLectures = subjectLectures.filter(l => l.componentType === 'LAB');

    const theoryStats = calculateAttendance(theoryLectures.map(toEngineLecture));
    const labStats = calculateAttendance(labLectures.map(toEngineLecture));
    const overallStats = calculateAttendance(subjectLectures.map(toEngineLecture));

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

    // Apply Baseline Attendance (starting counts when starting mid-semester or after reset)
    const baselineAttended = subject.baselineAttended || 0;
    const baselineMissed = subject.baselineMissed || 0;
    const baselineConducted = baselineAttended + baselineMissed;

    // Apply Manual Attendance Fallback System Adjustments
    const manualAttended = subject.manualAttendedAdjustment || 0;
    const manualTotal = subject.manualTotalAdjustment || 0;

    const totalAttendedAdd = baselineAttended + manualAttended;
    const totalConductedAdd = baselineConducted + manualTotal;

    if (totalAttendedAdd !== 0 || totalConductedAdd !== 0) {
      overallStats.present = Math.max(0, overallStats.present + totalAttendedAdd);
      overallStats.conducted = Math.max(overallStats.present, overallStats.conducted + totalConductedAdd);
      overallStats.attendancePercentage = overallStats.conducted > 0
        ? Math.round(Math.min(100, (overallStats.present / overallStats.conducted) * 100) * 100) / 100
        : null;

      theoryStats.present = Math.max(0, theoryStats.present + totalAttendedAdd);
      theoryStats.conducted = Math.max(theoryStats.present, theoryStats.conducted + totalConductedAdd);
      theoryStats.attendancePercentage = theoryStats.conducted > 0
        ? Math.round(Math.min(100, (theoryStats.present / theoryStats.conducted) * 100) * 100) / 100
        : null;
    }

    const theoryTarget = subject.theoryTarget ?? 75;
    const labTarget = subject.labTarget ?? 75;

    return {
      subject,
      theoryStats,
      labStats,
      overallStats,
      stats: overallStats,
      target: theoryTarget,
      labTarget,
      missableClasses: calculateSafeSkip(overallStats.present, overallStats.conducted, theoryTarget).safeSkips,
    };
  });

  const theoryLectures = lectures.filter(l => l.componentType !== 'LAB');
  const labLectures = lectures.filter(l => l.componentType === 'LAB');

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

  const isHydrated = cloudHydrated || (typeof window !== 'undefined' && Boolean(localStorage.getItem('onboarding_data')));

  // Derive the active timetable version's entries for use in components that need "today's timetable"
  const timetableVersions = parsed.onboarding.timetableVersions || [];
  const activeVersionEntries = (() => {
    if (timetableVersions.length > 0) {
      const todayStr = formatDate(new Date());
      const active = resolveVersionForDate(timetableVersions, todayStr);
      return active ? active.entries : (timetableVersions[timetableVersions.length - 1]?.entries || []);
    }
    return parsed.onboarding.timetableEntries || [];
  })();

  return {
    isHydrated,
    onboarding: parsed.onboarding,
    timetableVersions,
    /** Entries from the currently-active timetable version */
    activeTimetableEntries: activeVersionEntries,
    subjects: rawSubjects,
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

    /**
     * Creates a new timetable version effective from `effectiveFrom`.
     * The previous active version is automatically closed one day before.
     * Existing lecture history is NEVER modified.
     */
    applyNewTimetableVersion(entries: TimetableEntry[], effectiveFrom: string) {
      const currentVersions = parsed.onboarding.timetableVersions || [];
      const updatedVersions = createNewVersionUtil(currentVersions, entries, effectiveFrom);
      const warnings = validateVersionIntegrity(updatedVersions);
      if (warnings.length > 0) {
        console.warn('[Timetable Versioning] Version integrity warnings:', warnings);
      }
      writeJson(ONBOARDING_KEY, {
        ...parsed.onboarding,
        timetableVersions: updatedVersions,
      });
    },

    /**
     * @deprecated Use applyNewTimetableVersion() instead for any edit that should
     * create a new timetable version. This method is kept for direct onboarding data writes only.
     */
    setLectureStatus(lectureId: string, status: LectureStatus, attendance: AttendanceStatus | null) {
      const next = parsed.overrides.filter(override => override.lectureId !== lectureId);
      next.push({ lectureId, status, attendance: status === 'CONDUCTED' ? attendance : null });
      writeJson(ATTENDANCE_KEY, next);
    },

    /**
     * Edits any fields of a historical lecture record.
     * This creates or updates an override entry for the lecture.
     * All downstream stats (attendance %, analytics, etc.) recalculate automatically
     * because they are derived from getLectures() on every render.
     */
    editLectureRecord(lectureId: string, edits: LectureEditPayload) {
      const existing = parsed.overrides.find(o => o.lectureId === lectureId);
      const next = parsed.overrides.filter(o => o.lectureId !== lectureId);

      const updatedOverride: AttendanceOverride = {
        // Preserve any existing override fields
        ...existing,
        lectureId,
        // Status and attendance (required fields with defaults)
        status: edits.status ?? existing?.status ?? 'CONDUCTED',
        attendance: edits.status === 'CANCELLED' || edits.status === 'HOLIDAY'
          ? null
          : (edits.attendance !== undefined ? edits.attendance : (existing?.attendance ?? null)),
        // Optional editable field overrides
        ...(edits.subjectName !== undefined && { subjectNameOverride: edits.subjectName }),
        ...(edits.componentType !== undefined && { componentTypeOverride: edits.componentType }),
        ...(edits.date !== undefined && { dateOverride: edits.date }),
        ...(edits.startTime !== undefined && { startTimeOverride: edits.startTime }),
        ...(edits.endTime !== undefined && { endTimeOverride: edits.endTime }),
        ...(edits.notes !== undefined && { notesOverride: edits.notes }),
      };

      next.push(updatedOverride);
      writeJson(ATTENDANCE_KEY, next);
    },

    /**
     * Sets manual attendance fallback adjustments for a specific subject.
     * Works independently of lecture history.
     */
    setSubjectManualAdjustment(subjectId: string, attendedAdj: number, totalAdj: number) {
      const subjects = (parsed.onboarding.subjects || []).map(s => {
        if (s.id === subjectId) {
          return {
            ...s,
            manualAttendedAdjustment: attendedAdj,
            manualTotalAdjustment: totalAdj,
          };
        }
        return s;
      });
      writeJson(ONBOARDING_KEY, {
        ...parsed.onboarding,
        subjects,
      });
    },

    setEvents(nextEvents: AcademicEvent[]) { writeJson('academic_events', nextEvents); },
    setHolidays(nextHolidays: Holiday[]) { writeJson('holidays_list', nextHolidays); },
    setExtraClasses(nextExtra: ExtraClass[]) { writeJson('extra_classes', nextExtra); },
    setRescheduledClasses(nextRescheduled: RescheduledClass[]) { writeJson('rescheduled_classes', nextRescheduled); },
    setAttendanceCredits(nextCredits: AttendanceCredit[]) { writeJson('attendance_credits', nextCredits); },

    deleteLecture(lectureId: string) {
      if (lectureId.startsWith('extra|')) {
        const extraId = lectureId.replace('extra|', '');
        writeJson('extra_classes', parsed.extraClasses.filter(ec => ec.id !== extraId));
        return;
      }
      if (lectureId.startsWith('rescheduled|')) {
        const rcId = lectureId.replace('rescheduled|', '');
        writeJson('rescheduled_classes', parsed.rescheduledClasses.filter(rc => rc.id !== rcId));
        return;
      }
      writeJson(ATTENDANCE_KEY, parsed.overrides.filter(o => o.lectureId !== lectureId));
    },

    /**
     * Clears all lecture logs, overrides, extra classes, rescheduled classes,
     * attendance credits, and manual subject adjustments.
     * Sets historyClearedAt to today so past lectures are NOT automatically regenerated.
     */
    clearAllLogsAndSetBaselineDate(todayString = formatDate(new Date())) {
      writeJson(ATTENDANCE_KEY, []);
      writeJson('extra_classes', []);
      writeJson('rescheduled_classes', []);
      writeJson('attendance_credits', []);

      const subjects = (parsed.onboarding.subjects || []).map(s => ({
        ...s,
        manualAttendedAdjustment: 0,
        manualTotalAdjustment: 0,
      }));

      writeJson(ONBOARDING_KEY, {
        ...parsed.onboarding,
        historyClearedAt: todayString,
        subjects,
      });
    },

    /**
     * Sets baseline starting attendance for all subjects at once.
     */
    setAllSubjectBaselines(baselines: Array<{ subjectId: string; attended: number; missed: number }>) {
      const baselineMap = new Map(baselines.map(b => [b.subjectId, b]));
      const subjects = (parsed.onboarding.subjects || []).map(s => {
        const b = baselineMap.get(s.id);
        if (b) {
          return {
            ...s,
            baselineAttended: Math.max(0, b.attended),
            baselineMissed: Math.max(0, b.missed),
          };
        }
        return s;
      });

      writeJson(ONBOARDING_KEY, {
        ...parsed.onboarding,
        subjects,
      });
    },

    /**
     * Explicitly regenerates past lecture history starting from the semester start date.
     * Resets historyClearedAt.
     */
    regenerateHistoryFromStart() {
      const updatedOnboarding = { ...parsed.onboarding };
      delete updatedOnboarding.historyClearedAt;
      writeJson(ONBOARDING_KEY, updatedOnboarding);
    },

    /**
     * Clears all lecture logs, overrides, extra classes, rescheduled classes,
     * attendance credits, and manual subject adjustments.
     */
    clearAllLogs() {
      writeJson(ATTENDANCE_KEY, []);
      writeJson('extra_classes', []);
      writeJson('rescheduled_classes', []);
      writeJson('attendance_credits', []);

      // Reset manual subject adjustments
      const subjects = (parsed.onboarding.subjects || []).map(s => ({
        ...s,
        manualAttendedAdjustment: 0,
        manualTotalAdjustment: 0,
      }));

      writeJson(ONBOARDING_KEY, {
        ...parsed.onboarding,
        subjects,
      });
    },
  };
}

export function useHydratedStore() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const store = useAttendanceStore();
  const isFullyHydrated = mounted && store.isHydrated;

  return {
    ...store,
    isFullyHydrated,
  };
}