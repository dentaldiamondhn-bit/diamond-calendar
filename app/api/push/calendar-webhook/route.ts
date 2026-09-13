import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { deliverCalendarToUser } from '@/services/calendarNotifications';
import { formatClock12 } from '@/calendario/timezone';

export const dynamic = 'force-dynamic';

/**
 * Calendario Phase 5 — push target for the pg_net triggers on `events` and
 * `event_invitees` (see database/migrations/20260910a_calendario_push_webhook.sql).
 *
 * Unlike chat (where the sender is in the record), the calendar "actor" is the
 * event owner (`events.user_id`): the owner is never pushed — only invitees are.
 * That is exactly the flow that makes the server-side conflict demo observable:
 * when A force-books B's (dentist) slot, the invitee B receives "Nueva cita…"
 * the moment A saves.
 *
 * Protected by the shared PUSH_WEBHOOK_SECRET (origin is the database itself),
 * same gate as /api/push/webhook.
 */

const MAX_BODY_LENGTH = 120;

function fmtDate(date: string): string {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date || '').trim());
  if (!p) return date || '';
  try {
    return new Date(Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]))).toLocaleDateString(
      'es-HN',
      { weekday: 'short', day: 'numeric', month: 'short' }
    );
  } catch {
    return date || '';
  }
}

const clip = (s: string): string => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_BODY_LENGTH ? t.slice(0, MAX_BODY_LENGTH) + '…' : t;
};

interface EventRow {
  id: number;
  user_id: string;
  title: string | null;
  patient_name: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  dentist: string | null;
  status: string | null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: 'not-configured' }, { status: 503 });

  const provided = request.headers.get('x-webhook-secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const table = payload?.table;
  const record = payload?.record || payload?.new;
  if (!record || (table !== 'events' && table !== 'event_invitees')) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const db = createServiceClient();

  // ------------------------------------------------------------ events branch
  if (table === 'events') {
    const id = Number(record.id);
    if (!Number.isFinite(id)) return NextResponse.json({ ok: true, skipped: true });

    // A brand-new event is covered row-by-row by the `event_invitees` insert
    // branch below ("Invitación a cita" per invitee). Notifying invitees here
    // TOO would duplicate the same bell/push for every invitee of a new cita,
    // so INSERTs are quiet. UPDATEs (moved/rescheduled/cancelled) still fan out.
    if (payload.type !== 'UPDATE') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (record.status === 'completed') {
      // Completed slota are quiet — nothing actionable for invitees.
      return NextResponse.json({ ok: true, skipped: true });
    }

    const [{ data: event }, { data: inviteeRows }] = await Promise.all([
      db
        .from('events')
        .select('id, user_id, title, patient_name, date, start_time, end_time, dentist, status')
        .eq('id', id)
        .maybeSingle<EventRow>(),
      db.from('event_invitees').select('user_id').eq('event_id', id),
    ]);
    if (!event) return NextResponse.json({ ok: true, skipped: true });

    const ownerId = event.user_id;
    const recipients = (inviteeRows || [])
      .map((r) => r.user_id)
      .filter((uid) => uid && uid !== ownerId);

    if (recipients.length === 0) return NextResponse.json({ ok: true, recipients: 0 });

    const dateLabel = fmtDate(event.date);
    const who = clip(event.patient_name || event.title || 'Cita');
    const window = `${event.start_time ? formatClock12(event.start_time) : '--:--'}–${
      event.end_time ? formatClock12(event.end_time) : '--:--'
    }`;
    const dentistSuffix = (event.dentist || '').trim() ? ` · ${event.dentist}` : '';

    const cancelled = event.status === 'cancelled';
    const title = cancelled
      ? 'Cita cancelada'
      : payload.type === 'UPDATE'
        ? 'Cita actualizada'
        : 'Nueva cita';
    const body = cancelled
      ? `${who} · ${dateLabel}${dentistSuffix}`
      : `${who} · ${dateLabel} ${window}${dentistSuffix}`;

    const data: Record<string, unknown> = {
      type: 'calendar',
      source: 'events',
      eventId: id,
      date: event.date,
      startTime: event.start_time,
      patientName: event.patient_name || '',
      dentist: event.dentist || '',
      url: `/calendario?view=day&date=${encodeURIComponent(event.date)}&eventId=${id}`,
    };

    const summary = await Promise.all(
      recipients.map((userId) =>
        deliverCalendarToUser(
          db,
          userId,
          {
            title,
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `calendar-${id}`,
            renotify: true,
            data,
            actions: [{ action: 'open', title: 'Abrir cita' }],
          },
          { type: 'calendar_event', title, message: body, metadata: data }
        )
      )
    );

    const totals = summary.reduce(
      (acc, r) => ({
        sent: acc.sent + r.sent,
        removed: acc.removed + r.removed,
        failed: acc.failed + r.failed,
      }),
      { sent: 0, removed: 0, failed: 0 }
    );
    return NextResponse.json({ ok: true, recipients: recipients.length, ...totals });
  }

  // -------------------------------------------------- event_invitees branch
  // INSERT is "you were invited". UPDATE/DELETE (invite changed or revoked)
  // must NOT send a fresh "Invitación a cita".
  if (payload.type !== 'INSERT') {
    return NextResponse.json({ ok: true, skipped: true });
  }
  const eventId = Number(record.event_id);
  const inviteeId = String(record.user_id || '');
  if (!Number.isFinite(eventId) || !inviteeId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { data: event } = await db
    .from('events')
    .select('id, user_id, title, patient_name, date, start_time, end_time, dentist, status')
    .eq('id', eventId)
    .maybeSingle<EventRow>();
  if (!event || event.status === 'cancelled' || event.status === 'completed') {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (inviteeId === event.user_id) {
    // Self-invite (owner also in invitee list) — nothing to notify.
    return NextResponse.json({ ok: true, recipients: 0 });
  }

  const dateLabel = fmtDate(event.date);
  const who = clip(event.patient_name || event.title || 'Cita');
  const window = `${event.start_time ? formatClock12(event.start_time) : '--:--'}–${
    event.end_time ? formatClock12(event.end_time) : '--:--'
  }`;
  const dentistSuffix = (event.dentist || '').trim() ? ` · ${event.dentist}` : '';

  const inviteeData: Record<string, unknown> = {
    type: 'calendar',
    source: 'event_invitees',
    eventId,
    date: event.date,
    startTime: event.start_time,
    patientName: event.patient_name || '',
    dentist: event.dentist || '',
    url: `/calendario?view=day&date=${encodeURIComponent(event.date)}&eventId=${eventId}`,
  };
  const inviteBody = `${who} · ${dateLabel} ${window}${dentistSuffix}`;

  const result = await deliverCalendarToUser(
    db,
    inviteeId,
    {
      title: 'Invitación a cita',
      body: inviteBody,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `calendar-${eventId}`,
      renotify: true,
      data: inviteeData,
      actions: [{ action: 'open', title: 'Abrir cita' }],
    },
    { type: 'calendar_event', title: 'Invitación a cita', message: inviteBody, metadata: inviteeData }
  );

  return NextResponse.json({ ok: true, recipients: 1, ...result });
}