'use client';

import { useState, useRef } from 'react';
import { 
  FileText, Upload, RefreshCw, ChevronDown, ChevronUp, 
  AlertTriangle, CheckCircle2, XCircle, SkipForward, Clock, Sparkles, Check, FileCheck,
  Settings, Layers, Calendar, Edit3
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useAttendanceStore } from '@/features/attendance/services/attendance-store';

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

type SubjectItem = {
  id: string;
  name: string;
  code: string;
  faculty: string;
  credits: number | null;
  color: string;
  hasLab: boolean;
  theoryTarget: number;
  labTarget: number;
};

type TimetableEntryItem = {
  id: string;
  day: string;
  subjectName: string;
  startTime: string;
  endTime: string;
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok: <CheckCircle2 size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />,
  warn: <AlertTriangle size={14} className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />,
  error: <XCircle size={14} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />,
  skip: <SkipForward size={14} className="text-muted-foreground shrink-0 mt-0.5" />,
};

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-foreground',
  warn: 'text-amber-600 dark:text-amber-300',
  error: 'text-red-600 dark:text-red-300',
  skip: 'text-muted-foreground',
};

const COLOR_PALETTE = ['#6366f1', '#06b6d4', '#f43f5e', '#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899'];

function PipelinePanel({ log, rawMarkdown }: { log: PipelineLog; rawMarkdown?: string }) {
  const [showMarkdown, setShowMarkdown] = useState(false);

  const parserBadgeColor =
    log.parserType === 'proxy' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' :
    log.parserType === 'gemini' ? 'bg-blue-500/15 text-blue-300 border-blue-500/20' :
    log.parserType === 'ollama' ? 'bg-violet-500/15 text-violet-300 border-violet-500/20' :
    'bg-slate-700/40 text-slate-400 border-slate-600/20';

  const hasErrors = log.steps.some(s => s.status === 'error');
  const hasWarnings = log.steps.some(s => s.status === 'warn') || log.warnings.length > 0;

  const panelBorder = hasErrors
    ? 'border-red-500/20'
    : hasWarnings
    ? 'border-amber-500/20'
    : 'border-emerald-500/20';

  return (
    <div className={`mt-5 rounded-xl border ${panelBorder} bg-card overflow-hidden`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">Extraction Pipeline</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${parserBadgeColor}`}>
          {log.parserType === 'proxy' ? 'Proxy (auto)' : 
           log.parserType === 'gemini' ? `Gemini (${log.parserModel})` :
           log.parserType === 'ollama' ? `Ollama (${log.parserModel})` :
           'No AI'}
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
          <Clock size={11} />
          {(log.processingMs / 1000).toFixed(1)}s total
        </span>
      </div>

      {/* Parser reason */}
      <div className="px-4 py-2 border-b border-border bg-secondary/30">
        <p className="text-[11px] text-muted-foreground">
          <span className="text-foreground font-medium">Parser selection: </span>{log.parserReason}
        </p>
      </div>

      {/* Timetable stats */}
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border bg-secondary/20 text-center">
        <div className="py-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Chars Read</p>
          <p className="text-sm font-bold text-foreground mt-0.5">{log.rawMarkdownChars.toLocaleString()}</p>
        </div>
        <div className="py-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Table Rows</p>
          <p className="text-sm font-bold text-foreground mt-0.5">{log.tableRowsDetected}</p>
        </div>
        <div className="py-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Subjects</p>
          <p className="text-sm font-bold text-foreground mt-0.5">{log.finalSubjects}</p>
        </div>
        <div className="py-2.5">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Class Entries</p>
          <p className="text-sm font-bold text-foreground mt-0.5">{log.finalEntries}</p>
        </div>
      </div>

      {/* Comparison row — deterministic vs AI */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border text-[11px]">
        <div className="px-4 py-2">
          <span className="text-muted-foreground">Deterministic: </span>
          <span className="text-foreground font-medium">{log.deterministicSubjects} subj · {log.deterministicEntries} entries</span>
        </div>
        <div className="px-4 py-2">
          <span className="text-muted-foreground">AI: </span>
          <span className="text-foreground font-medium">
            {log.parserType === 'none' ? 'skipped' : `${log.aiSubjects} subj · {log.aiEntries} entries`}
          </span>
        </div>
      </div>

      {/* Step log */}
      <div className="px-4 py-3 space-y-2">
        {log.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            {STATUS_ICON[step.status]}
            <div className="flex-1 min-w-0">
              <span className={`text-xs font-medium ${STATUS_COLOR[step.status]}`}>{step.step}</span>
              <span className="text-[11px] text-muted-foreground ml-2">{step.detail}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">{step.ms}ms</span>
          </div>
        ))}
      </div>

      {/* Warning Box */}
      {log.warnings.length > 0 && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-1">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle size={13} />
            Parser Warnings
          </p>
          <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
            {log.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw Markdown Accordion */}
      {rawMarkdown && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowMarkdown(!showMarkdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/50 text-[11px] text-muted-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <FileText size={12} className="text-muted-foreground" />
              Raw OCR Output ({rawMarkdown.length.toLocaleString()} chars)
            </span>
            {showMarkdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showMarkdown && (
            <pre className="px-4 pb-4 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed">
              {rawMarkdown}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalyzePDFPage() {
  const { onboarding, setOnboarding } = useAttendanceStore();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  
  // Timetable setup states
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [entries, setEntries] = useState<TimetableEntryItem[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});

  const [pipelineLog, setPipelineLog] = useState<PipelineLog | null>(null);
  const [rawMarkdown, setRawMarkdown] = useState<string | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = event instanceof File ? event : event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please upload a valid PDF file.');
      return;
    }

    setUploadedFileName(file.name);
    setIsUploading(true);
    setPipelineLog(null);
    setRawMarkdown(undefined);
    setSubjects([]);
    setEntries([]);
    setManualOverrides({});

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/parse-timetable', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.pipelineLog) setPipelineLog(data.pipelineLog);
      if (data.rawMarkdown) setRawMarkdown(data.rawMarkdown);

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to analyze PDF');
      }

      // Initialize extracted subjects, default to Theory Only (hasLab = false)
      const parsedSubjects: SubjectItem[] = (data.subjects || []).map((s: any, idx: number) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: s.name,
        code: s.code || '',
        faculty: s.faculty || '',
        credits: s.credits ?? null,
        color: s.color || COLOR_PALETTE[idx % COLOR_PALETTE.length],
        hasLab: false, // Default to Theory Only!
        theoryTarget: s.theoryTarget ?? 75,
        labTarget: s.labTarget ?? 75,
      }));

      // Initialize extracted slots
      const parsedEntries: TimetableEntryItem[] = (data.timetableEntries || []).map((e: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        day: e.day,
        subjectName: e.subjectName,
        startTime: e.startTime,
        endTime: e.endTime,
      }));

      setSubjects(parsedSubjects);
      setEntries(parsedEntries);
      setManualOverrides({});
      toast.success(`Successfully extracted ${parsedSubjects.length} subjects & ${parsedEntries.length} entries!`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error occurred while parsing PDF.');
      setUploadedFileName(null);
    } finally {
      setIsUploading(false);
    }
  };

  const getResolvedSlotType = (entry: TimetableEntryItem): string => {
    const override = manualOverrides[entry.id];
    if (override) return override;

    const matchedSubject = subjects.find(s => s.name === entry.subjectName);
    if (matchedSubject?.hasLab) {
      try {
        const [startH, startM] = entry.startTime.split(':').map(Number);
        const [endH, endM] = entry.endTime.split(':').map(Number);
        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        // Consecutive or merged multi-period session (>= 100 minutes) automatically becomes LAB
        if (durationMinutes >= 100) {
          return 'LAB';
        }
      } catch (e) {}
    }
    return 'THEORY';
  };

  const handleSubjectFieldChange = (id: string, field: keyof SubjectItem, value: any) => {
    setSubjects(prev =>
      prev.map(s => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleSlotOverrideChange = (id: string, newType: string) => {
    setManualOverrides(prev => ({
      ...prev,
      [id]: newType,
    }));
  };

  const handleImport = () => {
    if (subjects.length === 0) return;

    // Overwrite the current active semester configuration in store
    const resolvedTimetable = entries.map(entry => ({
      day: entry.day,
      subjectName: entry.subjectName,
      componentType: getResolvedSlotType(entry) as any,
      startTime: entry.startTime,
      endTime: entry.endTime,
    }));

    const updatedOnboarding = {
      ...onboarding,
      semesterName: onboarding.semesterName || 'Semester 1',
      academicYear: onboarding.academicYear || '2026-2027',
      startDate: onboarding.startDate || new Date().toISOString().split('T')[0],
      subjects: subjects.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        faculty: s.faculty,
        credits: s.credits,
        color: s.color,
        hasLab: s.hasLab,
        theoryTarget: s.theoryTarget,
        labTarget: s.labTarget,
      })),
      timetableEntries: resolvedTimetable,
      onboardingCompletedAt: onboarding.onboardingCompletedAt || new Date().toISOString().split('T')[0],
      midSemesterBackfilled: onboarding.midSemesterBackfilled ?? false,
    };

    setOnboarding(updatedOnboarding);
    toast.success('Successfully imported timetable to your active semester!');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  return (
    <div className="space-y-6 max-w-7xl text-foreground p-1">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">PDF AI Import</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Scan and parse university schedules dynamically into your AcademicOS calendar.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 cursor-pointer bg-card transition-all duration-200 ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-foreground/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-10 w-10 text-primary animate-spin" />
            <p className="text-sm font-semibold text-muted-foreground">Extracting Schedule details...</p>
          </div>
        ) : uploadedFileName ? (
          <div className="flex flex-col items-center gap-2">
            <FileCheck className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 truncate max-w-[280px]">
              {uploadedFileName}
            </p>
            <span className="text-xs text-muted-foreground">Click or drop to replace</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-muted-foreground hover:text-foreground transition-colors" />
            <p className="text-sm font-semibold text-foreground">Upload Timetable PDF</p>
            <p className="text-xs text-muted-foreground">Max size: 10MB</p>
          </div>
        )}
      </div>

      {/* Pipeline log panel */}
      {pipelineLog && (
        <PipelinePanel log={pipelineLog} rawMarkdown={rawMarkdown} />
      )}

      {/* Extracted preview & Save option */}
      {subjects.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Review Extracted Data</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Please check subjects and entries before importing.</p>
            </div>
            <button
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
            >
              <Check size={14} />
              Import to Semester
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Subjects configuration editor */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Configure Subjects ({subjects.length})</h3>
              </div>
              
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {subjects.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl bg-secondary border border-border space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      {/* Name input */}
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => handleSubjectFieldChange(s.id, 'name', e.target.value)}
                        className="flex-1 bg-card border border-border rounded-lg px-2.5 py-1 text-sm font-semibold text-foreground focus:outline-none focus:border-foreground transition-colors"
                        placeholder="Subject Name"
                      />
                      <div className="w-6 h-6 rounded-full shrink-0 border border-border" style={{ backgroundColor: s.color }} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Code */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-medium">Code</label>
                        <input
                          type="text"
                          value={s.code}
                          onChange={(e) => handleSubjectFieldChange(s.id, 'code', e.target.value)}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          placeholder="e.g. CS101"
                        />
                      </div>
                      {/* Faculty */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-medium">Faculty</label>
                        <input
                          type="text"
                          value={s.faculty}
                          onChange={(e) => handleSubjectFieldChange(s.id, 'faculty', e.target.value)}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          placeholder="e.g. Dr. Jones"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 items-end">
                      {/* Target % */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-medium">Target %</label>
                        <input
                          type="number"
                          value={s.theoryTarget}
                          onChange={(e) => handleSubjectFieldChange(s.id, 'theoryTarget', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          min={0}
                          max={100}
                        />
                      </div>
                      {/* Credits */}
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-medium">Credits</label>
                        <input
                          type="number"
                          value={s.credits ?? ''}
                          onChange={(e) => handleSubjectFieldChange(s.id, 'credits', e.target.value === '' ? null : Number(e.target.value))}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                          placeholder="—"
                          min={0}
                        />
                      </div>
                      {/* Lab Target (only if Theory + Lab) */}
                      <div>
                        {s.hasLab && (
                          <>
                            <label className="text-[10px] text-muted-foreground uppercase font-medium">Lab Target %</label>
                            <input
                              type="number"
                              value={s.labTarget}
                              onChange={(e) => handleSubjectFieldChange(s.id, 'labTarget', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                              className="w-full bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-foreground transition-colors"
                              min={0}
                              max={100}
                            />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      {/* Session Configuration toggle */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-medium block">Session Config</span>
                        <div className="flex gap-1.5 p-0.5 rounded-lg bg-secondary border border-border">
                          <button
                            type="button"
                            onClick={() => handleSubjectFieldChange(s.id, 'hasLab', false)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                              !s.hasLab
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Theory Only
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSubjectFieldChange(s.id, 'hasLab', true)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                              s.hasLab
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Theory + Lab
                          </button>
                        </div>
                      </div>

                      {/* Color Palette */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 uppercase font-medium block">Color</span>
                        <div className="flex gap-1">
                          {COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => handleSubjectFieldChange(s.id, 'color', c)}
                              className={`w-4 h-4 rounded-full border transition-all ${s.color === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule slots and manual overrides */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Schedule Slots ({entries.length})</h3>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {entries.map((entry) => {
                  const resolvedType = getResolvedSlotType(entry);
                  const isOverridden = !!manualOverrides[entry.id];
                  
                  return (
                    <div key={entry.id} className="p-3 rounded-lg bg-secondary border border-border flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{entry.subjectName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.day.charAt(0) + entry.day.slice(1).toLowerCase()} &middot; {entry.startTime} - {entry.endTime}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Dynamic manual override dropdown */}
                        <select
                          value={resolvedType}
                          onChange={(e) => handleSlotOverrideChange(entry.id, e.target.value)}
                          className="bg-card border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none"
                        >
                          <option value="THEORY">Theory</option>
                          <option value="LAB">Lab</option>
                          <option value="TUTORIAL">Tutorial</option>
                          <option value="WORKSHOP">Workshop</option>
                          <option value="SEMINAR">Seminar</option>
                          <option value="OTHER">Other</option>
                        </select>

                        {/* Status badge */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          resolvedType === 'LAB' 
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' 
                            : resolvedType === 'THEORY' 
                            ? 'bg-secondary text-foreground border border-border'
                            : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                        }`}>
                          {resolvedType}
                          {isOverridden && ' *'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
