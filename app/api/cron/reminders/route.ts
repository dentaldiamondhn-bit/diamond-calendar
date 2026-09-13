import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { deliverCalendarToUser } from '@/services/calendarNotifications';
import { clinicDateKey, clinicWallClockTimestamp, formatClock12 } from '@/calendario/timezone';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Calendario Phase 5b — single reminder schedule dispatcher.
 *
 * Fired by GitHub Actions every 5 minutes (`/api/cron/reminders`). Covers three
 * sources with the same outward behavior (OS tray push + in-app bell):
 *
 *   - `event_reminders` → owner + every invitee of the event.
 *   - `events` starting now → owner + invitees ("La cita empieza ahora", once
 *     per event, guarded by `start_notified_at`).
 *   - `reminders` (personal notes) → the note's owner, one-shot, then dismissed.
 *   - `tasks` (recur-until-completed) → the task owner; advances `remind_at` by
 *     `repeat_every_days` until the task is completed (completed tasks never fire).
 *
 * Dispatch uses a **lean window**: reminders are treated as due `LEAN_MINUTES`
 * (default 1) before their anchored `reminder_time`, compensating precisely for
 * the scheduler's expected lag so a "N minutos antes" reminder still arrives on
 * time. Every source flips its guard column only after delivery succeeds, so the
 * cadence can never double-fire.
 *
 * Sources are isolated: a schema-drift failure in one branch is reported in
 * `errors` and never takes the other two down.
 *
 * Gate: `x-cron-secret` must equal `CRON_SECRET` (set in both GitHub Actions
 * secrets and the Vercel Production env).
 */

const MAX_REMINDERS = 200;

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

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface EventRow {
  id: number;
  user_id: string;
  title: string | null;
  patient_name: string | null;
  date: string;
  start_time: string | null;
  status: string | null;
}

interface ReminderRow {
  id: number;
  event_id: number;
  minutes_before: number;
}

interface PersonalReminderRow {
  id: number;
  user_id: string;
  message: string | null;
}

interface TaskRow {
  id: number;
  user_id: string;
  title: string;
  due_date: string | null;
  remind_at: string | null;
  repeat_every_days: number | null;
}

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: 'not-configured' }, { status: 503 });
  }

  const db = createServiceClient();
  // Lean the due-window forward by LEAN_MINUTES so scheduler lag doesn't make
  // reminders late: `remind_at <= now + lean` means "due before the next tick"
  // — dispatched now, at most ~LEAN_MINUTES early.
  const leanMinutes = Math.max(0, Number(process.env.REMINDER_LEAN_MINUTES) || 1);
  const dueAt = new Date(Date.now() + leanMinutes * 60_000).toISOString();

  const state = {
    sources: { event_reminders: 0, reminders: 0, tasks: 0, event_start: 0 },
    processed: 0,
    pushed: 0,
    bell: 0,
    failed: 0,
  };
  const errors: Record<string, string> = {};

  // ------------------------------------------------------------------- 1.
  // Event reminders → owner + invitees (original Phase 5b behavior).
  try {
    const { data: due, error: dueError } = await db
      .from('event_reminders')
      .select('id, event_id, minutes_before')
      .eq('sent', false)
      .lte('reminder_time', dueAt)
      .order('reminder_time', { ascending: true })
      .limit(MAX_REMINDERS);
    if (dueError) throw dueError;

    if (due && due.length > 0) {
      const eventIds = [...new Set((due as ReminderRow[]).map((r) => r.event_id))];

      const [{ data: events }, { data: inviteeRows }] = await Promise.all([
        db
          .from('events')
          .select('id, user_id, title, patient_name, date, start_time, status')
          .in('id', eventIds),
        db.from('event_invitees').select('event_id, user_id').in('event_id', eventIds),
      ]);

      const eventMap = new Map<number, EventRow>(
        ((events ?? []) as EventRow[])
          .filter((e) => e.status !== 'cancelled' && e.status !== 'completed')
          .map((e) => [e.id, e])
      );

      const recipientsByEvent = new Map<number, Set<string>>();
      for (const inv of (inviteeRows || []) as Array<{ event_id: number; user_id: string }>) {
        const set = recipientsByEvent.get(inv.event_id) || new Set<string>();
        set.add(inv.user_id);
        recipientsByEvent.set(inv.event_id, set);
      }

      for (const reminder of due as ReminderRow[]) {
        const ev = eventMap.get(reminder.event_id);
        if (!ev) continue; // cancelled/completed/deleted — leave unsent, next tick compacts

        const recipients = new Set<string>([ev.user_id]);
        for (const uid of recipientsByEvent.get(ev.id) || []) recipients.add(uid);

        const dateLabel = fmtDate(ev.date);
        const who = (ev.patient_name?.trim() || ev.title?.trim() || 'Cita');
        const body = `${who} · ${dateLabel} · ${
          ev.start_time ? formatClock12(ev.start_time) : '--:--'
        }`;
        const title = `Recordatorio: ${who}`;
        const metadata: Record<string, unknown> = {
          type: 'calendar',
          source: 'event_reminders',
          eventId: ev.id,
          date: ev.date,
          startTime: ev.start_time,
          url: `/calendario?view=day&date=${encodeURIComponent(ev.date)}&eventId=${ev.id}`,
        };

        try {
          for (const userId of recipients) {
            const pushResult = await deliverCalendarToUser(
              db,
              userId,
              {
                title,
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `calendar-${ev.id}`,
                renotify: true,
                data: metadata,
                actions: [{ action: 'open', title: 'Ver cita' }],
              },
              { type: 'calendar_reminder', title, message: body, metadata }
            );
            state.pushed += pushResult.sent;
            state.bell += recipients.size;
          }
          await db.from('event_reminders').update({ sent: true }).eq('id', reminder.id);
          state.processed++;
          state.sources.event_reminders++;
        } catch (err) {
          state.failed++;
          console.error('[cron/reminders] event reminder failed', reminder.id, errMsg(err));
        }
      }
    }
  } catch (err) {
    errors.event_reminders = errMsg(err);
    console.error('[cron/reminders] event_reminders branch failed', errMsg(err));
  }

  // ------------------------------------------------------------------- 1b.
  // Events starting NOW — a scheduled cita must also notify the moment it's
  // supposed to begin, even when no lead-time reminder was configured. Delivered
  // once per event (guarded by `events.start_notified_at`), owner + invitees.
  try {
    const nowForStart = new Date();
    const todayKey = clinicDateKey(nowForStart);
    const tomorrowKey = clinicDateKey(nowForStart, 1);
    const { data: startRows, error: startErr } = await db
      .from('events')
      .select('id, user_id, title, patient_name, date, start_time, status')
      .in('date', [todayKey, tomorrowKey])
      .is('start_notified_at', null)
      .order('start_time', { ascending: true })
      .limit(MAX_REMINDERS);
    if (startErr) throw startErr;

    const nowMs = nowForStart.getTime();
    const catchUpMs = 5 * 60_000;
    const dueStart = ((startRows ?? []) as EventRow[])
      .filter((e) => e.status !== 'cancelled' && e.status !== 'completed')
      .filter((e) => {
        if (!e.start_time) return false;
        const startMs = clinicWallClockTimestamp(e.date, e.start_time).getTime();
        // Strictly at (or just past) the start — never early — with a small
        // catch-up window so a single lost tick still delivers.
        return startMs <= nowMs && startMs >= nowMs - catchUpMs;
      });

    if (dueStart.length > 0) {
      const startIds = dueStart.map((e) => e.id);
      const { data: startInvitees } = await db
        .from('event_invitees')
        .select('event_id, user_id')
        .in('event_id', startIds);
      const startRecipients = new Map<number, Set<string>>();
      for (const inv of (startInvitees || []) as Array<{ event_id: number; user_id: string }>) {
        const set = startRecipients.get(inv.event_id) || new Set<string>();
        set.add(inv.user_id);
        startRecipients.set(inv.event_id, set);
      }

      for (const ev of dueStart) {
        const recipients = new Set<string>([ev.user_id]);
        for (const uid of startRecipients.get(ev.id) || []) recipients.add(uid);

        const dateLabel = fmtDate(ev.date);
        const who = ev.patient_name?.trim() || ev.title?.trim() || 'Cita';
        const body = `${who} · ${dateLabel} · ${formatClock12(ev.start_time)}`;
        const title = 'La cita empieza ahora';
        const metadata: Record<string, unknown> = {
          type: 'calendar',
          source: 'event_start',
          eventId: ev.id,
          date: ev.date,
          startTime: ev.start_time,
          url: `/calendario?view=day&date=${encodeURIComponent(ev.date)}&eventId=${ev.id}`,
        };

        try {
          for (const userId of recipients) {
            const pushResult = await deliverCalendarToUser(
              db,
              userId,
              {
                title,
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `calendar-${ev.id}`,
                renotify: true,
                data: metadata,
                actions: [{ action: 'open', title: 'Ver cita' }],
              },
              { type: 'calendar_reminder', title, message: body, metadata }
            );
            state.pushed += pushResult.sent;
            state.bell += recipients.size;
          }
          await db
            .from('events')
            .update({ start_notified_at: new Date().toISOString() })
            .eq('id', ev.id)
            .is('start_notified_at', null);
          state.processed++;
          state.sources.event_start++;
        } catch (err) {
          state.failed++;
          console.error('[cron/reminders] event start notification failed', ev.id, errMsg(err));
        }
      }
    }
  } catch (err) {
    errors.event_start = errMsg(err);
    console.error('[cron/reminders] event_start branch failed', errMsg(err));
  }

  // ------------------------------------------------------------------- 2.
  // Personal reminders (ReminderPanel notes) → the note's owner, one-shot.
  try {
    const { data: dueNotes, error: notesError } = await db
      .from('reminders')
      .select('id, user_id, message')
      .eq('dismissed', false)
      .lte('remind_at', dueAt)
      .order('remind_at', { ascending: true })
      .limit(MAX_REMINDERS);
    if (notesError) throw notesError;

    for (const note of (dueNotes ?? []) as PersonalReminderRow[]) {
      const title = 'Recordatorio';
      const body = note.message?.trim() || 'Tienes un recordatorio pendiente';
      const metadata: Record<string, unknown> = {
        type: 'calendar',
        source: 'reminders',
        url: `/calendario?view=day&date=${clinicDateKey()}`,
      };

      try {
        const pushResult = await deliverCalendarToUser(
          db,
          note.user_id,
          {
            title,
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `reminder-${note.id}`,
            renotify: true,
            data: metadata,
            actions: [{ action: 'open', title: 'Ver calendario' }],
          },
          { type: 'calendar_reminder', title, message: body, metadata }
        );
        state.pushed += pushResult.sent;
        state.bell += 1;
        await db.from('reminders').update({ dismissed: true }).eq('id', note.id);
        state.processed++;
        state.sources.reminders++;
      } catch (err) {
        state.failed++;
        console.error('[cron/reminders] personal reminder failed', note.id, errMsg(err));
      }
    }
  } catch (err) {
    errors.reminders = errMsg(err);
    console.error('[cron/reminders] reminders branch failed', errMsg(err));
  }

  // ------------------------------------------------------------------- 3.
  // Tasks — recur-until-completed: notify the owner, then advance `remind_at`
  // by `repeat_every_days` (or clear it for one-shot) while still incomplete.
  try {
    const { data: dueTasks, error: tasksError } = await db
      .from('tasks')
      .select('id, user_id, title, due_date, remind_at, repeat_every_days')
      .eq('completed', false)
      .not('remind_at', 'is', null)
      .lte('remind_at', dueAt)
      .order('remind_at', { ascending: true })
      .limit(MAX_REMINDERS);
    if (tasksError) throw tasksError;

    for (const task of (dueTasks ?? []) as TaskRow[]) {
      const who = task.title.trim() || 'Tarea';
      const body = `Tarea: ${who}`;
      const metadata: Record<string, unknown> = {
        type: 'calendar',
        source: 'tasks',
        taskId: task.id,
        url: `/calendario?view=day&date=${encodeURIComponent(task.due_date || clinicDateKey())}`,
      };

      try {
        const pushResult = await deliverCalendarToUser(
          db,
          task.user_id,
          {
            title: who,
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `task-${task.id}`,
            renotify: true,
            data: metadata,
            actions: [{ action: 'open', title: 'Ver tarea' }],
          },
          { type: 'calendar_reminder', title: who, message: body, metadata }
        );
        state.pushed += pushResult.sent;
        state.bell += 1;

        // Compute the next occurrence in JS (avoid raw update expressions).
        const days = Number(task.repeat_every_days) || 0;
        let nextAt: string | null = null;
        if (days > 0 && task.remind_at) {
          const base = new Date(task.remind_at).getTime() + days * 86_400_000;
          nextAt = new Date(base).toISOString();
        }

        const { error: advanceError } = await db
          .from('tasks')
          .update({ remind_at: nextAt })
          .eq('id', task.id)
          .eq('completed', false); // never resurrect a task completed mid-flight
        if (advanceError) throw advanceError;

        state.processed++;
        state.sources.tasks++;
      } catch (err) {
        state.failed++;
        console.error('[cron/reminders] task reminder failed', task.id, errMsg(err));
      }
    }
  } catch (err) {
    errors.tasks = errMsg(err);
    console.error('[cron/reminders] tasks branch failed', errMsg(err));
  }

  return NextResponse.json({
    ok: true,
    processed: state.processed,
    pushed: state.pushed,
    bell: state.bell,
    failed: state.failed,
    sources: state.sources,
    ...(Object.keys(errors).length ? { errors } : {}),
  });
}

export const POST = GET;