import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { calendarAliasIds } from '@/lib/calendarDevBridge';
import { CLINIC_TIME_ZONE, clinicWallClockTimestamp } from '@/calendario/timezone';
import {
  findDentistConflicts,
  dentistConflictMessage,
  findInviteeConflicts,
  inviteeConflictMessage,
} from '@/lib/dentistAvailability';
import type { DentistConflict } from '@/lib/dentistAvailability';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strip stray `:ss` (browser time inputs / legacy rows) → `HH:MM`, else blank. */
function normalizeStoredTime(t?: string | null): string {
  const [h = '', m = ''] = (t ?? '').split(':');
  const hh = h.trim().padStart(2, '0');
  const mm = m.slice(0, 2) || '00';
  const valid = /^\d{2}$/.test(hh) && Number(hh) <= 23 && /^\d{2}$/.test(mm) && Number(mm) <= 59;
  return valid ? `${hh}:${mm}` : '';
}

export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if (dateFrom && !DATE_RE.test(dateFrom)) {
    return NextResponse.json({ error: 'date_from must be YYYY-MM-DD' }, { status: 400 });
  }
  if (dateTo && !DATE_RE.test(dateTo)) {
    return NextResponse.json({ error: 'date_to must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const supabase = createServerServiceClient();
    // Visible events = owned OR invited (matches the `events` RLS predicate and the
    // realtime `event_invitees` binding, so invitee calendars actually populate).
    const aliasIds = calendarAliasIds(userId);
    const { data: inviteeRows } = await supabase
      .from('event_invitees')
      .select('event_id')
      .in('user_id', aliasIds);
    const inviteeEventIds = (inviteeRows ?? [])
      .map((r) => Number(r.event_id))
      .filter((n) => Number.isFinite(n));

    let query = supabase.from('events').select('*').in('user_id', aliasIds);
    if (inviteeEventIds.length > 0) {
      query = query.or(`id.in.(${inviteeEventIds.join(',')})`);
    }

    if (dateFrom) query = query.gte('date', dateFrom);
    if (dateTo) query = query.lte('date', dateTo);

    const { data, error: dbError } = await query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (dbError) throw dbError;
    return NextResponse.json(data || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const body = await req.json();
    const {
      title,
      patient_name,
      color,
      notes,
      description,
      location,
      event_type,
      status,
      priority,
      reminder_minutes,
      patient_id,
      procedure,
      dentist,
      phone,
      phone_country,
    } = body;

    const supabase = createServerServiceClient();

    // Server-side dentist availability (A may not see B's private calendar).
    // Refuse with 409 + DENTIST_CONFLICT unless `force_conflict` overrides it.
    const forceConflicts = !!body.force_conflict;
    const effectiveDate = body.date || (() => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CLINIC_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const v = (t: string) => parts.find(p => p.type === t)?.value || '';
      return `${v('year')}-${v('month')}-${v('day')}`;
    })();
    const effectiveStart = normalizeStoredTime(body.start_time) || '09:00';
    const effectiveEnd = normalizeStoredTime(body.end_time) || '09:30';
    const dentistName = (body.dentist || '').trim();
    if (dentistName && !forceConflicts) {
      const conflicts = await findDentistConflicts(
        supabase, dentistName, effectiveDate, effectiveStart, effectiveEnd
      );
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: dentistConflictMessage(dentistName),
            code: 'DENTIST_CONFLICT',
            conflicts,
          },
          { status: 409 }
        );
      }
    }

    const baseInsert: Record<string, unknown> = {
      user_id: userId,
      title: title || `Appointment - ${patient_name}`,
      patient_name: patient_name || '',
      date: effectiveDate,
      start_time: effectiveStart,
      end_time: effectiveEnd,
      color: color || '#0d9488',
      notes: notes || '',
    };

    baseInsert.description = description || '';
    baseInsert.location = location || '';
    baseInsert.event_type = event_type || 'appointment';
    baseInsert.status = status || 'scheduled';
    baseInsert.priority = priority || 'medium';
    baseInsert.reminder_minutes = reminder_minutes ?? 30;
    baseInsert.patient_id = patient_id || null;
    baseInsert.procedure = procedure || '';
    baseInsert.dentist = dentist || '';
    baseInsert.phone = phone || '';
    baseInsert.phone_country = phone_country || '504';

    const { data, error: dbError } = await supabase
      .from('events')
      .insert(baseInsert)
      .select()
      .single();

    if (dbError) {
      return NextResponse.json(
        {
          error: dbError.message,
          code: dbError.code,
          details: dbError.details,
          hint: dbError.hint,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const body = await req.json();
    const { id: eventId, force_conflict, ...updates } = body;

    // Normalize times before any conflict/schedule logic runs (`HH:MM` only).
    if (updates.start_time !== undefined) {
      const n = normalizeStoredTime(updates.start_time);
      if (n) updates.start_time = n;
      else delete updates.start_time;
    }
    if (updates.end_time !== undefined) {
      const n = normalizeStoredTime(updates.end_time);
      if (n) updates.end_time = n;
      else delete updates.end_time;
    }

    const supabase = createServerServiceClient();

    // Owner-scoped read of the current row so we can detect a window/dentist
    // change below (notes-only edits must not retrigger the conflict gate).
    const { data: existing, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json(
        { error: 'Evento no encontrado o no tienes permiso para editarlo' },
        { status: 404 }
      );
    }

    // Only gate when the schedule-relevant fields actually move AND the event is
    // not being cancelled (cancelling frees the slot).
    const newDate = updates.date ?? existing.date;
    const newStart = updates.start_time ?? existing.start_time;
    const newEnd = updates.end_time ?? existing.end_time;
    const newDentist = ((updates.dentist ?? existing.dentist) || '').trim();
    const scheduleMoved =
      (updates.date !== undefined && updates.date !== existing.date) ||
      (updates.start_time !== undefined && updates.start_time !== existing.start_time) ||
      (updates.end_time !== undefined && updates.end_time !== existing.end_time) ||
      (updates.dentist !== undefined && updates.dentist !== (existing.dentist || ''));
    const becomingCancelled = (updates.status ?? existing.status) === 'cancelled';

    // The event's invitees are booked too: the dentist check can't see B's own
    // private calendar, so any window/dentist move also asks each invitee's
    // schedule. Both gates share the `force_conflict` escape hatch.
    const { data: inviteeRows } = await supabase
      .from('event_invitees')
      .select('user_id')
      .eq('event_id', eventId);
    const inviteeIds = (inviteeRows || []).map((r) => r.user_id).filter(Boolean);

    if (scheduleMoved && !becomingCancelled && !force_conflict) {
      let conflicts: DentistConflict[] = [];
      let code: string | null = null;
      let message = '';
      if (newDentist) {
        conflicts = await findDentistConflicts(
          supabase, newDentist, newDate, newStart, newEnd, Number(eventId)
        );
        if (conflicts.length > 0) {
          code = 'DENTIST_CONFLICT';
          message = dentistConflictMessage(newDentist);
        }
      }
      if (!conflicts.length && inviteeIds.length > 0) {
        const inviteeConflicts = await findInviteeConflicts(
          supabase, inviteeIds, newDate, newStart, newEnd, Number(eventId)
        );
        if (inviteeConflicts.length > 0) {
          code = 'INVITEE_CONFLICT';
          message = inviteeConflictMessage(inviteeConflicts);
          conflicts = inviteeConflicts;
        }
      }
      if (code) {
        return NextResponse.json(
          {
            error: message,
            code,
            conflicts,
          },
          { status: 409 }
        );
      }
    }

    const { data, error: dbError } = await supabase
      .from('events')
      .update({ ...updates })
      .eq('id', eventId)
      .eq('user_id', userId)
      .select()
      .single();

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Evento no encontrado o no tienes permiso para editarlo' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error: dbError.message,
          code: dbError.code,
          details: dbError.details,
          hint: dbError.hint,
        },
        { status: 400 }
      );
    }
    // Best-effort realtime ping for invited calendars (C13): bumping the invitee
    // rows fires the invitee's `event_invitees` SSE binding → client invalidates →
    // refetches the (now invitee-inclusive) GET. Needs migration 20260909e for the
    // column; if it's not applied yet this call errors harmlessly and is swallowed.
    await supabase
      .from('event_invitees')
      .update({ updated_at: new Date().toISOString() })
      .eq('event_id', eventId);

    // Single reminder schedule — a moved window re-anchors every reminder to the
    // new start (event_start − minutes_before) and clears the sent flag so a
    // rescheduled cita reminds again from the correct instant.
    if (scheduleMoved && newDate && newStart) {
      const { data: reminderRows } = await supabase
        .from('event_reminders')
        .select('id, minutes_before')
        .eq('event_id', eventId);
      for (const r of reminderRows || []) {
        const anchor = clinicWallClockTimestamp(newDate, newStart);
        anchor.setMinutes(anchor.getMinutes() - (r.minutes_before ?? 0));
        await supabase
          .from('event_reminders')
          .update({ reminder_time: anchor.toISOString(), sent: false })
          .eq('id', r.id);
      }
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const body = await req.json();
    const { id } = body;

    const supabase = createServerServiceClient();
    const { data, error: dbError } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (dbError) throw dbError;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Evento no encontrado o no tienes permiso para eliminarlo' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}