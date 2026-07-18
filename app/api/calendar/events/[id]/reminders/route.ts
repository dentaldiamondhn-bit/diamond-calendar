import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: reminders, error } = await supabase
      .from('calendar_reminders')
      .select('*')
      .eq('item_type', 'event')
      .or(`item_id.eq.${params.id},event_id.eq.${params.id}`) // Handle both schemas
      .order('minutes_before', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(reminders || []);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    // TODO: Re-enable authentication once auth issues are resolved
    // const { data: { user }, error: authError } = await supabase.auth.getUser();
    // 
    // if (authError || !user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const reminders = await request.json();

    const { data: createdReminders, error } = await supabase
      .from('calendar_reminders')
      .insert(reminders.map((r: any) => ({
        ...r,
        // Handle both old schema (event_id) and new schema (item_id)
        event_id: params.id, // For backward compatibility
        item_type: 'event',
        item_id: params.id, // For new multiple reminders system
        created_by: 'temp-user' // TODO: Replace with actual user.id when auth is fixed
      })))
      .select()
      .order('minutes_before', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(createdReminders);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    // TODO: Re-enable authentication once auth issues are resolved
    // const { data: { user }, error: authError } = await supabase.auth.getUser();
    // 
    // if (authError || !user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const { error } = await supabase
      .from('calendar_reminders')
      .delete()
      .eq('item_type', 'event')
      .or(`item_id.eq.${params.id},event_id.eq.${params.id}`) // Handle both schemas
      // .eq('created_by', user.id); // TODO: Re-enable when auth is fixed

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
