/**
 * Unit tests for timetable-version-store.ts
 *
 * Tests every core function in the pure service layer to verify:
 * - Version resolution (correct version per date)
 * - Version creation (closes previous, opens new)
 * - Legacy migration (flat entries → Version 1)
 * - Override key migration (6-part → 7-part)
 * - Integrity validation (overlap detection)
 */

import { describe, it, expect } from 'vitest';
import {
  resolveVersionForDate,
  getEntriesForDate,
  createNewVersion,
  migrateFromLegacy,
  migrateOverrideKeys,
  buildVersionedLectureId,
  parseVersionedLectureId,
  getActiveVersion,
  isVersionReferenced,
  validateVersionIntegrity,
} from '@/features/timetable/services/timetable-version-store';
import type { TimetableVersion, TimetableEntry } from '@/features/attendance/services/attendance-store';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENTRY_PHYSICS: TimetableEntry = {
  day: 'MONDAY',
  subjectName: 'Physics',
  componentType: 'THEORY',
  startTime: '09:00',
  endTime: '10:00',
};

const ENTRY_CHEMISTRY: TimetableEntry = {
  day: 'TUESDAY',
  subjectName: 'Chemistry',
  componentType: 'LAB',
  startTime: '11:00',
  endTime: '13:00',
};

const ENTRY_MATH: TimetableEntry = {
  day: 'WEDNESDAY',
  subjectName: 'Mathematics',
  componentType: 'THEORY',
  startTime: '14:00',
  endTime: '15:00',
};

function makeVersion(
  id: string,
  versionNumber: number,
  effectiveFrom: string,
  effectiveUntil: string | null,
  status: TimetableVersion['status'],
  entries: TimetableEntry[]
): TimetableVersion {
  return { id, versionNumber, effectiveFrom, effectiveUntil, status, createdAt: '2026-01-01T00:00:00Z', entries };
}

const V1 = makeVersion('v1-uuid', 1, '2026-08-01', '2026-09-15', 'HISTORICAL', [ENTRY_PHYSICS]);
const V2 = makeVersion('v2-uuid', 2, '2026-09-16', '2026-10-31', 'HISTORICAL', [ENTRY_PHYSICS, ENTRY_CHEMISTRY]);
const V3 = makeVersion('v3-uuid', 3, '2026-11-01', null, 'ACTIVE', [ENTRY_PHYSICS, ENTRY_CHEMISTRY, ENTRY_MATH]);

const ALL_VERSIONS = [V1, V2, V3];

// ─── resolveVersionForDate ─────────────────────────────────────────────────────

describe('resolveVersionForDate', () => {
  it('resolves V1 for a date within its range', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-08-15');
    expect(v?.versionNumber).toBe(1);
  });

  it('resolves V1 exactly on its effectiveFrom date', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-08-01');
    expect(v?.versionNumber).toBe(1);
  });

  it('resolves V1 exactly on its effectiveUntil date', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-09-15');
    expect(v?.versionNumber).toBe(1);
  });

  it('resolves V2 exactly on its effectiveFrom date', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-09-16');
    expect(v?.versionNumber).toBe(2);
  });

  it('resolves V3 for a date in the open-ended range', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-12-31');
    expect(v?.versionNumber).toBe(3);
  });

  it('resolves V3 exactly on its effectiveFrom date', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-11-01');
    expect(v?.versionNumber).toBe(3);
  });

  it('returns null for a date before any version', () => {
    const v = resolveVersionForDate(ALL_VERSIONS, '2026-07-31');
    expect(v).toBeNull();
  });

  it('returns null for empty versions array', () => {
    const v = resolveVersionForDate([], '2026-09-01');
    expect(v).toBeNull();
  });

  it('handles single open-ended version covering all dates', () => {
    const only = [makeVersion('x', 1, '2026-01-01', null, 'ACTIVE', [ENTRY_PHYSICS])];
    expect(resolveVersionForDate(only, '2026-06-15')?.versionNumber).toBe(1);
    expect(resolveVersionForDate(only, '2030-01-01')?.versionNumber).toBe(1);
  });
});

// ─── getEntriesForDate ────────────────────────────────────────────────────────

describe('getEntriesForDate', () => {
  it('returns V1 entries for a V1 date', () => {
    const entries = getEntriesForDate(ALL_VERSIONS, '2026-09-01');
    expect(entries).toHaveLength(1);
    expect(entries[0].subjectName).toBe('Physics');
  });

  it('returns V2 entries for a V2 date', () => {
    const entries = getEntriesForDate(ALL_VERSIONS, '2026-10-01');
    expect(entries).toHaveLength(2);
  });

  it('returns V3 entries for a V3 date', () => {
    const entries = getEntriesForDate(ALL_VERSIONS, '2026-11-15');
    expect(entries).toHaveLength(3);
  });

  it('returns empty array for a date before any version', () => {
    const entries = getEntriesForDate(ALL_VERSIONS, '2026-07-01');
    expect(entries).toHaveLength(0);
  });
});

// ─── createNewVersion ─────────────────────────────────────────────────────────

describe('createNewVersion', () => {
  it('creates V1 when no versions exist', () => {
    const result = createNewVersion([], [ENTRY_PHYSICS], '2026-08-01');
    expect(result).toHaveLength(1);
    expect(result[0].versionNumber).toBe(1);
    expect(result[0].effectiveFrom).toBe('2026-08-01');
    expect(result[0].effectiveUntil).toBeNull();
    expect(result[0].status).toBe('ACTIVE');
  });

  it('closes the previous active version one day before', () => {
    const initial = createNewVersion([], [ENTRY_PHYSICS], '2026-08-01');
    const result = createNewVersion(initial, [ENTRY_CHEMISTRY], '2026-09-16');

    const v1 = result.find(v => v.versionNumber === 1);
    const v2 = result.find(v => v.versionNumber === 2);

    expect(v1?.effectiveUntil).toBe('2026-09-15'); // one day before v2
    expect(v1?.status).toBe('HISTORICAL');
    expect(v2?.effectiveUntil).toBeNull();
    expect(v2?.status).toBe('ACTIVE');
  });

  it('correctly numbers versions sequentially', () => {
    let versions: TimetableVersion[] = [];
    versions = createNewVersion(versions, [ENTRY_PHYSICS], '2026-08-01');
    versions = createNewVersion(versions, [ENTRY_CHEMISTRY], '2026-09-01');
    versions = createNewVersion(versions, [ENTRY_MATH], '2026-10-01');
    expect(versions.map(v => v.versionNumber).sort()).toEqual([1, 2, 3]);
  });

  it('does not modify existing lecture history (pure function — no side effects)', () => {
    const original = [V1, V2, V3];
    const originalCopy = JSON.stringify(original);
    createNewVersion(original, [ENTRY_MATH], '2027-01-01');
    expect(JSON.stringify(original)).toBe(originalCopy);
  });

  it('sorts result by effectiveFrom ascending', () => {
    let versions: TimetableVersion[] = [];
    versions = createNewVersion(versions, [ENTRY_PHYSICS], '2026-08-01');
    versions = createNewVersion(versions, [ENTRY_CHEMISTRY], '2026-09-16');
    versions = createNewVersion(versions, [ENTRY_MATH], '2026-11-01');
    expect(versions[0].effectiveFrom).toBe('2026-08-01');
    expect(versions[1].effectiveFrom).toBe('2026-09-16');
    expect(versions[2].effectiveFrom).toBe('2026-11-01');
  });
});

// ─── migrateFromLegacy ────────────────────────────────────────────────────────

describe('migrateFromLegacy', () => {
  it('wraps timetableEntries as Version 1 with correct effectiveFrom', () => {
    const result = migrateFromLegacy([ENTRY_PHYSICS], '2026-08-01', []);
    expect(result).toHaveLength(1);
    expect(result[0].versionNumber).toBe(1);
    expect(result[0].effectiveFrom).toBe('2026-08-01');
    expect(result[0].status).toBe('ACTIVE');
    expect(result[0].entries).toEqual([ENTRY_PHYSICS]);
  });

  it('returns empty array when there are no entries to migrate', () => {
    const result = migrateFromLegacy([], '2026-08-01', []);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when timetableEntries is undefined', () => {
    const result = migrateFromLegacy(undefined, '2026-08-01', []);
    expect(result).toHaveLength(0);
  });

  it('is idempotent — returns existing versions unchanged if they exist', () => {
    const existing = [V1, V2, V3];
    const result = migrateFromLegacy([ENTRY_PHYSICS], '2026-08-01', existing);
    expect(result).toBe(existing); // same reference
    expect(result).toHaveLength(3);
  });

  it('uses today as fallback when startDate is undefined', () => {
    const result = migrateFromLegacy([ENTRY_PHYSICS], undefined, []);
    expect(result).toHaveLength(1);
    // effective_from should be a valid date string
    expect(result[0].effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── migrateOverrideKeys ─────────────────────────────────────────────────────

describe('migrateOverrideKeys', () => {
  const versions = [
    makeVersion('aaaaaaaa-0000-4000-8000-000000000001', 1, '2026-08-01', '2026-09-15', 'HISTORICAL', []),
    makeVersion('bbbbbbbb-0000-4000-8000-000000000002', 2, '2026-09-16', null, 'ACTIVE', []),
  ];

  it('upgrades a 6-part key to 7-part by prepending the version ID', () => {
    const overrides = [
      { lectureId: '2026-08-10|MONDAY|Physics|THEORY|09:00|10:00', status: 'CONDUCTED' as const, attendance: 'PRESENT' as const },
    ];
    const result = migrateOverrideKeys(overrides, versions);
    expect(result[0].lectureId.startsWith('aaaaaaaa-0000-4000-8000-000000000001|')).toBe(true);
    expect(result[0].lectureId.split('|')).toHaveLength(7);
  });

  it('does not re-migrate already-migrated 7-part keys', () => {
    const originalId = 'aaaaaaaa-0000-4000-8000-000000000001|2026-08-10|MONDAY|Physics|THEORY|09:00|10:00';
    const overrides = [
      { lectureId: originalId, status: 'CONDUCTED' as const, attendance: 'PRESENT' as const },
    ];
    const result = migrateOverrideKeys(overrides, versions);
    expect(result[0].lectureId).toBe(originalId);
  });

  it('preserves all extra fields from AttendanceOverride', () => {
    const overrides = [
      {
        lectureId: '2026-09-20|FRIDAY|Chemistry|LAB|11:00|13:00',
        status: 'CONDUCTED' as const,
        attendance: 'ABSENT' as const,
        notesOverride: 'faculty absent',
      },
    ];
    const result = migrateOverrideKeys(overrides, versions);
    expect((result[0] as any).notesOverride).toBe('faculty absent');
    expect(result[0].attendance).toBe('ABSENT');
  });

  it('leaves keys unchanged when no matching version is found', () => {
    const beforeAnyVersion = [
      { lectureId: '2025-01-01|MONDAY|Physics|THEORY|09:00|10:00', status: 'CONDUCTED' as const, attendance: 'PRESENT' as const },
    ];
    const result = migrateOverrideKeys(beforeAnyVersion, versions);
    // Cannot match to any version → original ID preserved
    expect(result[0].lectureId).toBe(beforeAnyVersion[0].lectureId);
  });
});

// ─── buildVersionedLectureId / parseVersionedLectureId ───────────────────────

describe('Lecture ID builder and parser', () => {
  it('builds a 7-part versioned ID', () => {
    const id = buildVersionedLectureId('v1-id', '2026-08-10', 'monday', 'Physics', 'THEORY', '09:00', '10:00');
    const parts = id.split('|');
    expect(parts).toHaveLength(7);
    expect(parts[0]).toBe('v1-id');
    expect(parts[2]).toBe('MONDAY'); // uppercased
  });

  it('round-trips through parse correctly', () => {
    const id = buildVersionedLectureId('v3-id', '2026-11-15', 'WEDNESDAY', 'Mathematics', 'THEORY', '14:00', '15:00');
    const parsed = parseVersionedLectureId(id);
    expect(parsed).not.toBeNull();
    expect(parsed?.versionId).toBe('v3-id');
    expect(parsed?.date).toBe('2026-11-15');
    expect(parsed?.subjectName).toBe('Mathematics');
    expect(parsed?.startTime).toBe('14:00');
  });

  it('returns null for invalid / legacy IDs', () => {
    expect(parseVersionedLectureId('2026-08-10|MONDAY|Physics|THEORY|09:00|10:00')).toBeNull();
    expect(parseVersionedLectureId('bad')).toBeNull();
  });
});

// ─── getActiveVersion ─────────────────────────────────────────────────────────

describe('getActiveVersion', () => {
  it('returns the only ACTIVE open-ended version', () => {
    const active = getActiveVersion(ALL_VERSIONS);
    expect(active?.versionNumber).toBe(3);
  });

  it('returns null when no active version exists', () => {
    const allHistorical = [V1, V2];
    expect(getActiveVersion(allHistorical)).toBeNull();
  });
});

// ─── isVersionReferenced ─────────────────────────────────────────────────────

describe('isVersionReferenced', () => {
  it('returns true when override keys reference the version', () => {
    const keys = ['v1-uuid|2026-08-10|MONDAY|Physics|THEORY|09:00|10:00'];
    expect(isVersionReferenced('v1-uuid', keys)).toBe(true);
  });

  it('returns false when no keys reference the version', () => {
    const keys = ['v2-uuid|2026-09-20|FRIDAY|Chemistry|LAB|11:00|13:00'];
    expect(isVersionReferenced('v1-uuid', keys)).toBe(false);
  });

  it('returns false for empty keys array', () => {
    expect(isVersionReferenced('v1-uuid', [])).toBe(false);
  });
});

// ─── validateVersionIntegrity ────────────────────────────────────────────────

describe('validateVersionIntegrity', () => {
  it('returns no errors for well-formed non-overlapping versions', () => {
    const errors = validateVersionIntegrity(ALL_VERSIONS);
    expect(errors).toHaveLength(0);
  });

  it('detects multiple open-ended versions', () => {
    const broken = [
      makeVersion('a', 1, '2026-08-01', null, 'ACTIVE', []),
      makeVersion('b', 2, '2026-09-01', null, 'ACTIVE', []),
    ];
    const errors = validateVersionIntegrity(broken);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Multiple open-ended versions');
  });

  it('detects date range overlap', () => {
    const overlapping = [
      makeVersion('a', 1, '2026-08-01', '2026-09-30', 'HISTORICAL', []),
      makeVersion('b', 2, '2026-09-15', null, 'ACTIVE', []),
    ];
    const errors = validateVersionIntegrity(overlapping);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('overlaps'))).toBe(true);
  });

  it('returns no errors for an empty array', () => {
    expect(validateVersionIntegrity([])).toHaveLength(0);
  });
});
