import { NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { calendarAliasIds } from '@/lib/calendarDevBridge';
import { clinicDateKey } from '@/calendario/timezone';
import { createClerkClient } from '@clerk/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface WidgetOverview {
  // Today's appointments (owned OR invited, non-cancelled), sorted by start
  // time — consumed by the native Android home-launcher widget.
  date: string;
  userName: string;
  count: number;
  events: WidgetEvent[];
}

export interface WidgetEvent {
  id: number;
  title: string;
  patient_name: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  status: string;
}

export async function GET() {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const supabase = createServerServiceClient();
    const today = clinicDateKey();

    // Visible events = owned OR invited (mirrors the main /api/events read).
    const aliasIds = calendarAliasIds(userId);
    const { data: inviteeRows } = await supabase
      .from('event_invitees')
      .select('event_id')
      .in('user_id', aliasIds);
    const inviteeEventIds = (inviteeRows ?? [])
      .map((r) => Number(r.event_id))
      .filter((n) => Number.isFinite(n));

    let query = supabase
      .from('events')
      .select('*')
      .eq('date', today)
      .neq('status', 'cancelled')
      .in('user_id', aliasIds);

    if (inviteeEventIds.length > 0) {
      query = query.or(`id.in.(${inviteeEventIds.join(',')})`);
    }

    const { data: events, error: eventsError } = await query
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .limit(6);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 400 });
    }

    const preamble = (
      events ?? []
    ).map((e: any): WidgetEvent => ({
      id: Number(e.id),
      title: e.title || '',
      patient_name: e.patient_name || '',
      start_time: e.start_time ?? null,
      end_time: e.end_time ?? null,
      color: e.color ?? null,
      status: e.status || 'scheduled',
    }));

    let userName = '';
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const clerkUser = await clerk.users.getUser(userId);
      userName = clerkUser.firstName || clerkUser.lastName || '';
    } catch {
      // Name is cosmetic for the widget greeting; never fail the request on it.
    }

    const payload: WidgetOverview = {
      date: today,
      userName,
      count: preamble.length,
      events: preamble,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}