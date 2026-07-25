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

  async requestPermissions(): Promise<{ granted: boolean; platform: string }> {
    if (this.isNative()) {
      try {
        const localPermission = await LocalNotifications.requestPermissions();
        const pushPermission = await PushNotifications.requestPermissions();

        return {
          granted: localPermission.receive === 'granted' && pushPermission.receive === 'granted',
          platform: 'capacitor'
        };
      } catch {
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

  async scheduleAppointmentReminder(appointment: AppointmentNotification): Promise<boolean> {
    try {
      if (this.isNative()) {
        await LocalNotifications.schedule({
          notifications: [{
            id: parseInt(appointment.id),
            title: appointment.title,
            body: appointment.body,
            schedule: { at: appointment.scheduledDate },
            sound: 'default',
            smallIcon: 'notification_icon',
            largeIcon: 'notification_icon_large',
            iconColor: '#14b8a6',
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

  private fcmTokenPromise: Promise<string> | null = null;
  private fcmTokenResolve: ((token: string) => void) | null = null;

  async registerForPushNotifications(): Promise<string | null> {
    try {
      if (this.isNative()) {
        if (!this.fcmTokenPromise) {
          this.fcmTokenPromise = new Promise((resolve) => {
            this.fcmTokenResolve = resolve;
          });
        }

        PushNotifications.addListener('registration', (token) => {
          if (this.fcmTokenResolve) {
            this.fcmTokenResolve(token.value);
            this.fcmTokenResolve = null;
          }
          this.sendPushTokenToBackend(token.value);
        });

        PushNotifications.addListener('registrationError', () => {
          if (this.fcmTokenResolve) {
            this.fcmTokenResolve('');
            this.fcmTokenResolve = null;
          }
        });

        PushNotifications.register();

        const token = await Promise.race([
          this.fcmTokenPromise,
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
        ]);

        return token || null;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  async setupPushNotificationHandlers(): Promise<void> {
    if (!this.isNative()) return;

    try {
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        LocalNotifications.schedule({
          notifications: [{
            id: Date.now(),
            title: notification.title || 'Diamond Calendar',
            body: notification.body || 'Tiene una nueva notificación',
            sound: 'default',
            smallIcon: 'notification_icon',
            largeIcon: 'notification_icon_large',
            iconColor: '#14b8a6',
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
        await LocalNotifications.cancel({
          notifications: [{ id: parseInt(notificationId) }]
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
      await this.webService.initialize();

      if (this.isNative()) {
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
