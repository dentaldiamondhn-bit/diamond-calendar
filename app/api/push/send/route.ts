import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sendPushToUser, type PushNotificationPayload } from '@/lib/push/pushService';

export const dynamic = 'force-dynamic';

/**
 * Client-side send fallback: a live chat tab calls this when a new message for
 * the current user arrives while the tab/document is hidden or the thread is in
 * another conversation, so the push service delivers it to the user's own
 * subscriptions (Android tray). The server-side webhook (pg_net trigger) covers
 * the case where no tab is running at all.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const payload: PushNotificationPayload = {
      title: body?.title || 'Diamond Link',
      body: body?.body || '',
      icon: body?.icon || '/icon-192.png',
      badge: body?.badge || '/icon-192.png',
      ...(body?.tag ? { tag: body.tag } : {}),
      ...(body?.renotify ? { renotify: body.renotify } : {}),
      ...(body?.actions && Array.isArray(body.actions) ? { actions: body.actions } : {}),
      ...(body?.data && typeof body.data === 'object' ? { data: body.data } : {}),
    };

    const result = await sendPushToUser(userId, payload);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[push] send error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}