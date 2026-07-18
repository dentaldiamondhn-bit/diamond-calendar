'use client';

import { useUser } from '@clerk/nextjs';
import { Calendar } from '../../../components/calendar/Calendar';
import { useEffect, useState } from 'react';

export default function CalendarPage() {
  const { user, isLoaded } = useUser();
  const [userRole, setUserRole] = useState<string>('staff');

  useEffect(() => {
    if (isLoaded && user) {
      const role = user.publicMetadata?.role as string || 'staff';
      setUserRole(role);
    }
  }, [user, isLoaded]);

  if (!isLoaded) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-red-600 text-center p-4">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-lg font-semibold">No autorizado</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Por favor inicia sesión para acceder</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] p-4 bg-gray-50 dark:bg-gray-900">
      <Calendar userId={user.id} userRole={userRole} />
    </div>
  );
}
