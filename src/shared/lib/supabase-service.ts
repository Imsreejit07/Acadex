'use client';

/**
 * Supabase Service Layer
 *
 * Acts as the bridge between the flat JSON store (attendance-store.ts)
 * and the relational Supabase database. Data is synced asynchronously.
 *
 * Strategy:
 * - localStorage is the reactive UI cache (immediate reactivity)
 * - Supabase is the source of truth (persists across devices/sessions)
 * - On load: fetch from Supabase → populate localStorage
 * - On write: update localStorage first, then sync to Supabase
 */

import { supabase } from './supabase';
import type {
  OnboardingData,
  AttendanceOverride,
  AcademicEvent,
  Holiday,
  ExtraClass,
  RescheduledClass,
  AttendanceCredit,
} from '@/features/attendance/services/attendance-store';

// ─── Types matching Supabase schema ─────────────────────────────────────────

export interface SupabaseSemester {
  id: string;
  user_id: string;
  name: string;
  academic_year: string | null;
  start_date: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'ARCHIVED';
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSubject {
  id: string;
  semester_id: string;
  name: string;
  code: string | null;
  faculty: string | null;
  credits: number | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helper: get current user ───────────────────────────────────────────────

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

// ─── Semester operations ─────────────────────────────────────────────────────

export async function getActiveSemester(): Promise<SupabaseSemester | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('semesters')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active semester:', error.message);
    return null;
  }
  return data;
}

export async function upsertSemester(
  semesterId: string | null,
  data: {
    name: string;
    academic_year?: string;
    start_date?: string;
    user_id: string;
  }
): Promise<string | null> {
  if (semesterId) {
    const { error } = await supabase
      .from('semesters')
      .update({
        name: data.name,
        academic_year: data.academic_year || null,
        start_date: data.start_date || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', semesterId);

    if (error) {
      console.error('Error updating semester:', error.message);
      return null;
    }
    return semesterId;
  } else {
    const { data: created, error } = await supabase
      .from('semesters')
      .insert({
        user_id: data.user_id,
        name: data.name,
        academic_year: data.academic_year || null,
        start_date: data.start_date || null,
        status: 'ACTIVE',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating semester:', error.message);
      return null;
    }
    return created.id;
  }
}

// ─── Key-value metadata store ─────────────────────────────────────────────────
// We use the semester `description` JSON field to store auxiliary app data
// (events, holidays, extra classes, overrides, etc.) rather than creating
// extra tables beyond the current migration.

export async function saveMetaData(semesterId: string, meta: object): Promise<void> {
  const { error } = await supabase
    .from('semesters')
    .update({ description: JSON.stringify(meta) })
    .eq('id', semesterId);

  if (error) {
    console.error('Error saving semester metadata:', error.message);
  }
}

export async function loadMetaData(semesterId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('semesters')
    .select('description')
    .eq('id', semesterId)
    .single();

  if (error || !data?.description) return null;

  try {
    return JSON.parse(data.description) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Full onboarding state sync ───────────────────────────────────────────────

/**
 * Loads all app data from Supabase and writes it to localStorage.
 * Called once on app initialization to sync from the cloud.
 */
export async function loadStateFromSupabase(): Promise<boolean> {
  try {
    const semester = await getActiveSemester();
    if (!semester) return false;

    // Store the semester ID for future writes
    localStorage.setItem('supabase_semester_id', semester.id);

    // Build onboarding data from semester
    const onboarding: OnboardingData = {
      semesterName: semester.name,
      academicYear: semester.academic_year || '',
      startDate: semester.start_date || '',
    };

    // Load subjects for this semester
    const { data: subjects, error: subjectsError } = await supabase
      .from('subjects')
      .select('*')
      .eq('semester_id', semester.id);

    if (!subjectsError && subjects) {
      onboarding.subjects = subjects.map((s: SupabaseSubject) => ({
        id: s.id,
        name: s.name,
        code: s.code || '',
        faculty: s.faculty || '',
        credits: s.credits ?? null,
        color: s.color || '#3B82F6',
        hasLab: false,
        theoryTarget: 75,
        labTarget: 75,
      }));
    }

    // Load auxiliary meta from description field
    const meta = await loadMetaData(semester.id);
    if (meta) {
      if (meta.timetableEntries) {
        onboarding.timetableEntries = meta.timetableEntries as OnboardingData['timetableEntries'];
      }
      if (meta.subjectExtras) {
        // Merge hasLab, targets etc. into subjects
        const extras = meta.subjectExtras as Record<string, { hasLab?: boolean; theoryTarget?: number; labTarget?: number }>;
        onboarding.subjects = (onboarding.subjects || []).map(s => ({
          ...s,
          ...(extras[s.name] || {}),
        }));
      }
      if (meta.onboardingCompletedAt) {
        onboarding.onboardingCompletedAt = meta.onboardingCompletedAt as string;
      }
      if (meta.midSemesterBackfilled) {
        onboarding.midSemesterBackfilled = meta.midSemesterBackfilled as boolean;
      }
      if (meta.userName) {
        onboarding.userName = meta.userName as string;
      }

      // Restore auxiliary stores
      if (meta.overrides) localStorage.setItem('attendance_overrides', JSON.stringify(meta.overrides));
      if (meta.events) localStorage.setItem('academic_events', JSON.stringify(meta.events));
      if (meta.holidays) localStorage.setItem('holidays_list', JSON.stringify(meta.holidays));
      if (meta.extraClasses) localStorage.setItem('extra_classes', JSON.stringify(meta.extraClasses));
      if (meta.rescheduledClasses) localStorage.setItem('rescheduled_classes', JSON.stringify(meta.rescheduledClasses));
      if (meta.attendanceCredits) localStorage.setItem('attendance_credits', JSON.stringify(meta.attendanceCredits));
    }

    localStorage.setItem('onboarding_data', JSON.stringify(onboarding));
    return true;
  } catch (err) {
    console.error('loadStateFromSupabase error:', err);
    return false;
  }
}

/**
 * Saves the full app state to Supabase.
 * Called after every state mutation.
 */
export async function saveStateToSupabase(state: {
  onboarding: OnboardingData;
  overrides: AttendanceOverride[];
  events: AcademicEvent[];
  holidays: Holiday[];
  extraClasses: ExtraClass[];
  rescheduledClasses: RescheduledClass[];
  attendanceCredits: AttendanceCredit[];
}): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;

    let semesterId = localStorage.getItem('supabase_semester_id');

    // Upsert semester
    const newSemesterId = await upsertSemester(semesterId, {
      user_id: user.id,
      name: state.onboarding.semesterName || 'Semester',
      academic_year: state.onboarding.academicYear,
      start_date: state.onboarding.startDate,
    });

    if (!newSemesterId) return;

    if (!semesterId) {
      semesterId = newSemesterId;
      localStorage.setItem('supabase_semester_id', semesterId);
    }

    // Upsert subjects (delete then re-insert for simplicity, since subjects list changes rarely)
    if (state.onboarding.subjects?.length) {
      // Get existing subject IDs
      const { data: existingSubjects } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('semester_id', semesterId);

      const existingMap = new Map((existingSubjects || []).map((s: { id: string; name: string }) => [s.name, s.id]));

      for (const subject of state.onboarding.subjects) {
        const existingId = existingMap.get(subject.name);
        if (existingId) {
          await supabase
            .from('subjects')
            .update({
              code: subject.code || null,
              faculty: subject.faculty || null,
              credits: subject.credits ?? null,
              color: subject.color || null,
            })
            .eq('id', existingId);
        } else {
          await supabase
            .from('subjects')
            .insert({
              id: subject.id,
              semester_id: semesterId,
              name: subject.name,
              code: subject.code || null,
              faculty: subject.faculty || null,
              credits: subject.credits ?? null,
              color: subject.color || null,
            });
        }
      }
    }

    // Save all auxiliary data as metadata in the description column
    const subjectExtras: Record<string, { hasLab?: boolean; theoryTarget?: number; labTarget?: number }> = {};
    for (const s of state.onboarding.subjects || []) {
      subjectExtras[s.name] = {
        hasLab: s.hasLab,
        theoryTarget: s.theoryTarget,
        labTarget: s.labTarget,
      };
    }

    const meta = {
      userName: state.onboarding.userName,
      timetableEntries: state.onboarding.timetableEntries,
      subjectExtras,
      onboardingCompletedAt: state.onboarding.onboardingCompletedAt,
      midSemesterBackfilled: state.onboarding.midSemesterBackfilled,
      overrides: state.overrides,
      events: state.events,
      holidays: state.holidays,
      extraClasses: state.extraClasses,
      rescheduledClasses: state.rescheduledClasses,
      attendanceCredits: state.attendanceCredits,
    };

    await saveMetaData(semesterId, meta);
  } catch (err) {
    console.error('saveStateToSupabase error:', err);
  }
}

/**
 * Archives the current active semester and resets local state.
 */
export async function archiveActiveSemester(): Promise<void> {
  const semesterId = localStorage.getItem('supabase_semester_id');
  if (!semesterId) return;

  await supabase
    .from('semesters')
    .update({ status: 'ARCHIVED' })
    .eq('id', semesterId);

  localStorage.removeItem('supabase_semester_id');
}
