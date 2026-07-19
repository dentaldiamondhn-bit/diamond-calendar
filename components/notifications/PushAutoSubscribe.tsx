'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

function isCapacitorNative(): boolean {
  try {
    return navigator.userAgent.includes('Capacitor');
  } catch {
    return false;
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
        if (isCapacitorNative()) {
          setDebug('Dispositivo nativo — registrando FCM...');
          const { CapacitorNotificationService } = await import('@/services/capacitorNotificationService');
          if (cancelled) return;
          const svc = CapacitorNotificationService.getInstance();
          await svc.initialize();
          const token = await svc.registerForPushNotifications();
          if (token) {
            setDebug('FCM registrado exitosamente');
          } else {
            setDebug('Fallo registro FCM — permiso denegado');
          }
          setTimeout(() => setDebug(null), 5000);
          return;
        }

        setDebug('Cargando servicio push...');

        const { default: svc } = await import('@/services/pushNotificationService');
        if (cancelled) return;

        setDebug('Servicio cargado, inicializando...');
        await svc.initialize();

        setDebug('Verificando suscripción existente...');
        const reg = await navigator.serviceWorker.ready;
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
        backgroundColor: debug.includes('exitosa') ? '#16a34a' : debug.includes('Error') || debug.includes('Fallo') ? '#dc2626' : '#2563eb',
      }}
    >
      {debug}
    </div>
  ) : null;
}
