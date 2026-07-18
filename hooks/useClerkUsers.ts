'use client';

import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';

export interface ClerkUser {
  id: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  profileImageUrl?: string;
  role?: string;
}

export function useClerkUsers() {
  const { user } = useUser();
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Check if current user is admin or tech-support (handle both formats)
        if (!user?.id || !['admin', 'tech_support', 'tech-support'].includes(user?.publicMetadata?.role as string)) {
          setLoading(false);
          return;
        }

        // Use the real API endpoint
        const response = await fetch('/api/admin/doctor-users');
        
        if (response.status === 401) {
          setLoading(false);
          return;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to load doctor users`);
        }
        
        const data = await response.json();
        setUsers(data.users || []);
      } catch (error) {
        console.error('Error fetching doctor users:', error);
        // Only show alert for network errors, not auth errors
        if (!error.message.includes('401')) {
          // Network error handling
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [user]);

  return { users, loading };
}
