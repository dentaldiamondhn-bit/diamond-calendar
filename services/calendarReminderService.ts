import { CalendarService } from './calendarService';
import { CalendarTaskService } from './calendarTaskService';
import { CalendarEventWithPatient } from '../types/calendar';
import { CalendarTaskWithPatient } from '../types/calendarTasks';
import { InviteeNotificationService } from './inviteeNotificationService';
import { CalendarInviteesService } from './calendarInviteesService';
import { supabase } from '../lib/supabase';

export class CalendarReminderService {
  // Check for upcoming events and tasks and create reminder records
  static async checkAndCreateReminders() {
    try {
      // Check events
      const upcomingEvents = await CalendarService.getUpcomingEvents();
      
      for (const event of upcomingEvents) {
        // Get existing reminders for this event
        const existingReminders = await this.getRemindersForItem('event', event.id);
        
        // Create reminders if none exist
        if (existingReminders.length === 0 && event.reminder_minutes && event.reminder_minutes > 0) {
          await this.createReminderRecord('event', event.id, event.start_date, event.reminder_minutes);
        }
      }

      // Check tasks
      const upcomingTasks = await CalendarTaskService.getTasks();
      const now = new Date();
      
      for (const task of upcomingTasks) {
        if (task.due_date) {
          // Get existing reminders for this task
          const existingReminders = await this.getRemindersForItem('task', task.id);
          
          // Create reminders if none exist
          if (existingReminders.length === 0 && (task as any).reminder_minutes && (task as any).reminder_minutes > 0) {
            await this.createReminderRecord('task', task.id, task.due_date!, (task as any).reminder_minutes);
          }
        }
      }
    } catch (error) {
      console.error('Error checking calendar reminders:', error);
    }
  }

  // Get existing reminders for an item
  static async getRemindersForItem(itemType: 'event' | 'task', itemId: string) {
    try {
      const { data: reminders, error } = await supabase
        .from('calendar_reminders')
        .select('*')
        .eq('item_type', itemType)
        .eq('item_id', itemId)
        .order('minutes_before', { ascending: true });

      if (error) {
        console.error('Error fetching reminders:', error);
        return [];
      }

      return reminders || [];
    } catch (error) {
      console.error('Error fetching reminders:', error);
      return [];
    }
  }

  // Create reminder record in database
  static async createReminderRecord(itemType: 'event' | 'task', itemId: string, itemDateTime: string, reminderMinutes: number) {
    try {
      const itemDate = new Date(itemDateTime);
      const reminderTime = new Date(itemDate.getTime() - reminderMinutes * 60000);
      const now = new Date();

      // Only create reminder if it's in the future
      if (reminderTime > now) {
        const reminderData = {
          item_type: itemType,
          item_id: itemId,
          reminder_time: reminderTime.toISOString(),
          sent: false
        };

        // Check if reminder already exists
        const { data: existingReminder } = await supabase
          .from('calendar_reminders')
          .select('id')
          .eq('item_type', itemType)
          .eq('item_id', itemId)
          .eq('reminder_time', reminderTime.toISOString())
          .single();

        if (!existingReminder) {
          const { error } = await supabase
            .from('calendar_reminders')
            .insert([reminderData]);

          if (error) {
            console.error('Error creating reminder record:', error);
          } else {
            console.log(`✅ Reminder created for ${itemType} ${itemId} at ${reminderTime.toISOString()}`);
          }
        }
      }
    } catch (error) {
      console.error('Error creating reminder record:', error);
    }
  }

  // Check for pending reminders and send notifications
  static async processPendingReminders() {
    try {
      const pendingReminders = await CalendarService.getPendingReminders();
      
      for (const reminder of pendingReminders) {
        await this.sendReminderNotification(reminder);
        await CalendarService.markReminderAsSent(reminder.id);
      }
    } catch (error) {
      console.error('Error processing pending reminders:', error);
    }
  }

  // Send notification for reminder
  static async sendReminderNotification(reminder: any) {
    try {
      let item;
      
      if (reminder.item_type === 'event') {
        const events = await CalendarService.getEvents();
        item = events.find(e => e.id === reminder.item_id);
      } else if (reminder.item_type === 'task') {
        const tasks = await CalendarTaskService.getTasks();
        item = tasks.find(t => t.id === reminder.item_id);
      }

      if (!item) {
        console.error(`Item not found for reminder: ${reminder.item_type} ${reminder.item_id}`);
        return;
      }

      const notificationData = {
        type: 'calendar_reminder',
        title: `Recordatorio: ${item.title}`,
        message: this.getReminderMessage(item, reminder.item_type),
        metadata: {
          itemId: item.id,
          itemType: reminder.item_type,
          itemTitle: item.title,
          itemTime: reminder.item_type === 'event' ? item.start_date : item.due_date,
          patientName: item.patient?.nombre_completo,
          patientId: item.patient?.paciente_id,
        }
      };

      const targetUsers = new Set<string>();
      if (item.created_by) targetUsers.add(item.created_by);

      if (reminder.item_type === 'event') {
        try {
          const invitees = await CalendarInviteesService.getInviteesForItem('event', item.id);
          for (const inv of invitees) {
            if (inv.user_id) targetUsers.add(inv.user_id);
          }
        } catch (e) {
          console.error('Error fetching event invitees for reminder:', e);
        }
      }

      for (const uid of targetUsers) {
        try {
          await fetch('/api/notifications/send-to-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, notification: notificationData }),
          });
        } catch (e) {
          console.error(`Error sending reminder notification to user ${uid}:`, e);
        }
      }
    } catch (error) {
      console.error('Error sending reminder notification:', error);
    }
  }

  // Create notification for calendar event
  static async createEventNotification(event: CalendarEventWithPatient, type: 'created' | 'updated' | 'cancelled') {
    try {
      const notificationData = {
        type: 'calendar_event',
        title: this.getEventNotificationTitle(event, type),
        message: this.getEventNotificationMessage(event, type),
        metadata: {
          eventId: event.id,
          eventTitle: event.title,
          eventTime: new Date(event.start_date),
          patientName: event.patient?.nombre_completo,
          patientId: event.patient?.paciente_id,
        }
      };

      const targetUsers = new Set<string>();
      if (event.created_by) targetUsers.add(event.created_by);

      try {
        const invitees = await CalendarInviteesService.getInviteesForItem('event', event.id);
        for (const inv of invitees) {
          if (inv.user_id) targetUsers.add(inv.user_id);
        }
      } catch (e) {
        console.error('Error fetching invitees:', e);
      }

      for (const uid of targetUsers) {
        try {
          await fetch('/api/notifications/send-to-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, notification: notificationData }),
          });
        } catch (e) {
          console.error(`Error sending event notification to user ${uid}:`, e);
        }
      }
    } catch (error) {
      console.error('Error creating calendar event notification:', error);
    }
  }

  private static getEventNotificationTitle(event: CalendarEventWithPatient, type: 'created' | 'updated' | 'cancelled'): string {
    const patientName = event.patient?.nombre_completo || 'Sin paciente';
    
    switch (type) {
      case 'created':
        return `Nueva cita: ${event.title}`;
      case 'updated':
        return `Cita actualizada: ${event.title}`;
      case 'cancelled':
        return `Cita cancelada: ${event.title}`;
      default:
        return `Cita: ${event.title}`;
    }
  }

  private static getEventNotificationMessage(event: CalendarEventWithPatient, type: 'created' | 'updated' | 'cancelled'): string {
    const eventDate = new Date(event.start_date);
    const formattedDate = eventDate.toLocaleDateString('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Tegucigalpa' // Explicitly set to Honduras timezone
    });
    
    const patientName = event.patient?.nombre_completo || 'Sin paciente';
    
    switch (type) {
      case 'created':
        return `Cita agendada para ${patientName} el ${formattedDate}`;
      case 'updated':
        return `Cita modificada para ${patientName} el ${formattedDate}`;
      case 'cancelled':
        return `Cita cancelada para ${patientName} el ${formattedDate}`;
      default:
        return `Cita para ${patientName} el ${formattedDate}`;
    }
  }

  private static getReminderMessage(item: CalendarEventWithPatient | CalendarTaskWithPatient, itemType: 'event' | 'task'): string {
    const itemDate = new Date(itemType === 'event' ? (item as CalendarEventWithPatient).start_date : (item as CalendarTaskWithPatient).due_date!);
    const formattedDate = itemDate.toLocaleDateString('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Tegucigalpa' // Explicitly set to Honduras timezone
    });
    
    const patientName = item.patient?.nombre_completo || 'Sin paciente';
    const minutesBefore = (item as any).reminder_minutes || 0;
    const itemTypeLabel = itemType === 'event' ? 'cita' : 'tarea';
    
    if (minutesBefore === 0) {
      return `Tu ${itemTypeLabel} "${item.title}" es ahora mismo${patientName !== 'Sin paciente' ? ` para ${patientName}` : ''}`;
    } else if (minutesBefore < 60) {
      return `Tu ${itemTypeLabel} "${item.title}"${patientName !== 'Sin paciente' ? ` con ${patientName}` : ''} es en ${minutesBefore} minutos (${formattedDate})`;
    } else {
      const hours = Math.floor(minutesBefore / 60);
      return `Tu ${itemTypeLabel} "${item.title}"${patientName !== 'Sin paciente' ? ` con ${patientName}` : ''} es en ${hours} hora(s) (${formattedDate})`;
    }
  }
}
