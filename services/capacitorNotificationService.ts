'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import MobileNotificationService, { PushNotification } from './mobileNotificationService';

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

  // Check if running on native platform
  isNative(): boolean {
    try {
      return Capacitor.isNativePlatform();
    } catch (error) {
      console.warn('⚠️ Capacitor not available, assuming web platform:', error);
      return false;
    }
  }

  // Request notification permissions (Capacitor + Web fallback)
  async requestPermissions(): Promise<{ granted: boolean; platform: string }> {
    if (this.isNative()) {
      try {
        // Request local notification permissions
        const localPermission = await LocalNotifications.requestPermissions();
        
        // Request push notification permissions
        const pushPermission = await PushNotifications.requestPermissions();
        
        console.log('📱 Capacitor permissions:', { localPermission, pushPermission });
        
        return {
          granted: (localPermission as any).granted === 'granted' && (pushPermission as any).granted === 'granted',
          platform: 'capacitor'
        };
      } catch (error) {
        console.error('❌ Capacitor permission request failed:', error);
        // Fallback to web permissions
        const webPermission = await this.webService.requestPermission();
        return {
          granted: webPermission.granted,
          platform: 'web'
        };
      }
    } else {
      // Web permissions
      const webPermission = await this.webService.requestPermission();
      return {
        granted: webPermission.granted,
        platform: 'web'
      };
    }
  }

  // Schedule appointment reminder
  async scheduleAppointmentReminder(appointment: AppointmentNotification): Promise<boolean> {
    try {
      if (this.isNative()) {
        // Use Capacitor local notifications
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
        
        console.log('📱 Appointment reminder scheduled (Capacitor):', appointment);
        return true;
      } else {
        // Web fallback - schedule with browser notification
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
          
          console.log('🌐 Appointment reminder scheduled (Web):', appointment);
          return true;
        }
      }
    } catch (error) {
      console.error('❌ Failed to schedule appointment reminder:', error);
      return false;
    }
    
    return false;
  }

  // Register for push notifications (FCM token)
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
          console.log('📱 Push registration success:', token.value);
          if (this.fcmTokenResolve) {
            this.fcmTokenResolve(token.value);
            this.fcmTokenResolve = null;
          }
          this.sendPushTokenToBackend(token.value);
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('❌ Push registration error:', error);
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
        console.log('🌐 Push notifications not supported on web');
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to register for push notifications:', error);
      return null;
    }
  }

  // Handle incoming push notifications
  async setupPushNotificationHandlers(): Promise<void> {
    if (!this.isNative()) return;

    try {
      // Handle received push notifications
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('📱 Push notification received:', notification);
        
        // Show local notification
        this.webService.showLocalNotification({
          id: notification.id?.toString() || Date.now().toString(),
          title: notification.title || 'Diamond Link',
          body: notification.body || 'Tiene una nueva notificación',
          icon: '/Logo.svg',
          data: notification.data
        });
      });

      // Handle push notification clicks
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('📱 Push notification clicked:', notification);
        
        const data = notification.notification.data;
        if (data?.patientId) {
          this.openPatientRecord(data.patientId);
        } else if (data?.appointmentId) {
          this.openAppointment(data.appointmentId);
        }
      });

      console.log('✅ Push notification handlers setup complete');
    } catch (error) {
      console.error('❌ Failed to setup push notification handlers:', error);
    }
  }

  // Open patient record via deep link
  async openPatientRecord(patientId: string): Promise<void> {
    try {
      if (this.isNative()) {
        const deepLink = `diamondlink://patient/${patientId}`;
        await AppLauncher.openUrl({ url: deepLink });
        console.log('📱 Opened patient record (Capacitor):', patientId);
      } else {
        // Web navigation
        window.location.href = `/menu-navegacion?id=${patientId}`;
        console.log('🌐 Opened patient record (Web):', patientId);
      }
    } catch (error) {
      console.error('❌ Failed to open patient record:', error);
    }
  }

  // Open appointment via deep link
  async openAppointment(appointmentId: string): Promise<void> {
    try {
      if (this.isNative()) {
        const deepLink = `diamondlink://appointment/${appointmentId}`;
        await AppLauncher.openUrl({ url: deepLink });
        console.log('📱 Opened appointment (Capacitor):', appointmentId);
      } else {
        // Web navigation
        window.location.href = `/appointments?id=${appointmentId}`;
        console.log('🌐 Opened appointment (Web):', appointmentId);
      }
    } catch (error) {
      console.error('❌ Failed to open appointment:', error);
    }
  }

  // Cancel scheduled notification
  async cancelNotification(notificationId: string): Promise<boolean> {
    try {
      if (this.isNative()) {
        await LocalNotifications.cancel({
          notifications: [{ id: parseInt(notificationId) }]
        });
        console.log('📱 Notification cancelled (Capacitor):', notificationId);
        return true;
      } else {
        // Web notifications can't be cancelled once scheduled with setTimeout
        console.log('🌐 Web notification cancellation not supported');
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to cancel notification:', error);
      return false;
    }
  }

  // Get scheduled notifications
  async getScheduledNotifications(): Promise<any[]> {
    try {
      if (this.isNative()) {
        const pending = await LocalNotifications.getPending();
        console.log('📱 Scheduled notifications:', pending);
        return pending.notifications;
      } else {
        console.log('🌐 Web scheduled notifications not trackable');
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to get scheduled notifications:', error);
      return [];
    }
  }

  // Send FCM push token to backend
  private async sendPushTokenToBackend(token: string): Promise<void> {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
      });
      if (res.ok) {
        console.log('📤 FCM token saved to backend');
      } else {
        console.error('❌ Failed to save FCM token:', await res.text());
      }
    } catch (error) {
      console.error('❌ Failed to send push token to backend:', error);
    }
  }

  // Send immediate local notification
  async sendLocalNotification(notification: any): Promise<void> {
    await this.webService.showLocalNotification(notification);
  }

  // Initialize the complete service
  async initialize(): Promise<boolean> {
    try {
      console.log('🚀 Initializing Capacitor Notification Service...');
      
      // Initialize web service first
      await this.webService.initialize();
      
      // Setup push handlers only if native and Capacitor is available
      if (this.isNative() && typeof LocalNotifications !== 'undefined') {
        try {
          await this.setupPushNotificationHandlers();
        } catch (error) {
          console.warn('⚠️ Capacitor plugins not available, falling back to web:', error);
        }
      }
      
      console.log('✅ Capacitor Notification Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Capacitor Notification Service:', error);
      return false;
    }
  }
}

// React Hook for using Capacitor notifications
export const useCapacitorNotifications = () => {
  const [isNative, setIsNative] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const serviceRef = useRef(CapacitorNotificationService.getInstance());

  const requestPermissions = useCallback(async () => {
    const service = serviceRef.current;
    return await service.requestPermissions();
  }, []);

  const registerForPushNotifications = useCallback(async () => {
    const service = serviceRef.current;
    return await service.registerForPushNotifications();
  }, []);

  useEffect(() => {
    const service = serviceRef.current;
    
    // Check if native
    try {
      setIsNative(service.isNative());
    } catch (error) {
      console.warn('⚠️ Failed to detect native platform:', error);
      setIsNative(false);
    }
    
    // Initialize service with error handling
    service.initialize()
      .then(setIsInitialized)
      .catch((error) => {
        console.error('❌ Failed to initialize Capacitor service:', error);
        setIsInitialized(false);
      });
  }, []);

  return {
    isNative,
    isInitialized,
    requestPermissions,
    registerForPushNotifications,
  };
};

export default CapacitorNotificationService;
