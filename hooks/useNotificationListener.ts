'use client';

import { useEffect, useRef } from 'react';
import { useBellNotifications, BellNotification } from '../contexts/BellNotificationContext';

export function useNotificationListener() {
  const { notifications } = useBellNotifications();
  const processed = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const n of notifications) {
      if (!n.read && !processed.current.has(n.id)) {
        processed.current.add(n.id);
        showBrowserNotification(n);
      }
    }
  }, [notifications]);

  useEffect(() => {
    const cleanup = setInterval(() => {
      const recent = new Set(notifications.slice(0, 50).map(n => n.id));
      processed.current = new Set([...processed.current].filter(id => recent.has(id)));
    }, 60000);
    return () => clearInterval(cleanup);
  }, [notifications]);
}

function showBrowserNotification(n: BellNotification) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    return;
  }

  let body = n.message || '';
  const meta = n.metadata || {};
  if (meta.eventTime || meta.taskTime || meta.itemTime) {
    const d = new Date(meta.eventTime || meta.taskTime || meta.itemTime);
    if (!isNaN(d.getTime())) {
      body += ` | ${d.toLocaleDateString('es-HN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })}`;
    }
  }

  const bn = new Notification(n.title, {
    body,
    icon: '/Logo.svg',
    badge: '/Logo.svg',
    tag: n.type || 'general',
    requireInteraction: false,
    data: meta,
  });

  bn.onclick = () => {
    bn.close();
    window.focus?.();
    if (n.type === 'calendar_event' || n.type === 'calendar_reminder') {
      window.location.href = '/calendario';
    } else if (meta.patientId) {
      window.location.href = `/menu-navegacion?id=${meta.patientId}`;
    }
  };

  setTimeout(() => bn.close(), 8000);
}
