import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import webpush from 'web-push';
import { sendFCMNotification } from '@/lib/firebaseAdmin';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@diamondlink.app';
const vapidConfigured = !!(vapidPublicKey && vapidPrivateKey);

if (vapidConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('Push disabled. Set VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY in env.');
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { userId, notification } = await request.json();

    if (!userId || !notification) {
      return NextResponse.json({ error: 'userId and notification are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: notification.type || 'system',
        title: notification.title,
        message: notification.message,
        data: notification.metadata || {},
        read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing notification:', error);
      return NextResponse.json({ error: 'Failed to store notification' }, { status: 500 });
    }

    await sendPushToUser(supabase, userId, {
      title: notification.title || 'Diamond Calendar',
      message: notification.message || '',
      type: notification.type || 'general',
      metadata: notification.metadata,
    });

    return NextResponse.json({ id: data.id, success: true });
  } catch (error) {
    console.error('Error sending notification to user:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}

async function sendPushToUser(supabase: any, userId: string, data: any) {
  let subs: any[];
  try {
    const result = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, platform, fcm_token')
      .eq('user_id', userId);
    subs = result.data || [];
  } catch (dbErr) {
    console.error('Failed to query push_subscriptions:', dbErr);
    return;
  }

  if (subs.length === 0) {
    console.log(`No push subscriptions for user ${userId}`);
    return;
  }

  for (const sub of subs) {
    if (sub.platform === 'capacitor' && sub.fcm_token) {
      const sent = await sendFCMNotification(sub.fcm_token, {
        title: data.title,
        body: data.message,
        data: data.metadata || {},
      });
      if (!sent) {
        try {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } catch {}
      }
      continue;
    }

    if (!vapidConfigured) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(data),
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        try {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } catch {}
      }
      console.error('Push send error for', sub.endpoint, err.message || err);
    }
  }
}
