import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Configuration for the LLM-backed parser.
 * Uses the local proxy (OpenAI-compatible) when available, falls back to deterministic parsing.
 */
const LLM_CONFIG = (() => {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
  const ollamaModel = process.env.OLLAMA_MODEL;
  const proxyUrl = process.env.LOCAL_PROXY_URL;
  const proxyKey = process.env.LOCAL_PROXY_KEY;
  const geminiKeys = parseGeminiApiKeys();
  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const allowLocalLlmInProduction = process.env.ALLOW_LOCAL_LLM_IN_PRODUCTION === 'true';
  const canUseLocalBackends = !isProduction || allowLocalLlmInProduction;

  // Prioritize local proxy (unified API key) if configured
  if (proxyUrl && proxyKey && (canUseLocalBackends || !isLoopbackUrl(proxyUrl))) {
    return {
      type: 'proxy' as const,
      baseUrl: proxyUrl.replace(/\/+$/, ''),
      apiKey: proxyKey,
      model: 'auto',
    };
  }

  // Fall back to local Ollama when configured. This keeps timetable parsing fully local.
  if (ollamaBaseUrl && ollamaModel && (canUseLocalBackends || !isLoopbackUrl(ollamaBaseUrl))) {
    return {
      type: 'ollama' as const,
      baseUrl: ollamaBaseUrl.replace(/\/+$/, ''),
      model: ollamaModel,
    };
  }

  // Next try direct Gemini API.
  if (geminiKeys.length > 0) {
    return {
      type: 'gemini' as const,
      apiKeys: geminiKeys,
      model: 'gemini-2.5-flash',
    };
  }

  return null;
})();

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
  deterministicDetail?: {
    layout: string;
    catalogSize: number;
  };
};

const TIMETABLE_SYSTEM_PROMPT = `You are a precise college timetable extraction engine. Extract data from OCR/Markdown tables.

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
  ]
}

### UNIVERSAL TIMETABLE PDF PARSING RULES

1. OBJECTIVE & HALLUCINATION PREVENTION (RULE 11, RULE 21, RULE 22)
- Rely strictly on document structure. Never hallucinate or invent subjects, faculty, rooms, timings, or relationships.
- Missing data must remain NULL (or default "Unknown Faculty" / "SUBJ" as defined in schema). Every extracted value should be traceable.

2. DOCUMENT ANALYSIS & TABLE DETECTION (RULE 1, RULE 2, RULE 10)
- Analyze table headers, text blocks, grid boundaries, and merged cells. Process weekly timetables, subject lists, faculty lists, and mapping tables independently.
- Do not merge secondary/legend mapping tables directly into timetable cell texts.

3. TIMETABLE ORIENTATION & LABELS (RULE 3, RULE 4, RULE 5)
- Determine if days are in rows or columns, and if times are in rows or columns.
- Recognize weekdays in all formats (e.g. Monday, Mon, M, MON).
- Detect start and end times. Convert and output in 24-hour HH:mm format. 
- Use explicit AM/PM tags if available, and fallback to implicit afternoon hours (13:00 to 18:00) if the numbers fall in the 1-6 range.

4. BREAKS & SEPARATORS (RULE 6)
- Recognize non-academic slots (Lunch, Break, Tea, Recess, Interval, Free Period) and ignore them. Do not include them in timetableEntries.

5. GRID STRUCTURE & CELL EXTRACTION (RULE 7, RULE 8, RULE 9)
- Preserve row/column coordinates. Empty/blank cells indicate no scheduled session; omit them from timetableEntries.
- Extract complete cell contents (subject name, course code, faculty, room, batch, section, slot code, lecture type).
- Never merge independent subjects. If multiple subject codes (e.g. CS102C and CS204C) appear in the same details or timetable row due to horizontal OCR text merging, discard the merged details and extract the subjects independently directly from the timetable grid cells.
- Use digit-based course codes matching (e.g. /\\b([A-Z¢©®]*\\d+[A-Z\\d¢©®]*)\\b/i) to distinguish course codes from generic subject words like CHEMISTRY or PHYSICS.

6. MERGED SESSION DETECTION & DURATION (RULE 12, RULE 13, RULE 14, RULE 15)
- If consecutive timetable cells represent the same session (same subject, faculty, room, adjacent time intervals), merge them into a single entry covering the combined duration.
- NEVER infer LAB/TUTORIAL/WORKSHOP from duration alone. Duration only tells session length, not type.
- Use componentType "LAB" only when the PDF explicitly labels the session/subject as Lab, Practical, Workshop, or similar.
- If session type is not explicit, output componentType "THEORY" because the current app schema only accepts THEORY/LAB, but do not mark hasLab=true unless LAB is explicit.

7. OCR NORMALIZATION (RULE 17)
- Correct common OCR errors when confidence is high (e.g., O ↔ 0, I ↔ 1, S ↔ 5).

### STRICT EXTRACTION WORKFLOW

1. First identify all independent tables: weekly timetable grid, subject/faculty/slot lookup table, room/class metadata, notes, legends.
2. Build the complete subject lookup dictionary BEFORE mapping timetable cells.
3. Preserve slot codes exactly. A cell like "N", "G2", "C", or "P" may be a valid slot code; do not discard single-letter cells unless the time column is explicitly Lunch/Break.
4. Map every occupied timetable cell through the lookup dictionary when a slot table exists.
5. If an occupied timetable cell cannot be mapped, still include it using subjectName "UNKNOWN <cell text>" and code "<cell text>", and add enough information in verificationLog to audit it.
6. Empty timetable cells must remain omitted; never fill them.
7. Do not invent missing faculty, rooms, credits, or subject names.
8. After extraction, self-audit: every occupied non-break cell must correspond to exactly one timetable entry after merged-cell processing.`;

/**
 * Fetch with a configurable timeout. Aborts the request after `ms` milliseconds.
 */
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseGeminiApiKeys(): string[] {
  const multiKeyValue = process.env.GEMINI_API_KEYS?.trim();
  const rawKeys = multiKeyValue || process.env.GEMINI_API_KEY || '';

  return rawKeys
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function rotateFromRandomStart<T>(items: T[]): T[] {
  if (items.length <= 1) return items;
  const start = Math.floor(Math.random() * items.length);
  return [...items.slice(start), ...items.slice(0, start)];
}

async function fetchGeminiWithFailover(
  model: string,
  apiKeys: string[],
  body: unknown,
  timeout: number,
  context: string
): Promise<Response> {
  const orderedKeys = rotateFromRandomStart(apiKeys);
  let lastError: Error | null = null;

  for (let index = 0; index < orderedKeys.length; index++) {
    const key = orderedKeys[index];
    const keyLabel = `${index + 1}/${orderedKeys.length}`;

    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          timeout,
        }
      );

      if (response.ok) {
        return response;
      }

      const text = await response.text().catch(() => 'unknown error');
      lastError = new Error(`Gemini HTTP ${response.status}: ${text}`);
      console.warn(`Gemini ${context} failed with key ${keyLabel}; trying next key if available.`, lastError.message);
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Gemini ${context} threw with key ${keyLabel}; trying next key if available.`, lastError.message);
    }
  }

  throw lastError || new Error(`Gemini ${context} failed: no API keys configured`);
}

// ─── Pipeline Log Types ────────────────────────────────────────────────────

type PipelineStep = {
  step: string;
  status: 'ok' | 'warn' | 'error' | 'skip';
  detail: string;
  ms: number;
};

type PipelineLog = {
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

function buildParserDescription(): { type: string; model: string; reason: string } {
  const geminiKeyCount = parseGeminiApiKeys().length;
  const hasOllama = !!(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL);
  const hasProxy = !!(process.env.LOCAL_PROXY_URL && process.env.LOCAL_PROXY_KEY);
  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const allowLocalLlmInProduction = process.env.ALLOW_LOCAL_LLM_IN_PRODUCTION === 'true';
  const proxyIsLoopback = process.env.LOCAL_PROXY_URL ? isLoopbackUrl(process.env.LOCAL_PROXY_URL) : false;
  const ollamaIsLoopback = process.env.OLLAMA_BASE_URL ? isLoopbackUrl(process.env.OLLAMA_BASE_URL) : false;

  if (hasProxy && (!isProduction || allowLocalLlmInProduction || !proxyIsLoopback)) {
    return {
      type: 'proxy',
      model: 'auto',
      reason: 'LOCAL_PROXY_URL + LOCAL_PROXY_KEY are set — using local proxy (highest priority)',
    };
  }
  if (hasOllama && (!isProduction || allowLocalLlmInProduction || !ollamaIsLoopback)) {
    return {
      type: 'ollama',
      model: process.env.OLLAMA_MODEL || 'unknown',
      reason: 'OLLAMA_BASE_URL + OLLAMA_MODEL are set',
    };
  }
  if (geminiKeyCount > 0) {
    return {
      type: 'gemini',
      model: 'gemini-2.5-flash',
      reason: `${geminiKeyCount} Gemini API key(s) configured` +
        (isProduction && (proxyIsLoopback || ollamaIsLoopback) ? ' — skipped localhost-only backends in production' : ''),
    };
  }
  return {
    type: 'none',
    model: 'none',
    reason: 'No LLM configured — deterministic parser only',
  };
}

function countMarkdownTableRows(md: string): number {
  return md.split('\n').filter(line => line.includes('|') && line.startsWith('|')).length;
}

function getWritableScratchDir(...segments: string[]): string {
  const baseDir = process.env.VERCEL === '1'
    ? os.tmpdir()
    : path.join(process.cwd(), 'scratch');

  return path.join(baseDir, ...segments);
}

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

async function convertPdfToMarkdown(tempFilePath: string, outputDir: string): Promise<{ markdown: string; engine: string; warning?: string }> {
  try {
    const javaBinDir = path.join(process.cwd(), '.java', 'jdk-21.0.11+10-jre', 'bin');
    if (fs.existsSync(javaBinDir) && !process.env.PATH?.includes(javaBinDir)) {
      process.env.PATH = javaBinDir + path.delimiter + process.env.PATH;
    }

    const { convert } = await import('@opendataloader/pdf');
    await convert(tempFilePath, { outputDir, format: ['markdown'] });
    const outFiles = fs.readdirSync(outputDir);
    const mdFile = outFiles.find(f => f.endsWith('.md'));
    if (!mdFile) throw new Error('No .md file produced');

    return {
      markdown: fs.readFileSync(path.join(outputDir, mdFile), 'utf8'),
      engine: 'OpenDataLoader',
    };
  } catch (error: unknown) {
    const warning = error instanceof Error ? error.message : String(error);
    console.warn('OpenDataLoader conversion failed, using pdf.js fallback:', warning);
    return {
      markdown: await extractMarkdownWithPdfJs(tempFilePath),
      engine: 'pdf.js fallback',
      warning,
    };
  }
}

async function extractMarkdownWithPdfJs(tempFilePath: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.js');
  const data = new Uint8Array(fs.readFileSync(tempFilePath));
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items as PdfTextItem[];
    const rows = groupPdfTextItemsIntoRows(items);
    pages.push(rows.map(row => `|${row.join('|')}|`).join('\n'));
  }

  const markdown = pages.join('\n\n');
  if (!markdown.trim()) {
    throw new Error('pdf.js fallback extracted no text. This PDF is likely scanned/image-only.');
  }

  return markdown;
}

function groupPdfTextItemsIntoRows(items: PdfTextItem[]): string[][] {
  const rows = new Map<number, Array<{ x: number; text: string }>>();

  for (const item of items) {
    const text = (item.str || '').trim();
    const transform = item.transform || [];
    if (!text || transform.length < 6) continue;

    const x = transform[4] || 0;
    const y = transform[5] || 0;
    const rowKey = Math.round(y / 4) * 4;
    const row = rows.get(rowKey) || [];
    row.push({ x, text });
    rows.set(rowKey, row);
  }

  return Array.from(rows.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row
      .sort((a, b) => a.x - b.x)
      .map(item => item.text.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim())
    )
    .filter(row => row.length > 0);
}

async function testLlmConnection(): Promise<{ success: boolean; parserType: string; model: string; message: string; details?: string }> {
  if (!LLM_CONFIG) {
    return {
      success: false,
      parserType: 'none',
      model: 'none',
      message: 'No LLM backend is configured in environment variables.',
    };
  }

  const FETCH_TIMEOUT = 10000;

  try {
    if (LLM_CONFIG.type === 'proxy') {
      const response = await fetchWithTimeout(`${LLM_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: LLM_CONFIG.model,
          messages: [{ role: 'user', content: 'Say "Connection OK" in exactly 2 words' }],
          max_tokens: 10,
        }),
        timeout: FETCH_TIMEOUT,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown error');
        throw new Error(`Proxy HTTP ${response.status}: ${text}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim() || 'No response';
      return {
        success: true,
        parserType: 'proxy',
        model: LLM_CONFIG.model,
        message: `Successfully connected to proxy. AI replied: "${content}"`,
      };
    }

    if (LLM_CONFIG.type === 'gemini') {
      const response = await fetchGeminiWithFailover(
        LLM_CONFIG.model,
        LLM_CONFIG.apiKeys,
        {
          contents: [{ parts: [{ text: 'Say "Connection OK" in exactly 2 words' }] }],
          generationConfig: { maxOutputTokens: 10 },
        },
        FETCH_TIMEOUT,
        'connection test'
      );

      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No response';
      return {
        success: true,
        parserType: 'gemini',
        model: LLM_CONFIG.model,
        message: `Successfully connected to Gemini. AI replied: "${content}"`,
      };
    }

    if (LLM_CONFIG.type === 'ollama') {
      const response = await fetchWithTimeout(`${LLM_CONFIG.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLM_CONFIG.model,
          messages: [{ role: 'user', content: 'Say "Connection OK" in exactly 2 words' }],
          stream: false,
          options: { num_predict: 10 },
        }),
        timeout: FETCH_TIMEOUT,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown error');
        throw new Error(`Ollama HTTP ${response.status}: ${text}`);
      }

      const data = await response.json() as { message?: { content?: string } };
      const content = data.message?.content?.trim() || 'No response';
      return {
        success: true,
        parserType: 'ollama',
        model: LLM_CONFIG.model,
        message: `Successfully connected to local Ollama. AI replied: "${content}"`,
      };
    }

    return {
      success: false,
      parserType: 'unknown',
      model: 'unknown',
      message: 'Unknown configuration type.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      parserType: LLM_CONFIG.type,
      model: LLM_CONFIG.model,
      message: `Failed to connect to ${LLM_CONFIG.type} parser.`,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = await request.json() as { action?: string };
      if (body.action === 'test') {
        const testRes = await testLlmConnection();
        return NextResponse.json(testRes);
      }
    } catch (e: unknown) {
      return NextResponse.json({ success: false, error: 'Malformed JSON', details: String(e) }, { status: 400 });
    }
  }

  let tempFilePath = '';
  let outputDir = '';
  const globalStart = Date.now();

  const log: PipelineLog = {
    steps: [],
    parserType: '',
    parserModel: '',
    parserReason: '',
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

  // Populate parser info
  const parserDesc = buildParserDescription();
  log.parserType = parserDesc.type;
  log.parserModel = parserDesc.model;
  log.parserReason = parserDesc.reason;

  try {
    // ── Step 1: Receive PDF ────────────────────────────────────────────────
    let t = Date.now();
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileSizeKB = Math.round(file.size / 1024);
    addStep('PDF received', 'ok', `${file.name} · ${fileSizeKB} KB`, t);

    // ── Step 2: Write to disk ──────────────────────────────────────────────
    t = Date.now();
    const bytes = await file.arrayBuffer();
    const tempDir = getWritableScratchDir('uploads');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `${Date.now()}_timetable.pdf`);
    fs.writeFileSync(tempFilePath, Buffer.from(bytes));
    addStep('PDF written to disk', 'ok', tempFilePath, t);

    // ── Step 3: OpenDataLoader PDF → Markdown ─────────────────────────────
    t = Date.now();
    outputDir = getWritableScratchDir('output', `${Date.now()}`);
    fs.mkdirSync(outputDir, { recursive: true });

    let mdContent = '';
    try {
      const conversion = await convertPdfToMarkdown(tempFilePath, outputDir);
      mdContent = conversion.markdown;
      try {
        const debugPath = getWritableScratchDir('debug_output.md');
        fs.writeFileSync(debugPath, mdContent);
      } catch (debugErr) {
        console.warn('Could not write debug markdown:', debugErr);
      }
      log.rawMarkdownChars = mdContent.length;
      log.tableRowsDetected = countMarkdownTableRows(mdContent);
      if (conversion.warning) {
        log.warnings.push(`OpenDataLoader unavailable, used pdf.js fallback: ${conversion.warning}`);
      }
      addStep(
        `PDF → Markdown (${conversion.engine})`,
        'ok',
        `${mdContent.length.toLocaleString()} chars · ${log.tableRowsDetected} table rows detected`,
        t
      );
    } catch (ocrErr: unknown) {
      const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
      addStep('PDF → Markdown', 'error', `FAILED: ${msg}`, t);
      log.warnings.push(`PDF text extraction failed: ${msg}`);
      throw new Error(`PDF text extraction failed: ${msg}`);
    }

    // ── Step 4: Deterministic parser ─────────────────────────────────────
    t = Date.now();
    let fallbackResult: ParsedTimetable;
    try {
      fallbackResult = parseMarkdownTimetable(mdContent);
      const labeled = autoDetectLabSessions(fallbackResult);
      fallbackResult = labeled;
      log.deterministicSubjects = fallbackResult.subjects.length;
      log.deterministicEntries = fallbackResult.timetableEntries.length;
      log.subjectCatalogEntries = fallbackResult.subjects.length;
      const det = fallbackResult.deterministicDetail;
      addStep(
        'Deterministic parser',
        fallbackResult.timetableEntries.length > 0 ? 'ok' : 'warn',
        `${fallbackResult.subjects.length} subjects · ${fallbackResult.timetableEntries.length} entries` +
          (det?.catalogSize != null ? ` · ${det.catalogSize} catalog rows` : '') +
          (det?.layout ? ` · layout: ${det.layout}` : ''),
        t
      );
      if (fallbackResult.timetableEntries.length === 0) {
        log.warnings.push('Deterministic parser extracted 0 entries — likely unsupported PDF layout');
      }
    } catch (detErr: unknown) {
      const msg = detErr instanceof Error ? detErr.message : String(detErr);
      addStep('Deterministic parser', 'error', `FAILED: ${msg}`, t);
      log.warnings.push(`Deterministic parser error: ${msg}`);
      fallbackResult = { subjects: [], timetableEntries: [], verificationLog: 'Deterministic parse failed' };
    }

    // ── Step 5: AI parser ─────────────────────────────────────────────────
    t = Date.now();
    let aiResult: ParsedTimetable | null = null;
    if (log.parserType === 'none') {
      addStep('AI parser', 'skip', 'No LLM configured — skipped', t);
      log.warnings.push('No AI parser configured. Set OLLAMA_BASE_URL + OLLAMA_MODEL, LOCAL_PROXY_URL + LOCAL_PROXY_KEY, or GEMINI_API_KEYS in .env.local for best results.');
    } else {
      try {
        aiResult = await parseWithLLM(mdContent);
        log.aiSubjects = aiResult.subjects.length;
        log.aiEntries = aiResult.timetableEntries.length;
        addStep(
          `AI parser (${log.parserModel})`,
          aiResult.timetableEntries.length > 0 ? 'ok' : 'warn',
          `${aiResult.subjects.length} subjects · ${aiResult.timetableEntries.length} entries`,
          t
        );
        if (aiResult.timetableEntries.length === 0) {
          log.warnings.push(`${log.parserModel} returned 0 entries. The prompt may need tuning or the markdown is malformed.`);
        }
      } catch (aiErr: unknown) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        addStep(`AI parser (${log.parserModel})`, 'error', `FAILED: ${msg}`, t);
        log.warnings.push(`AI parser error: ${msg}`);
        aiResult = null;
      }
    }

    // ── Step 6: Merge ────────────────────────────────────────────────────
    t = Date.now();
    let finalResult = fallbackResult;
    if (aiResult && aiResult.timetableEntries.length > 0) {
      try {
        finalResult = mergeParsedTimetables(aiResult, fallbackResult, mdContent);
        finalResult = autoDetectLabSessions(finalResult);
        addStep(
          'Merge (AI + Deterministic)',
          'ok',
          `${finalResult.subjects.length} subjects · ${finalResult.timetableEntries.length} entries after dedup`,
          t
        );
      } catch (mergeErr: unknown) {
        const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
        addStep('Merge', 'error', `FAILED: ${msg} — falling back to AI result only`, t);
        log.warnings.push(`Merge error: ${msg}`);
        finalResult = aiResult;
      }
    } else if (aiResult === null && fallbackResult.timetableEntries.length === 0) {
      addStep('Merge', 'skip', 'Both parsers returned 0 entries — nothing to merge', t);
    } else {
      addStep('Merge', 'skip', 'AI returned no entries — using deterministic result only', t);
    }

    // ── Step 7: Final validation ─────────────────────────────────────────
    t = Date.now();
    log.finalSubjects = finalResult.subjects.length;
    log.finalEntries = finalResult.timetableEntries.length;

    // Check for subjects with no timetable entries
    const subjectNames = new Set(finalResult.subjects.map(s => s.name.toLowerCase()));
    const entrySubjectNames = new Set(finalResult.timetableEntries.map(e => e.subjectName.toLowerCase()));
    const orphanedSubjects = [...subjectNames].filter(n => !entrySubjectNames.has(n));
    const unmappedEntries = [...entrySubjectNames].filter(n => !subjectNames.has(n));
    if (orphanedSubjects.length > 0) {
      log.warnings.push(`${orphanedSubjects.length} subject(s) have no timetable entries: ${orphanedSubjects.join(', ')}`);
    }
    if (unmappedEntries.length > 0) {
      log.warnings.push(`${unmappedEntries.length} timetable entry subject(s) not found in subject list: ${unmappedEntries.join(', ')}`);
    }

    addStep(
      'Validation',
      log.warnings.length > 0 ? 'warn' : 'ok',
      `${finalResult.subjects.length} subjects · ${finalResult.timetableEntries.length} entries · ${log.warnings.length} warning(s)`,
      t
    );

    log.processingMs = Date.now() - globalStart;

    // ── Cleanup ──────────────────────────────────────────────────────────
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Error during temp file cleanup:', e);
    }

    if (finalResult.timetableEntries.length === 0) {
      return NextResponse.json({
        subjects: [],
        timetableEntries: [],
        verificationLog: 'No timetable data could be extracted from the PDF. The format may not be supported.',
        pipelineLog: log,
        rawMarkdown: mdContent,
      });
    }

    return NextResponse.json({
      ...finalResult,
      pipelineLog: log,
      rawMarkdown: mdContent,
    });

  } catch (error: unknown) {
    console.error('Error parsing timetable:', error);
    log.processingMs = Date.now() - globalStart;

    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (outputDir && fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Error during error-path cleanup:', e);
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    log.steps.push({ step: 'Fatal error', status: 'error', detail: errMsg, ms: Date.now() - globalStart });
    log.warnings.push(`Fatal: ${errMsg}`);

    return NextResponse.json(
      {
        error: 'Failed to parse timetable. The PDF may be scanned (image-based) or in an unsupported format.',
        details: errMsg,
        pipelineLog: log,
      },
      { status: 500 }
    );
  }
}

/**
 * Parses the Markdown output from OpenDataLoader using the configured LLM.
 * Supports Ollama, local proxy (OpenAI-compatible), and direct Gemini API.
 * Falls back gracefully on failure.
 */
async function parseWithLLM(markdownContent: string): Promise<ParsedTimetable> {
  if (!LLM_CONFIG) {
    throw new Error('No LLM configured');
  }

  const compactMarkdown = markdownContent.length > 40000
    ? `${markdownContent.slice(0, 40000)}\n\n[Content truncated for AI parser]`
    : markdownContent;

  const userMessage = `Markdown:\n${compactMarkdown}`;

  // Use a reasonable timeout (30s) to avoid hanging for minutes
  const FETCH_TIMEOUT = 30000;

  if (LLM_CONFIG.type === 'ollama') {
    const response = await fetchWithTimeout(`${LLM_CONFIG.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_CONFIG.model,
        messages: [
          { role: 'system', content: TIMETABLE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        format: 'json',
        options: {
          temperature: 0,
          num_predict: 4096,
        },
      }),
      timeout: FETCH_TIMEOUT,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      throw new Error(`Ollama returned ${response.status}: ${errText}`);
    }

    const data = await response.json() as { message?: { content?: string }; response?: string };
    const rawText = data.message?.content || data.response;

    if (!rawText) {
      throw new Error('Ollama returned empty response');
    }

    const parsed = parseLLMJson(rawText);
    return normalizeParsedTimetable(parsed, `Parsed using local Ollama (${LLM_CONFIG.model})`);
  }

  if (LLM_CONFIG.type === 'proxy') {
    const response = await fetchWithTimeout(`${LLM_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: LLM_CONFIG.model,
        messages: [
          { role: 'system', content: TIMETABLE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      timeout: FETCH_TIMEOUT,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      throw new Error(`LLM proxy returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content;

    if (!rawText) {
      throw new Error('LLM returned empty response');
    }

    const parsed = parseLLMJson(rawText);
    return normalizeParsedTimetable(parsed, `Parsed using AI (${LLM_CONFIG.model}) via proxy`);
  } else {
    // Direct Gemini API
    const response = await fetchGeminiWithFailover(
      LLM_CONFIG.model,
      LLM_CONFIG.apiKeys,
      {
        contents: [{
          parts: [{ text: `${TIMETABLE_SYSTEM_PROMPT}\n\n${userMessage}` }],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
        },
      },
      FETCH_TIMEOUT,
      'timetable extraction'
    );

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error('Gemini returned empty response');
    }

    const parsed = parseLLMJson(rawText);
    return normalizeParsedTimetable(parsed, `Parsed using AI (${LLM_CONFIG.model}) via Gemini`);
  }
}

function parseLLMJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM response did not contain valid JSON');
    }
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('LLM response contained JSON-like content but could not be parsed');
    }
  }
}

function normalizeParsedTimetable(raw: unknown, verificationLog: string): ParsedTimetable {
  if (!isRecord(raw) || !Array.isArray(raw.subjects) || !Array.isArray(raw.timetableEntries)) {
    throw new Error('AI JSON did not match the timetable schema');
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
    throw new Error('AI did not extract any usable timetable entries');
  }

  return {
    subjects: Array.from(subjectMap.values()),
    timetableEntries,
    verificationLog,
  };
}

function mergeParsedTimetables(ai: ParsedTimetable, fallback: ParsedTimetable, markdownContent: string): ParsedTimetable {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1',
  ];
  const subjectsByKey = new Map<string, ParsedTimetable['subjects'][number]>();
  const codeToKey = new Map<string, string>();

  const addSubject = (subject: ParsedTimetable['subjects'][number]) => {
    const code = normalizeCourseCode(subject.code);
    const nameKey = normalizeSubjectKey(subject.name);
    const existingKey = code !== 'SUBJ' ? codeToKey.get(code) : undefined;
    const key = existingKey || nameKey || code;
    const existing = subjectsByKey.get(key);

    if (existing) {
      existing.code = existing.code === 'SUBJ' && code !== 'SUBJ' ? code : existing.code;
      existing.faculty = existing.faculty === 'Unknown Faculty' && subject.faculty ? subject.faculty : existing.faculty;
      existing.hasLab = existing.hasLab || subject.hasLab;
      return existing.name;
    }

    const next = {
      ...subject,
      code,
      color: /^#[0-9A-F]{6}$/i.test(subject.color) ? subject.color : colors[subjectsByKey.size % colors.length],
      faculty: subject.faculty || 'Unknown Faculty',
    };
    subjectsByKey.set(key, next);
    if (code !== 'SUBJ') codeToKey.set(code, key);
    return next.name;
  };

  [...ai.subjects, ...fallback.subjects, ...extractSubjectCatalog(markdownContent)].forEach(addSubject);

  const entryKeys = new Set<string>();
  const timetableEntries: ParsedTimetable['timetableEntries'] = [];

  const addEntry = (entry: ParsedTimetable['timetableEntries'][number]) => {
    const subjectName = resolveSubjectName(entry.subjectName, subjectsByKey, codeToKey);
    const key = [
      entry.day,
      subjectName.toLowerCase(),
      entry.componentType,
      entry.startTime,
      entry.endTime,
    ].join('|');
    if (entryKeys.has(key)) return;

    entryKeys.add(key);
    timetableEntries.push({ ...entry, subjectName });

    const subjectKey = codeToKey.get(normalizeCourseCode(entry.subjectName)) || normalizeSubjectKey(subjectName);
    const subject = subjectsByKey.get(subjectKey);
    if (subject && entry.componentType === 'LAB') subject.hasLab = true;
  };

  ai.timetableEntries.forEach(addEntry);
  fallback.timetableEntries.forEach(addEntry);

  return {
    subjects: Array.from(subjectsByKey.values()),
    timetableEntries,
    verificationLog: `${ai.verificationLog}; reconciled with deterministic parser (${fallback.subjects.length} subjects, ${fallback.timetableEntries.length} entries)`,
  };
}

function normalizeCourseCode(value: string | undefined): string {
  const text = String(value || '').toUpperCase().replace(/[¢©]/g, 'C').replace(/®/g, 'R');
  const match = text.match(/\b[A-Z]{1,10}\d+[A-Z\d]*\b/);
  return match?.[0] || 'SUBJ';
}

function normalizeSubjectKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(subject|code|faculty|lecture|theory|tutorial|class|slot)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveSubjectName(
  subjectName: string,
  subjectsByKey: Map<string, ParsedTimetable['subjects'][number]>,
  codeToKey: Map<string, string>
): string {
  const code = normalizeCourseCode(subjectName);
  const codeKey = code !== 'SUBJ' ? codeToKey.get(code) : undefined;
  if (codeKey) return subjectsByKey.get(codeKey)?.name || subjectName;

  const nameKey = normalizeSubjectKey(subjectName);
  return subjectsByKey.get(nameKey)?.name || subjectName;
}

function extractSubjectCatalog(markdownContent: string): ParsedTimetable['subjects'] {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1',
  ];
  const subjects = new Map<string, ParsedTimetable['subjects'][number]>();
  const lines = markdownContent.split('\n');

  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---')) continue;

    const cells = line.split('|').map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const rowText = cells.join(' ');
    if (!/\b[A-Z¢©®]{1,10}\d+[A-Z\d¢©®]*\b/i.test(rowText)) continue;
    if (/\b(day|time|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunch|break)\b/i.test(rowText)) continue;

    const code = normalizeCourseCode(rowText);
    if (code === 'SUBJ') continue;

    const facultyMatch = rowText.match(/\b(?:Dr\.?|Prof\.?|Mr\.?|Ms\.?)\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,3}/i);
    const faculty = facultyMatch?.[0].trim() || 'Unknown Faculty';
    const likelySubjectCell = cells
      .filter(cell => !cell.includes(code))
      .map(cell => cell.replace(facultyMatch?.[0] || '', '').trim())
      .find(cell => {
        const normalized = normalizeSubjectKey(cell);
        return normalized.length > 2 && !/^\d+$/.test(normalized) && !/^dr |^prof |^mr |^ms /i.test(normalized);
      });

    const rawName = likelySubjectCell || rowText.replace(code, '').replace(facultyMatch?.[0] || '', '');
    const name = rawName
      .replace(/\b(course|subject|code|faculty|credits?|s\.?no\.?)\b/gi, '')
      .replace(/[\*\_#\(\)\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name || name.length < 3) continue;

    subjects.set(code, {
      name,
      code,
      faculty,
      color: colors[subjects.size % colors.length],
      hasLab: /\b(lab|practical)\b/i.test(rowText),
    });
  }

  return Array.from(subjects.values());
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

  // Fallback to implicit afternoon hours (1:00 PM to 6:00 PM) if numbers fall in that range
  if (hour >= 1 && hour <= 6) {
    hour += 12;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Merge consecutive classes of the same subject on the same day.
 * Session type is preserved; LAB is never inferred from duration alone.
 */
function autoDetectLabSessions(timetable: ParsedTimetable): ParsedTimetable {
  const entriesByDay = new Map<string, typeof timetable.timetableEntries>();
  
  // Group entries by day
  for (const entry of timetable.timetableEntries) {
    const day = entry.day.toUpperCase();
    if (!entriesByDay.has(day)) {
      entriesByDay.set(day, []);
    }
    entriesByDay.get(day)!.push(entry);
  }

  const mergedEntries: typeof timetable.timetableEntries = [];

  for (const entries of entriesByDay.values()) {
    // Sort entries by start time
    const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    const dayMerged: typeof timetable.timetableEntries = [];
    
    for (const entry of sorted) {
      if (dayMerged.length === 0) {
        dayMerged.push({ ...entry });
        continue;
      }
      
      const last = dayMerged[dayMerged.length - 1];
      
      // Calculate gap between last entry's end time and current entry's start time
      const [lastEndH, lastEndM] = last.endTime.split(':').map(Number);
      const [currStartH, currStartM] = entry.startTime.split(':').map(Number);
      const gapMinutes = (currStartH * 60 + currStartM) - (lastEndH * 60 + lastEndM);
      
      // If same subject and consecutive/close (gap <= 15 minutes)
      if (last.subjectName.toLowerCase() === entry.subjectName.toLowerCase() && gapMinutes >= 0 && gapMinutes <= 15) {
        last.endTime = entry.endTime;
        if (entry.componentType === 'LAB') {
          last.componentType = 'LAB';
        }
      } else {
        dayMerged.push({ ...entry });
      }
    }
    
    mergedEntries.push(...dayMerged);
  }

  return {
    ...timetable,
    timetableEntries: mergedEntries,
    verificationLog: timetable.verificationLog + '; consecutive slots merged without duration-based lab inference',
  };
}

function parseMarkdownTimetable(markdownContent: string): ParsedTimetable {
  const lines = markdownContent.split('\n');
  const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  // Collect all table rows (lines with | separators)
  const tableRows: string[][] = [];
  for (const line of lines) {
    if (line.includes('|') && line.startsWith('|')) {
      const parts = line.split('|').map(s => s.trim());
      tableRows.push(parts);
    }
  }

  if (tableRows.length === 0) {
    return {
      subjects: [],
      timetableEntries: [],
      verificationLog: 'No table data found in markdown',
    };
  }

  // ─── 1. EXTRACT SUBJECT LOOKUP TABLE DETERMINISTICALLY ─────────────────────
  // Scan rows to find headers like "Subject", "Slot" / "Code", "Faculty"
  let subjectIdx = -1;
  let facultyIdx = -1;
  let slotIdx = -1;
  let catalogHeaderRowIndex = -1;

  for (let i = 0; i < tableRows.length; i++) {
    const rowLower = tableRows[i].map(c => c.toLowerCase());
    const hasSubject = rowLower.some(c => c.includes('subject'));
    const hasFaculty = rowLower.some(c => c.includes('faculty'));
    const hasSlot = rowLower.some(c => c.includes('slot') || c.includes('code'));
    
    if (hasSubject && (hasFaculty || hasSlot)) {
      catalogHeaderRowIndex = i;
      subjectIdx = rowLower.findIndex(c => c.includes('subject'));
      facultyIdx = rowLower.findIndex(c => c.includes('faculty'));
      slotIdx = rowLower.findIndex(c => c.includes('slot') || c.includes('code'));
      break;
    }
  }

  const subjectCatalog: Array<{ subject: string; faculty: string; slot: string }> = [];
  if (catalogHeaderRowIndex !== -1) {
    for (let i = catalogHeaderRowIndex + 1; i < tableRows.length; i++) {
      const row = tableRows[i];
      const subjectVal = row[subjectIdx]?.trim();
      const slotVal = row[slotIdx]?.trim();
      
      // Skip separators or table header duplicates
      if (!subjectVal || subjectVal.includes('---') || subjectVal.toLowerCase().includes('subject')) continue;
      
      const facultyVal = facultyIdx !== -1 && row[facultyIdx] ? row[facultyIdx].trim() : 'Unknown Faculty';
      
      if (subjectVal && slotVal) {
        subjectCatalog.push({
          subject: subjectVal.replace(/[\*\_#\(\)\[\]]/g, '').trim(),
          faculty: facultyVal.replace(/[\*\_#\(\)\[\]]/g, '').trim() || 'Unknown Faculty',
          slot: slotVal.trim(),
        });
      }
    }
  }

  // Fallback mapping if no catalog headers were found
  if (subjectCatalog.length === 0) {
    for (const row of tableRows) {
      const rowText = row.join(' ');
      const hasFaculty = /\b(?:Dr\.?|Prof\.?|Mr\.?|Ms\.?)\s+[A-Z]/i.test(rowText);
      const isDayRow = DAYS.some(d => row[1]?.toUpperCase().includes(d));
      
      if (hasFaculty && !isDayRow) {
        const facultyMatch = rowText.match(/(?:Dr\.|Prof\.|Mr\.|Ms\.)\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,3}/i);
        const cells = row.filter(c => c.length > 2);
        const subjectCell = cells.find(c => {
          if (facultyMatch && c.includes(facultyMatch[0])) return false;
          if (/^\d+$/.test(c)) return false;
          return true;
        });
        const slotCell = cells.find(c => c.length > 0 && c.length <= 4 && c !== subjectCell);
        
        if (subjectCell && slotCell) {
          subjectCatalog.push({
            subject: subjectCell.replace(/[\*\_#\(\)\[\]]/g, '').trim(),
            faculty: facultyMatch?.[0]?.trim() || 'Unknown Faculty',
            slot: slotCell.trim(),
          });
        }
      }
    }
  }

  // ─── 2. IDENTIFY TIMETABLE GRID LAYOUT & ALIGNMENT ─────────────────────────
  // Find grid header containing day/time slots
  let gridHeaderRow: string[] | null = null;
  for (const row of tableRows) {
    const rowLower = row.map(c => c.toLowerCase());
    const hasDayTime = rowLower.some(c => c.includes('day/time') || (c.includes('day') && c.includes('time') && c.length < 15));
    const hasTimePattern = rowLower.filter(c => /\d+:\d+/.test(c) || c.includes('9:00') || c.includes('10:00')).length >= 2;
    if (hasDayTime || hasTimePattern) {
      gridHeaderRow = row;
      break;
    }
  }

  const slotColumns: Array<{ index: number; start: string; end: string; isBreak: boolean }> = [];
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1',
  ];
  const subjectsMap = new Map<string, ParsedTimetable['subjects'][number]>();
  const timetableEntries: ParsedTimetable['timetableEntries'] = [];

  const getOrCreateSubject = (name: string, code: string, faculty: string, hasLab: boolean) => {
    const key = name.toLowerCase().trim();
    if (!subjectsMap.has(key)) {
      subjectsMap.set(key, {
        name: name.trim(),
        code: code || 'SUBJ',
        faculty: faculty || 'Unknown Faculty',
        color: colors[subjectsMap.size % colors.length],
        hasLab,
      });
    } else if (hasLab) {
      subjectsMap.get(key)!.hasLab = true;
    }
    return subjectsMap.get(key)!;
  };

  const normalizeTimeStr = (timeStr: string): string | null => {
    const t = timeStr.trim().toUpperCase();
    let hour = 0, minute = 0;

    const ampmMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
    if (!ampmMatch) return null;

    hour = parseInt(ampmMatch[1]);
    minute = parseInt(ampmMatch[2] || '0');
    const hasAMPM = !!ampmMatch[3];
    const isPM = ampmMatch[3] === 'PM';

    if (hasAMPM) {
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    } else {
      // Fallback to implicit afternoon hours (1:00 PM to 6:00 PM) if numbers fall in that range
      if (hour >= 1 && hour <= 6) {
        hour += 12;
      }
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  if (gridHeaderRow) {
    for (let i = 2; i < gridHeaderRow.length; i++) {
      const cell = gridHeaderRow[i]?.trim() || '';
      if (!cell) continue;

      const timePattern = /(\d{1,2}(?::\d{2})?)\s*(?:AM|PM)?\s*(?:-|to|–)\s*(\d{1,2}(?::\d{2})?)\s*(?:AM|PM)?/i;
      const match = cell.match(timePattern);

      const isBreak = !cell.includes(':') || cell.toLowerCase().includes('lunch') || cell.toLowerCase().includes('break');

      let start = '';
      let end = '';

      if (match) {
        start = normalizeTimeStr(match[1]) || '';
        end = normalizeTimeStr(match[2]) || '';
      } else if (cell.includes('-')) {
        const parts = cell.split('-');
        start = normalizeTimeStr(parts[0].trim()) || '';
        end = normalizeTimeStr(parts[1].trim()) || '';
      }

      if (start && end) {
        slotColumns.push({ index: i, start, end, isBreak });
      }
    }
  }

  // ─── 3. PROCESS CELLS BY DAY AND ASSIGN SUBJECTS ──────────────────────────
  for (const row of tableRows) {
    const dayCell = (row[1] || '').toUpperCase().trim();
    const day = DAYS.find(d => dayCell.startsWith(d));
    if (!day) continue;

    for (const slotCol of slotColumns) {
      if (slotCol.isBreak) continue;

      const cellText = row[slotCol.index]?.trim() || '';
      if (!cellText || cellText === '-' || cellText === '|') continue;

      // Look up slot in our extracted subject catalog
      const catalogEntry = subjectCatalog.find(entry => 
        entry.slot.toLowerCase() === cellText.toLowerCase()
      );

      let subjectName = '';
      let facultyName = 'Unknown Faculty';
      const code = cellText;

      if (catalogEntry) {
        subjectName = catalogEntry.subject;
        facultyName = catalogEntry.faculty;
      } else {
        subjectName = `UNKNOWN ${cellText}`;
      }

      const hasLab = cellText.toLowerCase().includes('lab') || cellText.toLowerCase().includes('practical');
      getOrCreateSubject(subjectName, code, facultyName, hasLab);

      timetableEntries.push({
        day: day.toUpperCase(),
        subjectName,
        componentType: hasLab ? 'LAB' : 'THEORY',
        startTime: slotCol.start,
        endTime: slotCol.end,
      });
    }
  }

  return {
    subjects: Array.from(subjectsMap.values()),
    timetableEntries,
    verificationLog: `Parsed using OpenDataLoader PDF Core (${slotColumns.length} time slots aligned)`,
    deterministicDetail: {
      layout: 'standard',
      catalogSize: subjectCatalog.length,
    },
  };
}
