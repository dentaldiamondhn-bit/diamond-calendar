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

async function getPushPlugin() {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  try {
    const mod = await import('@capacitor/push-notifications');
    return mod.PushNotifications as any;
  } catch {
    return cap.Plugins?.PushNotifications || null;
  }
}

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn } = useUser();
  const [debug, setDebug] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    const run = async () => {
      try {
        const PushNotifications = await getPushPlugin();
        if (!PushNotifications) {
          // Not Capacitor native — use web push
          setDebug('Cargando servicio push...');

          const { default: svc } = await import('@/services/pushNotificationService');
          if (cancelled) return;

          const initialized = await svc.initialize();
          if (!initialized) {
            setDebug('Push no soportado en este navegador');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Verificando suscripción existente...');
          let reg: ServiceWorkerRegistration;
          try {
            reg = await swReadyTimeout(5000);
          } catch {
            setDebug('ServiceWorker no disponible');
            setTimeout(() => setDebug(null), 5000);
            return;
          }
          if (cancelled) return;

          const existingSub = await reg.pushManager.getSubscription();
          if (existingSub) {
            setDebug('Suscripción ya existe, sincronizada con servidor');
            setTimeout(() => setDebug(null), 3000);
            return;
          }

          setDebug('Sin suscripción — solicitando permiso...');
          const ok = await svc.subscribe();
          if (ok) {
            setDebug('Suscripción creada exitosamente');
          } else {
            setDebug(`Fallo al suscribir: permiso=${Notification.permission}`);
          }

          setTimeout(() => setDebug(null), 5000);
          return;
        }

        // Capacitor native path
        setDebug('Registrando FCM (sin permiso previo)...');

        let resolveToken: (v: string | null) => void;
        let timer: ReturnType<typeof setTimeout>;

        const tokenPromise = new Promise<string | null>((resolve) => {
          resolveToken = resolve;
        });

        // Add listeners first, then register
        PushNotifications.addListener('registration', (data: any) => {
          clearTimeout(timer);
          resolveToken(data.value);
        });

        PushNotifications.addListener('registrationError', (err: any) => {
          clearTimeout(timer);
          resolveToken(null);
          setDebug(`Error reg: ${err?.message || 'desconocido'}`);
        });

        timer = setTimeout(() => {
          resolveToken(null);
          setDebug('Token FCM timeout (60s)');
        }, 60000);

        try {
          await PushNotifications.register();
        } catch (e: any) {
          clearTimeout(timer);
          setDebug(`register() falló: ${e?.message || e}`);
          setTimeout(() => setDebug(null), 8000);
          return;
        }

        const token = await tokenPromise;

        if (cancelled) return;

        if (token) {
          setDebug(`Token: ${token.slice(0, 16)}...`);
          try {
            const res = await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
            });
            setDebug(res.ok ? 'FCM registrado' : `API err: ${await res.text()}`);
          } catch {
            setDebug('Error red al guardar');
          }
        } else {
          setDebug('FCM: sin token');
        }

        setTimeout(() => setDebug(null), 8000);
      } catch (e) {
        setDebug(`Error: ${e instanceof Error ? e.message : 'desconocido'}`);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return debug ? (
    <div
      style={{
        position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
        padding: '4px 8px', borderRadius: 6, color: '#fff',
        fontSize: 11, fontWeight: 500, maxWidth: 240, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
        backgroundColor: debug.includes('registrado') || debug.includes('Token:') ? '#16a34a' : debug.includes('Error') || debug.includes('falló') || debug.includes('timeout') || debug.includes('sin token') ? '#dc2626' : '#2563eb',
      }}
    >
      {debug}
    </div>
  ) : null;
}
