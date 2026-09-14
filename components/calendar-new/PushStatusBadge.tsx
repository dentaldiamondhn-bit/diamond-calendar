'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { registerServiceWorker } from '@/lib/serviceWorker';

const LABELS: Record<string, string> = {
  unsupported: 'Notificaciones no soportadas',
  default: 'Activar notificaciones',
  denied: 'Notificaciones bloqueadas',
  enabled: 'Activar notificaciones',
  subscribed: 'Notificaciones activas',
};

export function PushStatusBadge() {
  const push = usePushNotifications();
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    if (push.isNative) {
      setSwReady(true);
      return;
    }
    registerServiceWorker().then(() => setSwReady(true));
  }, [push.isNative]);

  if (!swReady || push.status === 'unsupported') return null;

  const active = push.status === 'subscribed';

  return (
    <button
      onClick={() => (active ? push.disable() : push.enable())}
      disabled={push.loading}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition"
      title="Notificaciones push de citas y recordatorios"
    >
      {push.loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : active ? (
        <BellRing size={16} />
      ) : (
        <BellOff size={16} />
      )}
      <span className="hidden sm:inline">{LABELS[push.status] ?? 'Notificaciones'}</span>
    </button>
  );
}