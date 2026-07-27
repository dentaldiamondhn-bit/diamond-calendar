'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import MobileNotificationService from './mobileNotificationService';

export interface AppointmentNotification {
  id: string;
  title: string;
  body: string;
  scheduledDate: Date;
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
}

export class CapacitorNotificationService {
  private static instance: CapacitorNotificationService;
  private webService: MobileNotificationService;

  private constructor() {
    this.webService = MobileNotificationService.getInstance();
  }

  static getInstance(): CapacitorNotificationService {
    if (!CapacitorNotificationService.instance) {
      CapacitorNotificationService.instance = new CapacitorNotificationService();
    }
    return CapacitorNotificationService.instance;
  }

  isNative(): boolean {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }

  /**
   * Generates a stable 31-bit positive integer from a string (e.g. UUID).
   * Necessary because Android notification IDs must be integers, and UUIDs are strings.
   * Also prevents overflow for Date.now() values.
   */
  private generateSafeId(input: string | number): number {
    const str = String(input);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Return positive 31-bit integer (max 2,147,483,647)
    return Math.abs(hash % 2147483647);
  }

  async requestPermissions(): Promise<{ granted: boolean; platform: string }> {
    if (this.isNative()) {
      try {
        console.log('[Notifications] Requesting permissions...');
        const localStatus = await LocalNotifications.checkPermissions();
        const pushStatus = await PushNotifications.checkPermissions();

        console.log('[Notifications] Current status:', { local: localStatus.receive, push: pushStatus.receive });

        let granted = pushStatus.receive === 'granted';

        if (pushStatus.receive !== 'granted') {
          const pushReq = await PushNotifications.requestPermissions();
          granted = pushReq.receive === 'granted';
        }

        if (localStatus.receive !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        return {
          granted,
          platform: 'capacitor'
        };
      } catch (e) {
        console.error('[Notifications] Permission request failed:', e);
        const webPermission = await this.webService.requestPermission();
        return {
          granted: webPermission.granted,
          platform: 'web'
        };
      }
    } else {
      const webPermission = await this.webService.requestPermission();
      return {
        granted: webPermission.granted,
        platform: 'web'
      };
    }
  }

  async createDefaultChannel(): Promise<void> {
    if (this.isNative()) {
      try {
        // Create the primary reminders channel
        await LocalNotifications.createChannel({
          id: 'reminders',
          name: 'Recordatorios',
          description: 'Notificaciones de recordatorios de citas',
          importance: 5,
          visibility: 1,
          sound: 'default'
        });

        // Also create a 'default' channel as a safety fallback for backend-sent notifications
        await LocalNotifications.createChannel({
          id: 'default',
          name: 'General',
          description: 'Notificaciones generales',
          importance: 3,
          visibility: 1,
          sound: 'default'
        });

        console.log('[Notifications] Channels created successfully');
      } catch (e) {
        console.error('Failed to create notification channels:', e);
      }
    }
  }

  async scheduleAppointmentReminder(appointment: AppointmentNotification): Promise<boolean> {
    try {
      if (this.isNative()) {
        const notificationId = this.generateSafeId(appointment.id);
        console.log(`[Notifications] Scheduling reminder ${appointment.id} with safe ID ${notificationId}`);

        await LocalNotifications.schedule({
          notifications: [{
            id: notificationId,
            title: appointment.title,
            body: appointment.body,
            schedule: { at: appointment.scheduledDate },
            sound: 'default',
            smallIcon: 'notification_icon',
            largeIcon: 'notification_icon_large',
            iconColor: '#14b8a6',
            channelId: 'reminders',
            extra: {
              patientId: appointment.patientId,
              doctorId: appointment.doctorId,
              appointmentId: appointment.appointmentId,
              type: 'appointment_reminder'
            }
          }]
        });
        return true;
      } else {
        const delay = appointment.scheduledDate.getTime() - Date.now();
        if (delay > 0) {
          setTimeout(() => {
            this.webService.showLocalNotification({
              id: appointment.id,
              title: appointment.title,
              body: appointment.body,
              icon: '/Logo.svg',
              tag: `appointment-${appointment.id}`,
              data: {
                patientId: appointment.patientId,
                appointmentId: appointment.appointmentId,
                url: appointment.patientId ? `/menu-navegacion?id=${appointment.patientId}` : undefined
              }
            });
          }, delay);
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  async registerForPushNotifications(): Promise<{ token: string | null; error?: string }> {
    try {
      if (!this.isNative()) return { token: null, error: 'not_native' };

      // Remove existing listeners to avoid duplicates
      try {
        await PushNotifications.removeAllListeners();
      } catch (e) {
        console.warn('[FCM] Error removing listeners:', e);
      }

      const result = await new Promise<{ token: string | null; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[FCM] Registration timeout after 30s');
          resolve({ token: null, error: 'timeout_30s' });
        }, 30000);

        PushNotifications.addListener('registration', (token) => {
          console.log('[FCM] Registration success:', token.value);
          clearTimeout(timeout);
          this.sendPushTokenToBackend(token.value);
          resolve({ token: token.value });
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('[FCM] Registration error:', JSON.stringify(err));
          clearTimeout(timeout);
          resolve({ token: null, error: JSON.stringify(err) });
        });

        console.log('[FCM] Calling PushNotifications.register()...');
        try {
          PushNotifications.register();
        } catch (e: any) {
          console.error('[FCM] register() threw:', e);
          clearTimeout(timeout);
          resolve({ token: null, error: `register_threw: ${e.message}` });
        }
      });

      return result;
    } catch (e: any) {
      console.error('[FCM] registerForPushNotifications failed:', e);
      return { token: null, error: e.message };
    }
  }

  async setupPushNotificationHandlers(): Promise<void> {
    if (!this.isNative()) return;

    try {
      // Re-setup listener safely
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        let body = notification.body || 'Tiene una nueva notificación';

        // Timezone correction for Honduras (UTC-6)
        // Only apply if body doesn't already contain a time string to avoid double formatting
        const hasTimeInBody = body.includes(' AM') || body.includes(' PM') || /\d{1,2}:\d{2}/.test(body);

        const rawTime = notification.data?.eventTime || notification.data?.taskTime || notification.data?.itemTime;
        if (rawTime && !hasTimeInBody) {
          const date = new Date(rawTime);
          if (!isNaN(date.getTime())) {
            const localDate = new Date(date.getTime() - (6 * 60 * 60 * 1000));
            const hours = localDate.getUTCHours();
            const minutes = String(localDate.getUTCMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const hours12 = hours % 12 || 12;
            body += ` | ${hours12}:${minutes} ${ampm}`;
          }
        }

        const safeId = this.generateSafeId(Date.now() + Math.random());
        console.log(`[Notifications] Local schedule for push with safe ID ${safeId}`);

        LocalNotifications.schedule({
          notifications: [{
            id: safeId,
            title: notification.title || 'Diamond Calendar',
            body: body,
            sound: 'default',
            smallIcon: 'notification_icon',
            largeIcon: 'notification_icon_large',
            iconColor: '#14b8a6',
            channelId: 'reminders',
            extra: notification.data || {}
          }]
        });
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const data = notification.notification.data;
        if (data?.patientId) {
          this.openPatientRecord(data.patientId);
        } else if (data?.appointmentId) {
          this.openAppointment(data.appointmentId);
        }
      });
    } catch {
      // handlers setup failed
    }
  }

  async openPatientRecord(patientId: string): Promise<void> {
    try {
      if (this.isNative()) {
        await AppLauncher.openUrl({ url: `diamondlink://patient/${patientId}` });
      } else {
        window.location.href = `/menu-navegacion?id=${patientId}`;
      }
    } catch {
      // open failed
    }
  }

  async openAppointment(appointmentId: string): Promise<void> {
    try {
      if (this.isNative()) {
        await AppLauncher.openUrl({ url: `diamondlink://appointment/${appointmentId}` });
      } else {
        window.location.href = `/appointments?id=${appointmentId}`;
      }
    } catch {
      // open failed
    }
  }

  async cancelNotification(notificationId: string): Promise<boolean> {
    try {
      if (this.isNative()) {
        const safeId = this.generateSafeId(notificationId);
        await LocalNotifications.cancel({
          notifications: [{ id: safeId }]
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getScheduledNotifications(): Promise<any[]> {
    try {
      if (this.isNative()) {
        const pending = await LocalNotifications.getPending();
        return pending.notifications;
      }
      return [];
    } catch {
      return [];
    }
  }

  private async sendPushTokenToBackend(token: string): Promise<void> {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
      });
      if (!res.ok) {
        console.error('Failed to save FCM token:', await res.text());
      }
    } catch (error) {
      console.error('Failed to send push token to backend:', error);
    }
  }

  async sendLocalNotification(notification: any): Promise<void> {
    await this.webService.showLocalNotification(notification);
  }

  async initialize(): Promise<boolean> {
    try {
      // Always initialize webService first, it handles native check internally now
      await this.webService.initialize();

      if (this.isNative()) {
        await this.createDefaultChannel();
        await this.requestPermissions();
        await this.setupPushNotificationHandlers();
        await this.registerForPushNotifications();
      }

      return true;
    } catch {
      return false;
    }
  }
}

export const useCapacitorNotifications = () => {
  const [isNative, setIsNative] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const serviceRef = useRef(CapacitorNotificationService.getInstance());

  const requestPermissions = useCallback(async () => {
    return await serviceRef.current.requestPermissions();
  }, []);

  const registerForPushNotifications = useCallback(async () => {
    return await serviceRef.current.registerForPushNotifications();
  }, []);

  useEffect(() => {
    const service = serviceRef.current;
    setIsNative(service.isNative());
    service.initialize().then(setIsInitialized).catch(() => setIsInitialized(false));
  }, []);

  return {
    isNative,
    isInitialized,
    requestPermissions,
    registerForPushNotifications,
  };
};

export default CapacitorNotificationService;
