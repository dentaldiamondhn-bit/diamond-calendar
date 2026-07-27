'use client';

import React, { useEffect } from 'react';
import { useNotificationListener } from '@/hooks/useNotificationListener';
import { CapacitorNotificationService } from '@/services/capacitorNotificationService';
import { PushNotifications } from '@capacitor/push-notifications';

export function NotificationListenerWrapper({ children }: { children: React.ReactNode }) {
  useNotificationListener();

  useEffect(() => {
    const service = CapacitorNotificationService.getInstance();
    if (service.isNative()) {
      service.setupPushNotificationHandlers();
    }
  }, []);

  return <>{children}</>;
}
