import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';

/** GET the current user's favorite_invitees (defaults to []). */
export async function GET(_req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const supabase = createServerServiceClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('favorite_invitees')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const favorites = Array.isArray(data?.favorite_invitees) ? data.favorite_invitees : [];
  return NextResponse.json({ favorite_invitees: favorites });
}

/** PUT (upsert) the current user's favorite_invitees array. */
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

  const { favorite_invitees } = body as { favorite_invitees?: unknown };
  if (!Array.isArray(favorite_invitees) || !favorite_invitees.every((v) => typeof v === 'string')) {
    return NextResponse.json({ error: 'favorite_invitees must be an array of strings' }, { status: 400 });
  }

  const supabase = createServerServiceClient();
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        clerk_user_id: userId,
        favorite_invitees,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, favorite_invitees });
}
