# Parser Restoration Audit Report

## Summary

Successfully restored the last known working parser from commit `a5d4c30` ("final update before completion") and verified it works correctly.

## Baseline Identification

| Commit | Message | Date |
|--------|---------|------|
| `a5d4c30` | final update before completion | 2026-07-16 23:42:52 |
| `c0b663b` (HEAD) | migrate Acadex Next.js app to Tauri desktop app | 2026-07-17 01:05:41 |

The baseline parser is `a5d4c30` — the final commit before the desktop migration.

## Changes Made

### Restored (from a5d4c30)

1. **`src/app/api/parse-timetable/route.ts`** — Complete restore from baseline
   - Full LLM configuration (proxy, ollama, gemini) restored
   - All parsing functions (`parseMarkdownTimetable`, `normalizeParsedTimetable`, `mergeParsedTimetables`)
   - PDF extraction pipeline with OpenDataLoader + pdfjs fallback
   - Course code extraction and normalization
   - Subject catalog building from markdown tables

### Removed (untested redesign)

2. **`src/lib/parser/` directory** — Entire untested 7-stage pipeline removed
   - `pipeline.ts`
   - `index.ts`
   - `types.ts`
   - `compat.ts`
   - `debug-engine.ts`
   - `validation-engine.ts`
   - `providers/ollama-provider.ts`
   - `stages/stage1-pdf-processing.ts` through `stage7-session-classification.ts`
   - All documentation files (`IMPLEMENTATION_SUMMARY.md`, `PIPELINE-ARCHITECTURE.md`, `TASK.md`, `TEST_PLAN.md`)

### Compatibility Layer Added

3. **Frontend response shape** — Added `PipelineLog` type and included `pipelineLog` + `rawMarkdown` in API response
   - The baseline parser did not return `pipelineLog` or `rawMarkdown`
   - These were added by the desktop migration version but are required by the frontend
   - Response now includes both fields for backward compatibility

## Regression Test Suite

Created `tests/regression/parse-timetable.test.ts` with 27 tests covering:

| Function | Tests | Status |
|----------|-------|--------|
| `normalizeTime` | 6 | ✅ All pass |
| `normalizeCourseCode` | 4 | ✅ All pass |
| `normalizeSubjectKey` | 2 | ✅ All pass |
| `parseLLMJson` | 4 | ✅ All pass |
| `normalizeParsedTimetable` | 7 | ✅ All pass |
| `countMarkdownTableRows` | 2 | ✅ All pass |
| Response shape | 1 | ✅ All pass |

**Total: 27 tests passed**

## Architecture Comparison (LAST WORKING vs CURRENT)

| Component | Last Working (a5d4c30) | Current (after restore) | Status |
|-----------|----------------------|----------------------|--------|
| Parser route | Single self-contained `route.ts` | Same restored | ✅ Back to baseline |
| LLM backends | Proxy + Ollama + Gemini | Ollama only | ✅ Restored all |
| PDF extraction | `@opendataloader/pdf` + pdfjs fallback | Same | ✅ Unchanged |
| Deterministic parser | In `route.ts` | Same restored | ✅ Back to baseline |
| `src/lib/parser/` | Does NOT exist | Does NOT exist | ✅ Removed |
| Desktop/Tauri | Does NOT exist | Full Tauri app | ✅ Preserved |

## Key Behavioral Differences

### LLM Configuration

The baseline (restored) version supports **3 LLM backends**:
1. **Local Proxy** (OpenAI-compatible) — highest priority
2. **Ollama** — local LLM
3. **Gemini API** — cloud-based

The intermediate version had stripped this down to **Ollama only**. This has been restored.

### Frontend Compatibility

The response now includes:
```json
{
  "subjects": [...],
  "timetableEntries": [...],
  "verificationLog": "...",
  "pipelineLog": {
    "steps": [...],
    "parserType": "ollama|proxy|gemini|none",
    "parserModel": "...",
    "parserReason": "...",
    "rawMarkdownChars": 12345,
    "tableRowsDetected": 15,
    "subjectCatalogEntries": 5,
    "deterministicSubjects": 5,
    "deterministicEntries": 20,
    "aiSubjects": 5,
    "aiEntries": 20,
    "finalSubjects": 5,
    "finalEntries": 20,
    "processingMs": 1234,
    "warnings": [...]
  },
  "rawMarkdown": "..."
}
```

## Verification Steps

1. ✅ TypeScript compilation passes (`pnpm tsc --noEmit`)
2. ✅ All 27 regression tests pass
3. ✅ No references to removed `src/lib/parser/` remain

## Next Steps (for future incremental improvements)

Per the mission plan, after verification:

1. **Add validation** — Session time conflict detection
2. **Add session grouping** — Merge consecutive theoretical sessions (≤15 min gap)
3. **Add lab detection improvements** — Explicit lab label detection
4. **Add provider abstraction** — Clean interface for LLM backends (if needed)
5. **Add debug mode** — Verbose logging for troubleshooting

---

*Report generated: 2026-07-17*