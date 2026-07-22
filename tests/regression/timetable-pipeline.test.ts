import { describe, it, expect } from 'vitest';
import {
  buildSlotDictionary,
  detectConsecutiveBlocks,
  classifyGroupedBlocks,
  validatePipeline,
  rebuildTimetableFromGrid,
  DetectedGrid,
  SlotCatalogEntry,
} from '../../src/lib/timetable-parser/index';

describe('Deterministic Timetable Pipeline Regression Suite', () => {
  const sampleCatalog: SlotCatalogEntry[] = [
    { slotCode: 'G', subjectName: 'Object Oriented Programming', code: 'CS101', faculty: 'Dr. Alice' },
    { slotCode: 'H', subjectName: 'Embedded Systems Design', code: 'CS102', faculty: 'Dr. Bob' },
  ];

  const sampleGrid: DetectedGrid = {
    headers: [
      { colIndex: 1, startTime: '09:00', endTime: '09:55', isBreak: false, label: '9:00-9:55' },
      { colIndex: 2, startTime: '10:00', endTime: '10:55', isBreak: false, label: '10:00-10:55' },
      { colIndex: 3, startTime: '11:00', endTime: '11:55', isBreak: false, label: '11:00-11:55' },
    ],
    rows: [
      {
        day: 'MONDAY',
        cells: [
          { colIndex: 1, rawText: 'G' },
          { colIndex: 2, rawText: 'G' },
          { colIndex: 3, rawText: 'H' },
        ],
      },
    ],
    totalOccupiedCells: 3,
  };

  it('1. Authoritative Slot Dictionary: maps slot codes strictly without guessing', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    expect(dictionary.lookupMap['G'].subjectName).toBe('Object Oriented Programming');
    expect(dictionary.lookupMap['H'].faculty).toBe('Dr. Bob');
  });

  it('2. Consecutive Block Grouping: merges adjacent identical slot blocks (G G)', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const blocks = detectConsecutiveBlocks(sampleGrid, dictionary);

    expect(blocks.length).toBe(2);
    // Block 1: G G on Monday from 09:00 to 10:55
    expect(blocks[0].subjectName).toBe('Object Oriented Programming');
    expect(blocks[0].startTime).toBe('09:00');
    expect(blocks[0].endTime).toBe('10:55');
    expect(blocks[0].cellCount).toBe(2);

    // Block 2: H on Monday from 11:00 to 11:55
    expect(blocks[1].subjectName).toBe('Embedded Systems Design');
    expect(blocks[1].startTime).toBe('11:00');
    expect(blocks[1].endTime).toBe('11:55');
    expect(blocks[1].cellCount).toBe(1);
  });

  it('3. Session Classification: does not force LAB unless configured', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const blocks = detectConsecutiveBlocks(sampleGrid, dictionary);

    // Default configuration (Theory Only)
    const sessionsDefault = classifyGroupedBlocks(blocks, {
      'object oriented programming': { hasLab: false },
    });

    expect(sessionsDefault[0].componentType).toBe('THEORY');

    // Configured with Theory+Lab
    const sessionsLab = classifyGroupedBlocks(blocks, {
      'object oriented programming': { hasLab: true },
    });

    expect(sessionsLab[0].componentType).toBe('LAB');
  });

  it('4. Deterministic Validation Engine: detects cell counts and impossible times', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const blocks = detectConsecutiveBlocks(sampleGrid, dictionary);
    const sessions = classifyGroupedBlocks(blocks);

    const report = validatePipeline(sampleGrid, dictionary, blocks, sessions);
    expect(report.isValid).toBe(true);
    expect(report.occupiedCellCount).toBe(3);
    expect(report.mappedCellCount).toBe(3);
  });

  it('5. Dynamic Zero-Cache Rebuild: regenerates timetable from grid on config change', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const result1 = rebuildTimetableFromGrid(sampleGrid, dictionary, {
      'object oriented programming': { hasLab: false },
    });

    expect(result1.timetableEntries[0].componentType).toBe('THEORY');

    const result2 = rebuildTimetableFromGrid(sampleGrid, dictionary, {
      'object oriented programming': { hasLab: true },
    });

    expect(result2.timetableEntries[0].componentType).toBe('LAB');
  });

  it('6. Header Alignment: auto-aligns header colIndex 0 to cell colIndex 1 preventing 1-hour time shift', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const unalignedGrid: DetectedGrid = {
      headers: [
        { colIndex: 0, startTime: '09:00', endTime: '09:55', isBreak: false, label: '9:00-9:55' },
        { colIndex: 1, startTime: '10:00', endTime: '10:55', isBreak: false, label: '10:00-10:55' },
      ],
      rows: [
        {
          day: 'MONDAY',
          cells: [
            { colIndex: 1, rawText: 'G' },
          ],
        },
      ],
      totalOccupiedCells: 1,
    };

    const blocks = detectConsecutiveBlocks(unalignedGrid, dictionary);
    expect(blocks.length).toBe(1);
    expect(blocks[0].startTime).toBe('09:00');
    expect(blocks[0].endTime).toBe('09:55');
  });

  it('7. Lunch & Break Filtering: ignores break columns and lunch cell text completely', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const breakGrid: DetectedGrid = {
      headers: [
        { colIndex: 1, startTime: '09:00', endTime: '09:55', isBreak: false, label: '9:00-9:55' },
        { colIndex: 2, startTime: '12:30', endTime: '13:30', isBreak: true, label: 'LUNCH BREAK' },
      ],
      rows: [
        {
          day: 'MONDAY',
          cells: [
            { colIndex: 1, rawText: 'G' },
            { colIndex: 2, rawText: 'LUNCH' },
          ],
        },
      ],
      totalOccupiedCells: 2,
    };

    const blocks = detectConsecutiveBlocks(breakGrid, dictionary);
    expect(blocks.length).toBe(1);
    expect(blocks[0].subjectName).toBe('Object Oriented Programming');
  });

  it('8. Fail-Fast Gate: returns empty subjects and entries if unmapped slots exist', () => {
    const dictionary = buildSlotDictionary(sampleCatalog);
    const invalidGrid: DetectedGrid = {
      headers: [
        { colIndex: 1, startTime: '09:00', endTime: '09:55', isBreak: false, label: '9:00-9:55' },
      ],
      rows: [
        {
          day: 'MONDAY',
          cells: [
            { colIndex: 1, rawText: 'UNKNOWN_SLOT_XYZ' },
          ],
        },
      ],
      totalOccupiedCells: 1,
    };

    const result = rebuildTimetableFromGrid(invalidGrid, dictionary);
    expect(result.validationReport.isValid).toBe(false);
    expect(result.subjects.length).toBe(0);
    expect(result.timetableEntries.length).toBe(0);
  });
});
