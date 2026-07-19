'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

function swReadyTimeout(ms: number): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
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
    const timer = setTimeout(() => {
      setDebug('FCM: timeout');
      resolve(null);
    }, 15000);

    const regHandler = PushNotifications.addListener('registration', (data: any) => {
      clearTimeout(timer);
      regHandler.remove?.();
      errHandler.remove?.();
      resolve(data.value);
    });

    const errHandler = PushNotifications.addListener('registrationError', () => {
      clearTimeout(timer);
      regHandler.remove?.();
      errHandler.remove?.();
      setDebug('FCM: error registro');
      resolve(null);
    });

    PushNotifications.register().catch(() => {
      clearTimeout(timer);
      regHandler.remove?.();
      errHandler.remove?.();
      setDebug('FCM: register lanzó error');
      resolve(null);
    });
  });
}

async function webPushSubscribe(setDebug: (m: string | null) => void): Promise<void> {
  setDebug('Cargando push web...');
  let svc: any;
  try {
    const mod = await Promise.race([
      import('@/services/pushNotificationService'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('import timeout')), 10000)),
    ]);
    svc = mod.default;
  } catch (e: any) {
    setDebug(`Import falló: ${e.message}`);
    setTimeout(() => setDebug(null), 5000);
    return;
  }

  try {
    const initialized = await svc.initialize();
    if (!initialized) {
      setDebug('Push no soportado');
      setTimeout(() => setDebug(null), 5000);
      return;
    }
  } catch (e: any) {
    setDebug(`init falló: ${e.message}`);
    setTimeout(() => setDebug(null), 5000);
    return;
  }

  setDebug('Buscando SW...');
  let reg: ServiceWorkerRegistration;
  try {
    reg = await swReadyTimeout(8000);
  } catch (e: any) {
    setDebug(`SW: ${e.message}`);
    setTimeout(() => setDebug(null), 5000);
    return;
  }

  const existingSub = await reg.pushManager.getSubscription();
  if (existingSub) {
    setDebug('Suscripción ya existe');
    setTimeout(() => setDebug(null), 3000);
    return;
  }

  setDebug('Suscribiendo web...');
  let ok = false;
  try {
    ok = await svc.subscribe();
  } catch (e: any) {
    setDebug(`sub falló: ${e.message}`);
    setTimeout(() => setDebug(null), 5000);
    return;
  }
  setDebug(ok ? 'Suscripción web creada' : `Fallo: permiso=${Notification.permission}`);
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
        const pn = cap?.Plugins?.PushNotifications;

        setDebug(`Inicio: native=${isNative}, pn=${!!pn}`);

        if (isNative && pn && typeof pn.register === 'function') {
          setDebug('FCM: registrando...');
          const token = await tryRegisterFCM(pn, setDebug);
          if (cancelled) return;

          if (token) {
            setDebug(`FCM token: ${token.slice(0, 16)}...`);
            try {
              const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
              });
              setDebug(res.ok ? 'FCM guardado!' : `API: ${await res.text()}`);
            } catch { setDebug('FCM: error red'); }
            setTimeout(() => setDebug(null), 8000);
            return;
          }

          setDebug('FCM falló, intentando web push...');
          await new Promise(r => setTimeout(r, 500));
        }

        await webPushSubscribe(setDebug);
      } catch (e: any) {
        setDebug(`Error fatal: ${e.message}`);
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
      fontSize: 11, fontWeight: 500, maxWidth: 280,
      textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
      backgroundColor: debug.includes('guardado') || debug.includes('creada') || debug.includes('FCM token') ?
        '#16a34a' : debug.includes('Error') || debug.includes('timeout') || debug.includes('falló') || debug.includes('falló') ? '#dc2626' : '#2563eb',
    }}>
      {debug}
    </div>
  );
}