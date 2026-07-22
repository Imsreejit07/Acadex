import { GoogleGenAI } from '@google/genai';

/**
 * Gemini-powered timetable parser.
 * Sends the PDF directly to Gemini — no OCR preprocessing, no fallbacks.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

type ParsedTimetable = {
  subjects: Array<{
    name: string;
    code: string;
    faculty: string;
    color: string;
    hasLab: boolean;
  }>;
  timetableEntries: Array<{
    day: string;
    subjectName: string;
    componentType: 'THEORY' | 'LAB';
    startTime: string;
    endTime: string;
  }>;
  verificationLog: string;
};const TIMETABLE_SYSTEM_PROMPT = `You are a precise college timetable extraction engine. Extract data from the provided university timetable PDF.

Return ONLY valid JSON with this exact shape — no markdown fences, no explanation, no other text:
{
  "subjects": [
    {
      "name": "subject name",
      "code": "course code or SUBJ",
      "faculty": "faculty name or Unknown Faculty",
      "color": "#3B82F6",
      "hasLab": false
    }
  ],
  "timetableEntries": [
    {
      "day": "MONDAY",
      "subjectName": "must match a subjects[].name",
      "componentType": "THEORY",
      "startTime": "09:00",
      "endTime": "10:00"
    }
  ],
  "verificationLog": "brief summary of extraction"
}

### CRITICAL TIME SLOT ALIGNMENT RULES (PERMANENT ACCURACY GUARANTEE)

1. COLUMN-TO-TIME BOUNDING & NO SHIFTING:
- First, identify and map all column header times from left to right (e.g. Column 1: 09:00-09:55, Column 2: 10:00-10:55, Column 3: 11:00-11:55, etc.).
- NEVER shift or offset time ranges across columns. A subject under Column 2 MUST be assigned Column 2's exact start and end time (10:00 to 10:55). NEVER shift it to Column 1's time (09:00 to 09:55).
- Verify every extracted slot's time range against its exact header column!

2. COMPLETE SLOT EXTRACTION (NO MISSING SLOTS):
- Scan every single row and cell methodically for every weekday (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday).
- Do not omit or skip any non-empty cell. Extract EVERY lecture/lab session present in the schedule grid.

3. OBJECTIVE & HALLUCINATION PREVENTION:
- Rely strictly on document structure. Never hallucinate or invent subjects, faculty, rooms, timings, or relationships.
- Do NOT output "UNKNOWN" subjects. If a cell cannot be resolved to a valid course/subject, ignore it.
- Empty cells remain omitted. Do NOT invent hypothetical slots.

4. BREAKS & SEPARATORS:
- Recognize non-academic slots (Lunch, Break, Recess, Interval) and ignore them. Do not include them in timetableEntries.

5. MERGED SESSION DETECTION & LAB CLASSIFICATION:
- If consecutive timetable cells represent the same session (same subject, adjacent time intervals), merge them into a single entry covering the combined duration.
- Infer componentType (THEORY or LAB). Lab sessions are typically 2+ hours long.`;

// ─── Pipeline Log Types ────────────────────────────────────────────────────

type PipelineStep = {
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

export type TimetableParseResult = ParsedTimetable & {
  pipelineLog: PipelineLog;
  rawMarkdown: string;
  error?: string;
  details?: string;
};

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
      model: 'gemini-2.0-flash',
      message: `Successfully connected to Gemini API. Reply: "${text}"`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      parserType: 'gemini',
      model: 'gemini-2.0-flash',
      message: 'Failed to connect to Gemini API.',
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Parse a timetable PDF using Gemini's native PDF understanding.
 * Accepts the raw PDF bytes and sends them directly to Gemini.
 */
export async function parseTimetableFromBuffer(
  bytes: ArrayBuffer,
  fileName = 'timetable.pdf',
): Promise<TimetableParseResult> {
  const globalStart = Date.now();
  const fileSizeKB = Math.round(bytes.byteLength / 1024);

  const log: PipelineLog = {
    steps: [],
    parserType: 'gemini',
    parserModel: 'gemini-2.0-flash',
    parserReason: 'GEMINI_API_KEY is set — using Gemini as primary parser',
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
              text: TIMETABLE_SYSTEM_PROMPT,
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

    addStep(
      'Gemini AI extraction',
      'ok',
      `${rawText.length.toLocaleString()} chars received`,
      t
    );

    // Parse the JSON response
    t = Date.now();
    const parsed = parseLLMJson(rawText);
    const normalized = normalizeParsedTimetable(parsed, 'Parsed using Gemini 2.0 Flash');

    log.aiSubjects = normalized.subjects.length;
    log.aiEntries = normalized.timetableEntries.length;

    // Apply auto lab detection
    const finalResult = autoDetectLabSessions(normalized);

    log.finalSubjects = finalResult.subjects.length;
    log.finalEntries = finalResult.timetableEntries.length;

    addStep(
      'Normalization & lab detection',
      finalResult.timetableEntries.length > 0 ? 'ok' : 'warn',
      `${finalResult.subjects.length} subjects · ${finalResult.timetableEntries.length} entries`,
      t
    );

    // Integrity check
    t = Date.now();
    const subjectNames = new Set(finalResult.subjects.map(s => s.name.toLowerCase()));
    const entrySubjectNames = new Set(finalResult.timetableEntries.map(e => e.subjectName.toLowerCase()));
    const orphanedSubjects = [...subjectNames].filter(n => !entrySubjectNames.has(n));
    const unmappedEntries = [...entrySubjectNames].filter(n => !subjectNames.has(n));

    if (orphanedSubjects.length > 0) {
      log.warnings.push(`${orphanedSubjects.length} subject(s) have no timetable entries: ${orphanedSubjects.join(', ')}`);
    }
    if (unmappedEntries.length > 0) {
      log.warnings.push(`${unmappedEntries.length} timetable entry subject(s) not in subject list: ${unmappedEntries.join(', ')}`);
    }

    addStep(
      'Validation',
      log.warnings.length > 0 ? 'warn' : 'ok',
      `${finalResult.subjects.length} subjects · ${finalResult.timetableEntries.length} entries · ${log.warnings.length} warning(s)`,
      t
    );

    log.processingMs = Date.now() - globalStart;

    return {
      ...finalResult,
      pipelineLog: log,
      rawMarkdown: `[PDF processed directly by Gemini — no raw markdown available]`,
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
  // Strip markdown fences if present
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(stripped);
  } catch {
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini response did not contain valid JSON');
    }
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Gemini response contained JSON-like content but could not be parsed');
    }
  }
}

function normalizeParsedTimetable(raw: unknown, verificationLog: string): ParsedTimetable {
  if (!isRecord(raw) || !Array.isArray(raw.subjects) || !Array.isArray(raw.timetableEntries)) {
    throw new Error('Gemini JSON did not match the timetable schema');
  }

  const timetable = raw as {
    subjects: unknown[];
    timetableEntries: unknown[];
  };

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1',
  ];
  const subjectMap = new Map<string, ParsedTimetable['subjects'][number]>();

  timetable.subjects.forEach((rawSubject, index) => {
    const subject = isRecord(rawSubject) ? rawSubject : {};
    const name = readString(subject.name).trim();
    if (!name) return;

    subjectMap.set(name.toLowerCase(), {
      name,
      code: readString(subject.code, 'SUBJ').trim() || 'SUBJ',
      faculty: readString(subject.faculty, 'Unknown Faculty').trim() || 'Unknown Faculty',
      color: /^#[0-9A-F]{6}$/i.test(readString(subject.color))
        ? readString(subject.color)
        : colors[index % colors.length],
      hasLab: Boolean(subject.hasLab),
    });
  });

  const validDays = new Set(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
  const timetableEntries: ParsedTimetable['timetableEntries'] = [];

  timetable.timetableEntries.forEach(rawEntry => {
    const entry = isRecord(rawEntry) ? rawEntry : {};
    const day = readString(entry.day).trim().toUpperCase();
    const subjectName = readString(entry.subjectName).trim();
    const componentType = readString(entry.componentType).trim().toUpperCase() === 'LAB' ? 'LAB' : 'THEORY';
    const startTime = normalizeTime(entry.startTime);
    const endTime = normalizeTime(entry.endTime);

    if (!validDays.has(day) || !subjectName || !startTime || !endTime) return;

    if (!subjectMap.has(subjectName.toLowerCase())) {
      subjectMap.set(subjectName.toLowerCase(), {
        name: subjectName,
        code: 'SUBJ',
        faculty: 'Unknown Faculty',
        color: colors[subjectMap.size % colors.length],
        hasLab: componentType === 'LAB',
      });
    } else if (componentType === 'LAB') {
      const existing = subjectMap.get(subjectName.toLowerCase());
      if (existing) existing.hasLab = true;
    }

    timetableEntries.push({ day, subjectName, componentType, startTime, endTime });
  });

  if (subjectMap.size === 0 || timetableEntries.length === 0) {
    throw new Error('Gemini did not extract any usable timetable entries');
  }

  return {
    subjects: Array.from(subjectMap.values()),
    timetableEntries,
    verificationLog,
  };
}

/**
 * Auto-detect lab sessions: merges consecutive classes of the same subject on the same day.
 * If the merged class duration is >= 100 minutes (2 periods), classifies it as a LAB session.
 */
function autoDetectLabSessions(timetable: ParsedTimetable): ParsedTimetable {
  const entriesByDay = new Map<string, typeof timetable.timetableEntries>();

  for (const entry of timetable.timetableEntries) {
    const day = entry.day.toUpperCase();
    if (!entriesByDay.has(day)) entriesByDay.set(day, []);
    entriesByDay.get(day)!.push(entry);
  }

  const mergedEntries: typeof timetable.timetableEntries = [];

  for (const entries of entriesByDay.values()) {
    const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const dayMerged: typeof timetable.timetableEntries = [];

    for (const entry of sorted) {
      if (dayMerged.length === 0) {
        dayMerged.push({ ...entry });
        continue;
      }
      const last = dayMerged[dayMerged.length - 1];
      const [lastEndH, lastEndM] = last.endTime.split(':').map(Number);
      const [currStartH, currStartM] = entry.startTime.split(':').map(Number);
      const gapMinutes = (currStartH * 60 + currStartM) - (lastEndH * 60 + lastEndM);

      if (last.subjectName.toLowerCase() === entry.subjectName.toLowerCase() && gapMinutes >= 0 && gapMinutes <= 15) {
        last.endTime = entry.endTime;
        if (entry.componentType === 'LAB') last.componentType = 'LAB';
      } else {
        dayMerged.push({ ...entry });
      }
    }
    mergedEntries.push(...dayMerged);
  }

  const finalEntries = mergedEntries.map(entry => {
    const [startH, startM] = entry.startTime.split(':').map(Number);
    const [endH, endM] = entry.endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    if (durationMinutes >= 100) {
      const subject = timetable.subjects.find(s => s.name.toLowerCase() === entry.subjectName.toLowerCase());
      if (subject) subject.hasLab = true;
      return { ...entry, componentType: 'LAB' as const };
    }
    return entry;
  });

  return {
    ...timetable,
    timetableEntries: finalEntries,
    verificationLog: timetable.verificationLog + '; consecutive slots merged & lab classification applied',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeTime(value: unknown): string | null {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  // Fallback to implicit afternoon hours (1:00 PM to 6:00 PM)
  if (hour >= 1 && hour <= 6) hour += 12;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
