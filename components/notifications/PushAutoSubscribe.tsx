'use client';

import { useEffect, useState, useRef } from 'react';
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

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn } = useUser();
  const [debug, setDebug] = useState<string | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasRunRef.current) return;
    hasRunRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const cap = (window as any).Capacitor;
        const isNative = cap?.isNativePlatform?.();
        const pn = cap?.Plugins?.PushNotifications;
        const ln = cap?.Plugins?.LocalNotifications;

        setDebug(`Inicio: native=${isNative}, pn=${!!pn}, ln=${!!ln}`);

        if (isNative && pn && ln) {
          // Request permissions (shows native dialog)
          setDebug('Solicitando permiso...');
          let permResult;
          try {
            const [localPerm, pushPerm] = await Promise.all([
              ln.requestPermissions(),
              pn.requestPermissions(),
            ]);
            setDebug(`Raw: local=${JSON.stringify(localPerm)}, push=${JSON.stringify(pushPerm)}`);
            permResult = { local: localPerm.receive, push: pushPerm.receive };
            setDebug(`Permiso: local=${localPerm.receive}, push=${pushPerm.receive}`);
          } catch (e: any) {
            setDebug(`Permiso error: ${e.message}`);
            permResult = { local: 'denied', push: 'denied' };
          }

          if (permResult.push !== 'granted') {
            setDebug(`Denegado: push=${permResult.push}`);
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          // Get FCM token
          setDebug('Obteniendo token FCM...');
          const token = await new Promise<string | null>((resolve) => {
            const timer = setTimeout(() => {
              setDebug('FCM timeout 15s');
              resolve(null);
            }, 15000);

            const regHandler = pn.addListener('registration', (data: any) => {
              clearTimeout(timer);
              regHandler.remove?.();
              errHandler.remove?.();
              resolve(data.value);
            });
            const errHandler = pn.addListener('registrationError', (e: any) => {
              clearTimeout(timer);
              regHandler.remove?.();
              errHandler.remove?.();
              setDebug(`FCM error: ${e?.message || 'desconocido'}`);
              resolve(null);
            });

            try {
              pn.register().catch((e: any) => {
                clearTimeout(timer);
                regHandler.remove?.();
                errHandler.remove?.();
                setDebug(`FCM register reject: ${e?.message || e}`);
                resolve(null);
              });
            } catch (e: any) {
              clearTimeout(timer);
              regHandler.remove?.();
              errHandler.remove?.();
              setDebug(`FCM register throw: ${e?.message || e}`);
              resolve(null);
            }
          });

          if (cancelled) return;

          if (token) {
            setDebug(`FCM: ${token.slice(0, 16)}...`);
            try {
              const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
              });
              setDebug(res.ok ? 'FCM guardado ✓' : `API: ${await res.text()}`);
            } catch { setDebug('FCM: error red'); }
            setTimeout(() => setDebug(null), 5000);
            return;
          }
          setDebug('FCM: sin token');
        }

        // Web push fallback
        setDebug('Cargando push web...');
        const { default: svc } = await import('@/services/pushNotificationService');
        const initialized = await svc.initialize();
        if (!initialized) {
          setDebug('Push no soportado');
          setTimeout(() => setDebug(null), 5000);
          return;
        }

        const existingSub = await navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription());
        if (existingSub) {
          setDebug('Suscripción ya existe');
          setTimeout(() => setDebug(null), 3000);
          return;
        }

        setDebug('Solicitando permiso push...');
        const ok = await svc.subscribe();
        if (cancelled) return;

        if (ok) {
          setDebug('Suscripción web creada ✓');
        } else {
          setDebug(`Fallo: permiso=${Notification.permission}`);
        }
        setTimeout(() => setDebug(null), 5000);

      } catch (e: any) {
        setDebug(`Error: ${e.message}`);
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
      backgroundColor: debug.includes('guardado') || debug.includes('creada') || debug.includes('FCM:') ?
        '#16a34a' : debug.includes('denegado') || debug.includes('Fallo') || debug.includes('Error') || debug.includes('timeout') || debug.includes('sin token') ? '#dc2626' : '#2563eb',
    }}>
      {debug}
    </div>
  );
}