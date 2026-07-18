import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@/lib/supabase/server';
import webpush from 'web-push';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@diamondlink.app';
const vapidConfigured = !!(vapidPublicKey && vapidPrivateKey);

if (vapidConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('Push disabled for /api/push/send — VAPID keys not configured');
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    if (!vapidConfigured) {
      return NextResponse.json({ error: 'Push not configured — set VAPID keys' }, { status: 500 });
    }

    const { subscription, data } = await request.json();
    if (!subscription || !data) {
      return NextResponse.json({ error: 'Subscription and data are required' }, { status: 400 });
    }

    const supabase = await createClient();
    let targets;

    if (subscription.endpoint) {
      targets = [subscription];
    } else if (data.targetUserId) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', data.targetUserId);
      targets = subs || [];
    }

    if (!targets || targets.length === 0) {
      return NextResponse.json({ error: 'No push targets' }, { status: 404 });
    }

    const payload = JSON.stringify(data);
    const results = [];

    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        results.push({ endpoint: sub.endpoint, status: 'sent' });
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          results.push({ endpoint: sub.endpoint, status: 'unsubscribed' });
        } else {
          results.push({ endpoint: sub.endpoint, status: 'error', message: err.message });
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error sending push notification:', error);
    return NextResponse.json({ error: 'Failed to send push notification' }, { status: 500 });
  }
}
