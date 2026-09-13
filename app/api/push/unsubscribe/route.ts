import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Removes a subscription when the user toggles notifications off. */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const endpoint = body?.endpoint;
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

    const db = createServiceClient();
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', userId);

    if (error) {
      console.error('[push] unsubscribe failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[push] unsubscribe error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}