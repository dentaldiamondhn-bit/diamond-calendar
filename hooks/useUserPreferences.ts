import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { UserPreferencesService, UserPreferences } from '../services/userPreferencesService';

interface UseUserPreferencesReturn {
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;
  updatePagePreferences: (page: string, prefs: any) => Promise<void>;
  getPagePreferences: (page: string) => Promise<any>;
  updateGlobalPreferences: (prefs: any) => Promise<void>;
  getGlobalPreferences: () => Promise<any>;
  refreshPreferences: () => Promise<void>;
}

export function useUserPreferences(): UseUserPreferencesReturn {
  const { user, isLoaded } = useUser();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user preferences
  const loadPreferences = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const userPrefs = await UserPreferencesService.getUserPreferences(user.id);
      setPreferences(userPrefs);
    } catch (err) {
      console.error('Error loading user preferences:', err);
      setError('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Update page preferences
  const updatePagePreferences = useCallback(async (page: string, prefs: any) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      const updatedPrefs = await UserPreferencesService.updatePagePreferences(
        user.id,
        page,
        prefs
      );
      setPreferences(updatedPrefs);
    } catch (err) {
      console.error('Error updating page preferences:', err);
      // Don't throw error, just log it to prevent UI breaking
      // For network errors, use optimistic update
      if (err instanceof TypeError && err.message?.includes('Failed to fetch')) {
        console.warn('Network error detected, using optimistic update for page preferences');
        setPreferences(current => {
          if (!current) return null;
          return {
            ...current,
            page_preferences: {
              ...current.page_preferences,
              [page]: {
                ...current.page_preferences?.[page] || {},
                ...prefs
              }
            }
          };
        });
      }
    }
  }, [user?.id]);

  // Get page preferences
  const getPagePreferences = useCallback(async (page: string) => {
    if (!user?.id) {
      return null;
    }

    try {
      return await UserPreferencesService.getPagePreferences(user.id, page);
    } catch (err) {
      console.error('Error getting page preferences:', err);
      return null;
    }
  }, [user?.id]);

  // Update global preferences
  const updateGlobalPreferences = useCallback(async (prefs: any) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    try {
      const updatedPrefs = await UserPreferencesService.updateGlobalPreferences(
        user.id,
        prefs
      );
      setPreferences(updatedPrefs);
    } catch (err) {
      console.error('Error updating global preferences:', err);
      // Don't throw error, just log it to prevent UI breaking
    }
  }, [user?.id]);

  // Get global preferences
  const getGlobalPreferences = useCallback(async () => {
    if (!user?.id) {
      return null;
    }

    try {
      return await UserPreferencesService.getGlobalPreferences(user.id);
    } catch (err) {
      console.error('Error getting global preferences:', err);
      return null;
    }
  }, [user?.id]);

  // Refresh preferences
  const refreshPreferences = useCallback(async () => {
    await loadPreferences();
  }, [loadPreferences]);

  // Load preferences when user is loaded
  useEffect(() => {
    if (isLoaded) {
      loadPreferences();
    }
  }, [isLoaded, loadPreferences]);

  return {
    preferences,
    loading,
    error,
    updatePagePreferences,
    getPagePreferences,
    updateGlobalPreferences,
    getGlobalPreferences,
    refreshPreferences
  };
}

// Helper hook for specific page preferences
export function usePagePreferences(page: string) {
  const { preferences, updatePagePreferences, getPagePreferences, loading, error } = useUserPreferences();
  const [pagePrefs, setPagePrefs] = useState<any>(null);

  // Get page preferences
  useEffect(() => {
    const loadPagePrefs = async () => {
      if (preferences?.page_preferences?.[page]) {
        setPagePrefs(preferences.page_preferences[page]);
      } else {
        const prefs = await getPagePreferences(page);
        setPagePrefs(prefs);
      }
    };

    if (page) {
      loadPagePrefs();
    }
  }, [preferences, page, getPagePreferences]);

  // Update page preferences
  const updatePrefs = useCallback(async (newPrefs: any) => {
    await updatePagePreferences(page, newPrefs);
    setPagePrefs(prev => ({ ...prev, ...newPrefs }));
  }, [updatePagePreferences, page]);

  return {
    preferences: pagePrefs,
    updatePreferences: updatePrefs,
    loading,
    error
  };
}

// Helper hook for global preferences
export function useGlobalPreferences() {
  const { preferences, updateGlobalPreferences, getGlobalPreferences, loading, error } = useUserPreferences();
  const [globalPrefs, setGlobalPrefs] = useState<any>(null);

  // Get global preferences
  useEffect(() => {
    const loadGlobalPrefs = async () => {
      if (preferences?.global_preferences) {
        setGlobalPrefs(preferences.global_preferences);
      } else {
        const prefs = await getGlobalPreferences();
        setGlobalPrefs(prefs);
      }
    };

    loadGlobalPrefs();
  }, [preferences, getGlobalPreferences]);

  // Update global preferences
  const updatePrefs = useCallback(async (newPrefs: any) => {
    await updateGlobalPreferences(newPrefs);
    setGlobalPrefs(prev => ({ ...prev, ...newPrefs }));
  }, [updateGlobalPreferences]);

  return {
    preferences: globalPrefs,
    updatePreferences: updatePrefs,
    loading,
    error
  };
}
