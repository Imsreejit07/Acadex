import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── Pipeline Types & Intermediate Representation (IR) ─────────────────────

export type ColumnHeader = {
  colIndex: number;
  startTime: string; // 24h format HH:mm
  endTime: string;   // 24h format HH:mm
  isBreak: boolean;
  label: string;
};

export type GridCell = {
  colIndex: number;
  rawText: string;
};

export type GridRow = {
  day: string; // MONDAY, TUESDAY, etc.
  cells: GridCell[];
};

export type DetectedGrid = {
  headers: ColumnHeader[];
  rows: GridRow[];
  totalOccupiedCells: number;
};

export type SlotCatalogEntry = {
  slotCode: string;
  subjectName: string;
  code: string;
  faculty: string;
};

export type SlotDictionary = {
  entries: SlotCatalogEntry[];
  lookupMap: Record<string, SlotCatalogEntry>;
};

export type GroupedBlock = {
  id: string;
  day: string;
  slotCode: string;
  subjectName: string;
  faculty: string;
  code: string;
  startCol: number;
  endCol: number;
  startTime: string;
  endTime: string;
  cellCount: number;
};

export type ClassifiedSession = {
  id: string;
  day: string;
  subjectName: string;
  code: string;
  faculty: string;
  componentType: 'THEORY' | 'LAB';
  startTime: string;
  endTime: string;
};

export type ValidationReport = {
  isValid: boolean;
  occupiedCellCount: number;
  mappedCellCount: number;
  groupedBlockCount: number;
  classifiedSessionCount: number;
  duplicateSessions: string[];
  overlappingSessions: string[];
  impossibleTimes: string[];
  errors: string[];
  warnings: string[];
};

export type ParsedSubject = {
  id: string;
  name: string;
  code: string;
  faculty: string;
  color: string;
  hasLab: boolean;
  theoryTarget: number;
  labTarget: number;
  credits: number | null;
};

export type PipelineStep = {
  step: string;
  status: 'ok' | 'warn' | 'error' | 'skip';
  detail: string;
  ms: number;
};

export type PipelineLog = {
  steps: PipelineStep[];
  parserType: string;
  parserModel: string;
  parserReason: string;
  rawMarkdownChars: number;
  tableRowsDetected: number;
  subjectCatalogEntries: number;
  deterministicSubjects: number;
  deterministicEntries: number;
  aiSubjects: number;
  aiEntries: number;
  finalSubjects: number;
  finalEntries: number;
  processingMs: number;
  warnings: string[];
};

export type TimetableParseResult = {
  subjects: ParsedSubject[];
  timetableEntries: ClassifiedSession[];
  verificationLog: string;
  pipelineLog: PipelineLog;
  rawMarkdown: string;
  // Intermediate Representation for Debug Mode & Inspection
  detectedGrid: DetectedGrid;
  slotDictionary: SlotDictionary;
  groupedBlocks: GroupedBlock[];
  validationReport: ValidationReport;
  error?: string;
  details?: string;
};

const COLOR_PALETTE = ['#6366f1', '#10b981', '#f43f5e', '#8b5cf6', '#06b6d4', '#3b82f6', '#f59e0b', '#ec4899'];

const RAW_GRID_EXTRACTION_PROMPT = `You are a 2D OCR Table Extractor. Your single task is to extract the 2D grid matrix and the subject lookup table from this timetable PDF.

Return ONLY a valid JSON object matching this exact shape:
{
  "columnHeaders": [
    {
      "colIndex": 1,
      "startTime": "09:00",
      "endTime": "09:55",
      "isBreak": false,
      "label": "9:00-9:55"
    }
  ],
  "gridRows": [
    {
      "day": "MONDAY",
      "cells": [
        {
          "colIndex": 1,
          "rawText": "G"
        }
      ]
    }
  ],
  "subjectCatalog": [
    {
      "slotCode": "G",
      "subjectName": "Object Oriented Programming",
      "code": "CS101",
      "faculty": "Dr. X"
    }
  ]
}

### EXTRACTION INSTRUCTIONS:
1. "columnHeaders": Identify all time columns from left to right. Extract start/end times in 24h format (HH:mm). Mark lunch/breaks as "isBreak": true.
2. "gridRows": Scan each day (MONDAY to SUNDAY). For every non-empty cell under column header "colIndex", extract the raw cell text (e.g. "G", "CS101", or full subject name). Do not guess or modify cell contents.
3. "subjectCatalog": Extract the subject/slot lookup legend table if present. Map every slot code (e.g., "G", "H", "CS101") to its full subject name, course code, and faculty.
4. DO NOT do time math, DO NOT merge cells across columns, DO NOT invent slots. Output ONLY raw grid coordinates and catalog data.`;

// ─── Test Connection Handler ──────────────────────────────────────────────

export async function testLlmConnection(): Promise<{ success: boolean; parserType: string; model: string; message: string; details?: string }> {
  if (!GEMINI_API_KEY) {
    return {
      success: false,
      parserType: 'gemini',
      model: 'none',
      message: 'GEMINI_API_KEY is not set in environment variables.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: 'Say "Connection OK" in exactly 2 words',
    });
    const text = response.text?.trim() || 'No response';
    return {
      success: true,
      parserType: 'gemini',
      model: 'gemini-2.5-flash-lite',
      message: `Successfully connected to Gemini API. Reply: "${text}"`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      parserType: 'gemini',
      model: 'gemini-2.5-flash-lite',
      message: 'Failed to connect to Gemini API.',
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Stage 1: Build Authoritative Slot Dictionary ──────────────────────────

export function buildSlotDictionary(rawCatalog: SlotCatalogEntry[]): SlotDictionary {
  const lookupMap: Record<string, SlotCatalogEntry> = {};
  const entries: SlotCatalogEntry[] = [];

  for (const entry of rawCatalog) {
    if (!entry.slotCode && !entry.subjectName) continue;
    const codeKey = (entry.slotCode || entry.code || entry.subjectName).trim().toUpperCase();
    const cleanEntry: SlotCatalogEntry = {
      slotCode: codeKey,
      subjectName: entry.subjectName?.trim() || codeKey,
      code: entry.code?.trim() || codeKey,
      faculty: entry.faculty?.trim() || 'Unknown Faculty',
    };

    if (codeKey) {
      lookupMap[codeKey] = cleanEntry;
    }
    entries.push(cleanEntry);
  }

  return { entries, lookupMap };
}

// ─── Stage 2: Consecutive Block Grouping ───────────────────────────────────

export function detectConsecutiveBlocks(
  grid: DetectedGrid,
  dictionary: SlotDictionary
): GroupedBlock[] {
  const groupedBlocks: GroupedBlock[] = [];
  const headerMap = new Map<number, ColumnHeader>();
  grid.headers.forEach(h => headerMap.set(h.colIndex, h));

  for (const row of grid.rows) {
    const day = row.day.toUpperCase();
    const sortedCells = [...row.cells].sort((a, b) => a.colIndex - b.colIndex);

    let currentBlock: {
      slotCode: string;
      subjectName: string;
      faculty: string;
      code: string;
      startCol: number;
      endCol: number;
      cellCount: number;
    } | null = null;

    for (const cell of sortedCells) {
      const header = headerMap.get(cell.colIndex);
      if (!header || header.isBreak) continue;

      const rawText = cell.rawText.trim();
      if (!rawText || rawText === '-' || rawText === '|') continue;

      const upperKey = rawText.toUpperCase();
      const mapped = dictionary.lookupMap[upperKey];

      const slotCode = mapped ? mapped.slotCode : upperKey;
      const subjectName = mapped ? mapped.subjectName : rawText;
      const faculty = mapped ? mapped.faculty : 'Unknown Faculty';
      const code = mapped ? mapped.code : 'SUBJ';

      if (
        currentBlock &&
        currentBlock.subjectName.toLowerCase() === subjectName.toLowerCase() &&
        cell.colIndex === currentBlock.endCol + 1
      ) {
        currentBlock.endCol = cell.colIndex;
        currentBlock.cellCount += 1;
      } else {
        if (currentBlock) {
          const startH = headerMap.get(currentBlock.startCol)!;
          const endH = headerMap.get(currentBlock.endCol)!;
          groupedBlocks.push({
            id: Math.random().toString(36).substr(2, 9),
            day,
            slotCode: currentBlock.slotCode,
            subjectName: currentBlock.subjectName,
            faculty: currentBlock.faculty,
            code: currentBlock.code,
            startCol: currentBlock.startCol,
            endCol: currentBlock.endCol,
            startTime: startH.startTime,
            endTime: endH.endTime,
            cellCount: currentBlock.cellCount,
          });
        }

        currentBlock = {
          slotCode,
          subjectName,
          faculty,
          code,
          startCol: cell.colIndex,
          endCol: cell.colIndex,
          cellCount: 1,
        };
      }
    }

    if (currentBlock) {
      const startH = headerMap.get(currentBlock.startCol)!;
      const endH = headerMap.get(currentBlock.endCol)!;
      groupedBlocks.push({
        id: Math.random().toString(36).substr(2, 9),
        day,
        slotCode: currentBlock.slotCode,
        subjectName: currentBlock.subjectName,
        faculty: currentBlock.faculty,
        code: currentBlock.code,
        startCol: currentBlock.startCol,
        endCol: currentBlock.endCol,
        startTime: startH.startTime,
        endTime: endH.endTime,
        cellCount: currentBlock.cellCount,
      });
    }
  }

  return groupedBlocks;
}

// ─── Stage 3: Session Classification & Dynamic Rebuild ──────────────────────

export function classifyGroupedBlocks(
  blocks: GroupedBlock[],
  subjectConfigs: Record<string, { hasLab: boolean }> = {}
): ClassifiedSession[] {
  return blocks.map(block => {
    const key = block.subjectName.toLowerCase();
    const config = subjectConfigs[key];

    let componentType: 'THEORY' | 'LAB' = 'THEORY';
    if (config?.hasLab) {
      if (block.cellCount >= 2 || block.slotCode.toLowerCase().includes('lab')) {
        componentType = 'LAB';
      }
    } else if (block.slotCode.toLowerCase().includes('lab') || block.subjectName.toLowerCase().includes('lab')) {
      componentType = 'LAB';
    }

    return {
      id: block.id,
      day: block.day,
      subjectName: block.subjectName,
      code: block.code,
      faculty: block.faculty,
      componentType,
      startTime: block.startTime,
      endTime: block.endTime,
    };
  });
}

// ─── Stage 4: Deterministic Validation Engine ──────────────────────────────

export function validatePipeline(
  grid: DetectedGrid,
  dictionary: SlotDictionary,
  blocks: GroupedBlock[],
  sessions: ClassifiedSession[]
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateSessions: string[] = [];
  const overlappingSessions: string[] = [];
  const impossibleTimes: string[] = [];

  let occupiedCellCount = 0;
  for (const r of grid.rows) {
    occupiedCellCount += r.cells?.length || 0;
  }

  let mappedCellCount = 0;
  for (const b of blocks) {
    mappedCellCount += b.cellCount;
  }

  for (const s of sessions) {
    const [sH, sM] = s.startTime.split(':').map(Number);
    const [eH, eM] = s.endTime.split(':').map(Number);

    if (isNaN(sH) || isNaN(eH) || sH > eH || (sH === eH && sM >= eM)) {
      impossibleTimes.push(`${s.subjectName} on ${s.day} (${s.startTime} - ${s.endTime})`);
    }
  }

  const sessionsByDay = new Map<string, ClassifiedSession[]>();
  for (const s of sessions) {
    if (!sessionsByDay.has(s.day)) sessionsByDay.set(s.day, []);
    sessionsByDay.get(s.day)!.push(s);
  }

  for (const [day, daySessions] of sessionsByDay.entries()) {
    for (let i = 0; i < daySessions.length; i++) {
      for (let j = i + 1; j < daySessions.length; j++) {
        const a = daySessions[i];
        const b = daySessions[j];

        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          overlappingSessions.push(`${day}: "${a.subjectName}" (${a.startTime}-${a.endTime}) overlaps with "${b.subjectName}" (${b.startTime}-${b.endTime})`);
        }
      }
    }
  }

  if (impossibleTimes.length > 0) {
    errors.push(`Found ${impossibleTimes.length} impossible time ranges.`);
  }
  if (overlappingSessions.length > 0) {
    warnings.push(`Found ${overlappingSessions.length} overlapping session(s).`);
  }

  return {
    isValid: errors.length === 0,
    occupiedCellCount,
    mappedCellCount,
    groupedBlockCount: blocks.length,
    classifiedSessionCount: sessions.length,
    duplicateSessions,
    overlappingSessions,
    impossibleTimes,
    errors,
    warnings,
  };
}

// ─── Stage 5: Zero-Cache Dynamic Rebuild API ────────────────────────────────

export function rebuildTimetableFromGrid(
  grid: DetectedGrid,
  dictionary: SlotDictionary,
  subjectConfigs: Record<string, { hasLab: boolean }> = {}
): { subjects: ParsedSubject[]; timetableEntries: ClassifiedSession[]; validationReport: ValidationReport } {
  const blocks = detectConsecutiveBlocks(grid, dictionary);
  const sessions = classifyGroupedBlocks(blocks, subjectConfigs);
  const validationReport = validatePipeline(grid, dictionary, blocks, sessions);

  const subjectMap = new Map<string, ParsedSubject>();
  blocks.forEach((block) => {
    const key = block.subjectName.toLowerCase();
    if (!subjectMap.has(key)) {
      const config = subjectConfigs[key];
      subjectMap.set(key, {
        id: Math.random().toString(36).substr(2, 9),
        name: block.subjectName,
        code: block.code,
        faculty: block.faculty,
        color: COLOR_PALETTE[subjectMap.size % COLOR_PALETTE.length],
        hasLab: config?.hasLab ?? false,
        theoryTarget: 75,
        labTarget: 75,
        credits: null,
      });
    }
  });

  return {
    subjects: Array.from(subjectMap.values()),
    timetableEntries: sessions,
    validationReport,
  };
}

// ─── Main Pipeline Entry Point ─────────────────────────────────────────────

export async function parseTimetableFromBuffer(
  bytes: ArrayBuffer,
  fileName = 'timetable.pdf'
): Promise<TimetableParseResult> {
  const globalStart = Date.now();
  const fileSizeKB = Math.round(bytes.byteLength / 1024);

  const log: PipelineLog = {
    steps: [],
    parserType: 'gemini',
    parserModel: 'gemini-2.5-flash-lite',
    parserReason: 'Gemini 2D Grid Extraction + Deterministic Reconstruction Pipeline',
    rawMarkdownChars: 0,
    tableRowsDetected: 0,
    subjectCatalogEntries: 0,
    deterministicSubjects: 0,
    deterministicEntries: 0,
    aiSubjects: 0,
    aiEntries: 0,
    finalSubjects: 0,
    finalEntries: 0,
    processingMs: 0,
    warnings: [],
  };

  const addStep = (step: string, status: PipelineStep['status'], detail: string, startMs: number) => {
    log.steps.push({ step, status, detail, ms: Date.now() - startMs });
  };

  let t = Date.now();
  addStep('PDF received', 'ok', `${fileName} · ${fileSizeKB} KB`, t);

  if (!GEMINI_API_KEY) {
    addStep('Gemini API', 'error', 'GEMINI_API_KEY is not configured', Date.now());
    log.processingMs = Date.now() - globalStart;
    throw new Error('GEMINI_API_KEY is not set. Please configure it in your environment variables.');
  }

  try {
    t = Date.now();
    const base64Pdf = Buffer.from(bytes).toString('base64');
    addStep('PDF encoded', 'ok', `${base64Pdf.length.toLocaleString()} base64 chars`, t);

    t = Date.now();
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              text: RAW_GRID_EXTRACTION_PROMPT,
            },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 8192,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error('Gemini returned an empty response');
    }
    log.rawMarkdownChars = rawText.length;
    addStep('2D Grid Extraction', 'ok', `${rawText.length.toLocaleString()} chars received`, t);

    t = Date.now();
    const rawJson = parseLLMJson(rawText) as {
      columnHeaders?: ColumnHeader[];
      gridRows?: GridRow[];
      subjectCatalog?: SlotCatalogEntry[];
    };

    const detectedGrid: DetectedGrid = {
      headers: rawJson.columnHeaders || [],
      rows: rawJson.gridRows || [],
      totalOccupiedCells: 0,
    };
    for (const r of detectedGrid.rows) {
      detectedGrid.totalOccupiedCells += r.cells?.length || 0;
    }
    log.tableRowsDetected = detectedGrid.rows.length;

    const slotDictionary = buildSlotDictionary(rawJson.subjectCatalog || []);
    log.subjectCatalogEntries = slotDictionary.entries.length;
    addStep('Slot Dictionary Built', 'ok', `${slotDictionary.entries.length} catalog entries`, t);

    t = Date.now();
    const groupedBlocks = detectConsecutiveBlocks(detectedGrid, slotDictionary);
    const rebuildRes = rebuildTimetableFromGrid(detectedGrid, slotDictionary);

    log.finalSubjects = rebuildRes.subjects.length;
    log.finalEntries = rebuildRes.timetableEntries.length;

    addStep('Deterministic Block Grouping', 'ok', `${groupedBlocks.length} blocks constructed`, t);

    const validationReport = validatePipeline(detectedGrid, slotDictionary, groupedBlocks, rebuildRes.timetableEntries);
    log.warnings.push(...validationReport.warnings);
    addStep('Validation Engine', validationReport.isValid ? 'ok' : 'warn', `${validationReport.errors.length} error(s) · ${validationReport.warnings.length} warning(s)`, t);

    log.processingMs = Date.now() - globalStart;

    return {
      subjects: rebuildRes.subjects,
      timetableEntries: rebuildRes.timetableEntries,
      verificationLog: `Processed via Deterministic Grid Pipeline (${rebuildRes.subjects.length} subjects, ${rebuildRes.timetableEntries.length} entries)`,
      pipelineLog: log,
      rawMarkdown: rawText,
      detectedGrid,
      slotDictionary,
      groupedBlocks,
      validationReport,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.steps.push({ step: 'Fatal error', status: 'error', detail: errMsg, ms: Date.now() - globalStart });
    log.warnings.push(`Fatal: ${errMsg}`);
    log.processingMs = Date.now() - globalStart;
    throw new Error(errMsg);
  }
}

function parseLLMJson(raw: string): unknown {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini response did not contain valid JSON');
    }
    return JSON.parse(jsonMatch[0]);
  }
}
