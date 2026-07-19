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
    data?: Record<string, string>;
  },
): Promise<boolean> {
  try {
    const app = getApp();

    const message: admin.messaging.Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          priority: 'high',
          visibility: 1,
          sound: 'default',
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
      data: payload.data,
    };

    await app.messaging().send(message);
    return true;
  } catch (error: any) {
    if (error?.errorInfo?.code === 'messaging/registration-token-not-registered') {
      console.warn('FCM token not registered (unregistered device):', token);
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
