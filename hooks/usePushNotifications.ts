'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Phase 5 — client-side push subscription lifecycle.
 *
 * Two delivery transports, one hook:
 *  - browser (web PWA): VAPID web-push via the service worker + PushManager
 *  - Capacitor APK (native): FCM via `@capacitor/push-notifications`; the
 *    Android WebView has no PushManager, so the native path is used instead.
 *
 * `status` drives the UI:
 *  - 'unsupported'  → no PushManager / Notification / SW support at all
 *  - 'default'      → permission not yet asked; show "Enable" button
 *  - 'denied'       → browser blocked the permission; show hint
 *  - 'enabled'      → permission granted but maybe not yet subscribed
 *  - 'subscribed'   → confirmed browser + server stores a live subscription
 */
export type PushStatus =
  | 'unsupported'
  | 'default'
  | 'denied'
  | 'enabled'
  | 'subscribed';

interface PushState {
  status: PushStatus;
  loading: boolean;
  error: string | null;
}

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNative()) return true;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

const B64_TO_UINT8 = (b64: string) => {
  const p = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = p.length % 4 === 0 ? '' : '='.repeat(4 - (p.length % 4));
  const raw = atob(p + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const FCM_TOKEN_KEY = 'diamond_calendar_fcm_token';

/** Resolve the native (Capacitor/FCM) status from the OS permission + our saved token. */
async function resolveNativeStatus(
  tokenRef: React.MutableRefObject<string | null>
): Promise<PushStatus> {
  try {
    const perms = await PushNotifications.checkPermissions();
    if (perms.receive === 'denied') return 'denied';
    if (perms.receive !== 'granted') return 'default';
    const token = tokenRef.current || localStorage.getItem(FCM_TOKEN_KEY);
    return token ? 'subscribed' : 'enabled';
  } catch {
    return 'default';
  }
}

/** Register with FCM and return the device token (30 s timeout, like the old app). */
async function registerNativeToken(): Promise<string | null> {
  let resolved = false;
  const result = await new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[fcm] registration timeout after 30s');
        resolved = true;
        resolve(null);
      }
    }, 30000);

    PushNotifications.addListener('registration', (token) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(token.value);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[fcm] registration error:', err);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });

    try {
      PushNotifications.register();
    } catch (e) {
      console.error('[fcm] register() threw:', e);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }
  });

  return result;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>(() => ({
    status: isSupported() ? 'default' : 'unsupported',
    loading: false,
    error: null,
  }));
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const nativeTokenRef = useRef<string | null>(null);
  // Cache the last browser-mapped status so refresh/mount re-syncs don't fire a
  // server round-trip on every call. The server confirm (subscribe POST) only
  // runs when we actually need to display the "subscribed" (server-registered)
  // state — i.e. on first evaluation or when a real change is detected.
  const lastPushState = useRef<{ status: PushStatus; subJSON: PushSubscriptionJSON | null } | null>(null);

  /** Derive browser state locally; confirm against the server only when the
   *  local shape changed since the last evaluation. */
  const resolveStatus = useCallback(async (): Promise<PushStatus> => {
    if (isNative()) {
      return resolveNativeStatus(nativeTokenRef);
    }
    if (!isSupported()) return 'unsupported';
    let perm: NotificationPermission;
    try {
      perm = Notification.permission;
    } catch {
      return 'denied';
    }
    if (perm === 'denied') return 'denied';
    // Ensure SW registration is available.
    let reg = regRef.current;
    if (!reg) {
      try {
        reg = await navigator.serviceWorker.ready;
        regRef.current = reg;
      } catch {
        return 'default';
      }
    }
    if (perm !== 'granted') return 'default';
    // Granted — check if an existing subscription matches our key.
    try {
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return 'enabled';

      const localStatus: PushStatus = 'subscribed';
      const subBase = sub.toJSON();
      const prev = lastPushState.current;
      const unchanged =
        prev &&
        prev.status === localStatus &&
        !!prev.subJSON &&
        JSON.stringify(prev.subJSON) === JSON.stringify(subBase);

      if (unchanged) return prev.status;

      // Subscription (or status) changed since last check — confirm against the
      // server (idempotent upsert) before claiming "subscribed".
      const ok = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subBase, confirm: false, userAgent: navigator.userAgent.slice(0, 512) }),
      }).then((r) => r.ok);
      const status: PushStatus = ok ? 'subscribed' : 'enabled';
      lastPushState.current = { status, subJSON: subBase };
      return status;
    } catch {
      return 'enabled';
    }
  }, []);

  // Sync status from the browser every time the hook mounts or visibility changes.
  useEffect(() => {
    void resolveStatus().then((s) => setState((prev) => (prev.status === s ? prev : { ...prev, status: s, error: null })));
    const vis = () => {
      if (document.visibilityState === 'visible') {
        void resolveStatus().then((s) => setState((prev) => ({ ...prev, status: s })));
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [resolveStatus]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) return false;
    setState((s) => ({ ...s, loading: true, error: null }));
    if (isNative()) {
      try {
        let perms = await PushNotifications.checkPermissions();
        if (perms.receive === 'denied') {
          setState({ status: 'denied', loading: false, error: null });
          return false;
        }
        if (perms.receive !== 'granted') {
          const req = await PushNotifications.requestPermissions();
          if (req.receive !== 'granted') {
            const after = await PushNotifications.checkPermissions();
            setState({ status: after.receive === 'denied' ? 'denied' : 'default', loading: false, error: null });
            return false;
          }
        }
        try {
          await LocalNotifications.createChannel({
            id: 'reminders',
            name: 'Recordatorios',
            description: 'Notificaciones de recordatorios de citas',
            importance: 5,
            visibility: 1,
            sound: 'default',
          });
        } catch {
          /* channel may already exist */
        }
        const token = await registerNativeToken();
        if (!token) throw new Error('fcm-register-failed');
        nativeTokenRef.current = token;
        try {
          localStorage.setItem(FCM_TOKEN_KEY, token);
        } catch {
          /* storage unavailable */
        }
        const serverRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: 'capacitor', fcmToken: token }),
        });
        if (!serverRes.ok) throw new Error('server');
        setState({ status: 'subscribed', loading: false, error: null });
        return true;
      } catch {
        setState({ status: 'default', loading: false, error: 'enable-failed' });
        return false;
      }
    }
    try {
      // Request permission (browser dialog).
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      if (perm === 'denied') {
        setState({ status: 'denied', loading: false, error: null });
        return false;
      }
      if (perm !== 'granted') {
        setState({ status: 'default', loading: false, error: null });
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      regRef.current = reg;
      // Fetch VAPID key.
      const keyRes = await fetch('/api/push/vapid-public-key');
      if (!keyRes.ok) throw new Error('VAPID key unavailable');
      const { key } = (await keyRes.json()) as { key: string };
      // Subscribe via PushManager (creates or reuses).
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: B64_TO_UINT8(key),
        }));
      // Register on the server (idempotent upsert).
      const serverRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent.slice(0, 512),
        }),
      });
      if (!serverRes.ok) throw new Error('server');
      setState({ status: 'subscribed', loading: false, error: null });
      return true;
    } catch {
      // Mid-flight dialog dismiss → permission granted but no registration yet.
      if (Notification.permission === 'granted') {
        const next = await resolveStatus();
        setState({ status: next, loading: false, error: null });
        return false;
      }
      setState({ status: 'default', loading: false, error: 'enable-failed' });
      return false;
    }
  }, [resolveStatus]);

  const disable = useCallback(async () => {
    if (!isSupported()) return;
    setState((s) => ({ ...s, loading: true }));
    if (isNative()) {
      const token = nativeTokenRef.current || (typeof localStorage !== 'undefined' ? localStorage.getItem(FCM_TOKEN_KEY) : null);
      if (token) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: `fcm:${token}` }),
        }).catch(() => null);
      }
      nativeTokenRef.current = null;
      try {
        localStorage.removeItem(FCM_TOKEN_KEY);
      } catch {
        /* storage unavailable */
      }
      try {
        await PushNotifications.removeAllListeners();
      } catch {
        /* best-effort */
      }
      const next = await resolveNativeStatus(nativeTokenRef);
      setState({ status: next, loading: false, error: null });
      return;
    }
    try {
      const reg = regRef.current || (await navigator.serviceWorker.getRegistration('/sw.js'));
      if (reg?.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => null);
          await sub.unsubscribe();
        }
      }
    } catch {
      /* best-effort */
    }
    const next = await resolveStatus();
    setState({ status: next, loading: false, error: null });
  }, [resolveStatus]);

  const sendTest = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const ok = res.ok;
      setState((s) => ({ ...s, loading: false }));
      return ok;
    } catch {
      setState((s) => ({ ...s, loading: false }));
      return false;
    }
  }, []);

  return { ...state, enable, disable, sendTest, isNative: isNative() };
}