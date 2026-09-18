import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { calendarAliasIds } from '@/lib/calendarDevBridge';
import { clinicDateKey } from '@/calendario/timezone';
import { createClerkClient } from '@clerk/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Month-grid payload for the Android home-launcher widget (Google-Calendar
 * style). Weeks start on Monday (matching the in-app RBC config: `weekStartsOn: 1`).
 *
 * `?offset=N` picks the month relative to the current clinic month (0 = this
 * month, -1 = previous, +1 = next...). All dates are clinic-local `YYYY-MM-DD`.
 */

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface CellEvent {
  id: number;
  time: string;
  color: string;
  title: string;
}

interface Cell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  count: number;
  events: CellEvent[];
}

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y = 1970, m = 1, d = 1] = key.split('-').map((n) => Number(n));
  return { y, m, d };
}

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDaysKey(key: string, days: number): string {
  const { y, m, d } = parseKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

function weekdayOf(key: string): number {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
}

export async function GET(request: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const supabase = createServerServiceClient();
    const today = clinicDateKey();

    const rawOffset = Number(new URL(request.url).searchParams.get('offset') || '0');
    const offset = Number.isFinite(rawOffset) ? Math.max(-24, Math.min(24, Math.trunc(rawOffset))) : 0;

    const { y, m } = parseKey(today);
    const target = addMonths(y, m, offset);
    const firstKey = keyOf(target.y, target.m, 1);

    // Monday-start padding, then 6 fixed weeks (42 cells) so the grid height is stable.
    const leading = (weekdayOf(firstKey) - 1 + 7) % 7;
    const gridStart = addDaysKey(firstKey, -leading);
    const gridEnd = addDaysKey(gridStart, 41);

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
      .select('id,date,start_time,color,title,patient_name,status')
      .gte('date', gridStart)
      .lte('date', gridEnd)
      .neq('status', 'cancelled')
      .in('user_id', aliasIds);

    if (inviteeEventIds.length > 0) {
      query = query.or(`id.in.(${inviteeEventIds.join(',')})`);
    }

    const { data: rows, error: eventsError } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .limit(1000);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 400 });
    }

    const byDate = new Map<string, CellEvent[]>();
    for (const row of rows ?? []) {
      const date = String(row.date || '');
      if (!date) continue;
      const list = byDate.get(date) ?? [];
      list.push({
        id: Number(row.id),
        time: row.start_time || '',
        color: row.color || '#0d9488',
        title: row.title || row.patient_name || '',
      });
      byDate.set(date, list);
    }

    const weeks: Cell[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = addDaysKey(gridStart, w * 7 + d);
        const parsed = parseKey(date);
        const events = byDate.get(date) ?? [];
        week.push({
          date,
          day: parsed.d,
          inMonth: parsed.y === target.y && parsed.m === target.m,
          isToday: date === today,
          count: events.length,
          events: events.slice(0, 3),
        });
      }
      weeks.push(week);
    }

    let userName = '';
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const clerkUser = await clerk.users.getUser(userId);
      userName = clerkUser.firstName || clerkUser.lastName || '';
    } catch {
      // Cosmetic only.
    }

    return NextResponse.json({
      monthLabel: `${MONTHS_ES[target.m - 1]} ${target.y}`,
      monthKey: keyOf(target.y, target.m, 1).slice(0, 7),
      today,
      offset,
      userName,
      weeks,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}