/**
 * AcademicOS Attendance Engine
 * 
 * This is the CORE of the application.
 * Every attendance calculation originates from here.
 * 
 * PRINCIPLE: History is the Single Source of Truth
 * Never store derived values. Always compute from lecture history.
 */

import { AttendanceStatus, LectureOccurrence, AttendanceRecord, LectureStatus } from '@/shared/types/database';

export interface AttendanceStats {
  conducted: number;
  present: number;
  absent: number;
  medicalLeave: number;
  dutyLeave: number;
  cancelled: number;
  holiday: number;
  scheduled: number;
  totalScheduled: number;
  attendancePercentage: number | null; // null if no conducted lectures
}

export interface SafeSkipResult {
  safeSkips: number;
}

export interface NeedClassesResult {
  needed: number;
}

export interface ProjectionResult {
  projectedPercentage: number;
}

export function getLectureMultiplier(componentType: string, startTime: string, endTime: string): number {
  if (componentType === 'LAB') return 1;
  
  try {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return Math.max(1, Math.round(durationMinutes / 55));
  } catch {
    return 1;
  }
}

/**
 * Calculate attendance statistics from lecture occurrences and attendance records.
 * This is the MAIN entry point for all attendance calculations.
 */
export function calculateAttendance(
  lectures: Array<{
    status: string;
    start_time?: string;
    end_time?: string;
    startTime?: string;
    endTime?: string;
    component_type?: string;
    componentType?: string;
    attendance?: { attendance_status: string } | null;
  }>
): AttendanceStats {
  let conducted = 0;
  let present = 0;
  let absent = 0;
  let medicalLeave = 0;
  let dutyLeave = 0;
  let cancelled = 0;
  let holiday = 0;
  let scheduled = 0;
  const totalScheduled = lectures.length;

  for (const lecture of lectures) {
    const componentType = lecture.component_type || lecture.componentType || 'THEORY';
    const startTime = lecture.start_time || lecture.startTime || '09:00';
    const endTime = lecture.end_time || lecture.endTime || '10:00';
    
    const multiplier = getLectureMultiplier(componentType, startTime, endTime);

    switch (lecture.status) {
      case 'CONDUCTED':
        conducted += multiplier;
        if (lecture.attendance) {
          switch (lecture.attendance.attendance_status) {
            case 'PRESENT':
              present += multiplier;
              break;
            case 'ABSENT':
              absent += multiplier;
              break;
            case 'MEDICAL_LEAVE':
              medicalLeave += multiplier;
              break;
            case 'DUTY_LEAVE':
              dutyLeave += multiplier;
              break;
          }
        }
        break;
      case 'CANCELLED':
        cancelled += 1;
        break;
      case 'HOLIDAY':
        holiday += 1;
        break;
      case 'SCHEDULED':
        scheduled += multiplier;
        break;
    }
  }

  const attendancePercentage = conducted > 0 
    ? (present / conducted) * 100 
    : null;

  // Double-Check Inequality Verification (C_attended + A_max = T and actual >= 75%)
  if (conducted > 0) {
    const minPresent = Math.ceil(0.75 * conducted);
    const maxAbsences = Math.floor(0.25 * conducted);
    if (minPresent + maxAbsences !== conducted) {
      console.warn(`Double-check inequality mismatch: minPresent (${minPresent}) + maxAbsences (${maxAbsences}) !== conducted (${conducted})`);
    }
    const checkMinPct = (minPresent / conducted) * 100;
    if (checkMinPct < 75) {
      console.warn(`Double-check inequality mismatch: min percentage (${checkMinPct.toFixed(1)}%) is less than 75%`);
    }
  }

  return {
    conducted,
    present,
    absent,
    medicalLeave,
    dutyLeave,
    cancelled,
    holiday,
    scheduled,
    totalScheduled,
    attendancePercentage: attendancePercentage !== null 
      ? Math.round(attendancePercentage * 100) / 100 
      : null,
  };
}

/**
 * Calculate how many lectures can be safely skipped.
 * Algorithm: Simulate adding absences until attendance drops below target.
 */
export function calculateSafeSkip(
  present: number,
  conducted: number,
  targetPercentage: number
): SafeSkipResult {
  if (conducted === 0) return { safeSkips: 0 };

  const currentPresent = present;
  let currentConducted = conducted;
  let safe = 0;

  while (true) {
    currentConducted++;
    const attendance = currentPresent / currentConducted * 100;
    if (attendance < targetPercentage) break;
    safe++;
  }

  return { safeSkips: safe };
}

/**
 * Calculate how many consecutive presents are needed to reach target.
 * Algorithm: Simulate adding presents until attendance reaches target.
 */
export function calculateNeedClasses(
  present: number,
  conducted: number,
  targetPercentage: number
): NeedClassesResult {
  if (conducted === 0) return { needed: 0 };

  // If already at or above target, we need 0 classes
  if ((present / conducted) * 100 >= targetPercentage) {
    return { needed: 0 };
  }

  let currentPresent = present;
  let currentConducted = conducted;
  let needed = 0;

  while (true) {
    needed++;
    currentPresent++;
    currentConducted++;
    const attendance = (currentPresent / currentConducted) * 100;
    if (attendance >= targetPercentage) break;
    if (needed > 1000) break; // Safety limit
  }

  return { needed };
}

/**
 * Project attendance after N future lectures with a given attendance pattern.
 */
export function projectAttendance(
  present: number,
  conducted: number,
  futurePresent: number,
  futureAbsent: number
): ProjectionResult {
  const totalConducted = conducted + futurePresent + futureAbsent;
  const totalPresent = present + futurePresent;

  if (totalConducted === 0) return { projectedPercentage: 0 };

  const percentage = (totalPresent / totalConducted) * 100;
  return { projectedPercentage: Math.round(percentage * 100) / 100 };
}

/**
 * Get overall stats from multiple component stats.
 * CORRECT: Aggregate counts first, then calculate percentage.
 * INCORRECT: Average percentages.
 */
export function aggregateAttendanceStats(stats: AttendanceStats[]): AttendanceStats {
  const total = stats.reduce(
    (acc, stat) => ({
      conducted: acc.conducted + stat.conducted,
      present: acc.present + stat.present,
      absent: acc.absent + stat.absent,
      medicalLeave: acc.medicalLeave + stat.medicalLeave,
      dutyLeave: acc.dutyLeave + stat.dutyLeave,
      cancelled: acc.cancelled + stat.cancelled,
      holiday: acc.holiday + stat.holiday,
      scheduled: acc.scheduled + stat.scheduled,
      totalScheduled: acc.totalScheduled + stat.totalScheduled,
    }),
    {
      conducted: 0,
      present: 0,
      absent: 0,
      medicalLeave: 0,
      dutyLeave: 0,
      cancelled: 0,
      holiday: 0,
      scheduled: 0,
      totalScheduled: 0,
    }
  );

  const attendancePercentage = total.conducted > 0
    ? (total.present / total.conducted) * 100
    : null;

  return {
    ...total,
    attendancePercentage: attendancePercentage !== null
      ? Math.round(attendancePercentage * 100) / 100
      : null,
  };
}

/**
 * Validate that attendance data is consistent.
 * @throws Error if data integrity rules are violated.
 */
export function validateAttendanceIntegrity(
  attendance: AttendanceStatus | null,
  lectureStatus: LectureStatus
): void {
  // Attendance exists ONLY IF Lecture Status is CONDUCTED
  if (attendance && lectureStatus !== 'CONDUCTED') {
    throw new Error('INVALID_STATE: Attendance record exists for non-conducted lecture');
  }

  // If CANCELLED, attendance must be NULL
  if (lectureStatus === 'CANCELLED' && attendance) {
    throw new Error('INVALID_STATE: Cancelled lecture cannot have attendance');
  }

  // If HOLIDAY, attendance must be NULL
  if (lectureStatus === 'HOLIDAY' && attendance) {
    throw new Error('INVALID_STATE: Holiday lecture cannot have attendance');
  }

  // If SCHEDULED, attendance must be NULL
  if (lectureStatus === 'SCHEDULED' && attendance) {
    throw new Error('INVALID_STATE: Scheduled lecture cannot have attendance');
  }
}

/**
 * Get health status based on attendance relative to target.
 */
export function getAttendanceHealth(
  percentage: number | null,
  target: number
): 'EXCELLENT' | 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'NO_DATA' {
  if (percentage === null) return 'NO_DATA';

  if (percentage >= target + 10) return 'EXCELLENT';
  if (percentage >= target) return 'HEALTHY';
  if (percentage >= target - 5) return 'WARNING';
  return 'CRITICAL';
}
