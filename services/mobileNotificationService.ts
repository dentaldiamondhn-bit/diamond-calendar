'use client';

import React, { useEffect, useRef, useState } from 'react';

// Extend the global NotificationOptions to include actions and timestamp
declare global {
  interface NotificationOptions {
    actions?: NotificationAction[];
    timestamp?: number;
  }
}

export interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  actions?: NotificationAction[];
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

class MobileNotificationService {
  private static instance: MobileNotificationService;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;
  private listeners: Set<(notification: PushNotification) => void> = new Set();

  private constructor() {}

  static getInstance(): MobileNotificationService {
    if (!MobileNotificationService.instance) {
      MobileNotificationService.instance = new MobileNotificationService();
    }
    return MobileNotificationService.instance;
  }

  // Initialize the service
  async initialize(): Promise<boolean> {
    try {
      // Register service worker with better error handling
      if ('serviceWorker' in navigator) {
        try {
          // Try to get ready service worker first
          this.swRegistration = await navigator.serviceWorker.ready;
          console.log('✅ Service Worker ready for notifications');
        } catch (error) {
          console.warn('⚠️ Service Worker not ready, trying manual registration:', error);
          
          // Fallback: try to register manually
          try {
            this.swRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker manually registered');
          } catch (regError) {
            console.warn('⚠️ Manual service worker registration failed:', regError);
            this.swRegistration = null;
          }
        }
      } else {
        console.warn('⚠️ Service Worker not supported in this browser');
        this.swRegistration = null;
      }

      // Get existing subscription
      if (this.swRegistration) {
        try {
          this.subscription = await this.swRegistration.pushManager.getSubscription();
        } catch (subError) {
          console.warn('⚠️ Failed to get push subscription:', subError);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize push notifications:', error);
      return false;
    }
  }

  // Request notification permission
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('❌ This browser does not support notifications');
      return { granted: false, denied: true, default: false };
    }

    const permission = await Notification.requestPermission();
    
    return {
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    };
  }

  // Get current permission status
  getPermission(): NotificationPermission {
    if (!('Notification' in window)) {
      return { granted: false, denied: true, default: false };
    }

    const permission = Notification.permission;
    
    return {
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    };
  }

  // Show local notification (not push)
  async showLocalNotification(notification: PushNotification): Promise<void> {
    const permission = this.getPermission();
    
    if (!permission.granted) {
      console.warn('❌ Notification permission not granted');
      throw new Error('Notification permission not granted');
    }

    const options: NotificationOptions = {
      body: notification.body,
      icon: notification.icon || '/Logo.svg',
      badge: notification.badge || '/Logo.svg',
      tag: notification.tag,
      data: notification.data,
      requireInteraction: notification.requireInteraction || false,
      silent: notification.silent || false,
      timestamp: notification.timestamp || Date.now()
    };

    if (notification.actions && notification.actions.length > 0) {
      options.actions = notification.actions;
    }

    // Ensure service worker is ready
    if (!this.swRegistration && 'serviceWorker' in navigator) {
      try {
        console.log('🔄 Waiting for service worker registration...');
        this.swRegistration = await navigator.serviceWorker.ready;
        console.log('✅ Service Worker is ready');
      } catch (error) {
        console.warn('⚠️ Service Worker not ready:', error);
      }
    }

    // Try service worker first (works in both mobile and desktop modes)
    if (this.swRegistration) {
      try {
        await this.swRegistration.showNotification(notification.title, options);
        console.log('✅ Notification shown via Service Worker');
        return;
      } catch (error) {
        console.warn('⚠️ Service Worker notification failed, trying Notification API:', error);
      }
    }

    // Try direct Notification API (works in both mobile and desktop modes)
    if ('Notification' in window) {
      try {
        const notificationInstance = new Notification(notification.title, options);

        // Handle notification click
        notificationInstance.onclick = (event) => {
          event.preventDefault();
          
          // Focus window if it's open
          if (window.focus) {
            window.focus();
          }

          // Handle notification click based on data
          if (notification.data?.url) {
            window.location.href = notification.data.url;
          }

          // Close notification
          notificationInstance.close();
        };

        // Auto-close after 5 seconds if not required interaction
        if (!notification.requireInteraction) {
          setTimeout(() => {
            notificationInstance.close();
          }, 5000);
        }
        
        console.log('✅ Notification shown via Notification API');
        return;
      } catch (error) {
        console.error('❌ Notification API failed:', error);
      }
    }

    // If all methods fail, show a console notification
    console.warn('⚠️ All notification methods failed, showing console notification');
    console.log('📱 Notification:', notification.title, '-', notification.body);
    
    // Show a simple alert as last resort
    alert(`${notification.title}\n\n${notification.body}`);

    throw new Error('No notification method available');
  }

  // Check if running on mobile browser
  private isMobileBrowser(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  }

  // Check if push is supported
  isPushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }
}

// React Hook for using push notifications
export const useMobileNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>({
    granted: false,
    denied: false,
    default: true
  });
  const [isSupported, setIsSupported] = useState(false);
  const serviceRef = useRef(MobileNotificationService.getInstance());

  useEffect(() => {
    const service = serviceRef.current;
    
    // Check if push is supported
    setIsSupported(service.isPushSupported());
    
    // Get current permission
    setPermission(service.getPermission());
    
    // Initialize service
    service.initialize();
  }, []);

  const requestPermission = async (): Promise<NotificationPermission> => {
    const service = serviceRef.current;
    const result = await service.requestPermission();
    setPermission(result);
    return result;
  };

  const showNotification = (notification: PushNotification): void => {
    const service = serviceRef.current;
    service.showLocalNotification(notification);
  };

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification
  };
};

export default MobileNotificationService;
