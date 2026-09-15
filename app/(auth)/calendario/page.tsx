'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ToastProvider } from '@/components/calendar-new/Toast';
import { PushStatusBadge } from '@/components/calendar-new/PushStatusBadge';
import { NativePushListener } from '@/components/calendar-new/NativePushListener';
import { QueryProvider } from '@/contexts/QueryProvider';

const CalendarNew = dynamic(() => import('@/calendario/CalendarShell'), { ssr: false });

export default function CalendarPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isLoaded && !user) {
      router.replace('/sign-in');
    }
  }, [mounted, isLoaded, user, router]);

  const ready = mounted && isLoaded;

  if (!ready) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    // Unauthenticated: the effect above is redirecting to /sign-in. Render the
    // loader instead of an error screen so signed-out PWA users never see a
    // stale "/calendario no autorizado" page.
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <a href="/sign-in" className="sr-only">Iniciar sesión</a>
      </div>
    );
  }

  return (
    <QueryProvider>
      <ToastProvider>
        <CalendarNew userId={user.id} />
        <PushStatusBadge />
        <NativePushListener />
      </ToastProvider>
    </QueryProvider>
  );
}