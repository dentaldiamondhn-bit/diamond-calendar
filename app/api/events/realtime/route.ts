import type { RealtimeChannel } from '@supabase/supabase-js';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clerk-gated Server-Sent Events feed for the calendario (Phase 2).
 *
 * Why server-side at all: Phase 0 revoked anon access to the canonical tables,
 * so a browser `postgres_changes` subscription is impossible by design. This
 * route authenticates via the Clerk session (`authorizeCalendar` — never
 * client-sent headers), opens a **service-role** realtime subscription filtered
 * to rows owned by / addressed to the caller, and re-broadcasts them as SSE.
 *
 * Filters: `events` / `tasks` / `reminders` where `user_id = X` (the caller's
 * rows) and `event_invitees` where `user_id = X` (events the caller is invited
 * to). One channel join, four bindings (keeps the join robust — see LEDGER for
 * hosted per-table-channel flakiness). Migration 20260908c set `REPLICA IDENTITY
 * FULL` on the canonical five; note that with RLS on, `payload.old` still only
 * carries the PK (documented Supabase limitation) — the client guard invalidates
 * rather than merges, so this is fine.
 */
export async function GET() {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const supabase = createServerServiceClient();
  const encoder = new TextEncoder();

  let channels: RealtimeChannel[] = [];
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream already closed — the connection is gone
        }
      };

      const filter = `user_id=eq.${userId}`;
      const handler =
        (table: string) =>
        (payload: { eventType: string; new?: unknown; old?: unknown }) => {
          send({
            table,
            event: payload.eventType,
            new: payload.new ?? null,
            old: payload.old ?? null,
          });
        };

      const eventsChannel = supabase
        .channel(`cal-realtime-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events', filter },
          handler('events')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks', filter },
          handler('tasks')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reminders', filter },
          handler('reminders')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_invitees', filter },
          handler('event_invitees')
        );

      channels = [eventsChannel];

      eventsChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          send({ connected: true, status });
        }
      });

      // Comment-formatted keepalive so proxies don't close idle SSE sockets.
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          // ignore
        }
      }, 15_000);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}