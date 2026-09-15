import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase';
import { sendFCMNotification } from '@/lib/firebaseAdmin';
import { ensureVapidConfigured } from './vapid';

/**
 * Phase 5 — server-side web-push fan-out.
 *
 * Subscriptions live in `push_subscriptions` (user_id = Clerk id as TEXT).
 * Sending is drive-by service-role (bypasses RLS) because a webhook has no user
 * session; the per-user routes still enforce Clerk auth before calling here.
 */

/** Notification action button (as shown in the OS tray). */
export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface PushNotificationPayload {
  title: string;
  /** Plain text body (HTML is stripped by callers). */
  body?: string;
  icon?: string;
  badge?: string;
  /** Group collapsed notifications for the same chat (replaces, can renotify). */
  tag?: string;
  renotify?: boolean;
  data?: Record<string, unknown>;
  /** Buttons shown on the notification (see NotificationAction). */
  actions?: NotificationAction[];
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  user_agent?: string | null;
  last_success_at?: string | null;
  /** Capacitor/FCM native rows only ('capacitor'); web rows leave this 'web'. */
  platform?: string | null;
  /** FCM device token for native rows (Capacitor APK). */
  fcm_token?: string | null;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  removed: number;
}

const EMPTY_RESULT: PushSendResult = { sent: 0, failed: 0, removed: 0 };

function toWebPushSubscription(row: PushSubscriptionRow): webpush.PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth_secret },
  };
}

const isGone = (err: unknown): boolean => {
  const e = err as { statusCode?: number };
  return e?.statusCode === 404 || e?.statusCode === 410 || e?.statusCode === 403;
};

/**
 * Push a notification to every active subscription belonging to `userId`.
 * Dead endpoints (410/404/403) are pruned so later sends stay fast.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload
): Promise<PushSendResult> {
  const db = createServiceClient();
  const { data: rows, error } = await db
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (error || !rows || rows.length === 0) return EMPTY_RESULT;

  const typedRows = (rows as PushSubscriptionRow[]).filter(
    (r) => r.endpoint && r.id
  );
  const webRows = typedRows.filter((r) => r.platform !== 'capacitor');
  const nativeRows = typedRows.filter(
    (r) => r.platform === 'capacitor' && r.fcm_token
  );

  // Web-Push rows only go out when VAPID is configured; native FCM rows do not
  // require VAPID, so an FCM-only user still gets native deliveries even if the
  // VAPID keys/environment are missing.
  if (webRows.length > 0 && !ensureVapidConfigured()) {
    if (nativeRows.length === 0) return EMPTY_RESULT;
  }

  const body = JSON.stringify(payload);
  const result: PushSendResult = { ...EMPTY_RESULT };

  await Promise.all([
    ...webRows.map(async (row) => {
      try {
        // TTL keeps stale subscriptions from eating a quota push.
        // urgency:high makes Android show it even in Doze / battery saver.
        await webpush.sendNotification(toWebPushSubscription(row), body, {
          TTL: 86_400,
          urgency: 'high',
        });
        result.sent++;
        await db
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString() })
          .eq('id', row.id);
      } catch (err) {
        if (isGone(err)) {
          result.removed++;
          await db.from('push_subscriptions').delete().eq('id', row.id);
        } else {
          result.failed++;
          console.error('[push] send failed', row.endpoint, (err as Error)?.message);
        }
      }
    }),
    ...nativeRows.map(async (row) => {
      try {
        const outcome = await sendFCMNotification(row.fcm_token!, {
          title: payload.title,
          body: payload.body,
          data: payload.data,
        });
        if (outcome === 'ok') {
          result.sent++;
          await db
            .from('push_subscriptions')
            .update({ last_success_at: new Date().toISOString() })
            .eq('id', row.id);
        } else if (outcome === 'unregistered') {
          result.removed++;
          await db.from('push_subscriptions').delete().eq('id', row.id);
        } else {
          result.failed++;
          console.error('[push] fcm send failed', row.endpoint);
        }
      } catch (err) {
        result.failed++;
        console.error('[push] fcm send error', row.endpoint, (err as Error)?.message);
      }
    }),
  ]);

  return result;
}

/** Convenience wrapper for the "Send test notification" button. */
export async function sendTestNotification(
  userId: string,
  title: string,
  body?: string
): Promise<PushSendResult> {
  return sendPushToUser(userId, {
    title,
    body,
    icon: '/Calendar.svg',
    badge: '/Calendar.svg',
    tag: `test-${userId}`,
    data: { type: 'test', url: '/chat' },
  });
}