CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLE 1: profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  college_name TEXT,
  degree TEXT,
  branch TEXT,
  theme TEXT DEFAULT 'dark',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 2: semesters
CREATE TABLE semesters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  academic_year TEXT,
  start_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('UPCOMING', 'ACTIVE', 'ARCHIVED')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_semesters_user_id ON semesters(user_id);

-- TABLE 3: subjects
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  faculty TEXT,
  credits INTEGER,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subjects_semester_id ON subjects(semester_id);

-- TABLE 4: subject_components
CREATE TABLE subject_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('THEORY', 'LAB', 'TUTORIAL', 'WORKSHOP')),
  attendance_target NUMERIC(5,2) CHECK (attendance_target >= 0 AND attendance_target <= 100),
  duration_minutes INTEGER CHECK (duration_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subject_components_subject_id ON subject_components(subject_id);

-- TABLE 5: timetable_versions
CREATE TABLE timetable_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timetable_versions_semester ON timetable_versions(semester_id);

-- TABLE 6: weekly_timetable
CREATE TABLE weekly_timetable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_id UUID NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES subject_components(id) ON DELETE CASCADE,
  weekday TEXT NOT NULL CHECK (weekday IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room TEXT,
  faculty_override TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_weekly_timetable_version ON weekly_timetable(version_id);
CREATE INDEX idx_weekly_timetable_weekday ON weekly_timetable(weekday);

-- TABLE 7: holiday_ranges
CREATE TABLE holiday_ranges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_holiday_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_holiday_ranges_semester ON holiday_ranges(semester_id);
CREATE INDEX idx_holiday_ranges_dates ON holiday_ranges(start_date, end_date);

-- TABLE 8: lecture_occurrences (MOST IMPORTANT TABLE)
CREATE TABLE lecture_occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES subject_components(id) ON DELETE CASCADE,
  lecture_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CONDUCTED', 'CANCELLED', 'HOLIDAY', 'RESCHEDULED', 'EXTRA')),
  generated_from_timetable BOOLEAN NOT NULL DEFAULT false,
  original_timetable_slot UUID REFERENCES weekly_timetable(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lecture_occurrences_semester ON lecture_occurrences(semester_id);
CREATE INDEX idx_lecture_occurrences_component ON lecture_occurrences(component_id);
CREATE INDEX idx_lecture_occurrences_date ON lecture_occurrences(lecture_date);
CREATE INDEX idx_lecture_occurrences_status ON lecture_occurrences(status);
CREATE INDEX idx_lecture_occurrences_date_status ON lecture_occurrences(lecture_date, status);

-- TABLE 9: attendance_records
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lecture_occurrence_id UUID NOT NULL REFERENCES lecture_occurrences(id) ON DELETE CASCADE,
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'MEDICAL_LEAVE', 'DUTY_LEAVE')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lecture_occurrence_id)
);

CREATE INDEX idx_attendance_records_lecture ON attendance_records(lecture_occurrence_id);
CREATE INDEX idx_attendance_records_status ON attendance_records(attendance_status);

-- TABLE 10: lecture_reschedules
CREATE TABLE lecture_reschedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_occurrence UUID NOT NULL REFERENCES lecture_occurrences(id) ON DELETE CASCADE,
  new_occurrence UUID NOT NULL REFERENCES lecture_occurrences(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE 11: pdf_imports
CREATE TABLE pdf_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'UPLOADING' CHECK (processing_status IN ('UPLOADING', 'PROCESSING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED')),
  confidence_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdf_imports_semester ON pdf_imports(semester_id);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecture_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecture_reschedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_imports ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- Each user can only access their own data

-- profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- semesters
CREATE POLICY "Users can view own semesters" ON semesters
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own semesters" ON semesters
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own semesters" ON semesters
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own semesters" ON semesters
  FOR DELETE USING (user_id = auth.uid());

-- Helper function to check semester ownership
CREATE OR REPLACE FUNCTION user_owns_semester(semester_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM semesters WHERE id = semester_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- subjects
CREATE POLICY "Users can view own subjects" ON subjects
  FOR SELECT USING (user_owns_semester(semester_id));

CREATE POLICY "Users can insert own subjects" ON subjects
  FOR INSERT WITH CHECK (user_owns_semester(semester_id));

CREATE POLICY "Users can update own subjects" ON subjects
  FOR UPDATE USING (user_owns_semester(semester_id));

CREATE POLICY "Users can delete own subjects" ON subjects
  FOR DELETE USING (user_owns_semester(semester_id));

-- subject_components
CREATE POLICY "Users can view own components" ON subject_components
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM subjects s JOIN semesters sem ON s.semester_id = sem.id
      WHERE s.id = subject_components.subject_id AND sem.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own components" ON subject_components
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM subjects s JOIN semesters sem ON s.semester_id = sem.id
      WHERE s.id = subject_components.subject_id AND sem.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own components" ON subject_components
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM subjects s JOIN semesters sem ON s.semester_id = sem.id
      WHERE s.id = subject_components.subject_id AND sem.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own components" ON subject_components
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM subjects s JOIN semesters sem ON s.semester_id = sem.id
      WHERE s.id = subject_components.subject_id AND sem.user_id = auth.uid()
    )
  );

-- timetable_versions
CREATE POLICY "Users can view own timetable versions" ON timetable_versions
  FOR SELECT USING (user_owns_semester(semester_id));

CREATE POLICY "Users can insert timetable versions" ON timetable_versions
  FOR INSERT WITH CHECK (user_owns_semester(semester_id));

CREATE POLICY "Users can update timetable versions" ON timetable_versions
  FOR UPDATE USING (user_owns_semester(semester_id));

CREATE POLICY "Users can delete timetable versions" ON timetable_versions
  FOR DELETE USING (user_owns_semester(semester_id));

-- weekly_timetable via version -> semester chain
CREATE POLICY "Users can view own weekly timetable" ON weekly_timetable
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM timetable_versions tv JOIN semesters s ON tv.semester_id = s.id
      WHERE tv.id = weekly_timetable.version_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert weekly timetable" ON weekly_timetable
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM timetable_versions tv JOIN semesters s ON tv.semester_id = s.id
      WHERE tv.id = weekly_timetable.version_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update weekly timetable" ON weekly_timetable
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM timetable_versions tv JOIN semesters s ON tv.semester_id = s.id
      WHERE tv.id = weekly_timetable.version_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete weekly timetable" ON weekly_timetable
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM timetable_versions tv JOIN semesters s ON tv.semester_id = s.id
      WHERE tv.id = weekly_timetable.version_id AND s.user_id = auth.uid()
    )
  );

-- holiday_ranges
CREATE POLICY "Users can view own holidays" ON holiday_ranges
  FOR SELECT USING (user_owns_semester(semester_id));

CREATE POLICY "Users can insert own holidays" ON holiday_ranges
  FOR INSERT WITH CHECK (user_owns_semester(semester_id));

CREATE POLICY "Users can update own holidays" ON holiday_ranges
  FOR UPDATE USING (user_owns_semester(semester_id));

CREATE POLICY "Users can delete own holidays" ON holiday_ranges
  FOR DELETE USING (user_owns_semester(semester_id));

-- lecture_occurrences
CREATE POLICY "Users can view own lectures" ON lecture_occurrences
  FOR SELECT USING (user_owns_semester(semester_id));

CREATE POLICY "Users can insert own lectures" ON lecture_occurrences
  FOR INSERT WITH CHECK (user_owns_semester(semester_id));

CREATE POLICY "Users can update own lectures" ON lecture_occurrences
  FOR UPDATE USING (user_owns_semester(semester_id));

CREATE POLICY "Users can delete own lectures" ON lecture_occurrences
  FOR DELETE USING (user_owns_semester(semester_id));

-- attendance_records via lecture -> semester chain
CREATE POLICY "Users can view own attendance" ON attendance_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lecture_occurrences lo JOIN semesters s ON lo.semester_id = s.id
      WHERE lo.id = attendance_records.lecture_occurrence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own attendance" ON attendance_records
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lecture_occurrences lo JOIN semesters s ON lo.semester_id = s.id
      WHERE lo.id = attendance_records.lecture_occurrence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own attendance" ON attendance_records
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lecture_occurrences lo JOIN semesters s ON lo.semester_id = s.id
      WHERE lo.id = attendance_records.lecture_occurrence_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own attendance" ON attendance_records
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lecture_occurrences lo JOIN semesters s ON lo.semester_id = s.id
      WHERE lo.id = attendance_records.lecture_occurrence_id AND s.user_id = auth.uid()
    )
  );

-- lecture_reschedules
CREATE POLICY "Users can view own reschedules" ON lecture_reschedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lecture_occurrences lo JOIN semesters s ON lo.semester_id = s.id
      WHERE lo.id = lecture_reschedules.original_occurrence AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own reschedules" ON lecture_reschedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lecture_occurrences lo JOIN semesters s ON lo.semester_id = s.id
      WHERE lo.id = lecture_reschedules.original_occurrence AND s.user_id = auth.uid()
    )
  );

-- pdf_imports
CREATE POLICY "Users can view own pdf imports" ON pdf_imports
  FOR SELECT USING (user_owns_semester(semester_id));

CREATE POLICY "Users can insert pdf imports" ON pdf_imports
  FOR INSERT WITH CHECK (user_owns_semester(semester_id));

CREATE POLICY "Users can update pdf imports" ON pdf_imports
  FOR UPDATE USING (user_owns_semester(semester_id));

CREATE POLICY "Users can delete pdf imports" ON pdf_imports
  FOR DELETE USING (user_owns_semester(semester_id));

-- AUTO-UPDATE updated_at TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_semesters_updated_at
  BEFORE UPDATE ON semesters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at
  BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subject_components_updated_at
  BEFORE UPDATE ON subject_components FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timetable_versions_updated_at
  BEFORE UPDATE ON timetable_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekly_timetable_updated_at
  BEFORE UPDATE ON weekly_timetable FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_holiday_ranges_updated_at
  BEFORE UPDATE ON holiday_ranges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lecture_occurrences_updated_at
  BEFORE UPDATE ON lecture_occurrences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();