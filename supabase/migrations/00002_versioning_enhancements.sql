-- ============================================================================
-- Migration 00002: Timetable Versioning Enhancements
--
-- This migration strengthens the timetable versioning schema by:
-- 1. Adding effective_until, status, and user_id to timetable_versions
-- 2. Ensuring no two active versions overlap for the same semester
-- 3. Recording which timetable version generated each lecture occurrence
-- 4. Adding full edit support to lecture_occurrences (faculty, subject, manual edit flag)
-- 5. Adding a timetable_version_references view for integrity checking
--
-- PRINCIPLE: Historical data is immutable.
-- This migration adds columns without breaking any existing data.
-- ============================================================================

-- ── TABLE: timetable_versions (enhance) ─────────────────────────────────────

ALTER TABLE timetable_versions
  ADD COLUMN IF NOT EXISTS effective_until DATE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'HISTORICAL', 'SCHEDULED')),
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate user_id from the semester owner for existing rows
UPDATE timetable_versions tv
SET user_id = s.user_id
FROM semesters s
WHERE tv.semester_id = s.id
  AND tv.user_id IS NULL;

-- Index for efficient date-range lookups (the core version resolution query)
CREATE INDEX IF NOT EXISTS idx_timetable_versions_date_range
  ON timetable_versions (semester_id, effective_from, effective_until);

-- Index for status lookups
CREATE INDEX IF NOT EXISTS idx_timetable_versions_status
  ON timetable_versions (semester_id, status);

-- ── CONSTRAINT: Only one ACTIVE version per semester per calendar date ───────
-- We enforce this at the application layer (in timetable-version-store.ts),
-- but also add a partial unique index for database-level protection.
-- Note: PostgreSQL cannot enforce "no date range overlap" with a simple unique
-- index, so we use a simpler constraint: only one open-ended (effective_until IS NULL)
-- version per semester at a time.

CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_versions_one_open_ended
  ON timetable_versions (semester_id)
  WHERE effective_until IS NULL AND status = 'ACTIVE';

-- ── TABLE: lecture_occurrences (enhance) ────────────────────────────────────

-- Record which timetable version generated each occurrence.
-- SET NULL on cascade so historical records survive if a scheduled version is deleted.
ALTER TABLE lecture_occurrences
  ADD COLUMN IF NOT EXISTS timetable_version_id UUID
    REFERENCES timetable_versions(id) ON DELETE SET NULL;

-- Full edit support: allow storing field-level overrides directly on the occurrence
-- (in addition to the attendance_records.remarks system).
ALTER TABLE lecture_occurrences
  ADD COLUMN IF NOT EXISTS faculty_override TEXT,
  ADD COLUMN IF NOT EXISTS subject_override TEXT,
  ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN NOT NULL DEFAULT false;

-- Index for the timetable_version_id foreign key (used to check if a version is referenced)
CREATE INDEX IF NOT EXISTS idx_lecture_occurrences_version
  ON lecture_occurrences (timetable_version_id);

-- ── VIEW: timetable_version_references ───────────────────────────────────────
-- Used to check which versions are referenced by lecture history,
-- so the UI can protect historical versions from deletion.

CREATE OR REPLACE VIEW timetable_version_references AS
SELECT
  tv.id AS version_id,
  tv.version_number,
  tv.semester_id,
  COUNT(lo.id) AS lecture_count,
  MIN(lo.lecture_date) AS first_lecture_date,
  MAX(lo.lecture_date) AS last_lecture_date
FROM timetable_versions tv
LEFT JOIN lecture_occurrences lo ON lo.timetable_version_id = tv.id
GROUP BY tv.id, tv.version_number, tv.semester_id;

-- Grant access to authenticated users (RLS on base tables protects row-level access)
GRANT SELECT ON timetable_version_references TO authenticated;

-- ── RLS POLICY UPDATE: timetable_versions ────────────────────────────────────
-- Existing policies already cover SELECT/INSERT/UPDATE/DELETE via user_owns_semester().
-- Add a user_id-based policy as an additional path for direct user_id checks.

CREATE POLICY IF NOT EXISTS "Users can view own timetable versions by user_id" ON timetable_versions
  FOR SELECT USING (user_id = auth.uid());

-- ── TRIGGER: auto-close previous active version ──────────────────────────────
-- When a new ACTIVE version is inserted, automatically set effective_until on the
-- previous active version (one day before the new version's effective_from).
-- This is a safety net — the application layer also does this.

CREATE OR REPLACE FUNCTION close_previous_active_timetable_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when a new ACTIVE version is being inserted
  IF NEW.status = 'ACTIVE' AND NEW.effective_until IS NULL THEN
    UPDATE timetable_versions
    SET
      effective_until = (NEW.effective_from - INTERVAL '1 day')::DATE,
      status = 'HISTORICAL',
      updated_at = NOW()
    WHERE
      semester_id = NEW.semester_id
      AND id != NEW.id
      AND status = 'ACTIVE'
      AND effective_until IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_close_previous_active_version ON timetable_versions;
CREATE TRIGGER trigger_close_previous_active_version
  AFTER INSERT ON timetable_versions
  FOR EACH ROW
  EXECUTE FUNCTION close_previous_active_timetable_version();

-- ── UPDATE updated_at trigger for new columns ────────────────────────────────
-- The existing update_timetable_versions_updated_at trigger already covers this table.
-- No additional trigger needed.

-- ── DATA INTEGRITY CHECK FUNCTION ────────────────────────────────────────────
-- Returns any version overlap conflicts for a given semester.
-- Called by the application after creating a new version.

CREATE OR REPLACE FUNCTION check_timetable_version_integrity(p_semester_id UUID)
RETURNS TABLE(
  version_a INTEGER,
  version_b INTEGER,
  overlap_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.version_number,
    b.version_number,
    FORMAT(
      'v%s (%s–%s) overlaps with v%s (%s–%s)',
      a.version_number, a.effective_from, COALESCE(a.effective_until::TEXT, '∞'),
      b.version_number, b.effective_from, COALESCE(b.effective_until::TEXT, '∞')
    )::TEXT
  FROM timetable_versions a
  JOIN timetable_versions b ON a.id < b.id AND a.semester_id = b.semester_id
  WHERE a.semester_id = p_semester_id
    AND a.effective_from <= COALESCE(b.effective_until, '9999-12-31'::DATE)
    AND b.effective_from <= COALESCE(a.effective_until, '9999-12-31'::DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
