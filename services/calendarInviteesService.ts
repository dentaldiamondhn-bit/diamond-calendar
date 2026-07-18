import { supabase } from '../lib/supabase';
import { CalendarInvitee, CalendarInviteeWithUser } from '../types/calendarInvitees';

export class CalendarInviteesService {
  // Invitees CRUD operations
  static async createInvitee(inviteeData: Omit<CalendarInvitee, 'id' | 'invited_at' | 'created_at'>): Promise<CalendarInvitee> {
    try {
      const { data, error } = await supabase
        .from('calendar_invitees')
        .insert([inviteeData])
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  static async getInviteesForItem(itemType: 'event' | 'task' | 'reminder', itemId: string): Promise<CalendarInviteeWithUser[]> {
    try {
      // First get the invitees
      const { data: invitees, error: inviteesError } = await supabase
        .from('calendar_invitees')
        .select('*')
        .eq('item_type', itemType)
        .eq('item_id', itemId)
        .order('invited_at', { ascending: true });

      if (inviteesError) {
        console.error('Error fetching calendar invitees:', inviteesError);
        throw inviteesError;
      }

      if (!invitees || invitees.length === 0) {
        return [];
      }

      // Get unique user IDs from invitees
      const userIds = [...new Set(invitees.map(invitee => invitee.user_id))];
      
      // Fetch user information using the same API as getAllUsers
      const response = await fetch('/api/users');
      if (!response.ok) {
        console.error('Error fetching users:', response.statusText);
        // Return invitees without user info if user fetch fails
        return invitees.map((invitee: any) => ({
          ...invitee,
          user: {
            id: invitee.user_id || '',
            first_name: '',
            last_name: '',
            email: '',
            role: ''
          }
        }));
      }
      
      const allUsers = await response.json();
      
      // Filter users to only those who are invitees
      const relevantUsers = allUsers.filter((user: any) => userIds.includes(user.id));

      // Create a map of user data for quick lookup
      const userMap = new Map(
        relevantUsers.map((user: any) => [user.id, user])
      );

      // Transform the data to match our interface
      return invitees.map((invitee: any) => {
        const userData: any = userMap.get(invitee.user_id);
        return {
          ...invitee,
          user: {
            id: invitee.user_id || '',
            first_name: userData?.first_name || '',
            last_name: userData?.last_name || '',
            email: userData?.email || '',
            role: userData?.role || '',
            profileImageUrl: userData?.profileImageUrl || null
          }
        };
      });
    } catch (error) {
      console.error('Unexpected error fetching calendar invitees:', error);
      throw error;
    }
  }

  static async updateInviteeStatus(id: string, status: CalendarInvitee['status']): Promise<CalendarInvitee> {
    try {
      const { data, error } = await supabase
        .from('calendar_invitees')
        .update({
          status,
          responded_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  static async deleteInvitee(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('calendar_invitees')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting calendar invitee:', error);
        throw error;
      }
    } catch (error) {
      console.error('Unexpected error deleting calendar invitee:', error);
      throw error;
    }
  }

  // Bulk operations
  static async createMultipleInvitees(inviteesData: Omit<CalendarInvitee, 'id' | 'invited_at' | 'created_at'>[]): Promise<CalendarInvitee[]> {
    try {
      const { data, error } = await supabase
        .from('calendar_invitees')
        .insert(inviteesData)
        .select();

      if (error) {
        console.error('Error creating multiple calendar invitees:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Unexpected error creating multiple calendar invitees:', error);
      throw error;
    }
  }

  static async deleteInviteesForItem(itemType: 'event' | 'task' | 'reminder', itemId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('calendar_invitees')
        .delete()
        .eq('item_type', itemType)
        .eq('item_id', itemId);

      if (error) {
        console.error('Error deleting calendar invitees for item:', error);
        throw error;
      }
    } catch (error) {
      console.error('Unexpected error deleting calendar invitees for item:', error);
      throw error;
    }
  }

  // Get all users for dropdown
  static async getAllUsers(): Promise<Array<{
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
    profileImageUrl?: string;
  }>> {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        console.error('Error fetching users:', response.statusText);
        throw new Error('Error fetching users');
      }
      
      const users = await response.json();
      return users || [];
    } catch (error) {
      console.error('Unexpected error fetching users:', error);
      throw error;
    }
  }

  // Get invitees for the current user
  static async getInviteesForCurrentUser(userId: string): Promise<CalendarInviteeWithUser[]> {
    try {
      const { data, error } = await supabase
        .from('calendar_invitees')
        .select(`
          *,
          user:auth.users(
            id,
            raw_user_meta_data->first_name,
            raw_user_meta_data->last_name,
            email,
            raw_user_meta_data->role
          )
        `)
        .eq('user_id', userId)
        .order('invited_at', { ascending: false });

      if (error) {
        console.error('Error fetching invitees for current user:', error);
        throw error;
      }

      return (data || []).map((invitee: any) => ({
        ...invitee,
        user: {
          id: invitee.user?.id || '',
          first_name: invitee.user?.raw_user_meta_data?.first_name || '',
          last_name: invitee.user?.raw_user_meta_data?.last_name || '',
          email: invitee.user?.email || '',
          role: invitee.user?.raw_user_meta_data?.role || ''
        }
      }));
    } catch (error) {
      console.error('Unexpected error fetching invitees for current user:', error);
      throw error;
    }
  }
}
