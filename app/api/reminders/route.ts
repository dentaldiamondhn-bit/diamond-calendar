import { NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';

export async function GET() {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  try {
    const supabase = createServerServiceClient();
    const { data, error: dbError } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .order('remind_at', { ascending: true });

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
    const { message, remind_at } = body;

    const supabase = createServerServiceClient();
    const { data, error: dbError } = await supabase
      .from('reminders')
      .insert({
        user_id: userId,
        message,
        remind_at,
        dismissed: false,
      })
      .select()
      .single();

    if (dbError) throw dbError;
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
    const { id, ...updates } = body;

    const supabase = createServerServiceClient();
    const { data, error: dbError } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (dbError) throw dbError;
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
    const { error: dbError } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (dbError) throw dbError;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}