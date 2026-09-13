import { NextResponse } from 'next/server';
import { getVapidConfig } from '@/lib/push/vapid';

export const dynamic = 'force-dynamic';

/**
 * Serves the browser-ready VAPID public key (base64url). Kept behind a route
 * so clients never depend on a build-time NEXT_PUBLIC copy being in sync.
 */
export async function GET() {
  const cfg = getVapidConfig();
  if (!cfg) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 503 });
  }
  return NextResponse.json({ key: cfg.publicKey });
}