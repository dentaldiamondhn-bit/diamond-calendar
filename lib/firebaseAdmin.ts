import admin from 'firebase-admin';

function getServiceAccount(): admin.ServiceAccount {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
  }
  return JSON.parse(sa);
}

function getApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccount = getServiceAccount();

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function sendFCMNotification(
  token: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, any>;
  },
): Promise<boolean> {
  try {
    const app = getApp();

    // FCM data payload requires all values to be strings
    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [key, value] of Object.entries(payload.data)) {
        stringData[key] = value != null ? String(value) : '';
      }
    }

    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'reminders',
          priority: 'high',
          visibility: 1,
          sound: 'default',
          icon: 'notification_icon',
          color: '#14b8a6',
          tag: stringData.eventId || stringData.taskId || 'general',
          clickAction: 'FCM_PLUGIN_ACTIVITY',
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

    await app.messaging().send(message);
    return true;
  } catch (error: any) {
    if (error?.errorInfo?.code === 'messaging/registration-token-not-registered') {
      return false;
    }
    console.error('FCM send error:', error);
    return false;
  }
}

export async function sendFCMNotificationToMultiple(
  tokens: string[],
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  },
): Promise<{ success: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    tokens.map((token) => sendFCMNotification(token, payload)),
  );

  const success: string[] = [];
  const failed: string[] = [];

  tokens.forEach((token, i) => {
    if (results[i].status === 'fulfilled' && results[i].value) {
      success.push(token);
    } else {
      failed.push(token);
    }
  });

  return { success, failed };
}
