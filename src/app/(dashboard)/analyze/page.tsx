'use client';

import { useState, useRef } from 'react';
import { 
  FileText, Upload, RefreshCw, ChevronDown, ChevronUp, 
  AlertTriangle, CheckCircle2, XCircle, SkipForward, Clock, Sparkles, Check, FileCheck,
  Settings, Layers, Calendar, Edit3, Plus, Trash2
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useAttendanceStore } from '@/features/attendance/services/attendance-store';
import { rebuildTimetableFromGrid } from '@/lib/timetable-parser';

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

const COLOR_PALETTE = ['#6366f1', '#06b6d4', '#f43f5e', '#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899'];

function DebugPanel({
  detectedGrid,
  slotDictionary,
  groupedBlocks,
  validationReport,
}: {
  detectedGrid?: any;
  slotDictionary?: any;
  groupedBlocks?: any;
  validationReport?: any;
}) {
  const [activeTab, setActiveTab] = useState<'grid' | 'dictionary' | 'blocks' | 'validation'>('grid');

  if (!detectedGrid && !slotDictionary) return null;

  return (
    <div className="mt-5 rounded-xl border border-primary/20 bg-card overflow-hidden text-xs">
      <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
        <Sparkles size={14} className="text-primary" />
        <span className="font-bold text-foreground uppercase tracking-wider">Parser Debug Mode (Staged IR)</span>
      </div>

      <div className="flex border-b border-border bg-secondary/20 overflow-x-auto">
        <button
          onClick={() => setActiveTab('grid')}
          className={`px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition-colors ${activeTab === 'grid' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
        >
          2D Grid ({detectedGrid?.totalOccupiedCells || 0} cells)
        </button>
        <button
          onClick={() => setActiveTab('dictionary')}
          className={`px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition-colors ${activeTab === 'dictionary' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
        >
          Slot Dictionary ({slotDictionary?.entries?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('blocks')}
          className={`px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition-colors ${activeTab === 'blocks' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
        >
          Grouped Blocks ({groupedBlocks?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('validation')}
          className={`px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition-colors ${activeTab === 'validation' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
        >
          Validation ({validationReport?.errors?.length || 0} errors)
        </button>
      </div>

      <div className="p-4 max-h-80 overflow-y-auto font-mono">
        {activeTab === 'grid' && (
          <div className="space-y-3">
            <p className="text-muted-foreground font-sans">Column Header Bounding:</p>
            <div className="flex flex-wrap gap-2">
              {detectedGrid?.headers?.map((h: any) => (
                <span key={h.colIndex} className="px-2 py-1 rounded bg-secondary border border-border">
                  Col {h.colIndex}: {h.startTime}-{h.endTime} {h.isBreak ? '(Break)' : ''}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground font-sans pt-2">Raw Grid Row Cells:</p>
            {detectedGrid?.rows?.map((r: any) => (
              <div key={r.day} className="space-y-1">
                <span className="font-bold text-foreground">{r.day}:</span>
                <div className="flex flex-wrap gap-1.5 pl-2">
                  {r.cells?.map((c: any, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border text-[11px]">
                      Col {c.colIndex} → "{c.rawText}"
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'dictionary' && (
          <div className="space-y-1">
            {slotDictionary?.entries?.map((e: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-1 border-b border-border/50">
                <span className="font-bold text-primary px-2 py-0.5 rounded bg-primary/10">{e.slotCode}</span>
                <span className="text-foreground">{e.subjectName}</span>
                <span className="text-muted-foreground">({e.faculty})</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'blocks' && (
          <div className="space-y-1">
            {groupedBlocks?.map((b: any) => (
              <div key={b.id} className="py-1 border-b border-border/50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-foreground">{b.day}</span>: {b.subjectName} ({b.slotCode})
                </div>
                <div className="text-muted-foreground">
                  Col {b.startCol}-{b.endCol} ({b.startTime} - {b.endTime}) &middot; {b.cellCount} cell(s)
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="space-y-2 font-sans">
            <div className="flex items-center gap-4">
              <span className={`px-2 py-1 rounded font-bold ${validationReport?.isValid ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                Status: {validationReport?.isValid ? 'VALID' : 'INVALID'}
              </span>
              <span>Occupied Cells: {validationReport?.occupiedCellCount}</span>
              <span>Mapped Cells: {validationReport?.mappedCellCount}</span>
            </div>
            {validationReport?.errors?.map((err: string, i: number) => (
              <p key={i} className="text-red-500 flex items-center gap-1 font-semibold"><XCircle size={13} /> {err}</p>
            ))}
            {validationReport?.warnings?.map((warn: string, i: number) => (
              <p key={i} className="text-amber-500 flex items-center gap-1"><AlertTriangle size={13} /> {warn}</p>
            ))}
          </div>
        )}
      </div>
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

  // Intermediate Representations for Debug Mode
  const [detectedGrid, setDetectedGrid] = useState<any>(null);
  const [slotDictionary, setSlotDictionary] = useState<any>(null);
  const [groupedBlocks, setGroupedBlocks] = useState<any[]>([]);
  const [validationReport, setValidationReport] = useState<any>(null);

  const [pipelineLog, setPipelineLog] = useState<PipelineLog | null>(null);
  const [rawMarkdown, setRawMarkdown] = useState<string | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = event instanceof File
      ? event
      : (event as React.ChangeEvent<HTMLInputElement>).target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please upload a valid PDF file.');
      return;
    }

    setUploadedFileName(file.name);
    setIsUploading(true);
    setPipelineLog(null);
    setRawMarkdown(undefined);
    setDetectedGrid(null);
    setSlotDictionary(null);
    setGroupedBlocks([]);
    setValidationReport(null);
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
      if (data.detectedGrid) setDetectedGrid(data.detectedGrid);
      if (data.slotDictionary) setSlotDictionary(data.slotDictionary);
      if (data.groupedBlocks) setGroupedBlocks(data.groupedBlocks);
      if (data.validationReport) setValidationReport(data.validationReport);

      if (!response.ok || (data.validationReport && !data.validationReport.isValid)) {
        const errorMsg = data.error || (data.validationReport?.errors || []).join('; ') || 'Timetable parsing failed validation checks';
        toast.error(`Validation Failed: ${errorMsg}`);
        return;
      }

      // Initialize extracted subjects
      const parsedSubjects: SubjectItem[] = (data.subjects || []).map((s: any, idx: number) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: s.name,
        code: s.code || '',
        faculty: s.faculty || '',
        credits: s.credits ?? null,
        color: s.color || COLOR_PALETTE[idx % COLOR_PALETTE.length],
        hasLab: false,
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

  const handleAddSubject = () => {
    setSubjects(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        name: 'New Subject',
        code: '',
        faculty: '',
        credits: null,
        color: COLOR_PALETTE[prev.length % COLOR_PALETTE.length],
        hasLab: false,
        theoryTarget: 75,
        labTarget: 75,
      }
    ]);
  };

  const handleDeleteSubject = (id: string) => {
    setSubjects(prev => prev.filter(s => s.id !== id));
  };

  const handleAddEntry = () => {
    setEntries(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        day: 'MONDAY',
        subjectName: subjects[0]?.name || '',
        startTime: '09:00',
        endTime: '10:00',
      }
    ]);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setManualOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleBulkTimeShift = (minutes: number) => {
    setEntries(prev =>
      prev.map(e => {
        const shiftTime = (timeStr: string) => {
          const [h, m] = (timeStr || '').split(':').map(Number);
          if (isNaN(h) || isNaN(m)) return timeStr;
          let totalMinutes = h * 60 + m + minutes;
          totalMinutes = (totalMinutes + 1440) % 1440;
          const newH = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
          const newM = (totalMinutes % 60).toString().padStart(2, '0');
          return `${newH}:${newM}`;
        };
        return {
          ...e,
          startTime: shiftTime(e.startTime),
          endTime: shiftTime(e.endTime),
        };
      })
    );
    const sign = minutes > 0 ? '+' : '';
    const label = Math.abs(minutes) >= 60 ? `${sign}${minutes / 60}h` : `${sign}${minutes}m`;
    toast.success(`Shifted all ${entries.length} slots by ${label}`);
  };

  const handleEntryFieldChange = (id: string, field: keyof TimetableEntryItem, value: string) => {
    setEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    );
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

    // Persist immediately to Supabase database
    import('@/shared/lib/supabase-service').then(({ saveStateToSupabase }) => {
      const overrides = JSON.parse(localStorage.getItem('attendance_overrides') || '[]');
      const events = JSON.parse(localStorage.getItem('academic_events') || '[]');
      const holidays = JSON.parse(localStorage.getItem('holidays_list') || '[]');
      const extraClasses = JSON.parse(localStorage.getItem('extra_classes') || '[]');
      const rescheduledClasses = JSON.parse(localStorage.getItem('rescheduled_classes') || '[]');
      const attendanceCredits = JSON.parse(localStorage.getItem('attendance_credits') || '[]');
      saveStateToSupabase({
        onboarding: updatedOnboarding,
        overrides,
        events,
        holidays,
        extraClasses,
        rescheduledClasses,
        attendanceCredits,
      }).then(() => {
        console.log('[Acadex Analyze] Timetable import persisted directly to Supabase database.');
      });
    });
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
          Scan and parse university schedules dynamically into your Acadex calendar.
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

      {/* Parser Debug Mode (Intermediate Representations) */}
      <DebugPanel
        detectedGrid={detectedGrid}
        slotDictionary={slotDictionary}
        groupedBlocks={groupedBlocks}
        validationReport={validationReport}
      />

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
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full shrink-0 border border-border" style={{ backgroundColor: s.color }} />
                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(s.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                          title="Delete Subject"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
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
                
                <button
                  onClick={handleAddSubject}
                  className="w-full py-3 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary/50 transition-all"
                >
                  <Plus size={16} />
                  Add Subject
                </button>
              </div>
            </div>

            {/* Schedule slots and manual overrides */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Schedule Slots ({entries.length})</h3>
                </div>
              </div>

              {/* Bulk Time Adjustment Widget */}
              {entries.length > 0 && (
                <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>Bulk Time Shift Tool</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Adjust all slot times at once</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkTimeShift(-60)}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-semibold text-foreground transition-all flex items-center gap-1"
                    >
                      -1 Hour
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkTimeShift(60)}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-semibold text-foreground transition-all flex items-center gap-1"
                    >
                      +1 Hour
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkTimeShift(-120)}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-semibold text-foreground transition-all flex items-center gap-1"
                    >
                      -2 Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkTimeShift(120)}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-semibold text-foreground transition-all flex items-center gap-1"
                    >
                      +2 Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkTimeShift(-30)}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-semibold text-foreground transition-all flex items-center gap-1"
                    >
                      -30 Mins
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkTimeShift(30)}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/10 hover:text-primary border border-border text-xs font-semibold text-foreground transition-all flex items-center gap-1"
                    >
                      +30 Mins
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {entries.map((entry) => {
                  const resolvedType = getResolvedSlotType(entry);
                  const isOverridden = !!manualOverrides[entry.id];
                  
                  return (
                    <div key={entry.id} className="p-3 rounded-lg bg-secondary border border-border flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <select
                          value={entry.subjectName}
                          onChange={(e) => handleEntryFieldChange(entry.id, 'subjectName', e.target.value)}
                          className="flex-1 bg-card border border-border rounded px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:border-foreground truncate"
                        >
                          <option value="">Select a subject...</option>
                          {subjects.map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors shrink-0"
                          title="Delete Slot"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={entry.day}
                          onChange={(e) => handleEntryFieldChange(entry.id, 'day', e.target.value)}
                          className="bg-card border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
                        >
                          {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(d => (
                            <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                          ))}
                        </select>
                        
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <input
                            type="time"
                            value={entry.startTime}
                            onChange={(e) => handleEntryFieldChange(entry.id, 'startTime', e.target.value)}
                            className="bg-card border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none"
                          />
                          <span>-</span>
                          <input
                            type="time"
                            value={entry.endTime}
                            onChange={(e) => handleEntryFieldChange(entry.id, 'endTime', e.target.value)}
                            className="bg-card border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none"
                          />
                        </div>
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

                <button
                  onClick={handleAddEntry}
                  className="w-full py-3 flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary/50 transition-all"
                >
                  <Plus size={16} />
                  Add Slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
