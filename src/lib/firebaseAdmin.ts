import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';

function getApp() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
  }
  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

/** Result of a single native (FCM) delivery attempt. */
export type FcmSendResult = 'ok' | 'unregistered' | 'error';

/**
 * Send one native push via Firebase Cloud Messaging (the Capacitor APK's
 * device token path). All `data` values are stringified because FCM's data
 * payload requires strings.
 */
export async function sendFCMNotification(
  token: string,
  payload: {
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  },
): Promise<FcmSendResult> {
  try {
    const messaging = getMessaging(getApp());

    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [key, value] of Object.entries(payload.data)) {
        stringData[key] = value != null ? String(value) : '';
      }
    }

    const message: Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body ?? '',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'reminders',
          priority: 'high',
          visibility: 'private',
          sound: 'default',
          icon: 'notification_icon',
          color: '#14b8a6',
          tag: stringData.eventId || stringData.taskId || stringData.bellId || 'general',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
      data: Object.keys(stringData).length > 0 ? stringData : undefined,
    };

    await messaging.send(message);
    return 'ok';
  } catch (error: any) {
    const code = error?.errorInfo?.code ?? error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      return 'unregistered';
    }
    console.error('[fcm] send error:', error);
    return 'error';
  }
}

/** Fan out to many FCM tokens; returns the tokens that came back dead. */
export async function sendFCMNotificationToMultiple(
  tokens: string[],
  payload: {
    title: string;
    body?: string;
    data?: Record<string, string>;
  },
): Promise<{ success: string[]; failed: string[] }> {
  const results = await Promise.all(
    tokens.map((token) => sendFCMNotification(token, payload)),
  );

  const success: string[] = [];
  const failed: string[] = [];

  tokens.forEach((token, i) => {
    if (results[i] === 'ok') {
      success.push(token);
    } else {
      failed.push(token);
    }
  });

  return { success, failed };
}