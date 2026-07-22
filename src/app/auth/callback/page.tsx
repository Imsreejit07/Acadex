'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/shared/lib/supabase';
import { loadStateFromSupabase } from '@/shared/lib/supabase-service';
import { GraduationCap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        console.log('[Acadex Auth Callback] Processing email verification callback...');
        
        if (!supabase) {
          throw new Error('Supabase client is not initialized.');
        }

        // 1. Check for PKCE exchange code in URL search parameters
        const code = searchParams?.get('code');
        const errorDescription = searchParams?.get('error_description');

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          console.log('[Acadex Auth Callback] Exchanging authorization code for session...');
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.warn('[Acadex Auth Callback] Code exchange error:', exchangeError.message);
            // Fall through to session check in case user is already authenticated
          }
        }

        // 2. Fetch active authenticated session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          // Double check with getUser() as fallback
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            throw new Error('Could not establish an authenticated session. The verification link may have expired or already been used.');
          }
        }

        console.log('[Acadex Auth Callback] Authentication verified successfully.');
        setStatus('success');

        // 3. Hydrate state from cloud database
        const hydrated = await loadStateFromSupabase();
        
        // 4. Check if active semester exists
        const { data: semData } = await supabase
          .from('semesters')
          .select('id')
          .eq('user_id', session?.user.id || '')
          .eq('status', 'ACTIVE')
          .maybeSingle();

        const targetPath = (semData || hydrated) ? '/dashboard' : '/dashboard/onboarding';

        // 5. Smooth redirect after success feedback
        setTimeout(() => {
          router.replace(targetPath);
        }, 1200);

      } catch (err: any) {
        console.error('[Acadex Auth Callback] Verification error:', err?.message || err);
        
        // Final fallback safeguard: if user is logged in despite callback error, proceed into app
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            console.log('[Acadex Auth Callback] Fallback: User active session detected despite callback warning. Continuing to dashboard...');
            setStatus('success');
            setTimeout(() => {
              router.replace('/dashboard');
            }, 1000);
            return;
          }
        } catch {
          // Ignore fallback error
        }

        setStatus('error');
        setErrorMessage(err?.message || 'An unexpected error occurred during email verification.');
      }
    }

    handleAuthCallback();
  }, [router, searchParams]);

  return (
    <div className="w-full max-w-sm space-y-6 bg-card p-8 rounded-2xl border border-border shadow-lg text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
        <GraduationCap className="text-foreground" size={24} />
      </div>

      {status === 'loading' && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="animate-spin text-primary" size={24} />
          </div>
          <h2 className="text-lg font-bold tracking-tight">Verifying your email</h2>
          <p className="text-xs text-muted-foreground">
            Please wait while we confirm your account and set up your session...
          </p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <h2 className="text-lg font-bold tracking-tight">Email Verified!</h2>
          <p className="text-xs text-muted-foreground">
            Your account has been successfully verified. Redirecting to your dashboard...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold tracking-tight">Verification Status</h2>
          <p className="text-xs text-muted-foreground">{errorMessage}</p>

          <div className="pt-2 space-y-2">
            <button
              onClick={() => router.replace('/dashboard')}
              className="w-full py-2.5 px-4 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => router.replace('/login')}
              className="w-full py-2.5 px-4 rounded-lg border border-border bg-secondary text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Return to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <Suspense
        fallback={
          <div className="w-full max-w-sm space-y-6 bg-card p-8 rounded-2xl border border-border shadow-lg text-center">
            <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto">
              <GraduationCap className="text-foreground" size={24} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Verifying your email</h2>
              <p className="text-xs text-muted-foreground">Loading authentication parameters...</p>
            </div>
          </div>
        }
      >
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}
