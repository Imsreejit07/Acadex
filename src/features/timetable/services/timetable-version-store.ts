/**
 * Timetable Version Store — Pure Service Layer
 *
 * All functions in this module are PURE (no side effects, no imports from
 * reactive stores). They can be tested independently and used anywhere.
 *
 * PRINCIPLE: A lecture date always resolves to exactly one timetable version.
 * PRINCIPLE: Creating a new version never modifies lecture history.
 * PRINCIPLE: Historical versions are immutable once referenced by lecture logs.
 */

import type { TimetableVersion, TimetableEntry } from '@/features/attendance/services/attendance-store';

// ─── Version Resolution ───────────────────────────────────────────────────────

/**
 * Given an array of timetable versions and a specific date string (YYYY-MM-DD),
 * returns the timetable version that was active on that date.
 *
 * Resolution rule:
 *   - Version is active if effectiveFrom <= date AND (effectiveUntil is null OR effectiveUntil >= date)
 *   - If multiple versions match (should never happen due to constraints), the latest effectiveFrom wins.
 *   - Returns null if no version covers the date (e.g., date is before any version).
 */
export function resolveVersionForDate(
  versions: TimetableVersion[],
  date: string
): TimetableVersion | null {
  if (!versions || versions.length === 0) return null;

  const matching = versions.filter(v => {
    const afterFrom = v.effectiveFrom <= date;
    const beforeUntil = v.effectiveUntil === null || v.effectiveUntil >= date;
    return afterFrom && beforeUntil;
  });

  if (matching.length === 0) return null;

  // Sort descending by effectiveFrom, pick the latest (most specific)
  matching.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return matching[0];
}

/**
 * Returns the entries for the timetable version active on a given date.
 * Convenience wrapper around resolveVersionForDate.
 */
export function getEntriesForDate(
  versions: TimetableVersion[],
  date: string
): TimetableEntry[] {
  const version = resolveVersionForDate(versions, date);
  return version ? version.entries : [];
}

// ─── Version Creation ─────────────────────────────────────────────────────────

/**
 * Creates a new timetable version starting from `effectiveFrom`.
 *
 * The previous ACTIVE version is automatically closed: its effectiveUntil
 * is set to one day before the new version's effectiveFrom.
 *
 * Returns a new sorted array of versions (does NOT mutate the input).
 */
export function createNewVersion(
  versions: TimetableVersion[],
  entries: TimetableEntry[],
  effectiveFrom: string
): TimetableVersion[] {
  const newVersionNumber = versions.length > 0
    ? Math.max(...versions.map(v => v.versionNumber)) + 1
    : 1;

  const effectiveUntilPrevious = subtractOneDay(effectiveFrom);

  // Close the currently-active version
  const updated = versions.map(v => {
    if (v.status === 'ACTIVE' || (v.effectiveUntil === null && v.status !== 'SCHEDULED')) {
      return {
        ...v,
        effectiveUntil: effectiveUntilPrevious,
        status: 'HISTORICAL' as const,
      };
    }
    return v;
  });

  const newVersion: TimetableVersion = {
    id: generateVersionId(),
    versionNumber: newVersionNumber,
    effectiveFrom,
    effectiveUntil: null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    entries,
  };

  return [...updated, newVersion].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  );
}

/**
 * Marks a version as HISTORICAL and sets its effectiveUntil.
 * Used when closing a version without immediately creating a new one.
 */
export function closeVersion(
  versions: TimetableVersion[],
  versionId: string,
  effectiveUntil: string
): TimetableVersion[] {
  return versions.map(v =>
    v.id === versionId
      ? { ...v, effectiveUntil, status: 'HISTORICAL' as const }
      : v
  );
}

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Migrates a legacy flat `timetableEntries` array into a versioned structure.
 * Creates Version 1 effective from the semester start date (or today as fallback).
 *
 * IDEMPOTENT: If versions already exist, returns them unchanged.
 */
export function migrateFromLegacy(
  timetableEntries: TimetableEntry[] | undefined,
  startDate: string | undefined,
  existingVersions?: TimetableVersion[]
): TimetableVersion[] {
  // Already migrated — do not touch
  if (existingVersions && existingVersions.length > 0) {
    return existingVersions;
  }

  // Nothing to migrate
  if (!timetableEntries || timetableEntries.length === 0) {
    return [];
  }

  const effectiveFrom = startDate || formatDate(new Date());

  const version1: TimetableVersion = {
    id: generateVersionId(),
    versionNumber: 1,
    effectiveFrom,
    effectiveUntil: null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    entries: timetableEntries,
  };

  return [version1];
}

// ─── Lecture Override Key Migration ──────────────────────────────────────────

/**
 * Migrates old 6-part attendance override keys to 7-part keys that include
 * the timetable version ID.
 *
 * Old format:  {date}|{day}|{subject}|{type}|{startTime}|{endTime}
 * New format:  {versionId}|{date}|{day}|{subject}|{type}|{startTime}|{endTime}
 *
 * Generic over T so it preserves all extra fields from AttendanceOverride.
 * Returns the migrated array (does NOT mutate the input).
 */
export function migrateOverrideKeys<T extends { lectureId: string; status: string; attendance: string | null }>(
  overrides: T[],
  versions: TimetableVersion[]
): T[] {
  if (!overrides || overrides.length === 0) return overrides;

  return overrides.map(override => {
    // Already migrated (7 parts with a UUID-like version ID)
    const parts = override.lectureId.split('|');
    if (parts.length === 7 && isVersionId(parts[0])) {
      return override;
    }

    // Legacy 6-part key — determine which version was active on the lecture date
    if (parts.length === 6) {
      const [date] = parts;
      const version = resolveVersionForDate(versions, date);
      if (version) {
        return {
          ...override,
          lectureId: [version.id, ...parts].join('|'),
        };
      }
    }

    // Cannot migrate — return as-is (will not match any lecture)
    return override;
  });
}

// ─── Lecture ID Builder ───────────────────────────────────────────────────────

/**
 * Builds a version-stable lecture ID.
 * Format: {versionId}|{date}|{day}|{subjectName}|{resolvedType}|{startTime}|{endTime}
 */
export function buildVersionedLectureId(
  versionId: string,
  date: string,
  day: string,
  subjectName: string,
  resolvedType: string,
  startTime: string,
  endTime: string
): string {
  return [versionId, date, day.toUpperCase(), subjectName, resolvedType, startTime, endTime].join('|');
}

/**
 * Parses a versioned lecture ID back into its components.
 * Returns null if the ID format is invalid.
 */
export function parseVersionedLectureId(id: string): {
  versionId: string;
  date: string;
  day: string;
  subjectName: string;
  resolvedType: string;
  startTime: string;
  endTime: string;
} | null {
  const parts = id.split('|');
  if (parts.length !== 7) return null;
  return {
    versionId: parts[0],
    date: parts[1],
    day: parts[2],
    subjectName: parts[3],
    resolvedType: parts[4],
    startTime: parts[5],
    endTime: parts[6],
  };
}

// ─── Version Status Helpers ───────────────────────────────────────────────────

/**
 * Returns the currently ACTIVE version (status === 'ACTIVE' and effectiveUntil === null).
 */
export function getActiveVersion(versions: TimetableVersion[]): TimetableVersion | null {
  return versions.find(v => v.status === 'ACTIVE' && v.effectiveUntil === null) ?? null;
}

/**
 * Checks whether a given version is referenced by any lecture occurrence log key.
 * Used to determine if a version can be safely deleted.
 */
export function isVersionReferenced(
  versionId: string,
  overrideKeys: string[]
): boolean {
  return overrideKeys.some(key => key.startsWith(versionId + '|'));
}

/**
 * Validates version array consistency:
 * - No two versions have overlapping date ranges
 * - At most one version has effectiveUntil === null (the active one)
 * Returns an array of error messages (empty = valid).
 */
export function validateVersionIntegrity(versions: TimetableVersion[]): string[] {
  const errors: string[] = [];

  const openVersions = versions.filter(v => v.effectiveUntil === null);
  if (openVersions.length > 1) {
    errors.push(`Multiple open-ended versions detected: ${openVersions.map(v => `v${v.versionNumber}`).join(', ')}`);
  }

  // Check for overlaps
  for (let i = 0; i < versions.length; i++) {
    for (let j = i + 1; j < versions.length; j++) {
      const a = versions[i];
      const b = versions[j];
      const aEnd = a.effectiveUntil ?? '9999-12-31';
      const bEnd = b.effectiveUntil ?? '9999-12-31';
      const overlap = a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd;
      if (overlap) {
        errors.push(
          `Version ${a.versionNumber} (${a.effectiveFrom}–${a.effectiveUntil ?? '∞'}) ` +
          `overlaps with Version ${b.versionNumber} (${b.effectiveFrom}–${b.effectiveUntil ?? '∞'})`
        );
      }
    }
  }

  return errors;
}

// ─── Private Utilities ────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

function generateVersionId(): string {
  // Use crypto.randomUUID if available (browser + Node 18+), otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Simple UUID v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Checks if a string looks like a version ID (UUID format) */
function isVersionId(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
