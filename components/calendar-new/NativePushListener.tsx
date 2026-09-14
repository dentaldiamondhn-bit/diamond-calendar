'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Capacitor APK-only notification bridge.
 *
 * The Android WebView cannot display FCM notification-payload messages while
 * the app is foregrounded, so we re-present them as a local notification, and
 * we route notification taps to the deep-link carried in the payload's `url`
 * (calendar events deliver `/calendario?view=day&date=…&eventId=…`). Renders
 * nothing outside the native app.
 */
export function NativePushListener(): null {
  useEffect(() => {
    let isNative = false;
    try {
      isNative = Capacitor.isNativePlatform?.() ?? false;
    } catch {
      isNative = false;
    }
    if (!isNative) return;

    let disposed = false;
    const incHandler: { remove: () => void } = { remove: () => {} };
    const actHandler: { remove: () => void } = { remove: () => {} };

    (async () => {
      try {
        await LocalNotifications.createChannel({
          id: 'reminders',
          name: 'Recordatorios',
          description: 'Notificaciones de recordatorios de citas',
          importance: 5,
          visibility: 1,
          sound: 'default',
        });
      } catch {
        /* channel may already exist */
      }

      try {
        const h1 = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            if (disposed) return;
            const data: Record<string, any> = (notification as any).data || {};
            let body = notification.body || 'Tiene una nueva notificación';

            const rawTime =
              data.eventTime || data.taskTime || data.itemTime;
            if (rawTime && !/\d{1,2}:\d{2}/.test(body)) {
              const date = new Date(rawTime);
              if (!isNaN(date.getTime())) {
                const h = date.getHours();
                const mm = String(date.getMinutes()).padStart(2, '0');
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 || 12;
                body += ` | ${h12}:${mm} ${ampm}`;
              }
            }

            const id = (Date.now() % 2147483646) + 1;
            LocalNotifications.schedule({
              notifications: [
                {
                  id,
                  title: notification.title || 'Diamond Calendar',
                  body,
                  sound: 'default',
                  smallIcon: 'notification_icon',
                  iconColor: '#14b8a6',
                  channelId: 'reminders',
                  extra: data,
                },
              ],
            }).catch(() => {});
          }
        );
        incHandler.remove = () => h1.remove();

        const h2 = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            if (disposed) return;
            const data: Record<string, any> =
              (action as any).notification?.data || {};
            const url = data.url;
            if (url && typeof url === 'string') {
              const href = url.startsWith('/') ? url : `/${url}`;
              window.location.href = href;
            }
          }
        );
        actHandler.remove = () => h2.remove();
      } catch {
        /* listeners setup failed */
      }
    })();

    return () => {
      disposed = true;
      try {
        incHandler.remove();
        actHandler.remove();
      } catch {
        /* best-effort */
      }
    };
  }, []);

  return null;
}