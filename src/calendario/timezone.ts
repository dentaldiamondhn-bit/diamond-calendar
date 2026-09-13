/**
 * Clinic-local timezone policy (CALENDARIO_OVERHAUL_PLAN — Phase 0).
 *
 * The canonical `events`/`tasks`/`reminders` family stores *local clock*
 * values (`date DATE`, `start_time`/`end_time` TIME, `remind_at` timestamptz)
 * and there are NO +/−6h shims in the live data layer. RBC dates are
 * interpreted against the clinic timezone below (Phase 2 `rbcAdapter`), not
 * the browser/server default. `America/Tegucigalpa` has no DST, so the offset
 * is a constant UTC−06:00.
 */
export const CLINIC_TIME_ZONE = 'America/Tegucigalpa';

/** `YYYY-MM-DD` for a given instant, in clinic-local time (`offsetDays` ±). */
export function clinicDateKey(date: Date = new Date(), offsetDays = 0): string {
  const shifted = new Date(date.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * The true UTC instant whose *clinic-local* clock shows `date` + `time` (wall
 * clock). `America/Tegucigalpa` has no DST, so the offset is a constant
 * UTC−06:00 (Phase 0 policy) — this is what `event_reminders.reminder_time`
 * must be anchored to (event start − minutes_before), not `now()`.
 */
export function clinicWallClockTimestamp(date: string, time?: string): Date {
  const [y = '0', mo = '0', d = '0'] = (date || '').split('-');
  const [h = '0', mi = '0'] = (time || '09:00').split(':');
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const clinicOffsetMs = 6 * 3600 * 1000; // UTC−06:00 = wall + 6h in UTC
  return new Date(wall + clinicOffsetMs);
}

/** Coerce a stored clock value to `HH:MM` (strips browser `:ss` suffixes, blanks). */
export function normalizeTime(time?: string | null): string {
  const [h, mi] = (time ?? '').split(':');
  const hh = String(Number(h));
  const mm = (mi || '').slice(0, 2) || '00';
  const ok =
    /^\d{1,2}$/.test(hh) &&
    Number(hh) <= 23 &&
    /^\d{2}$/.test(mm) &&
    Number(mm) <= 59;
  return ok ? `${hh.padStart(2, '0')}:${mm}` : '09:00';
}

/** `17:45` → `5:45 p. m.` — the es-HN 12-hour display (only `hh:mm`, no seconds). */
export function formatClock12(time?: string | null): string {
  const t = normalizeTime(time);
  const h24 = Number(t.slice(0, 2));
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 >= 12 ? 'p. m.' : 'a. m.';
  return `${h}:${t.slice(3, 5)} ${suffix}`;
}

/** `17:45` + 60 → `18:45` (`HH:MM`). Wraps past midnight within the same key. */
export function addHourToTime(time?: string | null, hours = 1): string {
  const t = normalizeTime(time);
  const h24 = (Number(t.slice(0, 2)) + hours) % 24;
  return `${String(h24).padStart(2, '0')}:${t.slice(3, 5)}`;
}