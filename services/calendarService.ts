import { supabase } from '../lib/supabase';
import type { CalendarEvent, CalendarEventWithPatient, CalendarFilter, CalendarReminder } from '../types/calendar';
import type { CalendarInvitee } from '../types/calendarInvitees';
import { SimpleTimezoneFix } from './simpleTimezoneFix';
import CapacitorNotificationService from './capacitorNotificationService';

export class CalendarService {
  // Events CRUD operations
  static async createEvent(eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>): Promise<CalendarEvent> {
    try {
      // Remove doctor_id if it exists in the data (it shouldn't be there)
      const { doctor_id, ...cleanEventData } = eventData as any;
      
      const { data, error } = await supabase
        .from('calendar_events')
        .insert([cleanEventData])
        .select(`
          id,
          title,
          description,
          start_date,
          end_date,
          all_day,
          location,
          event_type,
          status,
          priority,
          patient_id,
          notes,
          created_by,
          created_at,
          updated_at
        `)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  static async getEvents(filter?: CalendarFilter): Promise<CalendarEventWithPatient[]> {
    try {
      let query = supabase
        .from('calendar_events')
        .select(`
          *,
          patient:patients(
            paciente_id,
            nombre_completo,
            telefono,
            email
          )
        `);

      // Apply filters
      if (filter?.event_type) {
        query = query.eq('event_type', filter.event_type);
      }
      if (filter?.status) {
        query = query.eq('status', filter.status);
      }
      if (filter?.priority) {
        query = query.eq('priority', filter.priority);
      }
      if (filter?.date_range) {
        query = query
          .gte('start_date', filter.date_range.start)
          .lte('end_date', filter.date_range.end);
      }

      const { data, error } = await query
        .order('start_date', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  static async getEventById(id: string): Promise<CalendarEventWithPatient | null> {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          patient:patients(
            paciente_id,
            nombre_completo,
            telefono,
            email
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Record not found
          return null;
        }
        throw error;
      }

      if (!data) {
        // Record not found
        return null;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  static async updateEvent(id: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    try {
      // Remove doctor_id if it exists in the updates (it shouldn't be there)
      const { doctor_id, ...cleanUpdates } = updates as any;
      
      const { data, error } = await supabase
        .from('calendar_events')
        .update({
          ...cleanUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          id,
          title,
          description,
          start_date,
          end_date,
          all_day,
          location,
          event_type,
          status,
          priority,
          patient_id,
          notes,
          created_by,
          created_at,
          updated_at
        `)
        .single();

      if (error) {
        console.error('Error updating calendar event:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error updating calendar event:', error);
      throw error;
    }
  }

  static async deleteEvent(id: string): Promise<void> {
    try {
      // Delete all related data in the correct order to respect foreign key constraints
      
      // 1. Delete calendar invitees for this event
      const { error: inviteesError } = await supabase
        .from('calendar_invitees')
        .delete()
        .eq('item_type', 'event')
        .eq('item_id', id);

      if (inviteesError) {
        console.error('Error deleting calendar invitees:', inviteesError);
        throw inviteesError;
      }

      // 2. Delete calendar reminders for this event
      const { error: remindersError } = await supabase
        .from('calendar_reminders')
        .delete()
        .or(`item_type.eq.event AND item_id.eq.${id},event_id.eq.${id}`); // Handle both schemas

      if (remindersError) {
        console.error('Error deleting calendar reminders:', remindersError);
        throw remindersError;
      }

      // 3. Finally delete the event itself
      const { error: eventError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (eventError) {
        console.error('Error deleting calendar event:', eventError);
        throw eventError;
      }

      console.log(`✅ Event ${id} and all related data deleted successfully`);
    } catch (error) {
      console.error('Unexpected error deleting calendar event:', error);
      throw error;
    }
  }

  // Get events for a specific date range
  static async getEventsByDateRange(startDate: string, endDate: string, userId?: string): Promise<CalendarEventWithPatient[]> {
    try {
      // If no userId provided, return empty array (shouldn't happen in normal flow)
      if (!userId) {
        console.warn('⚠️ getEventsByDateRange called without userId');
        return [];
      }

      const { data, error } = await supabase
        .rpc('get_user_events', {
          user_id_param: userId,
          start_date_param: startDate,
          end_date_param: endDate
        });

      if (error) {
        console.error('Error fetching events by date range:', error);
        throw error;
      }

      // Remove duplicates and format data
      const events = data || [];
      const uniqueEvents = events.filter((event, index, self) => 
        index === self.findIndex((e) => e.id === event.id)
      );

      return uniqueEvents;
    } catch (error) {
      console.error('Unexpected error fetching events by date range:', error);
      throw error;
    }
  }

  // Get events for a specific patient
  static async getEventsByPatientId(patientId: string): Promise<CalendarEventWithPatient[]> {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          patient:patients(
            paciente_id,
            nombre_completo,
            telefono,
            email
          )
        `)
        .eq('patient_id', patientId)
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Error fetching events by patient:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Unexpected error fetching events by patient:', error);
      throw error;
    }
  }

  // Get event participants (owner + invitees) for avatar display
  static async getEventParticipants(eventId: string): Promise<any[]> {
    try {
      const participants: any[] = [];
      
      // Get event details to find owner
      const { data: eventData, error: eventError } = await supabase
        .from('calendar_events')
        .select('created_by')
        .eq('id', eventId)
        .single();
        
      if (eventError) {
        console.error('Error fetching event owner:', eventError);
        return [];
      }
      
      // Get all user data from API
      let allUsers: any[] = [];
      try {
        const response = await fetch('/api/users');
        if (response.ok) {
          allUsers = await response.json();
        }
      } catch (error) {
        console.error('Error fetching users:', error);
      }
      
      // Create user map for quick lookup
      const userMap = new Map(allUsers.map((user: any) => [user.id, user]));
      
      // Add event owner to participants with real user info
      if (eventData?.created_by) {
        const userData = userMap.get(eventData.created_by);
        participants.push({
          id: eventData.created_by,
          role: 'owner',
          first_name: userData?.first_name || 'Event',
          last_name: userData?.last_name || 'Owner',
          email: userData?.email || '',
          profile_image_url: userData?.profileImageUrl || null
        });
      }
      
      // Get invitees with real user info
      const { data: inviteeData, error: inviteeError } = await supabase
        .from('calendar_invitees')
        .select('user_id, status')
        .eq('item_id', eventId)
        .eq('item_type', 'event')
        .in('status', ['accepted', 'pending']);
        
      if (!inviteeError && inviteeData) {
        for (const invitee of inviteeData) {
          const userData = userMap.get(invitee.user_id);
          participants.push({
            id: invitee.user_id,
            role: invitee.status === 'accepted' ? 'invitee_accepted' : 'invitee_pending',
            first_name: userData?.first_name || 'Invited',
            last_name: userData?.last_name || 'User',
            email: userData?.email || '',
            profile_image_url: userData?.profileImageUrl || null
          });
        }
      }
      
      return participants;
    } catch (error) {
      console.error('Error fetching event participants:', error);
      return [];
    }
  }

  // Get upcoming events for reminders - includes events where user is creator OR invitee
  static async getUpcomingEvents(userId?: string): Promise<CalendarEventWithPatient[]> {
    try {
      // Use Honduras local time for filtering - get start of today in local time
      const nowLocal = new Date();
      const startOfTodayLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
      const startOfTodayUTC = startOfTodayLocal.toISOString();
      
      const nextWeekLocal = new Date();
      nextWeekLocal.setDate(nextWeekLocal.getDate() + 14);
      const nextWeekUTC = nextWeekLocal.toISOString();

      // First, get events where user is the creator
      let creatorQuery = supabase
        .from('calendar_events')
        .select(`
          *,
          patient:patients(
            paciente_id,
            nombre_completo,
            telefono,
            email
          )
        `)
        .gte('start_date', startOfTodayUTC)
        .lte('start_date', nextWeekUTC)
        .neq('status', 'cancelled')
        .order('start_date', { ascending: true });

      if (userId) {
        creatorQuery = creatorQuery.eq('created_by', userId);
      }

      const { data: creatorEvents, error: creatorError } = await creatorQuery;

      if (creatorError) {
        console.error('Error fetching creator events:', creatorError);
        throw creatorError;
      }

      // Second, get events where user is an invitee
      let inviteeEvents: CalendarEventWithPatient[] = [];
      
      if (userId) {
        // First get the invitee records (without date filtering first)
        const { data: inviteeData, error: inviteeError } = await supabase
          .from('calendar_invitees')
          .select(`
            item_id,
            status
          `)
          .eq('user_id', userId)
          .eq('item_type', 'event') // Only get event invitees
          .in('status', ['accepted', 'pending']); // Include both accepted and pending

        if (inviteeError) {
          console.error('Error fetching invitee records:', inviteeError);
        } else if (inviteeData && inviteeData.length > 0) {
          // Get the event IDs
          const eventIds = inviteeData.map(item => item.item_id);
          
          // Now fetch the events for these IDs (with broader date range)
          const { data: eventsData, error: eventsError } = await supabase
            .from('calendar_events')
            .select(`
              *,
              patient:patients(
                paciente_id,
                nombre_completo,
                telefono,
                email
              )
            `)
            .in('id', eventIds)
            .gte('start_date', startOfTodayUTC)
            .lte('start_date', nextWeekUTC)
            .neq('status', 'cancelled')
            .order('start_date', { ascending: true });

          if (eventsError) {
            console.error('Error fetching invitee events:', eventsError);
          } else {
            // Transform and add invitee status
            inviteeEvents = (eventsData || []).map(event => {
              const inviteeRecord = inviteeData.find(item => item.item_id === event.id);
              return {
                ...event,
                invitee_status: inviteeRecord?.status
              };
            });
          }
        }
      }

      // Combine both sets of events
      const allEvents = [...(creatorEvents || []), ...inviteeEvents];
      
      // Remove duplicates (in case user is both creator and invitee)
      const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex((e) => e.id === event.id)
      );

      // Sort by start date
      uniqueEvents.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

      return uniqueEvents;
    } catch (error) {
      console.error('Unexpected error fetching upcoming events:', error);
      throw error;
    }
  }

  // Reminders operations
  static async createReminder(reminderData: Omit<CalendarReminder, 'id' | 'created_at'>): Promise<CalendarReminder> {
    try {
      const { data, error } = await supabase
        .from('calendar_reminders')
        .insert([reminderData])
        .select()
        .single();

      if (error) {
        console.error('Error creating calendar reminder:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Unexpected error creating calendar reminder:', error);
      throw error;
    }
  }

  static async getPendingReminders(): Promise<CalendarReminder[]> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('calendar_reminders')
        .select('*')
        .eq('sent', false)
        .lte('reminder_time', now)
        .order('reminder_time', { ascending: true });

      if (error) {
        console.error('Error fetching pending reminders:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Unexpected error fetching pending reminders:', error);
      throw error;
    }
  }

  static async markReminderAsSent(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('calendar_reminders')
        .update({ sent: true })
        .eq('id', id);

      if (error) {
        console.error('Error marking reminder as sent:', error);
        throw error;
      }
    } catch (error) {
      console.error('Unexpected error marking reminder as sent:', error);
      throw error;
    }
  }

  // Schedule mobile notification for calendar event
  static async scheduleEventNotification(event: CalendarEventWithPatient, reminderMinutes: number = 60): Promise<boolean> {
    try {
      const notificationService = CapacitorNotificationService.getInstance();
      
      // Calculate reminder time
      const eventDate = new Date(event.start_date);
      const reminderDate = new Date(eventDate.getTime() - reminderMinutes * 60 * 1000);
      
      // Only schedule if reminder date is in the future
      if (reminderDate > new Date()) {
        const eventNotification = {
          id: `calendar-event-${event.id}`,
          title: 'Evento de Calendario - Diamond Link',
          body: `${event.title}${event.patient?.nombre_completo ? ` con ${event.patient.nombre_completo}` : ''} en ${reminderMinutes} minutos`,
          scheduledDate: reminderDate,
          patientId: event.patient_id,
          appointmentId: `calendar-${event.id}`
        };

        const scheduled = await notificationService.scheduleAppointmentReminder(eventNotification);
        
        if (scheduled) {
          console.log('✅ Calendar event notification scheduled:', event.title);
          
          // Also create a database reminder record
          await this.createReminder({
            event_id: event.id,
            reminder_time: reminderDate.toISOString(),
            sent: false
          });
        }
        
        return scheduled;
      } else {
        console.log('⚠️ Event date is too soon to schedule notification');
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to schedule calendar event notification:', error);
      return false;
    }
  }

  // Cancel calendar event notification
  static async cancelEventNotification(eventId: string): Promise<boolean> {
    try {
      const notificationService = CapacitorNotificationService.getInstance();
      const cancelled = await notificationService.cancelNotification(`calendar-event-${eventId}`);
      
      if (cancelled) {
        console.log('✅ Calendar event notification cancelled:', eventId);
        
        // Mark database reminders as sent/cancelled
        await supabase
          .from('calendar_reminders')
          .update({ sent: true })
          .eq('event_id', eventId)
          .eq('reminder_type', 'mobile_notification');
      }
      
      return cancelled;
    } catch (error) {
      console.error('❌ Failed to cancel calendar event notification:', error);
      return false;
    }
  }

  // Schedule multiple notifications for an event (e.g., 1 day before, 1 hour before)
  static async scheduleMultipleEventNotifications(event: CalendarEventWithPatient, reminderTimes: number[] = [1440, 60, 15]): Promise<boolean[]> {
    const results: boolean[] = [];
    
    for (const minutes of reminderTimes) {
      const scheduled = await this.scheduleEventNotification(event, minutes);
      results.push(scheduled);
    }
    
    console.log(`📅 Scheduled ${results.filter(r => r).length}/${results.length} notifications for event: ${event.title}`);
    return results;
  }

  // Send immediate notification for event changes
  static async sendEventChangeNotification(event: CalendarEventWithPatient, changeType: 'created' | 'updated' | 'cancelled'): Promise<void> {
    try {
      const notificationService = CapacitorNotificationService.getInstance();
      
      const changeMessages = {
        created: 'Nuevo evento creado',
        updated: 'Evento actualizado',
        cancelled: 'Evento cancelado'
      };
      
      const notification = {
        id: `event-change-${event.id}-${Date.now()}`,
        title: `${changeMessages[changeType]} - Diamond Link`,
        body: `${event.title}${event.patient?.nombre_completo ? ` - ${event.patient.nombre_completo}` : ''}`,
        icon: '/Logo.svg',
        tag: `event-change-${event.id}`,
        data: {
          eventId: event.id,
          patientId: event.patient_id,
          changeType,
          url: event.patient_id ? `/menu-navegacion?id=${event.patient_id}` : '/calendar'
        }
      };

      // Send immediate notification
      await notificationService.sendLocalNotification(notification);
      
      console.log(`📱 Event ${changeType} notification sent:`, event.title);
    } catch (error) {
      console.error('❌ Failed to send event change notification:', error);
    }
  }
}
