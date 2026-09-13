import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Calendar-wide server-side auth (Phase 0 of CALENDARIO_OVERHAUL_PLAN).
 *
 * Identity ALWAYS comes from the Clerk session resolved by `auth()` — never
 * from client-sent headers (`x-user-id`, `authorization`). The `/calendario`
 * surface is now accessible to all authenticated users; the same permissive
 * gate is enforced here for every `/api/events*`, `/api/tasks` and
 * `/api/reminders` handler, because middleware treats `/api/(.*)` as public.
 */

export const CALENDAR_ROLES = ['admin', 'doctor', 'assistant', 'tech_support'] as const;

export interface CalendarSession {
  userId: string;
  role: string;
}

/** Replicates the middleware's sessionClaims role resolution, normalized to lowercase. */
export function roleFromSessionClaims(sessionClaims: unknown): string {
  type SessionClaims = {
    public_metadata?: { role?: unknown };
    metadata?: { role?: unknown };
    role?: unknown;
  };
  const claims = sessionClaims as SessionClaims | null;
  let role = 'staff';
  if (claims?.public_metadata?.role) {
    role = claims.public_metadata.role as string;
  } else if (claims?.metadata?.role) {
    role = claims.metadata.role as string;
  } else if (claims?.role) {
    role = claims.role as string;
  }
  return String(role).toLowerCase();
}

export function isCalendarRole(role: string): boolean {
  return (CALENDAR_ROLES as readonly string[]).includes(role.toLowerCase());
}

/**
 * Masks replicated from `middleware.ts` so server route auth stays consistent
 * with page-level gating: the tech-support superuser is granted `tech_support`
 * unconditionally (metadata broken → still passes).
 */
export const TECH_SUPPORT_USER_IDS = ['user_3A1mYfR054eV3tqtellpfMKZ7f6'] as const;

/** Resolve the Clerk session + role, or null when unauthenticated. */
export async function getCalendarSession(): Promise<CalendarSession | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  let role = roleFromSessionClaims(sessionClaims);
  if ((TECH_SUPPORT_USER_IDS as readonly string[]).includes(userId)) {
    role = 'tech_support';
  }
  return { userId, role };
}

export type CalendarAuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; response: NextResponse };

/**
 * Enforce "authenticated" for a calendar API request.
 * Returns the verified session on success, or a ready-to-return 401/403
 * NextResponse when the caller must be rejected.
 */
export async function authorizeCalendar(): Promise<CalendarAuthResult> {
  const session = await getCalendarSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { ok: true, userId: session.userId, role: session.role };
}