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
          setDebug('Iniciando registro FCM...');

          // Import the plugin directly
          let PushNotifications: any;
          try {
            PushNotifications = cap.Plugins?.PushNotifications;
            if (!PushNotifications) throw new Error('not in plugins');
          } catch {
            setDebug('PushNotifications plugin no encontrado');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          const permResult = await PushNotifications.requestPermissions();
          setDebug(`Permiso: ${permResult?.receive}`);

          if (permResult?.receive !== 'granted') {
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Registrando FCM...');

          let resolveToken: (v: string | null) => void;
          let timer: ReturnType<typeof setTimeout>;

          const p = new Promise<string | null>((resolve) => {
            resolveToken = resolve;
          });

          PushNotifications.addListener('registration', (data: any) => {
            clearTimeout(timer);
            resolveToken(data.value);
          });

          PushNotifications.addListener('registrationError', () => {
            clearTimeout(timer);
            resolveToken(null);
          });

          timer = setTimeout(() => resolveToken(null), 30000);

          PushNotifications.register();

          const token = await p;

          if (cancelled) return;

          if (token) {
            setDebug(`Token obtenido: ${token.slice(0, 20)}...`);
            try {
              const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
              });
              setDebug(res.ok ? 'FCM registrado exitosamente' : `Error API: ${await res.text()}`);
            } catch {
              setDebug('Error de red al guardar token');
            }
          } else {
            setDebug('No se pudo obtener token FCM (timeout 30s)');
          }

          setTimeout(() => setDebug(null), 8000);
          return;
        }

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
        fontSize: 11, fontWeight: 500, maxWidth: 200, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
        backgroundColor: debug.includes('exitosa') || debug.includes('Token obtenido') ? '#16a34a' : debug.includes('Error') || debug.includes('No se pudo') ? '#dc2626' : '#2563eb',
      }}
    >
      {debug}
    </div>
  ) : null;
}
