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
  ok: <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />,
  warn: <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />,
  error: <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />,
  skip: <SkipForward size={14} className="text-slate-500 shrink-0 mt-0.5" />,
};

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-slate-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
  skip: 'text-slate-500',
};

function PipelinePanel({ log, rawMarkdown }: { log: PipelineLog; rawMarkdown?: string }) {
  const [showMarkdown, setShowMarkdown] = useState(false);

  const parserBadgeColor =
    log.parserType === 'gemini' ? 'bg-blue-500/15 text-blue-300 border-blue-500/20' :
    log.parserType === 'ollama' ? 'bg-violet-500/15 text-violet-300 border-violet-500/20' :
    log.parserType === 'proxy'  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' :
    'bg-slate-700/40 text-slate-400 border-slate-600/20';

  const hasErrors = log.steps.some(s => s.status === 'error');
  const hasWarnings = log.steps.some(s => s.status === 'warn') || log.warnings.length > 0;

  const panelBorder = hasErrors
    ? 'border-red-500/20'
    : hasWarnings
    ? 'border-amber-500/20'
    : 'border-emerald-500/20';

  return (
    <div className={`mt-5 rounded-xl border ${panelBorder} bg-slate-900/60 backdrop-blur-sm overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/5">
        <span className="text-xs font-bold text-white uppercase tracking-wider">Extraction Pipeline</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${parserBadgeColor}`}>
          {log.parserType === 'proxy' ? 'Proxy (auto)' : 
           log.parserType === 'gemini' ? `Gemini (${log.parserModel})` :
           log.parserType === 'ollama' ? `Ollama (${log.parserModel})` :
           'No AI'}
        </span>
        <span className="text-[11px] text-slate-500 ml-auto flex items-center gap-1">
          <Clock size={11} />
          {(log.processingMs / 1000).toFixed(1)}s total
        </span>
      </div>

      {/* Parser reason */}
      <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
        <p className="text-[11px] text-slate-500">
          <span className="text-slate-400 font-medium">Parser selection: </span>{log.parserReason}
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 divide-x divide-white/5 border-b border-white/5">
        {[
          { label: 'OCR chars', value: log.rawMarkdownChars.toLocaleString() },
          { label: 'Table rows', value: log.tableRowsDetected },
          { label: 'Subjects', value: log.finalSubjects },
          { label: 'Entries', value: log.finalEntries },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-2 text-center">
            <div className="text-base font-bold text-white">{value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Comparison row — deterministic vs AI */}
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5 text-[11px]">
        <div className="px-4 py-2">
          <span className="text-slate-500">Deterministic: </span>
          <span className="text-slate-300 font-medium">{log.deterministicSubjects} subj · {log.deterministicEntries} entries</span>
        </div>
        <div className="px-4 py-2">
          <span className="text-slate-500">AI ({log.parserModel}): </span>
          <span className="text-slate-300 font-medium">
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
              <span className="text-[11px] text-slate-500 ml-2">{step.detail}</span>
            </div>
            <span className="text-[10px] text-slate-600 shrink-0">{step.ms}ms</span>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {log.warnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="h-px bg-white/5 mb-2" />
          {log.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300/80">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Raw OCR markdown collapsible */}
      {rawMarkdown && (
        <div className="border-t border-white/5">
          <button
            onClick={() => setShowMarkdown(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors"
          >
            <span className="font-medium">
              Raw OCR Output ({rawMarkdown.length.toLocaleString()} chars)
            </span>
            {showMarkdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {showMarkdown && (
            <pre className="px-4 pb-4 text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-words max-h-72 overflow-y-auto leading-relaxed">
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
    <div className="flex-1 flex flex-col relative bg-slate-950 text-slate-100 overflow-x-hidden">
      <Toaster position="top-center" richColors />

      {/* Background Decorative Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full z-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3 w-3 animate-pulse text-violet-400" />
            Timetable Import
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Let&apos;s Set Up AcademicOS
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">
            Configure your academic semester, subjects, and weekly timetable in seconds.
          </p>
        </div>

        {/* PDF Upload Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 shadow-2xl transition-all duration-300 hover:border-slate-700">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
                  <Sparkles className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-bold text-white">Auto-fill from PDF</h2>
              </div>
              <p className="text-xs md:text-sm text-slate-400 max-w-xl">
                Upload a PDF of your weekly class schedule or timetable. The parser will extract classes, subjects, timings, and build your schedule.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || isUploading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white hover:border-slate-700 hover:bg-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTestingConnection ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Testing LLM Connection...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="text-violet-400" />
                      Test AI Connection
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="w-full md:w-auto shrink-0">
              <label className="relative flex flex-col items-center justify-center w-full md:w-56 h-28 border-2 border-dashed border-slate-800 rounded-xl cursor-pointer hover:border-violet-500/50 hover:bg-slate-950/40 transition-all duration-200 group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-6 w-6 text-violet-400 animate-spin" />
                      <p className="text-xs font-semibold text-violet-300">Analyzing PDF...</p>
                    </div>
                  ) : uploadedFileName ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileCheck className="h-6 w-6 text-emerald-400" />
                      <p className="text-xs font-semibold text-emerald-300 truncate max-w-[180px]">
                        {uploadedFileName}
                      </p>
                      <span className="text-[10px] text-slate-500">Click to replace</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-6 w-6 text-slate-400 group-hover:text-violet-400 group-hover:scale-110 transition-all duration-200" />
                      <p className="text-xs font-semibold text-slate-300">Upload Timetable PDF</p>
                      <p className="text-[10px] text-slate-500">Max size: 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>

          {/* Pipeline Transparency Panel */}
          {pipelineLog && (
            <PipelinePanel log={pipelineLog} rawMarkdown={rawMarkdown} />
          )}

          {/* Minimal success summary if no pipeline log yet (shouldn't happen) */}
          {aiData && !pipelineLog && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
              <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Success!</strong> Pre-filled{' '}
                <strong>{aiData.subjects?.length || 0} subjects</strong> and{' '}
                <strong>{aiData.timetableEntries?.length || 0} class slots</strong>. Review the setup below.
              </span>
            </div>
          )}
        </div>

        {/* Stepper Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 md:p-8 shadow-xl">
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
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-slate-800 border-t-violet-500 animate-spin" />
            <Sparkles className="h-6 w-6 text-violet-400 absolute top-5 left-5 animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold text-white">Parsing Timetable</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Running OCR → Deterministic parser → AI ({process.env.NEXT_PUBLIC_AI_MODEL || 'Gemini'})...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
