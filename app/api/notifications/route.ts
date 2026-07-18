import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export const revalidate = 0;

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json([]);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json([], { status: 500 });
    }

    const mapped = (data || []).map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      timestamp: n.created_at,
      read: n.read,
      metadata: n.data,
      userId: n.user_id,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const supabase = await createClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: body.type || 'system',
        title: body.title,
        message: body.message,
        data: body.metadata || {},
        read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      type: data.type,
      title: data.title,
      message: data.message,
      timestamp: data.created_at,
      read: data.read,
      metadata: data.data,
      userId: data.user_id,
    });
  } catch (error) {
    console.error('Error adding notification:', error);
    return NextResponse.json({ error: 'Failed to add notification' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const supabase = await createClient();
    const { notificationId, action } = await request.json();

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    if (action === 'markAsRead') {
      if (!notificationId) {
        return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
      }
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);
      if (error) throw error;
    } else if (action === 'markAllAsRead') {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (error) throw error;
    } else if (action === 'remove') {
      if (!notificationId) {
        return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
      }
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId);
      if (error) throw error;
    } else if (action === 'clearAll') {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
