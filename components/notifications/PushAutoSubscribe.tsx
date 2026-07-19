'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

function swReadyTimeout(ms: number): Promise<ServiceWorkerRegistration> {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  return new Promise((resolve, reject) => {
    navigator.serviceWorker.ready.then((reg) => {
      clearTimeout(timer);
      resolve(reg);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function tryRegisterFCM(PushNotifications: any, setDebug: (m: string | null) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    let regToken: string | null = null;

    PushNotifications.addListener('registration', (data: any) => {
      regToken = data.value;
      clearTimeout(timer);
      resolve(regToken);
    });

    PushNotifications.addListener('registrationError', () => {
      clearTimeout(timer);
      resolve(null);
    });

    PushNotifications.register().catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function webPushSubscribe(setDebug: (m: string | null) => void): Promise<void> {
  setDebug('Cargando servicio push...');
  const { default: svc } = await import('@/services/pushNotificationService');

  const initialized = await svc.initialize();
  if (!initialized) {
    setDebug('Push no soportado');
    setTimeout(() => setDebug(null), 5000);
    return;
  }

  setDebug('Buscando service worker...');
  let reg: ServiceWorkerRegistration;
  try {
    reg = await swReadyTimeout(5000);
  } catch {
    setDebug('ServiceWorker no disponible');
    setTimeout(() => setDebug(null), 5000);
    return;
  }

  const existingSub = await reg.pushManager.getSubscription();
  if (existingSub) {
    setDebug('Suscripción ya existe');
    setTimeout(() => setDebug(null), 3000);
    return;
  }

  setDebug('Suscribiendo...');
  const ok = await svc.subscribe();
  setDebug(ok ? 'Suscripción creada' : `Fallo al suscribir: permiso=${Notification.permission}`);
  setTimeout(() => setDebug(null), 5000);
}

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn } = useUser();
  const [debug, setDebug] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    const run = async () => {
      try {
        const cap = (window as any).Capacitor;
        const isNative = cap?.isNativePlatform?.();

        if (isNative) {
          const pn = cap.Plugins?.PushNotifications;
          if (pn && typeof pn.register === 'function') {
            setDebug('FCM: registrando...');
            const token = await tryRegisterFCM(pn, setDebug);
            if (cancelled) return;

            if (token) {
              setDebug(`FCM: ${token.slice(0, 16)}...`);
              try {
                const res = await fetch('/api/push/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
                });
                setDebug(res.ok ? 'FCM registrado!' : `API err: ${await res.text()}`);
              } catch { setDebug('FCM: error red'); }
              setTimeout(() => setDebug(null), 8000);
              return;
            }

            setDebug('FCM timeout, usando Web Push...');
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        await webPushSubscribe(setDebug);
      } catch (e) {
        setDebug(`Error: ${e instanceof Error ? e.message : '?'}`);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  if (!debug) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
      padding: '4px 8px', borderRadius: 6, color: '#fff',
      fontSize: 11, fontWeight: 500, maxWidth: 240,
      textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
      backgroundColor: debug.includes('registrado') || debug.includes('creada') || debug.includes('FCM: ') ?
        '#16a34a' : debug.includes('Error') || debug.includes('timeout') || debug.includes('Fallo') ? '#dc2626' : '#2563eb',
    }}>
      {debug}
    </div>
  );
}
