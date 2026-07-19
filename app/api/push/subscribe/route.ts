import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const authResult = await auth();
    const userId = authResult?.userId;

    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys, platform, fcmToken } = body;

    // Handle Capacitor/FCM registration
    if (platform === 'capacitor') {
      if (!fcmToken) {
        return NextResponse.json({ error: 'fcmToken is required for capacitor platform' }, { status: 400 });
      }

      const supabase = await createClient();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: `fcm:${fcmToken}`,
          platform: 'capacitor',
          fcm_token: fcmToken,
          p256dh: '',
          auth: '',
        },
        { onConflict: 'user_id,endpoint' },
      );

      if (error) {
        console.error(`[${requestId}] Supabase upsert error:`, error);
        return NextResponse.json({ error: 'Failed to save FCM subscription' }, { status: 500 });
      }

      return NextResponse.json({ success: true, platform: 'capacitor' });
    }

    // Handle web push (VAPID) registration
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        platform: 'web',
        p256dh: keys.p256dh,
        auth: keys.auth,
        fcm_token: null,
      },
      { onConflict: 'user_id,endpoint' },
    );

    if (error) {
      console.error(`[${requestId}] Supabase upsert error:`, error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true, platform: 'web' });
  } catch (error) {
    console.error(`Error saving push subscription:`, error);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}
