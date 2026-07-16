import { z } from 'zod';

export const semesterSchema = z.object({
  name: z.string().min(1, 'Semester name is required'),
  academic_year: z.string().optional(),
  start_date: z.string().optional(),
  description: z.string().optional(),
});

export const subjectSchema = z.object({
  name: z.string().min(1, 'Subject name is required'),
  code: z.string().optional(),
  faculty: z.string().optional(),
  credits: z.number().int().positive().optional(),
  color: z.string().optional(),
  semester_id: z.string().uuid(),
});

export const subjectComponentSchema = z.object({
  subject_id: z.string().uuid(),
  type: z.enum(['THEORY', 'LAB', 'TUTORIAL', 'WORKSHOP']),
  attendance_target: z.number().min(0).max(100).nullable(),
  duration_minutes: z.number().int().positive().nullable(),
});

export const timetableSlotSchema = z.object({
  component_id: z.string().uuid(),
  weekday: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  room: z.string().optional(),
  faculty_override: z.string().optional(),
});

export const lectureUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['SCHEDULED', 'CONDUCTED', 'CANCELLED', 'HOLIDAY', 'RESCHEDULED', 'EXTRA']),
  attendance_status: z.enum(['PRESENT', 'ABSENT', 'MEDICAL_LEAVE', 'DUTY_LEAVE']).optional(),
  notes: z.string().optional(),
});

export const holidayRangeSchema = z.object({
  semester_id: z.string().uuid(),
  name: z.string().min(1, 'Holiday name is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  reason: z.string().optional(),
}).refine(
  (data) => {
    if (!data.start_date || !data.end_date) return true;
    return new Date(data.end_date) >= new Date(data.start_date);
  },
  { message: 'End date must be after or equal to start date', path: ['end_date'] }
);

export const extraLectureSchema = z.object({
  semester_id: z.string().uuid(),
  component_id: z.string().uuid(),
  date: z.string().min(1, 'Date is required'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  notes: z.string().optional(),
});

export const profileSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  college_name: z.string().optional(),
  degree: z.string().optional(),
  branch: z.string().optional(),
  timezone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(1, 'Name is required'),
});