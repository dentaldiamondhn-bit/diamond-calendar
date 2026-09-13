'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { calendarKeys } from '@/calendario/hooks/useCalendarData';

const DEBOUNCE_MS = 1_500;
const MAX_RETRY_MS = 30_000;

/**
 * Client side of `/api/events/realtime`, the Clerk-gated SSE feed.
 *
 * The server already filters to the caller's rows (owner + invitee), so this
 * hook only has to turn frames into cache invalidation:
 *   - **dedupe:** bursts are collapsed by a 1.5s debounce — one invalidate per
 *     window no matter how many events the server forwards (snappy enough that
 *     invitee calendars see an owner's move within ~2s);
 *   - **tombstone guard:** we never mutate the cache from a frame. A DELETE
 *     (or anything else) only schedules a server refetch, so deleted events can
 *     not be resurrected by a stale INSERT echo that lands after the DELETE.
 *   - **reconnect:** EventSource is re-opened with capped exponential backoff.
 */
export function useCalendarRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  // Keep the "latest value" refs in sync without writing during render.
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;

    const scheduleInvalidate = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void queryClientRef.current.invalidateQueries({ queryKey: calendarKeys.all });
      }, DEBOUNCE_MS);
    };

    const cleanup = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };

    const connect = () => {
      const es = new EventSource('/api/events/realtime');

      es.onopen = () => {
        attemptRef.current = 0;
      };

      es.onmessage = (ev) => {
        if (!ev.data) return;
        try {
          const payload = JSON.parse(ev.data);
          // `{ connected: true }` is the subscribe handshake, not a data change.
          if (payload?.connected) return;
          scheduleInvalidate();
        } catch {
          // malformed frame — ignore
        }
      };

      es.onerror = () => {
        es.close();
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_RETRY_MS);
        attemptRef.current += 1;
        retryRef.current = setTimeout(connect, delay);
      };

      return es;
    };

    const es = connect();

    return () => {
      es.close();
      cleanup();
    };
  }, [enabled]);
}