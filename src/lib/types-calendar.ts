export interface ClinicEvent {
  id: number;
  user_id: string;
  title: string;
  patient_name: string;
  procedure: string;
  dentist: string;
  phone?: string;
  phone_country?: string;
  date: string;
  start_time: string;
  end_time: string;
  color: string;
  notes: string;
  description?: string;
  location?: string;
  event_type?: 'appointment' | 'consultation' | 'surgery' | 'follow_up' | 'reminder' | 'other';
  status?: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  reminder_minutes?: number;
  patient_id?: string;
  created_at: string;
}

export interface Task {
  id: number;
  user_id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string;
  completed: boolean;
  created_at: string;
  /** Next reminder occurrence (ISO). NULL = no reminder on this task. */
  remind_at: string | null;
  /** >0: re-remind every N days until the task is completed. NULL/0: one-shot. */
  repeat_every_days: number | null;
}

export interface Reminder {
  id: number;
  user_id: string;
  message: string;
  remind_at: string;
  dismissed: boolean;
  created_at: string;
}

/** One `event_reminders` row joined with enough event data to show it in the
 *  Recordatorios card (fire time = event start − minutes_before). */
export interface EventReminder {
  id: number;
  event_id: number;
  minutes_before: number;
  /** True once the cron dispatcher delivered this reminder (`sent` flag). */
  sent: boolean;
  event: {
    id: number;
    user_id: string;
    title: string | null;
    patient_name: string | null;
    date: string;
    start_time: string | null;
    end_time: string | null;
    status: string | null;
  } | null;
}

export const PROCEDURES = [
  'Limpieza',
  'Chequeo',
  'Restauraciones',
  'Endodoncia',
  'Corona',
  'Extracción',
  'Blanqueamiento',
  'Radiografía',
  'Ortodoncia',
  'Implante',
  'Promo 3 tapones',
  'Limpieza + 3 tapones',
];

export const NO_PROCEDURE_COLOR = '#6b7280';

/** Auto-tint swatch per Procedimiento (click the procedure, the pill adopts its color). */
export const PROCEDURE_COLORS: Record<string, string> = {
  Limpieza: '#0d9488',
  Chequeo: '#2563eb',
  Restauraciones: '#059669',
  Endodoncia: '#7c3aed',
  Corona: '#e11d48',
  Extracción: '#d97706',
  Blanqueamiento: '#0ea5e9',
  Radiografía: '#64748b',
  Ortodoncia: '#ec4899',
  Implante: '#f97316',
  'Promo 3 tapones': '#ca8a04',
  'Limpieza + 3 tapones': '#06b6d4',
};

export const EVENT_COLORS = [
  { name: 'teal', value: '#0d9488' },
  { name: 'blue', value: '#2563eb' },
  { name: 'violet', value: '#7c3aed' },
  { name: 'rose', value: '#e11d48' },
  { name: 'amber', value: '#d97706' },
  { name: 'emerald', value: '#059669' },
];
