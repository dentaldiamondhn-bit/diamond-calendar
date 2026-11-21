import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';
import { todayClinicKey } from '@/calendario/dobProjection';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const supabase = createServerServiceClient();
    const { data, error } = await supabase
      .from('patient_birthday_wishes')
      .select('*')
      .eq('created_by', userId)
      .order('wish_sent_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const body = await req.json();
    const {
      patient_id,
      wish_year,
      channel = 'whatsapp',
      message_template = 'birthday_greeting',
      promotion_code,
      promotion_type,
      promotion_value,
    } = body;

    if (!patient_id) {
      return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });
    }
    const year = wish_year ?? new Date(todayClinicKey()).getFullYear();

    const supabase = createServerServiceClient();
    const { data, error } = await supabase
      .from('patient_birthday_wishes')
      .insert({
        patient_id,
        wish_year: year,
        channel,
        message_template,
        promotion_code: promotion_code ?? null,
        promotion_type: promotion_type ?? null,
        promotion_value: promotion_value ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      // Unique violation on (patient_id, wish_year) → already congratulated this year.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya se felicitó a este paciente este año', code: 'DUPLICATE_WISH' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
