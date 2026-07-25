'use client';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface FCMTokenData {
  fcmToken: string;
  platform: 'capacitor';
}

type SubscriptionPayload = PushSubscriptionData | FCMTokenData;

export class UnifiedPushService {
  private static instance: UnifiedPushService;
  private isCapacitor = false;
  private pushNotifications: any = null;
  private localNotifications: any = null;

  static getInstance(): UnifiedPushService {
    if (!UnifiedPushService.instance) {
      UnifiedPushService.instance = new UnifiedPushService();
    }
    return UnifiedPushService.instance;
  }

  private async detectPlatform(): Promise<void> {
    if (typeof window !== 'undefined') {
      const cap = (window as any).Capacitor;
      this.isCapacitor = cap?.isNativePlatform?.() ?? false;
      
      if (this.isCapacitor) {
        const plugins = cap.Plugins;
        this.pushNotifications = plugins?.PushNotifications;
        this.localNotifications = plugins?.LocalNotifications;
      }
    }
  }

  isNative(): boolean {
    return this.isCapacitor;
  }

  async initialize(): Promise<boolean> {
    await this.detectPlatform();
    
    if (this.isCapacitor) {
      return await this.initializeCapacitor();
    }
    return await this.initializeWeb();
  }

  private async initializeCapacitor(): Promise<boolean> {
    try {
      if (!this.pushNotifications) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('Capacitor init failed:', error);
      return false;
    }
  }

  private async initializeWeb(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await this.saveWebSubscription(sub);
      }
      return true;
    } catch {
      return false;
    }
  }

  async requestPermissions(): Promise<{ granted: boolean; debug: string }> {
    if (this.isCapacitor) {
      try {
        // Request push permissions (only push is needed for FCM)
        const pushPerm = await this.pushNotifications?.requestPermissions?.() ?? { receive: 'granted' };
        // Also request local notifications permission (separate, but let's get it too)
        const localPerm = await this.localNotifications?.requestPermissions?.() ?? { receive: 'granted' };
        
        const pushStatus = pushPerm?.receive ?? 'undefined';
        const localStatus = localPerm?.receive ?? 'granted'; // default to granted if not available
        
        // Only push permission is required for FCM
        const granted = pushStatus === 'granted';
        const debug = `push=${pushStatus}, local=${localStatus}, granted=${granted}`;
        console.log('Permission results:', { pushPerm, localPerm, debug });
        return { granted, debug };
      } catch (error: any) {
        console.error('Capacitor permission error:', error);
        return { granted: false, debug: `error: ${error.message}` };
      }
    } else {
      // Web permissions
      try {
        const permission = await Notification.requestPermission();
        return { granted: permission === 'granted', debug: `web: ${permission}` };
      } catch (error: any) {
        return { granted: false, debug: `web error: ${error.message}` };
      }
    }
  }

  async registerForPush(): Promise<string | null> {
    if (this.isCapacitor) {
      const token = await this.registerCapacitor();
      if (token) {
        await this.sendTokenToBackend(token);
      }
      return token;
    }
    return await this.registerWeb();
  }

  private async registerCapacitor(): Promise<string | null> {
    if (!this.pushNotifications) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('FCM registration timeout after 20s');
        resolve(null);
      }, 20000);

      const regHandler = this.pushNotifications.addListener('registration', (token: any) => {
        console.log('FCM registration received:', token.value);
        clearTimeout(timeout);
        regHandler.remove();
        errHandler.remove();
        resolve(token.value);
      });

      const errHandler = this.pushNotifications.addListener('registrationError', (err: any) => {
        console.error('FCM registration error:', err);
        clearTimeout(timeout);
        regHandler.remove();
        errHandler.remove();
        resolve(null);
      });

      console.log('Calling pushNotifications.register()...');
      this.pushNotifications.register();
    });
  }

  private async registerWeb(): Promise<string | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return null;
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn('VAPID key not configured');
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(vapidKey),
        });
      }

      await this.saveWebSubscription(sub);
      return sub.endpoint;
    } catch (error) {
      console.error('Web push registration failed:', error);
      return null;
    }
  }

  private async saveWebSubscription(sub: PushSubscription): Promise<void> {
    const json = sub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh || '',
          auth: json.keys?.auth || '',
        },
      }),
    });
  }

  private async sendTokenToBackend(token: string): Promise<void> {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
      });
      if (!res.ok) {
        console.error('Failed to save FCM token:', res.status, await res.text());
      }
    } catch (e) {
      console.error('Failed to send FCM token to backend:', e);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  }

  private showLocalNotification(notification: any): void {
    if (this.localNotifications) {
      this.localNotifications.schedule({
        notifications: [{
          id: Date.now(),
          title: notification.title || 'Notificación',
          body: notification.body || '',
          sound: 'default',
          smallIcon: 'notification_icon',
          largeIcon: 'notification_icon_large',
          iconColor: '#14b8a6',
          extra: notification.data,
        }]
      });
    }
  }
}

export const pushService = UnifiedPushService.getInstance();
export default UnifiedPushService;