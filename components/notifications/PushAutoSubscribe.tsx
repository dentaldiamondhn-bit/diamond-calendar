'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

declare const Capacitor: any;

function getCapacitor() {
  try {
    return (window as any).Capacitor;
  } catch {
    return null;
  }
}

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
        const cap = getCapacitor();
        const isNative = cap?.isNativePlatform?.();

        if (isNative) {
          setDebug('Solicitando permiso...');

          const PushNotifications = cap.Plugins?.PushNotifications;
          if (!PushNotifications) {
            setDebug('Plugin PushNotifications no disponible');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          // Request permission first
          const permResult = await PushNotifications.requestPermissions();
          if (permResult?.granted !== 'granted') {
            setDebug('Permiso de notificaciones denegado');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Solicitando token FCM...');

          // Listen for FCM token
          const token = await new Promise<string | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 15000);

            PushNotifications.addListener('registration', (data: any) => {
              clearTimeout(timeout);
              resolve(data.value);
            });

            PushNotifications.addListener('registrationError', () => {
              clearTimeout(timeout);
              resolve(null);
            });

            PushNotifications.register();
          });

          if (cancelled) return;

          if (token) {
            setDebug('Guardando token FCM...');
            try {
              const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fcmToken: token, platform: 'capacitor' }),
              });
              if (res.ok) {
                setDebug('FCM registrado exitosamente');
              } else {
                setDebug('Error al guardar token FCM');
              }
            } catch {
              setDebug('Error de red al guardar token');
            }
          } else {
            setDebug('No se pudo obtener token FCM');
          }

          setTimeout(() => setDebug(null), 5000);
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
          const perm = Notification.permission;
          setDebug(`Fallo al suscribir: permiso=${perm}`);
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
        backgroundColor: debug.includes('exitosa') ? '#16a34a' : debug.includes('Error') || debug.includes('Fallo') || debug.includes('No se pudo') ? '#dc2626' : '#2563eb',
      }}
    >
      {debug}
    </div>
  ) : null;
}
