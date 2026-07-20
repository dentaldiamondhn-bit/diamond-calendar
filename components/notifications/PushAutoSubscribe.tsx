'use client';

import { useEffect, useState, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { pushService } from '@/services/unifiedPushService';

export function PushAutoSubscribe() {
  const { isLoaded, isSignedIn } = useUser();
  const [debug, setDebug] = useState<string | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || hasRunRef.current) return;
    hasRunRef.current = true;

    const run = async () => {
      try {
        setDebug('Inicializando push...');
        
        const initialized = await pushService.initialize();
        if (!initialized) {
          setDebug('Push no disponible');
          setTimeout(() => setDebug(null), 5000);
          return;
        }

        const isNative = pushService.isNative();
        setDebug(`Plataforma: ${isNative ? 'Capacitor' : 'Web'}`);

        setDebug('Solicitando permiso...');
        const { granted } = await pushService.requestPermissions();
        
        if (!granted) {
          setDebug('Permiso denegado');
          setTimeout(() => setDebug(null), 5000);
          return;
        }

        setDebug('Registrando push...');
        const token = await pushService.registerForPush();

        if (token) {
          setDebug(`${isNative ? 'FCM' : 'Web Push'} registrado ✓`);
        } else {
          setDebug('No se pudo obtener token');
        }
        setTimeout(() => setDebug(null), 5000);

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