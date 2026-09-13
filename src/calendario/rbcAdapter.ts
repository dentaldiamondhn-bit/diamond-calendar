import type { ClinicEvent } from '@/lib/types-calendar';
import { clinicDateKey } from '@/calendario/timezone';

export interface RbcEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  resource: ClinicEvent;
}

function parseTime(time: string): { h: number; m: number } {
  const [h = '0', m = '0'] = (time || '').split(':');
  return { h: parseInt(h, 10) || 0, m: parseInt(m, 10) || 0 };
}

export function clinicEventToRbc(ev: ClinicEvent): RbcEvent {
  const [y = '0', mo = '0', d = '0'] = ev.date.split('-');
  const startT = parseTime(ev.start_time || '09:00');
  const endT = parseTime(ev.end_time || ev.start_time || '09:30');

  const start = new Date(+y, +mo - 1, +d, startT.h, startT.m);
  let end = new Date(+y, +mo - 1, +d, endT.h, endT.m);
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 30 * 60 * 1000);
  }

  return {
    id: String(ev.id),
    title: ev.patient_name || ev.title || 'Evento',
    start,
    end,
    allDay: false,
    color: ev.color || '#0d9488',
    resource: ev,
  };
}

export function eventsToRbc(events: ClinicEvent[]): RbcEvent[] {
  return events.map(clinicEventToRbc);
}

export function dateToDateStr(date: Date): string {
  return clinicDateKey(date);
}

export function dateToTimeStr(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}