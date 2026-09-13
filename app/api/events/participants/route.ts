import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { clerkIdentityOf, getClerkUserIdentities } from '@/lib/clerkUsers';

export const runtime = 'nodejs';

export interface Participant {
  id: string;
  role: 'owner' | 'invitee_accepted' | 'invitee_pending';
  first_name: string;
  last_name: string;
  email: string;
  profileImageUrl: string | null;
}

export type ParticipantMap = Record<string, Participant[]>;

/**
 * Batched participants for many events in one round-trip (Phase 2 — kills the
 * N+1 that the dashboard and UpcomingEvents run by calling
 * `/api/events/[id]/participants` once per event).
 *
 * Access control mirrors `isEventMember`: the caller only receives participants
 * for events they own or are invited to. The membership check is folded into
 * the batched queries below so no per-event sub-queries are needed.
 */
export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const { searchParams } = new URL(req.url);
  const rawIds = (searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map((s) => Number(s));

  if (rawIds.length === 0) {
    return NextResponse.json({} satisfies ParticipantMap);
  }

  try {
    const supabase = createServerServiceClient();
    const ids = [...new Set(rawIds)];

    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('id, user_id')
      .in('id', ids);

    if (eventError) throw eventError;

    const { data: invitees, error: inviteesError } = await supabase
      .from('event_invitees')
      .select('event_id, user_id, status')
      .in('event_id', ids)
      .in('status', ['pending', 'accepted']);

    if (inviteesError) throw inviteesError;

    // Allowed event ids: owned by the caller, or with the caller as invitee.
    const inviteesByEvent = new Map<number, Array<{ user_id: string; status: string }>>();
    for (const inv of invitees || []) {
      const list = inviteesByEvent.get(inv.event_id) || [];
      list.push(inv);
      inviteesByEvent.set(inv.event_id, list);
    }

    const eventMap = new Map((events || []).map((e) => [e.id, e]));
    const allowedEventIds = ids.filter((id) => {
      const owner = eventMap.get(id)?.user_id;
      if (owner && owner === userId) return true;
      const list = inviteesByEvent.get(id) || [];
      return list.some((i) => i.user_id === userId);
    });

    // Collect every distinct user id referenced by the allowed events.
    const userIdsToFetch = new Set<string>();
    for (const id of allowedEventIds) {
      const owner = eventMap.get(id)?.user_id;
      if (owner) userIdsToFetch.add(owner);
      for (const inv of inviteesByEvent.get(id) || []) userIdsToFetch.add(inv.user_id);
    }

    const userMap = await getClerkUserIdentities(Array.from(userIdsToFetch));

    const result: ParticipantMap = {};
    for (const id of allowedEventIds) {
      const participants: Participant[] = [];
      const owner = eventMap.get(id)?.user_id;
      if (owner) {
        const ownerIdentity = clerkIdentityOf(userMap, owner);
        participants.push({
          id: owner,
          role: 'owner',
          first_name: ownerIdentity.first_name,
          last_name: ownerIdentity.last_name,
          email: ownerIdentity.email,
          profileImageUrl: ownerIdentity.profileImageUrl,
        });
      }
      for (const inv of inviteesByEvent.get(id) || []) {
        const inviteeIdentity = clerkIdentityOf(userMap, inv.user_id);
        participants.push({
          id: inv.user_id,
          role: inv.status === 'accepted' ? 'invitee_accepted' : 'invitee_pending',
          first_name: inviteeIdentity.first_name,
          last_name: inviteeIdentity.last_name,
          email: inviteeIdentity.email,
          profileImageUrl: inviteeIdentity.profileImageUrl,
        });
      }
      result[String(id)] = participants;
    }

    return NextResponse.json(result satisfies ParticipantMap);
  } catch (err: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[events/participants batch] error', err);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}