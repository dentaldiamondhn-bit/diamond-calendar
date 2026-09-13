import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@/lib/push/pushService';
import type { PushNotificationPayload } from '@/lib/push/pushService';

/**
 * Phase 5 — one delivery helper for calendar notifications so the OS tray
 * (push) and the in-app bell (`notifications` table) always stay in sync.
 *
 * The bell is written service-role (drive-by) because these calls come from the
 * pg_net webhook and the Vercel cron tick — there is no live Clerk session.
 * The `BellNotificationProvider` realtime subscription picks the row up for the
 * target user via RLS + Postgres realtime.
 */

export interface BellPayload {
  /** Bell record type (`calendar_event` / `calendar_reminder`). */
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}

/** Write one in-app bell row (service-role; failures are logged, never fatal). */
export async function notifyBell(
  db: SupabaseClient,
  userId: string,
  bell: BellPayload
): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await db
    .from('notifications')
    .insert({
      user_id: userId,
      type: bell.type,
      title: bell.title,
      message: bell.message,
      data: bell.metadata || {},
      read: false,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[calendarNotifications] bell insert failed', error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Push + bell for one user (tray and bell stay in lockstep).
 *
 * The bell row is written FIRST so its id can ride inside the push payload's
 * `data.bellId`: when the user swipes that tray notification away (Android
 * `notificationclose`), the service worker can mark exactly that bell row read.
 */
export async function deliverCalendarToUser(
  db: SupabaseClient,
  userId: string,
  push: PushNotificationPayload,
  bell: BellPayload
): Promise<{ sent: number; failed: number; removed: number }> {
  const bellId = await notifyBell(db, userId, bell);
  const pushResult = await sendPushToUser(userId, {
    ...push,
    data: { ...(push.data || {}), bellId: bellId || undefined },
  });
  return pushResult;
}