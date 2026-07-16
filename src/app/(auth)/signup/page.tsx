'use client';

import { useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { toast, Toaster } from 'sonner';
import { Loader2, GraduationCap } from 'lucide-react';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!supabase) {
      toast.error('Supabase is not configured. Please check your env variables.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (error) throw error;

      toast.success('Account created successfully! Check your email for confirmation.');

      // Save user details locally for onboarding auto-fill, keeping existing data if it exists
      const existing = localStorage.getItem('onboarding_data');
      const parsed = existing ? JSON.parse(existing) : null;
      if (!parsed || !parsed.subjects || parsed.subjects.length === 0) {
        const onboardingData = {
          userName: name,
          semesterName: '',
          academicYear: '',
          startDate: '',
          subjects: [],
          timetableEntries: [],
          onboardingCompletedAt: '',
          midSemesterBackfilled: false,
        };
        localStorage.setItem('onboarding_data', JSON.stringify(onboardingData));
        localStorage.removeItem('attendance_overrides');
      } else {
        parsed.userName = name;
        localStorage.setItem('onboarding_data', JSON.stringify(parsed));
      }
      window.dispatchEvent(new Event('attendance-tool-store-change'));

      setTimeout(() => {
        window.location.href = '/dashboard/onboarding';
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <Toaster position="top-center" richColors />
      
      <div className="w-full max-w-sm space-y-6 bg-card p-8 rounded-2xl border border-border shadow-md">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
            <GraduationCap className="text-foreground" size={20} />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Acadex
          </h1>
          <p className="text-xs text-muted-foreground">Create your account to get started</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs font-semibold text-muted-foreground">Full Name</label>
            <input
              id="name"
              type="text"
              placeholder="Sreejit Das"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground transition-colors"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-muted-foreground">Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="name@iiitnr.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground transition-colors"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-muted-foreground">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Signing up...
              </>
            ) : (
              'Sign Up'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="text-foreground hover:underline font-bold">Log in</a>
        </p>
      </div>
    </div>
  );
}