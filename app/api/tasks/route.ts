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
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('completed', { ascending: true })
      .order('due_date', { ascending: true });

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
    const { title, priority, due_date, remind_at = null, repeat_every_days = null } = body;

    const supabase = createServerServiceClient();
    const { data, error: dbError } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        priority: priority || 'medium',
        due_date,
        completed: false,
        remind_at,
        repeat_every_days: Number.isFinite(repeat_every_days) ? repeat_every_days : null,
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
      .from('tasks')
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
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (dbError) throw dbError;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}