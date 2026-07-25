'use client';

import { useEffect, useState, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { CapacitorNotificationService } from '@/services/capacitorNotificationService';

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn } = useUser();
  const [debug, setDebug] = useState<string | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasRunRef.current) return;
    hasRunRef.current = true;

    const run = async () => {
      try {
        const service = CapacitorNotificationService.getInstance();
        const isNative = service.isNative();

        if (isNative) {
          setDebug('Solicitando permisos...');
          const permResult = await service.requestPermissions();
          if (!permResult.granted) {
            setDebug('Permisos denegados');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Registrando FCM...');
          const result = await service.registerForPushNotifications();
          if (result.token) {
            setDebug('FCM registrado ✓');
          } else {
            setDebug(`FCM fail: ${result.error || '?'}`);
          }
          setTimeout(() => setDebug(null), 20000);
        } else {
          const { pushService } = await import('@/services/unifiedPushService');
          const initialized = await pushService.initialize();
          if (!initialized) {
            setDebug('Push no disponible');
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Solicitando permiso...');
          const result = await pushService.requestPermissions();
          setDebug(`Permiso: ${result.debug}`);

          if (!result.granted) {
            setTimeout(() => setDebug(null), 5000);
            return;
          }

          setDebug('Registrando Web Push...');
          const token = await pushService.registerForPush();
          if (token) {
            setDebug('Web Push registrado ✓');
          } else {
            setDebug('Web Push: registro falló');
          }
          setTimeout(() => setDebug(null), 5000);
        }
      } catch (error: any) {
        setDebug(`Error: ${error.message}`);
        setTimeout(() => setDebug(null), 8000);
      }
    };

    run();
  }, [isLoaded, isSignedIn]);

  if (!debug) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 9999,
        padding: '6px 10px',
        borderRadius: 6,
        color: '#fff',
        fontSize: 11,
        fontWeight: 500,
        maxWidth: 260,
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        backgroundColor: debug.includes('✓') ? '#16a34a' :
          debug.includes('Error') || debug.includes('denegado') || debug.includes('no disponible') ? '#dc2626' : '#2563eb',
      }}
    >
      {debug}
    </div>
  );
}
