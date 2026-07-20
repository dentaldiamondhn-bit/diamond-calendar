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
        console.warn('PushNotifications plugin not available');
        return false;
      }

      // Setup listeners
      this.pushNotifications.addListener('registration', (token: any) => {
        console.log('FCM registration:', token.value);
        this.sendTokenToBackend(token.value);
      });

      this.pushNotifications.addListener('registrationError', (err: any) => {
        console.error('FCM registration error:', err);
      });

      this.pushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        console.log('Push received:', notification);
        this.showLocalNotification(notification);
      });

      this.pushNotifications.addListener('pushNotificationActionPerformed', (notification: any) => {
        console.log('Push action:', notification);
      });

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

  async requestPermissions(): Promise<{ granted: boolean }> {
    if (this.isCapacitor) {
      try {
        // Request both local and push permissions
        const [localPerm, pushPerm] = await Promise.all([
          this.localNotifications?.requestPermissions?.() ?? { receive: 'granted' },
          this.pushNotifications?.requestPermissions?.() ?? { receive: 'granted' }
        ]);
        
        const granted = localPerm.receive === 'granted' && pushPerm.receive === 'granted';
        return { granted };
      } catch (error) {
        console.error('Capacitor permission error:', error);
        return { granted: false };
      }
    } else {
      // Web permissions
      try {
        const permission = await Notification.requestPermission();
        return { granted: permission === 'granted' };
      } catch {
        return { granted: false };
      }
    }
  }

  async registerForPush(): Promise<string | null> {
    if (this.isCapacitor) {
      return await this.registerCapacitor();
    }
    return await this.registerWeb();
  }

  private async registerCapacitor(): Promise<string | null> {
    if (!this.pushNotifications) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('FCM registration timeout');
        resolve(null);
      }, 20000);

      const regHandler = this.pushNotifications.addListener('registration', (token: any) => {
        clearTimeout(timeout);
        regHandler.remove();
        errHandler.remove();
        resolve(token.value);
      });

      const errHandler = this.pushNotifications.addListener('registrationError', (err: any) => {
        clearTimeout(timeout);
        regHandler.remove();
        errHandler.remove();
        console.error('FCM error:', err);
        resolve(null);
      });

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
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
    });
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