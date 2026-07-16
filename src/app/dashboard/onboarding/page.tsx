'use client';

import { useState } from 'react';
import Stepper from './stepper';
import { Upload, Sparkles, FileCheck, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle, SkipForward, Clock } from 'lucide-react';
import { toast, Toaster } from 'sonner';

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

type AiTimetableData = {
  subjects?: Array<{
    name: string;
    code: string;
    faculty: string;
    color: string;
    hasLab: boolean;
  }>;
  timetableEntries?: Array<{
    day: string;
    subjectName: string;
    componentType: 'THEORY' | 'LAB';
    startTime: string;
    endTime: string;
  }>;
  pipelineLog?: PipelineLog;
  rawMarkdown?: string;
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

function PipelinePanel({ log, rawMarkdown }: { log: PipelineLog; rawMarkdown?: string }) {
  const [showMarkdown, setShowMarkdown] = useState(false);

  const parserBadgeColor =
    log.parserType === 'gemini' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/20' :
    log.parserType === 'ollama' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/20' :
    log.parserType === 'proxy'  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/20' :
    'bg-secondary text-muted-foreground border-border';

  const hasErrors = log.steps.some(s => s.status === 'error');
  const hasWarnings = log.steps.some(s => s.status === 'warn') || log.warnings.length > 0;

  const panelBorder = hasErrors
    ? 'border-red-500/20'
    : hasWarnings
    ? 'border-amber-500/20'
    : 'border-emerald-500/20';

  return (
    <div className={`mt-5 rounded-xl border ${panelBorder} bg-card overflow-hidden`}>
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

      {/* Stats strip */}
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {[
          { label: 'OCR chars', value: log.rawMarkdownChars.toLocaleString() },
          { label: 'Table rows', value: log.tableRowsDetected },
          { label: 'Subjects', value: log.finalSubjects },
          { label: 'Entries', value: log.finalEntries },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-2 text-center bg-secondary/10">
            <div className="text-base font-bold text-foreground">{value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Comparison row — deterministic vs AI */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border text-[11px]">
        <div className="px-4 py-2">
          <span className="text-muted-foreground">Deterministic: </span>
          <span className="text-foreground font-medium">{log.deterministicSubjects} subj · {log.deterministicEntries} entries</span>
        </div>
        <div className="px-4 py-2">
          <span className="text-muted-foreground">AI ({log.parserModel}): </span>
          <span className="text-foreground font-medium">
            {log.parserType === 'none' ? 'skipped' : `${log.aiSubjects} subj · ${log.aiEntries} entries`}
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
            <span className="text-[10px] text-muted-foreground shrink-0">{step.ms}ms</span>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {log.warnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="h-px bg-border mb-2" />
          {log.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-600 dark:text-amber-300/80">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Raw OCR markdown collapsible */}
      {rawMarkdown && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowMarkdown(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <span className="font-medium">
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

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [aiData, setAiData] = useState<AiTimetableData | null>(null);
  const [pipelineLog, setPipelineLog] = useState<PipelineLog | null>(null);
  const [rawMarkdown, setRawMarkdown] = useState<string | undefined>(undefined);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const totalSteps = 4;

  const steps = [
    { id: 1, title: 'Create Your Semester', description: 'Set up your current academic term' },
    { id: 2, title: 'Add Your Subjects', description: 'Enter all your courses for this semester' },
    { id: 3, title: 'Set Up Your Timetable', description: 'Add your weekly class schedule' },
    { id: 4, title: "You're All Set!", description: 'Start tracking your attendance today' },
  ];

  const handleNext = () => {
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
    else window.location.href = '/dashboard';
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const res = await fetch('/api/parse-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });

      const data = await res.json() as { success: boolean; message: string; details?: string };
      if (res.ok && data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.details || data.message || 'Connection test failed');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect to parser endpoint');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | React.MouseEvent) => {
    const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);

    if (isTauri) {
      event.preventDefault();
      setIsUploading(true);
      setPipelineLog(null);
      setRawMarkdown(undefined);

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const selectedModel = localStorage.getItem('selected_ollama_model') || 'qwen2.5:14b';
        
        // Pick and parse the file natively
        const rawJson = await invoke<string>('parse_timetable_desktop', { selectedModel });
        const parsed = JSON.parse(rawJson) as AiTimetableData;
        
        const subjectCount = parsed.subjects?.length ?? 0;
        const entryCount = parsed.timetableEntries?.length ?? 0;

        if (subjectCount === 0 && entryCount === 0) {
          toast.warning('Ollama completed but found no timetable entries. Please check the PDF contents.');
        } else {
          toast.success(`Extracted ${subjectCount} subjects · ${entryCount} class slots`);
        }

        setUploadedFileName('timetable.pdf');
        setAiData(parsed);
        setCurrentStep(1);
      } catch (error: any) {
        console.error(error);
        toast.error(error?.toString() || 'Failed to parse timetable via Ollama.');
        setUploadedFileName(null);
      } finally {
        setIsUploading(false);
      }
      return;
    }

    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file.');
      return;
    }

    setUploadedFileName(file.name);
    setIsUploading(true);
    setPipelineLog(null);
    setRawMarkdown(undefined);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/parse-timetable', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as AiTimetableData & { error?: string; details?: string };

      // Always capture pipeline log regardless of success/failure
      if (data.pipelineLog) setPipelineLog(data.pipelineLog);
      if (data.rawMarkdown) setRawMarkdown(data.rawMarkdown);

      if (!response.ok) {
        const errMsg = data.error || data.details || 'Failed to analyze PDF';
        toast.error(errMsg);
        setUploadedFileName(null);
        return;
      }

      const subjectCount = data.subjects?.length ?? 0;
      const entryCount = data.timetableEntries?.length ?? 0;

      if (subjectCount === 0 && entryCount === 0) {
        toast.warning('Parser completed but found no data. Check the pipeline log below for details.');
      } else {
        toast.success(`Extracted ${subjectCount} subjects · ${entryCount} class slots`);
      }

      setAiData(data);
      setCurrentStep(1);
    } catch (error: unknown) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Error occurred while parsing PDF. Please try manual entry.');
      setUploadedFileName(null);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col relative bg-background text-foreground overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Main Content Area */}
      <div className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full z-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary border border-border text-foreground text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3 w-3 animate-pulse text-foreground" />
            Timetable Import
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
            Let&apos;s Set Up Acadex
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
            Configure your academic semester, subjects, and weekly timetable in seconds.
          </p>
        </div>

        {/* PDF Upload Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8 shadow-md transition-all duration-300">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-secondary border border-border text-foreground">
                  <Sparkles className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-bold text-foreground">Auto-fill from PDF</h2>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground max-w-xl">
                Upload a PDF of your weekly class schedule or timetable. The parser will extract classes, subjects, timings, and build your schedule.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || isUploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTestingConnection ? (
                    <>
                      <RefreshCw size={12} className="animate-spin text-muted-foreground" />
                      Testing LLM Connection...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="text-muted-foreground" />
                      Test AI Connection
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="w-full md:w-auto shrink-0">
              <label 
                onClick={handleFileUpload}
                className="relative flex flex-col items-center justify-center w-full md:w-56 h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-foreground/30 hover:bg-secondary/35 transition-all duration-200 group"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-6 w-6 text-foreground animate-spin" />
                      <p className="text-xs font-semibold text-muted-foreground">Analyzing PDF...</p>
                    </div>
                  ) : uploadedFileName ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300 truncate max-w-[180px]">
                        {uploadedFileName}
                      </p>
                      <span className="text-[10px] text-muted-foreground">Click to replace</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-6 w-6 text-muted-foreground group-hover:text-foreground group-hover:scale-110 transition-all duration-200" />
                      <p className="text-xs font-semibold text-foreground">Upload Timetable PDF</p>
                      <p className="text-[10px] text-muted-foreground">Max size: 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  onClick={(e) => {
                    const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI_INTERNALS__ !== undefined || (window as any).__TAURI__ !== undefined);
                    if (isTauri) e.stopPropagation();
                  }}
                />
              </label>
            </div>
          </div>


          {/* Minimal success summary if no pipeline log yet */}
          {aiData && !pipelineLog && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-xs">
              <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>
                <strong>Success!</strong> Pre-filled{' '}
                <strong>{aiData.subjects?.length || 0} subjects</strong> and{' '}
                <strong>{aiData.timetableEntries?.length || 0} class slots</strong>. Review the setup below.
              </span>
            </div>
          )}
        </div>

        {/* Stepper Card */}
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-md">
          <Stepper
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={handleBack}
            onNext={handleNext}
            steps={steps}
            initialData={aiData || undefined}
          />
        </div>

      </div>

      {/* Screen Blur Overlay while uploading */}
      {isUploading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-border border-t-foreground animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold text-foreground">Parsing Timetable</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Running OCR → Deterministic parser → AI (Ollama)...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
