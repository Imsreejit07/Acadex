'use client';

import { redirect } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    async function checkUserStatus() {
      let targetPath = '/login';
      try {
        console.log('[Acadex Root Guard] Checking authenticated user session...');
        const client = supabase;
        if (!client) {
          const savedOnboarding = localStorage.getItem('onboarding_data');
          const hasOnboarded = savedOnboarding ? JSON.parse(savedOnboarding)?.subjects?.length > 0 : false;
          targetPath = hasOnboarded ? '/dashboard' : '/onboarding';
          return;
        }

        const { data, error: authError } = await client.auth.getUser();
        if (authError || !data?.user) {
          console.log('[Acadex Root Guard] No active session found. Redirecting to /login');
          targetPath = '/login';
          return;
        }

        const user = data.user;
        console.log('[Acadex Root Guard] User authenticated:', user.email || user.id);

        // Import and execute full cloud hydration before determining navigation path
        const { loadStateFromSupabase } = await import('@/shared/lib/supabase-service');
        const hydrated = await loadStateFromSupabase();

        // Double check database active semester directly
        const { data: semData } = await client
          .from('semesters')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (semData || hydrated) {
          console.log('[Acadex Root Guard] Active academic semester restored. Navigating to /dashboard');
          targetPath = '/dashboard';
        } else {
          console.log('[Acadex Root Guard] No active semester found in database. Navigating to /onboarding');
          targetPath = '/onboarding';
        }
      } catch (error: any) {
        console.error('[Acadex Root Guard] Error checking user status:', error?.message || error);
        targetPath = '/login';
      } finally {
        setRedirectPath(targetPath);
        setLoading(false);
      }
    }

    checkUserStatus();
  }, []);

  useEffect(() => {
    if (redirectPath) {
      redirect(redirectPath);
    }
  }, [redirectPath]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="animate-pulse rounded-full bg-indigo-500/20 border border-indigo-500/30 h-12 w-12 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full bg-indigo-500 animate-ping" />
      </div>
    </div>
  );
}