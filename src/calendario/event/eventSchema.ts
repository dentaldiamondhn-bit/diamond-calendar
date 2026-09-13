'use client';

import { z } from 'zod';
import { EVENT_COLORS } from '@/lib/types-calendar';
import { validatePhoneNumber, getPhonePlaceholder } from '@/utils/formatUtils';

export const EVENT_TYPES = [
  'appointment',
  'consultation',
  'surgery',
  'follow_up',
  'reminder',
  'other',
] as const;

export const STATUSES = ['scheduled', 'confirmed', 'cancelled', 'completed'] as const;

export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Single source of truth for the event form (phase 3 — first Zod adoption).
 * Dates stay as '<YYYY-MM-DD>' / '<HH:MM>' strings to mirror the DB and the
 * legacy modal; custom options typed as plain strings so clinic-defined
 * dentist/procedure labels are preserved end-to-end (C21).
 */
export const eventFormSchema = z
  .object({
    title: z.string().trim(),
    patient_name: z.string().trim().min(1, 'El nombre del paciente es obligatorio'),
    patient_id: z.string().optional(),
    procedure: z.string().trim(),
    dentist: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    phone_country: z.string().trim().optional(),
    date: z.string().regex(DATE_RE, 'Fecha inválida'),
    start_time: z.string().regex(TIME_RE, 'Hora de inicio inválida'),
    end_time: z.string().regex(TIME_RE, 'Hora de fin inválida'),
    color: z.string(),
    notes: z.string(),
    description: z.string(),
    location: z.string(),
    event_type: z.enum(EVENT_TYPES),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    reminder_minutes: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.start_time && value.end_time && value.start_time >= value.end_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_time'],
        message: 'La hora de fin debe ser posterior a la de inicio',
      });
    }
    const phone = value.phone?.trim();
    if (phone && !validatePhoneNumber(phone, value.phone_country || '504')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: `Número de teléfono inválido (ej. ${getPhonePlaceholder(value.phone_country || '504')})`,
      });
    }
  });

export type EventFormValues = z.input<typeof eventFormSchema>;
export type EventType = EventFormValues['event_type'];
export type EventStatus = EventFormValues['status'];
export type EventPriority = EventFormValues['priority'];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  appointment: 'Cita',
  consultation: 'Consulta',
  surgery: 'Cirugía',
  follow_up: 'Seguimiento',
  reminder: 'Recordatorio',
  other: 'Otro',
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
};

export const PRIORITY_LABELS: Record<EventPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export function defaultEventForm(): EventFormValues {
  return {
    title: '',
    patient_name: '',
    patient_id: '',
    procedure: '',
    dentist: '',
    phone: '',
    phone_country: '504',
    date: '',
    start_time: '09:00',
    end_time: '09:30',
    color: EVENT_COLORS[0].value,
    notes: '',
    description: '',
    location: '',
    event_type: 'appointment',
    status: 'scheduled',
    priority: 'medium',
    reminder_minutes: 30,
  };
}

export const REMINDER_OPTIONS = [
  { value: 0, label: 'Sin recordatorio' },
  { value: 10, label: '10 min antes' },
  { value: 15, label: '15 min antes' },
  { value: 30, label: '30 min antes' },
  { value: 60, label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
  { value: 1440, label: '1 día antes' },
] as const;