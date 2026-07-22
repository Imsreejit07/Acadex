'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, Trash2 } from 'lucide-react';
import { getResolvedComponentType } from '@/features/attendance/services/attendance-store';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

interface StepperProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  steps: Array<{ id: number; title: string; description: string }>;
  initialData?: {
    semesterName?: string;
    academicYear?: string;
    startDate?: string;
    subjects?: Array<{
      id?: string;
      name: string;
      code?: string;
      faculty?: string;
      credits?: number | null;
      color: string;
      hasLab: boolean;
      theoryTarget?: number;
      labTarget?: number;
    }>;
    timetableEntries?: Array<{
      day: string;
      subjectName: string;
      componentType: 'THEORY' | 'LAB';
      startTime: string;
      endTime: string;
    }>;
  };
}

export default function Stepper({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  steps,
  initialData
}: StepperProps) {
  const [stepData, setStepData] = useState({
    userName: '',
    semesterName: '',
    academicYear: '',
    startDate: '',
    subjects: [] as Array<{
      id: string;
      name: string;
      code: string;
      faculty: string;
      credits: number | null;
      color: string;
      hasLab: boolean;
      theoryTarget: number;
      labTarget: number;
    }>,
    timetableEntries: [] as Array<{
      day: string;
      subjectName: string;
      componentType: 'THEORY' | 'LAB';
      startTime: string;
      endTime: string;
    }>
  });

  useEffect(() => {
    if (initialData) {
      setStepData({
        userName: (initialData as any).userName || '',
        semesterName: initialData.semesterName || '',
        academicYear: initialData.academicYear || '',
        startDate: initialData.startDate || '',
        subjects: (initialData.subjects || []).map(subject => ({
          id: subject.id || Math.random().toString(36).substr(2, 9),
          name: subject.name,
          code: subject.code || '',
          faculty: subject.faculty || '',
          credits: subject.credits || null,
          color: subject.color || '#3B82F6',
          hasLab: subject.hasLab || false,
          theoryTarget: subject.theoryTarget ?? 75,
          labTarget: subject.labTarget ?? 75,
        })),
        timetableEntries: (initialData.timetableEntries || []).map(entry => ({
          day: entry.day,
          subjectName: entry.subjectName,
          componentType: entry.componentType,
          startTime: entry.startTime,
          endTime: entry.endTime,
        }))
      });
    }
  }, [initialData]);

  const handleInputChange = (field: string, value: any) => {
    setStepData(prev => ({ ...prev, [field]: value }));
  };

  const handleStep1Submit = () => {
    // In a real app, this would save to database
    // For now, just proceed
    onNext();
  };

  const handleStep2Submit = () => {
    // In a real app, this would save subjects to database
    onNext();
  };

  const handleStep3Submit = () => {
    // Record onboarding completion date for mid-semester backfill support
    const onboardingCompleteData = {
      ...stepData,
      onboardingCompletedAt: new Date().toISOString().split('T')[0],
      midSemesterBackfilled: false,
    };
    localStorage.setItem('onboarding_data', JSON.stringify(onboardingCompleteData));
    window.dispatchEvent(new Event('attendance-tool-store-change'));

    // Persist immediately to Supabase database
    import('@/shared/lib/supabase-service').then(({ saveStateToSupabase }) => {
      const overrides = JSON.parse(localStorage.getItem('attendance_overrides') || '[]');
      const events = JSON.parse(localStorage.getItem('academic_events') || '[]');
      const holidays = JSON.parse(localStorage.getItem('holidays_list') || '[]');
      const extraClasses = JSON.parse(localStorage.getItem('extra_classes') || '[]');
      const rescheduledClasses = JSON.parse(localStorage.getItem('rescheduled_classes') || '[]');
      const attendanceCredits = JSON.parse(localStorage.getItem('attendance_credits') || '[]');
      saveStateToSupabase({
        onboarding: onboardingCompleteData,
        overrides,
        events,
        holidays,
        extraClasses,
        rescheduledClasses,
        attendanceCredits,
      }).then(() => {
        console.log('[Acadex Onboarding] Onboarding state persisted directly to Supabase database.');
      });
    });

    onNext();
  };

  // Get current step component
  let currentStepContent = null;
  
  switch (currentStep) {
    case 1:
      currentStepContent = (
        <Step1 
          stepData={stepData}
          onInputChange={handleInputChange}
          onSubmit={handleStep1Submit}
        />
      );
      break;
    case 2:
      currentStepContent = (
        <Step2 
          stepData={stepData}
          onInputChange={handleInputChange}
          onSubmit={handleStep2Submit}
        />
      );
      break;
    case 3:
      currentStepContent = (
        <Step3 
          stepData={stepData}
          onInputChange={handleInputChange}
          onSubmit={handleStep3Submit}
        />
      );
      break;
    case 4:
      currentStepContent = <Step4 onFinish={() => window.location.href = '/dashboard'} />;
      break;
    default:
      currentStepContent = <div>Loading...</div>;
  }

  const getInitials = (name: string): string => {
    if (!name || !name.trim()) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${first}${last}`;
  };

  const userInitials = getInitials(stepData.userName);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="space-y-6">
        {/* Progress Bar */}
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white text-lg font-bold">
            {userInitials || currentStep}
          </div>
          <div className="flex-1 space-y-2">
            <h1 className="text-xl font-bold">{steps[currentStep - 1].title}</h1>
            <p className="text-sm text-muted-foreground">{steps[currentStep - 1].description}</p>
          </div>
        </div>
        
        {/* Progress Bar Visual */}
        <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
          <div 
            className={`h-full bg-primary transition-all duration-500`} 
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          ></div>
        </div>
        
        {/* Step Content */}
        <div className="space-y-6">
          {currentStepContent}
        </div>
        
        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 border-t">
          {currentStep > 1 && (
            <button 
              onClick={onBack}
              className="flex items-center space-x-2 px-4 py-2 border border-secondary rounded-lg hover:bg-secondary/50 text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          )}
          
          {currentStep < totalSteps ? (
            <button 
              onClick={onNext}
              className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm font-medium"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button 
              onClick={() => window.location.href = '/dashboard'}
              className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm font-medium"
            >
              <span>Get Started</span>
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step 1: Create Semester
function Step1({ 
  stepData, 
  onInputChange, 
  onSubmit 
}: {
  stepData: any;
  onInputChange: (field: string, value: any) => void;
  onSubmit: () => void;
}) {
  const isFormInvalid = !stepData.userName?.trim() || !stepData.semesterName?.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Your Name <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={stepData.userName || ''}
          onChange={(e) => onInputChange('userName', e.target.value)}
          placeholder="e.g., Sreejit Das"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Semester Name <span className="text-red-400">*</span></label>
        <input
          type="text"
          value={stepData.semesterName || ''}
          onChange={(e) => onInputChange('semesterName', e.target.value)}
          placeholder="e.g., Fall 2024, Spring 2025, Semester 5"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          required
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Academic Year (Optional)</label>
          <input
            type="text"
            value={stepData.academicYear || ''}
            onChange={(e) => onInputChange('academicYear', e.target.value)}
            placeholder="e.g., 2024-2025"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Start Date (Optional)</label>
          <input
            type="date"
            value={stepData.startDate || ''}
            onChange={(e) => onInputChange('startDate', e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border">
        <label className="text-sm font-medium text-foreground flex items-center justify-between">
          <span>Gemini API Key (Optional BYOK)</span>
          <span className="text-xs text-muted-foreground font-normal">Use your own AI key</span>
        </label>
        <input
          type="password"
          value={typeof window !== 'undefined' ? (localStorage.getItem('custom_gemini_api_key') || '') : ''}
          onChange={(e) => {
            const val = e.target.value.trim();
            if (val) {
              localStorage.setItem('custom_gemini_api_key', val);
            } else {
              localStorage.removeItem('custom_gemini_api_key');
            }
          }}
          placeholder="AIzaSy... (Leave blank for app default key)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors font-mono"
        />
        <p className="text-[11px] text-muted-foreground">
          You can also add or validate your personal API key later in Settings.
        </p>
      </div>
      
      <button 
        onClick={onSubmit}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 mt-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        disabled={isFormInvalid}
      >
        Continue to Subjects
      </button>
    </div>
  );
}

// Step 2: Add Subjects
function Step2({ 
  stepData, 
  onInputChange, 
  onSubmit 
}: {
  stepData: any;
  onInputChange: (field: string, value: any) => void;
  onSubmit: () => void;
}) {
  const [tempSubject, setTempSubject] = useState({
    name: '',
    code: '',
    faculty: '',
    credits: null as number | null,
    color: '#3B82F6',
    hasLab: false,
    theoryTarget: 75,
    labTarget: 75
  });

  const handleTempChange = (field: string, value: any) => {
    setTempSubject(prev => ({ ...prev, [field]: value }));
  };

  const handleAddSubject = () => {
    if (!tempSubject.name.trim()) return;
    
    const subjectNames = tempSubject.name
      .split(/[,;\n]+/)
      .map(name => name.trim())
      .filter(name => name.length > 0);
      
    if (subjectNames.length === 0) return;
    
    const newSubjects = subjectNames.map((name, index) => {
      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];
      const colorIndex = ((stepData.subjects || []).length + index) % colors.length;
      return {
        id: Math.random().toString(36).substr(2, 9),
        name,
        code: index === 0 ? tempSubject.code : '',
        faculty: index === 0 ? tempSubject.faculty : '',
        credits: index === 0 ? tempSubject.credits : null,
        color: colors[colorIndex],
        hasLab: index === 0 ? tempSubject.hasLab : false,
        theoryTarget: tempSubject.theoryTarget,
        labTarget: tempSubject.labTarget
      };
    });
    
    onInputChange('subjects', [...(stepData.subjects || []), ...newSubjects]);
    
    setTempSubject({
      name: '',
      code: '',
      faculty: '',
      credits: null,
      color: '#3B82F6',
      hasLab: false,
      theoryTarget: 75,
      labTarget: 75
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Subject Name(s)</label>
        <input
          type="text"
          value={tempSubject.name}
          onChange={(e) => handleTempChange('name', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddSubject();
            }
          }}
          placeholder="e.g. Calculus, Physics, Data Structures (or comma-separated)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-3 space-y-2">
        <div>
          <label className="text-sm font-medium">Subject Code (Optional)</label>
          <input
            type="text"
            value={tempSubject.code}
            onChange={(e) => handleTempChange('code', e.target.value)}
            placeholder="e.g., MATH101"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Faculty (Optional)</label>
          <input
            type="text"
            value={tempSubject.faculty}
            onChange={(e) => handleTempChange('faculty', e.target.value)}
            placeholder="e.g., Dr. Smith"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3 space-y-2">
        <div>
          <label className="text-sm font-medium">Credits (Optional)</label>
          <input
            type="number"
            value={tempSubject.credits ?? ''}
            onChange={(e) => handleTempChange('credits', e.target.value === '' ? null : parseInt(e.target.value))}
            min="1"
            max="10"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex items-center space-x-2 pb-2">
          <label className="text-sm font-medium flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={tempSubject.hasLab}
              onChange={(e) => handleTempChange('hasLab', e.target.checked)}
              className="h-4 w-4 text-primary"
            />
            <span className="ml-2 select-none">Has Lab Component</span>
          </label>
        </div>
      </div>
      
      {tempSubject.hasLab && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Theory Attendance Target (%)</label>
            <input
              type="number"
              value={tempSubject.theoryTarget}
              onChange={(e) => handleTempChange('theoryTarget', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              min="0"
              max="100"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Lab Attendance Target (%)</label>
            <input
              type="number"
              value={tempSubject.labTarget}
              onChange={(e) => handleTempChange('labTarget', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              min="0"
              max="100"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}
      
      {!tempSubject.hasLab && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Attendance Target (%)</label>
          <input
            type="number"
            value={tempSubject.theoryTarget}
            onChange={(e) => handleTempChange('theoryTarget', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            min="0"
            max="100"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Color Theme</label>
        <div className="flex space-x-2">
          {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'].map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => handleTempChange('color', color)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${tempSubject.color === color ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      
      <div className="pt-2">
        <button 
          type="button"
          onClick={handleAddSubject}
          className="w-full rounded-lg border px-4 py-2 text-sm font-medium border-primary/50 hover:bg-primary/5"
        >
          Add Subject
        </button>
      </div>
      
      {(stepData.subjects || []).length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <h2 className="text-lg font-semibold">Added Subjects</h2>
          <div className="space-y-2">
            {(stepData.subjects || []).map((subject: any, index: number) => (
              <div key={subject.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex-1">
                  <p className="font-medium">{subject.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-slate-400">
                    {subject.code && <span className="text-xs">Code: {subject.code}</span>}
                    {subject.credits && <span className="text-xs">Credits: {subject.credits}</span>}
                    {subject.faculty && <span className="text-xs">Faculty: {subject.faculty}</span>}
                    <span className="text-xs">
                      {`Target: ${subject.hasLab ? `Theory: ${subject.theoryTarget}%` : `Overall: ${subject.theoryTarget}%`}`}{subject.hasLab && `, Lab: ${subject.labTarget}%`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center space-x-1.5 cursor-pointer select-none border border-border bg-secondary/60 rounded px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <input
                      type="checkbox"
                      checked={subject.hasLab}
                      onChange={(e) => {
                        const updated = [...(stepData.subjects || [])];
                        updated[index] = { ...subject, hasLab: e.target.checked };
                        onInputChange('subjects', updated);
                      }}
                      className="h-3.5 w-3.5 rounded text-primary focus:ring-0 bg-transparent border-slate-800"
                    />
                    <span>Has Lab</span>
                  </label>
                  <div className="w-8 h-8 rounded-full" style={{ backgroundColor: subject.color }}></div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (stepData.subjects || []).filter((_: any, i: number) => i !== index);
                      onInputChange('subjects', updated);
                    }}
                    className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                    title="Remove subject"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <button 
        onClick={onSubmit}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 mt-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        disabled={(stepData.subjects || []).length === 0}
      >
        Continue to Timetable
      </button>
    </div>
  );
}

// Step 3: Set Up Timetable
function Step3({ 
  stepData, 
  onInputChange, 
  onSubmit 
}: {
  stepData: any;
  onInputChange: (field: string, value: any) => void;
  onSubmit: () => void;
}) {
  const daysOfWeek = [
    { label: 'Mon', value: 'MONDAY' },
    { label: 'Tue', value: 'TUESDAY' },
    { label: 'Wed', value: 'WEDNESDAY' },
    { label: 'Thu', value: 'THURSDAY' },
    { label: 'Fri', value: 'FRIDAY' },
    { label: 'Sat', value: 'SATURDAY' },
    { label: 'Sun', value: 'SUNDAY' },
  ];

  const [selectedDays, setSelectedDays] = useState<string[]>(['MONDAY']);
  const [tempEntry, setTempEntry] = useState({
    subjectName: '',
    componentType: 'THEORY' as 'THEORY' | 'LAB',
    startTime: '09:00',
    endTime: '10:00'
  });

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editFields, setEditFields] = useState({
    day: '',
    subjectName: '',
    componentType: 'THEORY' as 'THEORY' | 'LAB',
    startTime: '',
    endTime: ''
  });

  const startEditing = (index: number, entry: any) => {
    setEditingIndex(index);
    setEditFields({
      day: entry.day,
      subjectName: entry.subjectName,
      componentType: entry.manualOverrideType || entry.componentType || 'THEORY',
      startTime: entry.startTime,
      endTime: entry.endTime
    });
  };

  const handleEditFieldChange = (field: string, value: any) => {
    setEditFields(prev => ({ ...prev, [field]: value }));
  };

  const saveEdit = (index: number) => {
    const updated = [...stepData.timetableEntries];
    updated[index] = {
      ...updated[index],
      day: editFields.day,
      subjectName: editFields.subjectName,
      startTime: editFields.startTime,
      endTime: editFields.endTime,
      manualOverrideType: editFields.componentType,
    };
    onInputChange('timetableEntries', updated);
    setEditingIndex(null);
  };

  const handleTempEntryChange = (field: string, value: any) => {
    setTempEntry(prev => ({ ...prev, [field]: value }));
  };

  const handleAddTimetableEntry = () => {
    if (!tempEntry.subjectName || selectedDays.length === 0) return;
    
    const newEntries = selectedDays.map(day => ({
      id: Math.random().toString(36).substr(2, 9),
      day,
      subjectName: tempEntry.subjectName,
      startTime: tempEntry.startTime,
      endTime: tempEntry.endTime,
      manualOverrideType: tempEntry.componentType,
    }));

    onInputChange('timetableEntries', [
      ...stepData.timetableEntries,
      ...newEntries
    ]);
    
    // Clear subjectName to prevent accidental duplicates but keep time/days for fast entry of other subjects if needed
    setTempEntry(prev => ({
      ...prev,
      subjectName: ''
    }));
  };

  const availableSubjects = (stepData.subjects || []).map((s: any) => s.name);
  const isAddDisabled = selectedDays.length === 0 || !tempEntry.subjectName;

  return (
    <div className="space-y-4">
      {/* Multi-day Selection Pills */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Days of Week <span className="text-red-400">*</span></label>
        <div className="flex flex-wrap gap-2 pt-1">
          {daysOfWeek.map((d) => {
            const isSelected = selectedDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => {
                  setSelectedDays(prev => 
                    prev.includes(d.value) 
                      ? prev.filter(day => day !== d.value)
                      : [...prev, d.value]
                  );
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                  isSelected 
                    ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-sm' 
                    : 'bg-card border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Subject <span className="text-red-400">*</span></label>
        <select
          value={tempEntry.subjectName}
          onChange={(e) => handleTempEntryChange('subjectName', e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
        >
          <option value="">-- Select Subject --</option>
          {availableSubjects.map((subject: string) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Session Type</label>
        <select
          value={tempEntry.componentType}
          onChange={(e) => handleTempEntryChange('componentType', e.target.value as any)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
        >
          <option value="THEORY">Theory</option>
          <option value="LAB">Lab</option>
          <option value="TUTORIAL">Tutorial</option>
          <option value="WORKSHOP">Workshop</option>
          <option value="SEMINAR">Seminar</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3 space-y-2">
        <div>
          <label className="text-sm font-medium">Start Time</label>
          <input
            type="time"
            value={tempEntry.startTime}
            onChange={(e) => handleTempEntryChange('startTime', e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium">End Time</label>
          <input
            type="time"
            value={tempEntry.endTime}
            onChange={(e) => handleTempEntryChange('endTime', e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
      
      <div className="space-y-4 pt-2">
        <button 
          type="button"
          onClick={handleAddTimetableEntry}
          className="w-full rounded-lg border px-4 py-2 text-sm font-medium border-primary/50 hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          disabled={isAddDisabled}
        >
          Add Time Slot
        </button>
      </div>
      
      <div className="space-y-3 pt-4 border-t">
        <h2 className="text-lg font-semibold">Timetable</h2>
        {stepData.timetableEntries.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No timetable available yet.</p>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-secondary/50">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Day</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Subject</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Time</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary/50">
                  {stepData.timetableEntries.map((entry: any, index: number) => {
                    const isEditing = editingIndex === index;
                    const resolvedType = getResolvedComponentType(entry, stepData.subjects || []);
                    
                    return (
                      <tr key={index} className="hover:bg-secondary/50 transition-all">
                        {isEditing ? (
                          <>
                            {/* Day edit */}
                            <td className="px-2 py-1.5 align-middle">
                              <select
                                value={editFields.day}
                                onChange={(e) => handleEditFieldChange('day', e.target.value)}
                                className="w-full max-w-[85px] rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none"
                              >
                                {daysOfWeek.map(d => (
                                  <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                              </select>
                            </td>
                            {/* Subject edit */}
                            <td className="px-2 py-1.5 align-middle">
                              <select
                                value={editFields.subjectName}
                                onChange={(e) => handleEditFieldChange('subjectName', e.target.value)}
                                className="w-full max-w-[125px] rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none"
                              >
                                {availableSubjects.map((subj: string) => (
                                  <option key={subj} value={subj}>{subj}</option>
                                ))}
                              </select>
                            </td>
                            {/* Type edit */}
                            <td className="px-2 py-1.5 align-middle">
                              <select
                                value={editFields.componentType}
                                onChange={(e) => handleEditFieldChange('componentType', e.target.value)}
                                className="w-full max-w-[105px] rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none"
                              >
                                <option value="THEORY">THEORY</option>
                                <option value="LAB">LAB</option>
                                <option value="TUTORIAL">TUTORIAL</option>
                                <option value="WORKSHOP">WORKSHOP</option>
                                <option value="SEMINAR">SEMINAR</option>
                                <option value="OTHER">OTHER</option>
                              </select>
                            </td>
                            {/* Time edit */}
                            <td className="px-2 py-1.5 align-middle">
                              <div className="flex items-center gap-1">
                                <input
                                  type="time"
                                  value={editFields.startTime}
                                  onChange={(e) => handleEditFieldChange('startTime', e.target.value)}
                                  className="w-[72px] rounded border border-border bg-card px-1 py-0.5 text-xs text-foreground focus:outline-none"
                                />
                                <span className="text-slate-500 text-xs">-</span>
                                <input
                                  type="time"
                                  value={editFields.endTime}
                                  onChange={(e) => handleEditFieldChange('endTime', e.target.value)}
                                  className="w-[72px] rounded border border-border bg-card px-1 py-0.5 text-xs text-foreground focus:outline-none"
                                />
                              </div>
                            </td>
                            {/* Save/Cancel actions */}
                            <td className="px-2 py-1.5 text-center align-middle">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveEdit(index)}
                                  className="text-xs text-emerald-400 hover:text-emerald-300 font-bold"
                                >
                                  ✓ Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingIndex(null)}
                                  className="text-xs text-rose-400 hover:text-rose-300"
                                >
                                  ✕ Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-sm">{entry.day.charAt(0) + entry.day.slice(1).toLowerCase()}</td>
                            <td className="px-3 py-2 text-sm">{entry.subjectName}</td>
                            <td className="px-3 py-2 text-sm">
                              <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                                resolvedType === 'LAB' 
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/20' 
                                  : resolvedType === 'THEORY' 
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
                              }`}>
                                {resolvedType}
                                {entry.manualOverrideType && <span className="ml-1 text-[10px] text-slate-400 font-bold">*</span>}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm">{`${entry.startTime} - ${entry.endTime}`}</td>
                            <td className="text-center px-3 py-2">
                              <div className="flex items-center justify-center gap-3">
                                <button
                                  type="button"
                                  disabled={editingIndex !== null}
                                  onClick={() => startEditing(index, entry)}
                                  className="text-xs text-primary hover:text-primary-foreground/80 font-medium disabled:opacity-40 disabled:pointer-events-none"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={editingIndex !== null}
                                  onClick={() => {
                                    const newEntries = [...stepData.timetableEntries];
                                    newEntries.splice(index, 1);
                                    onInputChange('timetableEntries', newEntries);
                                  }}
                                  className="text-xs text-red-500 hover:text-red-500/80 disabled:opacity-40 disabled:pointer-events-none"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      <button 
        onClick={onSubmit}
        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 mt-4"
        disabled={stepData.timetableEntries.length === 0}
      >
        Finish Setup
      </button>
    </div>
  );
}

// Step 4: Completion
function Step4({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center items-center h-20 w-20 rounded-full bg-primary/10 text-primary mx-auto">
        <Check className="h-8 w-8" />
      </div>
      
      <h1 className="text-2xl font-bold">Welcome to Acadex!</h1>
      <p className="text-lg text-muted-foreground">
        Your academic journey tracking system is ready to use.
      </p>
      
      <div className="space-y-4 text-left max-w-xl mx-auto">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <Check className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-medium">Track Attendance Accurately</h3>
            <p className="text-sm text-muted-foreground">
              Mark lectures as conducted, cancelled, or holiday - only actual classes count toward your attendance.
            </p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <Check className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-medium">Never Lose Your Data</h3>
            <p className="text-sm text-muted-foreground">
              Every edit is saved permanently - your academic history is always accurate and complete.
            </p>
          </div>
        </div>
        
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <Check className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-medium">Plan Your Success</h3>
            <p className="text-sm text-muted-foreground">
              See exactly how many classes you can miss or need to attend to reach your goals.
            </p>
          </div>
        </div>
      </div>
      
      <button 
        onClick={onFinish}
        className="w-full rounded-lg bg-primary px-6 py-3 text-lg font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
