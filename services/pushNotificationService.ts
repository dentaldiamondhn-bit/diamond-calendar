'use client';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export class PushNotificationService {
  private static instance: PushNotificationService;

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  }

  get isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  async initialize(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await this.saveSubscription({
          endpoint: sub.endpoint,
          keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  async subscribe(): Promise<boolean> {
    if (!this.isSupported) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.warn('VAPID public key not configured');
        return false;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidKey),
      });

      const subJSON = sub.toJSON();
      const saved = await this.saveSubscription({
        endpoint: sub.endpoint,
        keys: {
          p256dh: subJSON.keys?.p256dh || '',
          auth: subJSON.keys?.auth || '',
        },
      });
      if (!saved) return false;

      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      return false;
    }
  }

  async unsubscribe(): Promise<boolean> {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      return false;
    }
  }

  private async saveSubscription(sub: PushSubscriptionData): Promise<boolean> {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async showTestNotification(): Promise<void> {
    if (!this.isSupported || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Diamond Link - Test', {
        body: 'Notificación de prueba',
        icon: '/Logo.svg',
        badge: '/Logo.svg',
        tag: 'test',
        requireInteraction: true,
      });
    } catch (error) {
      console.error('Error showing test notification:', error);
    }
  }
}

export default PushNotificationService.getInstance();
