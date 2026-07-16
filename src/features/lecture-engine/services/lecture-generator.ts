/**
 * AcademicOS Daily Lecture Engine
 * 
 * Generates daily lecture occurrences based on:
 * - Active semester
 * - Weekly timetable (current version)
 * - Holiday ranges
 * 
 * PRINCIPLE: Lazy generation - only create occurrences when needed.
 * PRINCIPLE: Never duplicate - today's occurrences should only be generated once.
 */

import { supabase as supabaseInstance } from '@/shared/lib/supabase';
const supabase = supabaseInstance!;
import { LectureOccurrence, Weekday } from '@/shared/types/database';

/**
 * Get the weekday string for a given date
 */
export function getWeekday(date: Date): Weekday {
  const days: Weekday[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[date.getDay()];
}

/**
 * Check if a date falls within any holiday range
 */
export async function isHolidayDate(semesterId: string, date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('holiday_ranges')
    .select('id')
    .eq('semester_id', semesterId)
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Get the active timetable version for a given date
 */
export async function getActiveTimetableVersion(semesterId: string, date: string) {
  const { data, error } = await supabase
    .from('timetable_versions')
    .select('id, version_number')
    .eq('semester_id', semesterId)
    .lte('effective_from', date)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

/**
 * Get today's timetable slots for a given semester
 */
export async function getTodayTimetableSlots(semesterId: string, date: string) {
  const weekday = getWeekday(new Date(date + 'T00:00:00'));
  
  const version = await getActiveTimetableVersion(semesterId, date);
  if (!version) return [];

  const { data, error } = await supabase
    .from('weekly_timetable')
    .select(`
      id,
      component_id,
      start_time,
      end_time,
      room,
      faculty_override,
      notes,
      subject_components:component_id (
        id,
        type,
        subject_id,
        subjects:subject_id (
          id,
          name,
          semester_id
        )
      )
    `)
    .eq('version_id', version.id)
    .eq('weekday', weekday);

  if (error) throw error;
  return data || [];
}

/**
 * Check if lecture occurrences already exist for a given date and semester
 */
export async function haveOccurrencesForDate(semesterId: string, date: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('lecture_occurrences')
    .select('*', { count: 'exact', head: true })
    .eq('semester_id', semesterId)
    .eq('lecture_date', date);

  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Generate today's lecture occurrences for the active semester.
 * This is the MAIN entry point for daily lecture generation.
 */
export async function generateTodayOccurrences(semesterId: string, date: string): Promise<LectureOccurrence[]> {
  // 1. Check if already generated
  const exists = await haveOccurrencesForDate(semesterId, date);
  if (exists) {
    // Return existing occurrences
    const { data, error } = await supabase
      .from('lecture_occurrences')
      .select('*')
      .eq('semester_id', semesterId)
      .eq('lecture_date', date);

    if (error) throw error;
    return data || [];
  }

  // 2. Check if holiday
  const isHoliday = await isHolidayDate(semesterId, date);
  if (isHoliday) {
    return []; // No lectures on holidays
  }

  // 3. Get timetable slots for today
  const slots = await getTodayTimetableSlots(semesterId, date);

  // 4. Generate occurrences
  const occurrences = slots.map(slot => ({
    semester_id: semesterId,
    component_id: slot.component_id,
    lecture_date: date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    status: 'SCHEDULED' as const,
    generated_from_timetable: true,
    original_timetable_slot: slot.id,
    notes: null,
  }));

  // 5. Batch insert
  if (occurrences.length > 0) {
    const { data, error } = await supabase
      .from('lecture_occurrences')
      .insert(occurrences)
      .select();

    if (error) throw error;
    return data || [];
  }

  return [];
}

/**
 * Generate occurrences for a date range (used when user is away for multiple days)
 */
export async function generateOccurrencesForRange(
  semesterId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  let totalGenerated = 0;
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const occurrences = await generateTodayOccurrences(semesterId, dateStr);
    totalGenerated += occurrences.length;
  }

  return totalGenerated;
}

/**
 * Create an extra lecture (outside timetable)
 */
export async function createExtraLecture(
  semesterId: string,
  componentId: string,
  date: string,
  startTime: string,
  endTime: string,
  notes?: string
): Promise<LectureOccurrence> {
  const { data, error } = await supabase
    .from('lecture_occurrences')
    .insert({
      semester_id: semesterId,
      component_id: componentId,
      lecture_date: date,
      start_time: startTime,
      end_time: endTime,
      status: 'EXTRA',
      generated_from_timetable: false,
      original_timetable_slot: null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Reschedule a lecture to a new date
 */
export async function rescheduleLecture(
  occurrenceId: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  reason?: string
): Promise<void> {
  const { data: original, error: fetchError } = await supabase
    .from('lecture_occurrences')
    .select('*')
    .eq('id', occurrenceId)
    .single();

  if (fetchError) throw fetchError;

  // Mark original as rescheduled
  const { error: updateError } = await supabase
    .from('lecture_occurrences')
    .update({ status: 'RESCHEDULED' })
    .eq('id', occurrenceId);

  if (updateError) throw updateError;

  // Create new occurrence
  const { data: newOccurrence, error: createError } = await supabase
    .from('lecture_occurrences')
    .insert({
      semester_id: original.semester_id,
      component_id: original.component_id,
      lecture_date: newDate,
      start_time: newStartTime,
      end_time: newEndTime,
      status: 'SCHEDULED',
      generated_from_timetable: false,
      original_timetable_slot: null,
      notes: `Rescheduled from ${original.lecture_date}`,
    })
    .select()
    .single();

  if (createError) throw createError;

  // Create reschedule record
  const { error: rescheduleError } = await supabase
    .from('lecture_reschedules')
    .insert({
      original_occurrence: occurrenceId,
      new_occurrence: newOccurrence.id,
      reason: reason || null,
    });

  if (rescheduleError) throw rescheduleError;
}
