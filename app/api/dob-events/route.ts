import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { projectDobEvents, type PatientDob } from '@/calendario/dobProjection';
import type { EventRange } from '@/calendario/calendarRepository';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const runtime = 'nodejs';

function parseRange(req: NextRequest): EventRange | null {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if (dateFrom && !DATE_RE.test(dateFrom)) return null;
  if (dateTo && !DATE_RE.test(dateTo)) return null;
  const today = new Date();
  return {
    from: dateFrom || `${today.getFullYear()}-01-01`,
    to: dateTo || `${today.getFullYear()}-12-31`,
  };
}

export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const range = parseRange(req);
  if (!range) {
    return NextResponse.json({ error: 'date_from/date_to must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const supabase = createServerServiceClient();

    // Patients with a stored fecha_nacimiento.
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('paciente_id, nombre_completo, telefono, fecha_nacimiento')
      .not('fecha_nacimiento', 'is', null);

    if (patientsError) throw patientsError;

    // Existing wishes for the years touched by the window (plus current year).
    const years = new Set<number>([
      Number(range.from.slice(0, 4)) || new Date().getFullYear(),
      Number(range.to.slice(0, 4)) || new Date().getFullYear(),
      new Date().getFullYear(),
    ]);
    const { data: wishes, error: wishesError } = await supabase
      .from('patient_birthday_wishes')
      .select('patient_id, wish_year')
      .in('wish_year', Array.from(years));

    if (wishesError) throw wishesError;

    const wishedKeys = new Set<string>();
    for (const w of (wishes ?? [])) {
      wishedKeys.add(`${w.patient_id}-${w.wish_year}`);
    }

    const dobEvents = projectDobEvents(
      (patients ?? []) as PatientDob[],
      { range, wishedKeys }
    );

    return NextResponse.json(dobEvents);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
