'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { CapacitorNotificationService, useCapacitorNotifications } from '@/services/capacitorNotificationService';

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn } = useUser();
  const { isNative, isInitialized, requestPermissions, registerForPushNotifications } = useCapacitorNotifications();
  const [debug, setDebug] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasRun) return;
    setHasRun(true);
    let cancelled = false;

    const run = async () => {
      try {
        const native = isNative;
        if (native) {
          setDebug('Solicitando permiso de notificaciones...');
          
          const permResult = await requestPermissions();
          if (!permResult.granted) {
            setDebug('Permiso denegado');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Obteniendo token FCM...');
          const token = await registerForPushNotifications();
          
          if (cancelled) return;

          if (token) {
            setDebug('FCM registrado ✓');
          } else {
            setDebug('No se obtuvo token FCM');
          }
          setTimeout(() => setDebug(null), 5000);
          return;
        }

        // Web push fallback
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
  }, [isLoaded, isSignedIn, isNative, isInitialized, requestPermissions, registerForPushNotifications]);

  if (!debug) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
      padding: '4px 8px', borderRadius: 6, color: '#fff',
      fontSize: 11, fontWeight: 500, maxWidth: 240,
      textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
      backgroundColor: debug.includes('✓') || debug.includes('creada') ? '#16a34a' : 
        debug.includes('denegado') || debug.includes('Fallo') || debug.includes('Error') || debug.includes('no soportado') ? '#dc2626' : '#2563eb',
    }}>
      {debug}
    </div>
  );
}