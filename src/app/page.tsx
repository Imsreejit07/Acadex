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
        const savedOnboarding = localStorage.getItem('onboarding_data');
        const hasOnboarded = savedOnboarding ? JSON.parse(savedOnboarding)?.subjects?.length > 0 : false;

        const client = supabase;
        if (!client) {
          targetPath = hasOnboarded ? '/dashboard' : '/dashboard/onboarding';
          return;
        }

        const { data, error: authError } = await client.auth.getUser();
        if (authError) {
          // If auth fails or session expired, redirect to login
          targetPath = '/login';
          return;
        }

        const user = data?.user;
        
        if (user) {
          // Check if user has an active semester
          const { data: semData, error: dbError } = await client
            .from('semesters')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'ACTIVE')
            .maybeSingle(); // maybeSingle is safer than single and doesn't throw on empty

          if (dbError) {
            throw dbError;
          }

          targetPath = semData ? '/dashboard' : '/dashboard/onboarding';
        }
      } catch (error: any) {
        console.error('Error checking user status:', error?.message || error);
        targetPath = '/dashboard/onboarding';
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