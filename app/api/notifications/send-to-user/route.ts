import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';

/**
 * Server-side cross-user bell write for trusted internal flows (chat message
 * recipients, ticket assignees). Uses the service-role client because the
 * `notifications` INSERT policy is owner-only (20260913b) — a plain browser
 * client may only write rows for itself. The Clerk session gate still applies,
 * so unauthenticated callers are rejected.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { userId: targetUserId, notification } = await request.json();

    if (typeof targetUserId !== 'string' || !targetUserId || !notification) {
      return NextResponse.json({ error: 'userId and notification are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: targetUserId,
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

    return NextResponse.json({ id: data.id, success: true });
  } catch (error) {
    console.error('Error sending notification to user:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
