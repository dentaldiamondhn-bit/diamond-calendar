import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { isEventVisible } from '@/lib/calendarAccess';
import { clerkIdentityOf, getClerkUserIdentities } from '@/lib/clerkUsers';

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

    const participants: any[] = [];

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('user_id, title')
      .eq('id', id)
      .single();

    if (eventError || !eventData) {
      return NextResponse.json(participants);
    }

    const userIdsToFetch = new Set<string>();
    if (eventData.user_id) userIdsToFetch.add(eventData.user_id);

    const { data: invitees, error: inviteesError } = await supabase
      .from('event_invitees')
      .select('user_id, status')
      .eq('event_id', id)
      .in('status', ['pending', 'accepted']);

    if (!inviteesError && invitees && invitees.length > 0) {
      for (const invitee of invitees) {
        userIdsToFetch.add(invitee.user_id);
      }
    }

    const userMap = await getClerkUserIdentities(Array.from(userIdsToFetch));

    if (eventData.user_id) {
      const owner = clerkIdentityOf(userMap, eventData.user_id);
      participants.push({
        id: eventData.user_id,
        role: 'owner',
        first_name: owner.first_name,
        last_name: owner.last_name,
        email: owner.email,
        profileImageUrl: owner.profileImageUrl,
      });
    }

    if (!inviteesError && invitees && invitees.length > 0) {
      for (const invitee of invitees) {
        const invited = clerkIdentityOf(userMap, invitee.user_id);
        participants.push({
          id: invitee.user_id,
          role: invitee.status === 'accepted' ? 'invitee_accepted' : 'invitee_pending',
          first_name: invited.first_name,
          last_name: invited.last_name,
          email: invited.email,
          profileImageUrl: invited.profileImageUrl,
        });
      }
    }

    return NextResponse.json(participants);
  } catch (err: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[participants] error', err);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}