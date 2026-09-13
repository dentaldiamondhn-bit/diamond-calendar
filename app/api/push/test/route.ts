import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sendTestNotification } from '@/lib/push/pushService';

export const dynamic = 'force-dynamic';

/** "Send test notification" — pushes to every subscription of the caller. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const title = body?.title || '🔔 Diamond Link';
    const message = body?.body || 'Test de notificación push: si ves esto, todo funciona.';
    const result = await sendTestNotification(userId, title, message);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[push] test error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}