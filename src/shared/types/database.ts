// AcademicOS Database Types - Supabase/PostgreSQL
// These types mirror the database schema exactly

export type SemesterStatus = 'UPCOMING' | 'ACTIVE' | 'ARCHIVED';

export type SubjectComponentType = 'THEORY' | 'LAB' | 'TUTORIAL' | 'WORKSHOP';

export type LectureStatus = 'SCHEDULED' | 'CONDUCTED' | 'CANCELLED' | 'HOLIDAY' | 'RESCHEDULED' | 'EXTRA';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'MEDICAL_LEAVE' | 'DUTY_LEAVE';

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export interface Profile {
  id: string;
  full_name: string;
  college_name: string | null;
  degree: string | null;
  branch: string | null;
  theme: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Semester {
  id: string;
  user_id: string;
  name: string;
  academic_year: string | null;
  start_date: string | null;
  status: SemesterStatus;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
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

export interface SubjectComponent {
  id: string;
  subject_id: string;
  type: SubjectComponentType;
  attendance_target: number | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface TimetableVersion {
  id: string;
  semester_id: string;
  version_number: number;
  effective_from: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklyTimetable {
  id: string;
  version_id: string;
  component_id: string;
  weekday: Weekday;
  start_time: string;
  end_time: string;
  room: string | null;
  faculty_override: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HolidayRange {
  id: string;
  semester_id: string;
  name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LectureOccurrence {
  id: string;
  semester_id: string;
  component_id: string;
  lecture_date: string;
  start_time: string;
  end_time: string;
  status: LectureStatus;
  generated_from_timetable: boolean;
  original_timetable_slot: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  lecture_occurrence_id: string;
  attendance_status: AttendanceStatus;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface LectureReschedule {
  id: string;
  original_occurrence: string;
  new_occurrence: string;
  reason: string | null;
  created_at: string;
}

export interface PdfImport {
  id: string;
  semester_id: string;
  storage_path: string;
  processing_status: string;
  confidence_score: number | null;
  created_at: string;
}