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
      // Create notification channel for background push delivery
      PushNotifications.createChannel({
        id: 'default',
        name: 'Notifications',
        description: 'App notifications',
        importance: 4,
        visibility: 1,
        sound: 'default',
      }).catch(() => {});

      service.setupPushNotificationHandlers();
    }
  }, []);

  return <>{children}</>;
}
