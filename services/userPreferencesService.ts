import { supabase } from '../lib/supabase';

export interface UserPreferences {
  clerk_user_id: string;
  page_preferences: {
    [page: string]: {
      viewMode?: 'grid' | 'list';
      recordsPerPage?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      [key: string]: any;
    };
  };
  global_preferences: {
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    [key: string]: any;
  };
  updated_at?: string;
}

export class UserPreferencesService {
  // Get user preferences
  static async getUserPreferences(clerkUserId: string): Promise<UserPreferences | null> {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user preferences:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error fetching user preferences:', error);
      return null;
    }
  }

  // Save user preferences
  static async saveUserPreferences(preferences: UserPreferences): Promise<UserPreferences> {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({
          ...preferences,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'clerk_user_id',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) {
        // Handle network errors gracefully
        if (error.message?.includes('Failed to fetch') || error.code === 'NETWORK_ERROR') {
          console.warn('Network error saving preferences, using offline mode:', error);
          // Return preferences as if saved (optimistic update)
          return preferences;
        }
        console.error('Error saving user preferences:', error);
        throw error;
      }

      return data;
    } catch (error) {
      // Handle network errors gracefully
      if (error instanceof TypeError && error.message?.includes('Failed to fetch')) {
        console.warn('Network error saving preferences, using offline mode:', error);
        // Return preferences as if saved (optimistic update)
        return preferences;
      }
      console.error('Unexpected error saving user preferences:', error);
      throw error;
    }
  }

  // Update specific page preferences
  static async updatePagePreferences(
    clerkUserId: string,
    page: string,
    preferences: Partial<UserPreferences['page_preferences'][string]>
  ): Promise<UserPreferences> {
    try {
      // Get current preferences
      const currentPrefs = await this.getUserPreferences(clerkUserId);
      
      const updatedPrefs: UserPreferences = {
        clerk_user_id: clerkUserId,
        page_preferences: {
          ...currentPrefs?.page_preferences || {},
          [page]: {
            ...currentPrefs?.page_preferences?.[page] || {},
            ...preferences
          }
        },
        global_preferences: currentPrefs?.global_preferences || {}
      };

      return await this.saveUserPreferences(updatedPrefs);
    } catch (error) {
      console.error('Error updating page preferences:', error);
      // For network errors, return optimistic update
      if (error instanceof TypeError && error.message?.includes('Failed to fetch')) {
        console.warn('Network error in updatePagePreferences, returning optimistic preferences');
        // Return a basic preferences object to prevent UI breaking
        return {
          clerk_user_id: clerkUserId,
          page_preferences: {
            [page]: preferences
          },
          global_preferences: {}
        } as UserPreferences;
      }
      throw error;
    }
  }

  // Get specific page preferences
  static async getPagePreferences(
    clerkUserId: string,
    page: string
  ): Promise<UserPreferences['page_preferences'][string] | null> {
    try {
      const userPrefs = await this.getUserPreferences(clerkUserId);
      return userPrefs?.page_preferences?.[page] || null;
    } catch (error) {
      console.error('Error getting page preferences:', error);
      return null;
    }
  }

  // Update global preferences
  static async updateGlobalPreferences(
    clerkUserId: string,
    preferences: Partial<UserPreferences['global_preferences']>
  ): Promise<UserPreferences> {
    try {
      // Get current preferences
      const currentPrefs = await this.getUserPreferences(clerkUserId);
      
      const updatedPrefs: UserPreferences = {
        clerk_user_id: clerkUserId,
        page_preferences: currentPrefs?.page_preferences || {},
        global_preferences: {
          ...currentPrefs?.global_preferences || {},
          ...preferences
        }
      };

      return await this.saveUserPreferences(updatedPrefs);
    } catch (error) {
      console.error('Error updating global preferences:', error);
      throw error;
    }
  }

  // Get global preferences
  static async getGlobalPreferences(
    clerkUserId: string
  ): Promise<UserPreferences['global_preferences'] | null> {
    try {
      const userPrefs = await this.getUserPreferences(clerkUserId);
      return userPrefs?.global_preferences || null;
    } catch (error) {
      console.error('Error getting global preferences:', error);
      return null;
    }
  }

  // Delete user preferences
  static async deleteUserPreferences(clerkUserId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_preferences')
        .delete()
        .eq('clerk_user_id', clerkUserId);

      if (error) {
        console.error('Error deleting user preferences:', error);
        throw error;
      }
    } catch (error) {
      console.error('Unexpected error deleting user preferences:', error);
      throw error;
    }
  }
}
