import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { deliverCalendarToUser } from '@/services/calendarNotifications';
import { createClerkClient } from '@clerk/backend';
import { clinicDateKey, CLINIC_TIME_ZONE } from '@/calendario/timezone';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Calendario Birthday Cron — Phase 4.
 *
 * Primary target: Supabase `pg_cron` + `pg_net.http_post` (POST).
 * Fallback target: GitHub Actions workflow (GET).
 * Both are protected by `CRON_SECRET` (mirrors /api/cron/reminders).
 *
 * Idempotent: before inserting a `birthday_wish` notification for a patient,
 * we check whether one already exists today (America/Tegucigalpa bounds).
 * So Supabase pg_cron at 14:00 UTC and the GitHub fallback at 14:15 UTC
 * never duplicate notifications.
 *
 * Does NOT write to `patient_birthday_wishes` — that table is reserved for
 * staff-initiated WhatsApp wishes only.
 */

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('authorization') === `Bearer ${secret}`
  );
}

/** Today's clinic-local date key (America/Tegucigalpa). */
function todayKey(): string {
  return clinicDateKey();
}

/** Today's MM-DD in clinic timezone. */
function todayMd(): string {
  return todayKey().slice(5); // MM-DD
}

/** [todayStart, todayEnd] inclusive timestamptz bounds in clinic timezone (UTC-06:00). */
function todayBounds(): { from: string; to: string } {
  const k = todayKey();
  return { from: `${k}T00:00:00-06:00`, to: `${k}T23:59:59-06:00` };
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: 'not-configured' }, { status: 503 });
  }

  const db = createServiceClient();
  const md = todayMd();
  const { from, to } = todayBounds();

  const state = {
    patientsFound: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Patients whose fecha_nacimiento MM-DD matches today's MM-DD.
    const { data: patients, error: patientsError } = await db
      .from('patients')
      .select('paciente_id, nombre_completo, telefono, fecha_nacimiento')
      .not('fecha_nacimiento', 'is', null);

    if (patientsError) throw patientsError;

    const matching = ((patients ?? []) as Array<{
      paciente_id: string;
      nombre_completo: string | null;
      telefono: string | null;
      fecha_nacimiento: string | null;
    }>).filter((p) => {
      const dob = p.fecha_nacimiento!;
      const dobMd = dob.slice(5); // MM-DD
      if (dobMd === md) return true;
      // Feb 29 birthdays surface on Feb 28 in non-leap years.
      if (dobMd === '02-29' && md === '02-28') return true;
      return false;
    });

    state.patientsFound = matching.length;

    if (matching.length === 0) {
      return NextResponse.json({ ok: true, md, ...state });
    }

    // Resolve clinic staff users (Clerk) so the bell reaches every staff member.
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const { data: clerkUsers } = await clerk.users.getUserList({ limit: 200 });
    const userIds = (clerkUsers ?? []).map((u) => u.id).filter(Boolean);

    for (const p of matching) {
      const year = new Date(`${todayKey()}T00:00:00`).getFullYear();
      const dob = p.fecha_nacimiento!;
      let age = year - Number(dob.slice(0, 4));
      const dobMd = dob.slice(5);
      if (dobMd !== '02-29' && dobMd > md) age -= 1;

      // Idempotency: skip if a birthday_wish notification already exists today for this patient.
      const { data: existing } = await db
        .from('notifications')
        .select('id')
        .eq('type', 'birthday_wish')
        .gte('created_at', from)
        .lte('created_at', to)
        .filter('data->>patient_id', 'eq', p.paciente_id);

      if ((existing ?? []).length > 0) {
        state.skipped++;
        continue;
      }

      const ageDisplay = age > 0 ? ` (${age} años)` : '';
      const title = '🎂 Cumpleaños de hoy';
      const body = `Hoy cumple años: ${p.nombre_completo}${ageDisplay}`;

      const metadata: Record<string, unknown> = {
        type: 'birthday_wish',
        patientId: p.paciente_id,
        patientName: p.nombre_completo || '',
        date: todayKey(),
        channel: 'whatsapp',
      };

      let deliveredAny = false;
      for (const userId of userIds) {
        try {
          await deliverCalendarToUser(
            db,
            userId,
            {
              title,
              body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `birthday-${p.paciente_id}-${todayKey()}`,
              renotify: false,
              data: metadata,
              actions: [],
            },
            { type: 'birthday_wish', title, message: body, metadata }
          );
          deliveredAny = true;
        } catch (err) {
          state.failed++;
          state.errors.push(
            `${p.paciente_id}->${userId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      if (deliveredAny) state.notified++;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message, state }, { status: 500 });
  }

  return NextResponse.json({ ok: true, md, ...state });
}
