import type { ClinicEvent } from '@/lib/types-calendar';
import { clinicDateKey, CLINIC_TIME_ZONE } from '@/calendario/timezone';
import type { EventRange } from '@/calendario/calendarRepository';

export interface PatientDob {
  paciente_id: string;
  nombre_completo: string;
  telefono: string | null;
  fecha_nacimiento: string | null; // YYYY-MM-DD
}

export interface DobProjectionOptions {
  range: EventRange;
  /** Set of "patient_id-wish_year" keys that already have a wish logged. */
  wishedKeys?: Set<string>;
  /** Year used for age computation and wish lookup. Defaults to clinic-local year. */
  wishYear?: number;
}

const BIRTHDAY_COLOR = '#ec4899'; // pink — distinct from clinical EVENT_COLORS

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Map a dob (YYYY-MM-DD) onto `year`. Feb 29 → Feb 28 in non-leap years. */
function occurrenceDate(dob: string, year: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const month = Number(m[2]);
  let day = Number(m[3]);
  if (month === 2 && day === 29 && !isLeapYear(year)) day = 28;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Age of the patient on `asOf` (YYYY-MM-DD). */
function computeAge(dob: string, asOf: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return 0;
  const birthYear = Number(m[1]);
  const birthMonth = Number(m[2]);
  const birthDay = Number(m[3]);
  const [cy, cm, cd] = asOf.split('-').map((n) => Number(n));
  let age = cy - birthYear;
  if (cm < birthMonth || (cm === birthMonth && cd < birthDay)) age -= 1;
  return age;
}

/** Stable numeric id for a projected (read-only) dob event. */
function stableId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Current clinic-local year (America/Tegucigalpa). */
function currentClinicYear(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'year')?.value || new Date().getFullYear());
}

/**
 * Project patient birthdays onto every year overlapping [from, to].
 * Read-only: returns ClinicEvent objects with event_type 'dob' and is_dob_event true.
 * Never writes to `events`.
 */
export function projectDobEvents(
  patients: PatientDob[],
  options: DobProjectionOptions
): ClinicEvent[] {
  const { range, wishedKeys = new Set<string>(), wishYear = currentClinicYear() } = options;
  const events: ClinicEvent[] = [];

  const fromYear = Number(range.from.slice(0, 4)) || wishYear;
  const toYear = Number(range.to.slice(0, 4)) || wishYear;

  for (const p of patients) {
    if (!p.fecha_nacimiento) continue;
    const dob = p.fecha_nacimiento;

    for (let y = fromYear; y <= toYear; y++) {
      const occurrence = occurrenceDate(dob, y);
      if (!occurrence) continue;
      // Year-boundary guard: keep only occurrences inside the requested window.
      if (occurrence < range.from || occurrence > range.to) continue;

      const wishKey = `${p.paciente_id}-${y}`;
      const alreadyWished = wishedKeys.has(wishKey);
      const age = computeAge(dob, occurrence);

      events.push({
        id: stableId(`dob-${p.paciente_id}-${y}`),
        user_id: '', // system-projected, no owner
        title: p.nombre_completo,
        patient_name: p.nombre_completo,
        patient_id: p.paciente_id,
        phone: p.telefono ?? undefined,
        phone_country: '504',
        date: occurrence,
        start_time: '00:00',
        end_time: '23:59',
        color: BIRTHDAY_COLOR,
        notes: alreadyWished ? 'Ya felicitado este año' : '',
        description: `Cumpleaños de ${p.nombre_completo} · ${age} años`,
        location: '',
        procedure: '',
        dentist: '',
        event_type: 'dob',
        status: 'scheduled',
        priority: 'medium',
        reminder_minutes: 0,
        is_dob_event: true,
        created_at: clinicDateKey(),
      });
    }
  }

  return events;
}

/** Today's clinic-local date key (for wish-year defaults). */
export function todayClinicKey(): string {
  return clinicDateKey();
}
