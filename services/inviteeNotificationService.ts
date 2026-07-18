import { CalendarInviteesService } from './calendarInviteesService';
import { CalendarEventWithPatient } from '../types/calendar';
import { CalendarTaskWithPatient } from '../types/calendarTasks';

export class InviteeNotificationService {
  // Send notifications to all invitees of an event
  static async notifyEventInvitees(
    event: CalendarEventWithPatient, 
    type: 'created' | 'updated' | 'cancelled' | 'reminder'
  ) {
    try {
      // Get all invitees for this event
      const invitees = await CalendarInviteesService.getInviteesForItem('event', event.id);
      
      // Create notification data
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
          notificationType: type
        }
      };

      // Send notification to each invitee (send to all invitees, not just accepted)
      for (const invitee of invitees) {
        await this.sendNotificationToUser(invitee.user_id, notificationData);
      }
    } catch (error) {
      console.error('❌ Error notifying event invitees:', error);
    }
  }

  // Send notifications to all invitees of a task
  static async notifyTaskInvitees(
    task: CalendarTaskWithPatient, 
    type: 'created' | 'updated' | 'cancelled' | 'reminder'
  ) {
    try {
      // Get all invitees for this task
      const invitees = await CalendarInviteesService.getInviteesForItem('task', task.id);
      
      // Create notification data
      const notificationData = {
        type: 'calendar_task',
        title: this.getTaskNotificationTitle(task, type),
        message: this.getTaskNotificationMessage(task, type),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          taskTime: task.due_date ? new Date(task.due_date) : null,
          patientName: task.patient?.nombre_completo,
          patientId: task.patient?.paciente_id,
          notificationType: type
        }
      };

      // Send notification to each invitee (send to all invitees, not just accepted)
      for (const invitee of invitees) {
        await this.sendNotificationToUser(invitee.user_id, notificationData);
      }
    } catch (error) {
      console.error('❌ Error notifying task invitees:', error);
    }
  }

  // Send notification to a specific user (bypassing current user authentication)
  private static async sendNotificationToUser(userId: string, notificationData: any) {
    try {
      // Use service role to send notification to any user
      const response = await fetch('/api/notifications/send-to-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          notification: notificationData
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error sending notification to user ${userId}:`, errorText);
      }
    } catch (error) {
      console.error(`❌ Error sending notification to user ${userId}:`, error);
    }
  }

  private static getEventNotificationTitle(event: CalendarEventWithPatient, type: 'created' | 'updated' | 'cancelled' | 'reminder'): string {
    const patientName = event.patient?.nombre_completo || 'Sin paciente';
    
    switch (type) {
      case 'created':
        return `Nueva cita: ${event.title}`;
      case 'updated':
        return `Cita actualizada: ${event.title}`;
      case 'cancelled':
        return `Cita cancelada: ${event.title}`;
      case 'reminder':
        return `Recordatorio: ${event.title}`;
      default:
        return `Cita: ${event.title}`;
    }
  }

  private static getEventNotificationMessage(event: CalendarEventWithPatient, type: 'created' | 'updated' | 'cancelled' | 'reminder'): string {
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
      case 'reminder':
        return `Recordatorio: Tu cita "${event.title}"${patientName !== 'Sin paciente' ? ` con ${patientName}` : ''} es ${formattedDate}`;
      default:
        return `Cita para ${patientName} el ${formattedDate}`;
    }
  }

  private static getTaskNotificationTitle(task: CalendarTaskWithPatient, type: 'created' | 'updated' | 'cancelled' | 'reminder'): string {
    const patientName = task.patient?.nombre_completo || 'Sin paciente';
    
    switch (type) {
      case 'created':
        return `Nueva tarea: ${task.title}`;
      case 'updated':
        return `Tarea actualizada: ${task.title}`;
      case 'cancelled':
        return `Tarea cancelada: ${task.title}`;
      case 'reminder':
        return `Recordatorio: ${task.title}`;
      default:
        return `Tarea: ${task.title}`;
    }
  }

  private static getTaskNotificationMessage(task: CalendarTaskWithPatient, type: 'created' | 'updated' | 'cancelled' | 'reminder'): string {
    if (!task.due_date) {
      return `Tarea "${task.title}"${task.patient?.nombre_completo ? ` para ${task.patient.nombre_completo}` : ''} sin fecha límite`;
    }

    const taskDate = new Date(task.due_date);
    const formattedDate = taskDate.toLocaleDateString('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Tegucigalpa' // Explicitly set to Honduras timezone
    });
    
    const patientName = task.patient?.nombre_completo || 'Sin paciente';
    
    switch (type) {
      case 'created':
        return `Tarea creada para ${patientName} con fecha límite ${formattedDate}`;
      case 'updated':
        return `Tarea modificada para ${patientName} con fecha límite ${formattedDate}`;
      case 'cancelled':
        return `Tarea cancelada para ${patientName}`;
      case 'reminder':
        return `Recordatorio: Tu tarea "${task.title}"${patientName !== 'Sin paciente' ? ` para ${patientName}` : ''} vence ${formattedDate}`;
      default:
        return `Tarea para ${patientName} con fecha límite ${formattedDate}`;
    }
  }
}
