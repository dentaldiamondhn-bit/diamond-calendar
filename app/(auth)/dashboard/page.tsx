'use client';

import { UserButton, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && user) {
      router.push('/calendario');
    }
  }, [isLoaded, user, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Diamond Calendar</h1>
        <p className="text-gray-500 mt-2">Redirigiendo al calendario...</p>
      </div>
    </div>
  );
}
