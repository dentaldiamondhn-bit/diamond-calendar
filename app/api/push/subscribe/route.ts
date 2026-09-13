import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServiceClient } from '@/lib/supabase';
import { sendTestNotification } from '@/lib/push/pushService';

export const dynamic = 'force-dynamic';

/**
 * Stores a browser's PushSubscription for the authenticated user and fires a
 * confirmation notification so the whole VAPID chain is proven end-to-end.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint;
    const keys = subscription?.keys || {};
    const p256dh = keys.p256dh;
    const authSecret = keys.auth;

    if (!endpoint || !p256dh || !authSecret) {
      return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 });
    }
    if (!endpoint.startsWith('https://')) {
      return NextResponse.json({ error: 'Endpoint must be https' }, { status: 400 });
    }

    const db = createServiceClient();
    const { error } = await db.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth_secret: authSecret,
        user_agent: typeof navigator === 'undefined' ? body?.userAgent?.slice(0, 512) : undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      console.error('[push] subscribe upsert failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Prove the delivery chain (VAPID → push service → SW tray) only when the
    // user just enabled notifications; silent re-upserts (visibility refresh)
    // must not spam the tray on every mount.
    let result = { sent: 0 };
    if (body?.confirm !== false) {
      result = await sendTestNotification(
        userId,
        '🔔 Diamond Link',
        'Notificaciones activadas. Recibirás los mensajes aquí.'
      );
    }

    return NextResponse.json({ ok: true, delivered: result.sent });
  } catch (error: any) {
    console.error('[push] subscribe error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}