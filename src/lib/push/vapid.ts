import webpush from 'web-push';

/**
 * Phase 5 — VAPID web-push configuration.
 *
 * Keys are generated once (scripts/generate-vapid.mjs) and live in the server
 * env. They are stored as standard base64 in .env.local; both the browser's
 * PushManager and web-push expect base64url WITHOUT padding, so normalize on
 * load. Vercel uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY_1` / `VAPID_PRIVATE_KEY_1`; the
 * unsuffixed names are kept as fallbacks so existing environments keep working.
 */

export function toUrlBase64(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface VapidConfig {
  /** base64url public key — safe to ship to the browser. */
  publicKey: string;
  /** base64url private key — server only. */
  privateKey: string;
  /** mailto: contact the push service can reach the admin at. */
  subject: string;
}

export function getVapidConfig(): VapidConfig | null {
  const rawPublic =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY_1 ||
    process.env.VAPID_PUBLIC_KEY_1 ||
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    '';
  const rawPrivate = process.env.VAPID_PRIVATE_KEY_1 || process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@diamondlink.app';
  if (!rawPublic || !rawPrivate) return null;
  return {
    publicKey: toUrlBase64(rawPublic),
    privateKey: toUrlBase64(rawPrivate),
    subject,
  };
}

let vapidConfigured = false;

/**
 * Idempotently configures web-push with the VAPID pair. Returns false when the
 * keys are missing (dev environments without the env block) so callers can
 * short-circuit without throwing.
 */
export function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const cfg = getVapidConfig();
  if (!cfg) return false;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  vapidConfigured = true;
  return true;
}