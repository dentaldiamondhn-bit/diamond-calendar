import { CalendarEvent } from './calendar';
import { CalendarTask } from './calendarTasks';

export interface CalendarInvitee {
  id?: string;
  item_type: 'event' | 'task' | 'reminder';
  item_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
  invited_at: string;
  responded_at?: string;
  created_by: string;
  created_at: string;
}

export interface CalendarInviteeWithUser extends CalendarInvitee {
  user: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
  };
}

export interface CalendarEventWithInvitees extends CalendarEvent {
  invitees?: CalendarInviteeWithUser[];
}

export interface CalendarTaskWithInvitees extends CalendarTask {
  invitees?: CalendarInviteeWithUser[];
}
