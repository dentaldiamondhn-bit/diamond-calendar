import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    return NextResponse.json({ id: data.id, success: true });
  } catch (error) {
    console.error('Error sending notification to user:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
