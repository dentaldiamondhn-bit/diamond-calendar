'use client';

import React from 'react';
import { useNotificationListener } from '@/hooks/useNotificationListener';

export function NotificationListenerWrapper({ children }: { children: React.ReactNode }) {
  // Enable notification listener for all authenticated users
  useNotificationListener();
  
  return <>{children}</>;
}
