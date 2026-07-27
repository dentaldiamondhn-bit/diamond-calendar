'use client';

import { useEffect, useState, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { CapacitorNotificationService } from '@/services/capacitorNotificationService';

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [debug, setDebug] = useState<string | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const hasRunRef = useRef(false);

  const sendTestPush = async () => {
    if (!user?.id || isSendingTest) return;
    setIsSendingTest(true);
    setDebug('Enviando prueba...');
    try {
      const res = await fetch('/api/notifications/send-to-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          notification: {
            title: 'Diamond Calendar - Prueba',
            message: 'Si ves esto, las notificaciones están funcionando correctamente ✓',
            type: 'test',
            metadata: {
              test: 'true',
              timestamp: new Date().toISOString()
            }
          }
        })
      });
      if (res.ok) {
        setDebug('Prueba enviada ✓');
      } else {
        setDebug(`Error prueba: ${res.status}`);
      }
    } catch (e: any) {
      setDebug(`Error: ${e.message}`);
    } finally {
      setIsSendingTest(false);
      setTimeout(() => setDebug(fcmToken ? 'FCM registrado ✓' : null), 5000);
    }
  };

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
            setFcmToken(result.token);
            setDebug('FCM registrado ✓');
          } else {
            setDebug(`FCM fail: ${result.error || '?'}`);
          }
          // Don't clear debug if we have a token, so we can show the test button
          if (!result.token) {
            setTimeout(() => setDebug(null), 20000);
          }
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
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        backgroundColor: debug.includes('✓') ? '#16a34a' :
          debug.includes('Error') || debug.includes('denegado') || debug.includes('no disponible') ? '#dc2626' : '#2563eb',
      }}
    >
      <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {debug}
      </div>
      {fcmToken && debug === 'FCM registrado ✓' && (
        <button
          onClick={sendTestPush}
          disabled={isSendingTest}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 10,
            textAlign: 'center'
          }}
        >
          {isSendingTest ? 'Enviando...' : 'Probar Notificación'}
        </button>
      )}
    </div>
  );
}
