import type { ClinicEvent, Task, Reminder, EventReminder } from '@/lib/types-calendar';
import type { ParticipantMap } from '@/app/api/events/participants/route';
import type { DentistConflict, InviteeConflict } from '@/lib/dentistAvailability';

export interface EventRange {
  /** Inclusive YYYY-MM-DD start of the window. */
  from: string;
  /** Inclusive YYYY-MM-DD end of the window. */
  to: string;
}

/** Persistable event payload (mirrors the `EventModal` form + route defaults). */
export interface EventInput {
  title: string;
  patient_name: string;
  date: string;
  start_time: string;
  end_time: string;
  color: string;
  notes: string;
  description?: string;
  location?: string;
  event_type?: ClinicEvent['event_type'];
  status?: ClinicEvent['status'];
  priority?: ClinicEvent['priority'];
  reminder_minutes?: number;
  patient_id?: string;
  procedure?: string;
  dentist?: string;
  /** Patient phone stored on the event (modal "Teléfono" next to Procedimiento). */
  phone?: string;
  /** Dialing code of the phone (same split as patient-form's `codigopais`). */
  phone_country?: string;
  /** Server-side dentist-availability escape hatch (409 DENTIST_CONFLICT override). */
  force_conflict?: boolean;
}

/** Rich fetch error: carries HTTP status, server `code` and any payload. */
export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;
  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/** True when the server refused the save because someone's schedule is double-booked. */
export function isDentistConflictError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    (err.code === 'DENTIST_CONFLICT' || err.code === 'INVITEE_CONFLICT')
  );
}

/** The conflicting bookings carried by a schedule-conflict rejection. */
export function dentistConflictsOf(err: unknown): Array<DentistConflict | InviteeConflict> {
  if (err instanceof ApiError && err.payload && typeof err.payload === 'object') {
    const conflicts = (err.payload as { conflicts?: unknown }).conflicts;
    if (Array.isArray(conflicts)) return conflicts as Array<DentistConflict | InviteeConflict>;
  }
  return [];
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let code: string | undefined;
    let payload: unknown;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
      if (body?.code) code = body.code;
      if (body?.conflicts) payload = body;
      else payload = body;
    } catch {
      // keep the default message
    }
    throw new ApiError(msg, res.status, code, payload);
  }
  return res.json() as Promise<T>;
}

const REQUEST: RequestInit = {
  cache: 'no-store',
};

/**
 * Thin data-access layer for the calendario shell (Phase 2).
 *
 * Every method returns raw domain types and lets react-query own caching. The
 * enum-style column defaults (event `status`, `priority`, …) stay untouched so
 * the server route keeps applying them, exactly like chat's repository+service
 * split. Identity for all requests comes from the Clerk session resolved
 * server-side (`authorizeCalendar`); this layer never sends `x-user-id`.
 */
export class CalendarRepository {
  // ---------------------------------------------------------------- events
  static async getEvents(range?: EventRange): Promise<ClinicEvent[]> {
    const params = new URLSearchParams();
    if (range) {
      params.set('date_from', range.from);
      params.set('date_to', range.to);
    }
    const qs = params.toString();
    return readJson<ClinicEvent[]>(
      await fetch(`/api/events${qs ? `?${qs}` : ''}`, REQUEST)
    );
  }

  static async createEvent(payload: EventInput): Promise<ClinicEvent> {
    return readJson<ClinicEvent>(
      await fetch('/api/events', {
        ...REQUEST,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );
  }

  static async updateEvent(id: number, updates: Partial<EventInput>): Promise<ClinicEvent> {
    return readJson<ClinicEvent>(
      await fetch('/api/events', {
        ...REQUEST,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
    );
  }

  static async deleteEvent(id: number): Promise<void> {
    await readJson<{ ok: boolean }>(
      await fetch('/api/events', {
        ...REQUEST,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    );
  }

  /** Batched participants for many events (N+1 killer — dashboard panel + agenda rows). */
  static async getParticipants(eventIds: number[]): Promise<ParticipantMap> {
    const ids = [...new Set(eventIds)].filter((id) => Number.isFinite(id));
    if (ids.length === 0) return {};
    return readJson<ParticipantMap>(
      await fetch(`/api/events/participants?ids=${ids.join(',')}`, REQUEST)
    );
  }

  // ------------------------------------------------- event sub-resources
  /** Invitee rows for one event (owner or member only — route enforces). */
  static async getEventInvitees(
    eventId: number
  ): Promise<Array<{ event_id: number; user_id: string; status: string }>> {
    return readJson(
      await fetch(`/api/events/${eventId}/invitees`, REQUEST)
    );
  }

  /** minutes_before per reminder for one event (owner or member only). */
  static async getEventReminders(eventId: number): Promise<number[]> {
    const rows = await readJson<Array<{ minutes_before: number }>>(
      await fetch(`/api/events/${eventId}/reminders`, REQUEST)
    );
    return rows.map((r) => r.minutes_before);
  }

  /** Diff-replace invitees on an owned event (DELETE all → POST each). */
  static async setEventInvitees(eventId: number, userIds: string[]): Promise<void> {
    await readJson<{ ok: boolean }>(
      await fetch(`/api/events/${eventId}/invitees`, {
        ...REQUEST,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    for (const user_id of [...new Set(userIds)].filter(Boolean)) {
      await readJson<{ event_id: number; user_id: string; status: string }>(
        await fetch(`/api/events/${eventId}/invitees`, {
          ...REQUEST,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, status: 'pending' }),
        })
      );
    }
  }

  /** Batch reminders for many events at once (ReminderPanel "citas" rows). */
  static async getEventRemindersBatch(eventIds: number[]): Promise<EventReminder[]> {
    if (eventIds.length === 0) return [];
    return readJson<EventReminder[]>(
      await fetch(`/api/events/reminders?ids=${eventIds.join(',')}`, REQUEST)
    );
  }

  /** Remove a single event reminder (owner only). */
  static async deleteEventReminder(eventId: number, reminderId: number): Promise<void> {
    await readJson<{ ok: boolean }>(
      await fetch(`/api/events/${eventId}/reminders`, {
        ...REQUEST,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_id: reminderId }),
      })
    );
  }

  /** Diff-replace reminders on an owned event (DELETE all → POST each >0). */
  static async setEventReminders(eventId: number, minutes: number[]): Promise<void> {
    await readJson<{ ok: boolean }>(
      await fetch(`/api/events/${eventId}/reminders`, {
        ...REQUEST,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    for (const minutes_before of [...new Set(minutes)].filter((m) => m > 0)) {
      await readJson<{ event_id: number; minutes_before: number }>(
        await fetch(`/api/events/${eventId}/reminders`, {
          ...REQUEST,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutes_before }),
        })
      );
    }
  }

  // ----------------------------------------------------------------- tasks
  static async getTasks(): Promise<Task[]> {
    return readJson<Task[]>(await fetch('/api/tasks', REQUEST));
  }

  static async createTask(
    title: string,
    priority: Task['priority'],
    due_date: string,
    remind_at: string | null = null,
    repeat_every_days: number | null = null
  ): Promise<Task> {
    return readJson<Task>(
      await fetch('/api/tasks', {
        ...REQUEST,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority, due_date, remind_at, repeat_every_days }),
      })
    );
  }

  static async updateTask(id: number, updates: Partial<Task>): Promise<Task> {
    return readJson<Task>(
      await fetch('/api/tasks', {
        ...REQUEST,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
    );
  }

  static async deleteTask(id: number): Promise<void> {
    await readJson<{ ok: boolean }>(
      await fetch('/api/tasks', {
        ...REQUEST,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    );
  }

  // ------------------------------------------------------------- reminders
  static async getReminders(): Promise<Reminder[]> {
    return readJson<Reminder[]>(await fetch('/api/reminders', REQUEST));
  }

  static async createReminder(message: string, remind_at: string): Promise<Reminder> {
    return readJson<Reminder>(
      await fetch('/api/reminders', {
        ...REQUEST,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, remind_at }),
      })
    );
  }

  static async updateReminder(id: number, updates: Partial<Reminder>): Promise<Reminder> {
    return readJson<Reminder>(
      await fetch('/api/reminders', {
        ...REQUEST,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
    );
  }

  static async deleteReminder(id: number): Promise<void> {
    await readJson<{ ok: boolean }>(
      await fetch('/api/reminders', {
        ...REQUEST,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    );
  }
}