'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/nextjs';

export interface BellNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  metadata?: Record<string, any>;
  userId?: string;
}

interface BellNotificationContextType {
  notifications: BellNotification[];
  unreadCount: number;
  addNotification: (notification: { type?: string; title: string; message: string; metadata?: Record<string, any> }) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const BellNotificationContext = createContext<BellNotificationContextType | undefined>(undefined);

function mapRow(row: any): BellNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    timestamp: row.created_at,
    read: row.read,
    metadata: row.data,
    userId: row.user_id,
  };
}

export function BellNotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<BellNotification[]>([]);
  const { user } = useUser();
  const userId = user?.id;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = async (notification: { type?: string; title: string; message: string; metadata?: Record<string, any> }) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
      });
    } catch (e) {
      console.error('Error adding notification:', e);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id, action: 'markAsRead' }),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      }
    } catch (e) {
      console.error('Error marking notification as read:', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllAsRead' }),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (e) {
      console.error('Error marking all as read:', e);
    }
  };

  const removeNotification = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id, action: 'remove' }),
      });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }
    } catch (e) {
      console.error('Error removing notification:', e);
    }
  };

  const clearAll = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearAll' }),
      });
      if (res.ok) {
        setNotifications([]);
      }
    } catch (e) {
      console.error('Error clearing all:', e);
    }
  };

  return (
    <BellNotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAsRead, markAllAsRead, removeNotification, clearAll }}
    >
      {children}
    </BellNotificationContext.Provider>
  );
}

export function useBellNotifications() {
  const context = useContext(BellNotificationContext);
  if (!context) throw new Error('useBellNotifications must be used within a BellNotificationProvider');
  return context;
}
