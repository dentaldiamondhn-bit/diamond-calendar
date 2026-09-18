import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { isEventOwner, isEventVisible } from '@/lib/calendarAccess';
import { findInviteeConflicts, inviteeConflictMessage } from '@/lib/dentistAvailability';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const { id } = await params;
    const supabase = createServerServiceClient();

    if (!(await isEventVisible(supabase, id, userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('event_invitees')
      .select('*')
      .eq('event_id', id)
      .order('invited_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const { id } = await params;
    const body = await req.json();
    const { user_id, status = 'pending' } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const supabase = createServerServiceClient();

    if (!(await isEventOwner(supabase, id, userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Inviting books the invitee in this slot too — refuse when the invitee
    // already owns an overlapping event there (the create/edit paths add
    // invitees separately from the event row, so this is the only gate that
    // sees the real invite).
    if (!body.force_conflict) {
      const { data: event } = await supabase
        .from('events')
        .select('id, date, start_time, end_time, status')
        .eq('id', id)
        .maybeSingle();
      const active =
        event && event.status !== 'cancelled' && event.status !== 'completed';
      if (active) {
        const inviteeConflicts = await findInviteeConflicts(
          supabase,
          [user_id],
          event.date,
          event.start_time,
          event.end_time,
          Number(id)
        );
        if (inviteeConflicts.length > 0) {
          return NextResponse.json(
            {
              error: inviteeConflictMessage(inviteeConflicts),
              code: 'INVITEE_CONFLICT',
              conflicts: inviteeConflicts,
            },
            { status: 409 }
          );
        }
      }
    }

    const { data, error } = await supabase
      .from('event_invitees')
      .insert({
        event_id: id,
        user_id,
        status,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'User is already invited' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const { id } = await params;
    const body = await req.json();
    const { user_id } = body;

    const supabase = createServerServiceClient();

    if (!(await isEventOwner(supabase, id, userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let query = supabase.from('event_invitees').delete().eq('event_id', id);
    if (user_id) query = query.eq('user_id', user_id);

    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}