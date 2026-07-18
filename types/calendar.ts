export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  start_date: string; // ISO string
  end_date: string; // ISO string
  all_day: boolean;
  location?: string;
  event_type: 'appointment' | 'consultation' | 'surgery' | 'follow_up' | 'reminder' | 'other';
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  priority: 'low' | 'medium' | 'high';
  patient_id?: string;
  notes?: string;
  reminder_minutes?: number; // Minutes before event to send reminder
  created_by: string; // User ID who created the event
  created_at?: string;
  updated_at?: string;
}

export interface CalendarEventWithPatient extends CalendarEvent {
  patient?: {
    paciente_id: string;
    nombre_completo: string;
    telefono?: string;
    email?: string;
  };
}

export interface CalendarReminder {
  id?: string;
  event_id: string;
  reminder_time: string; // ISO string
  sent: boolean;
  created_at?: string;
}

export interface CalendarFilter {
  event_type?: CalendarEvent['event_type'];
  status?: CalendarEvent['status'];
  priority?: CalendarEvent['priority'];
  date_range?: {
    start: string;
    end: string;
  };
}

export interface CalendarView {
  type: 'month' | 'week' | 'day' | 'agenda';
  current_date: string; // ISO string
}
