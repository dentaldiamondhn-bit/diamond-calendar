import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';

/** GET the current user's favorite_invitees and appointment_confirmation. */
export async function GET(_req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const supabase = createServerServiceClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('favorite_invitees, appointment_confirmation')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const favorites = Array.isArray(data?.favorite_invitees) ? data.favorite_invitees : [];
  const confirm = typeof data?.appointment_confirmation === 'boolean' ? data.appointment_confirmation : false;
  return NextResponse.json({ favorite_invitees: favorites, appointment_confirmation: confirm });
}

/** PUT (upsert) the current user's favorite_invitees and/or appointment_confirmation. */
export async function PUT(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { favorite_invitees, appointment_confirmation } = body as {
    favorite_invitees?: unknown;
    appointment_confirmation?: unknown;
  };

  const update: Record<string, unknown> = {
    clerk_user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (favorite_invitees !== undefined) {
    if (!Array.isArray(favorite_invitees) || !favorite_invitees.every((v) => typeof v === 'string')) {
      return NextResponse.json({ error: 'favorite_invitees must be an array of strings' }, { status: 400 });
    }
    update.favorite_invitees = favorite_invitees;
  }

  if (appointment_confirmation !== undefined) {
    if (typeof appointment_confirmation !== 'boolean') {
      return NextResponse.json({ error: 'appointment_confirmation must be a boolean' }, { status: 400 });
    }
    update.appointment_confirmation = appointment_confirmation;
  }

  if (Object.keys(update).length <= 2) {
    // Only clerk_user_id and updated_at present — nothing to update.
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const supabase = createServerServiceClient();
  const { error } = await supabase
    .from('user_preferences')
    .upsert(update, { onConflict: 'clerk_user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, favorite_invitees: update.favorite_invitees, appointment_confirmation: update.appointment_confirmation });
}
