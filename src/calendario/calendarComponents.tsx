'use client';

import type { ReactNode } from 'react';
import type {
  Components,
  EventProps,
  HeaderProps,
  ToolbarProps,
  View,
} from 'react-big-calendar';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { RbcEvent } from '@/calendario/rbcAdapter';
import type { ClinicEvent } from '@/lib/types-calendar';
import { EVENT_COLORS } from '@/lib/types-calendar';
import type { EventStatus } from '@/calendario/event/eventSchema';
import { STATUS_LABELS } from '@/calendario/event/eventSchema';

const VIEW_LABELS: Record<View, string> = {
  month: 'Mes',
  week: 'Semana',
  work_week: 'Semana laboral',
  day: 'Día',
  agenda: 'Agenda',
};

const NAV_ICONS: Record<string, ReactNode> = {
  TODAY: 'Hoy',
  PREV: '‹',
  NEXT: '›',
};

const STATUS_CHIP: Record<EventStatus, { label: string; cls: string }> = {
  scheduled: {
    label: STATUS_LABELS.scheduled,
    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  },
  confirmed: {
    label: STATUS_LABELS.confirmed,
    cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  },
  cancelled: {
    label: STATUS_LABELS.cancelled,
    cls: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',
  },
  completed: {
    label: STATUS_LABELS.completed,
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
};

/** Stable per-dentist accent (map the name onto the EVENT_COLORS swatch). */
export function dentistColor(dentist: string): string {
  const name = (dentist || '').trim();
  if (!name) return '#9ca3af';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[hash % EVENT_COLORS.length].value;
}

function timeRange(ev: ClinicEvent): string {
  const start = ev.start_time || '09:00';
  const end = ev.end_time || ev.start_time || start;
  return `${start} – ${end}`;
}

/** Dental event pill — dentist dot + patient name, procedure badge on date-wide cells (C21). */
export function EventPill({ event, title, slotStart, slotEnd }: EventProps<RbcEvent>) {
  const clinic = event.resource;
  // RBC passes slotStart/slotEnd only on the month/all-day path (EventCell);
  // time-grid events arrive with just {event, title} (TimeGridEvent).
  const fullDay =
    slotStart && slotEnd
      ? slotEnd.getTime() - slotStart.getTime() >= 23 * 60 * 60 * 1000
      : false;
  const name = clinic.patient_name || title || 'Evento';

  return (
    <div
      className="flex items-center gap-1.5 min-w-0 px-1.5 py-0.5 text-white"
      title={`${name} · ${timeRange(clinic)}${clinic.dentist ? ` · ${clinic.dentist}` : ''}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/60"
        style={{ backgroundColor: dentistColor(clinic.dentist) }}
        aria-hidden="true"
      />
      <span className="truncate text-[10px] leading-tight sm:text-xs font-medium">{name}</span>
      {fullDay && clinic.procedure ? (
        <span className="hidden sm:inline text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-black/20 truncate">
          {clinic.procedure}
        </span>
      ) : null}
    </div>
  );
}

/** WhatsApp-style agenda row with the status chip on the right (C21 styling). */
export function AgendaEventRow({ event }: EventProps<RbcEvent>) {
  const clinic = event.resource;
  const status = (clinic.status ?? 'scheduled') as EventStatus;
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.scheduled;
  const name = clinic.patient_name || event.title || 'Evento';
  const initial = name.trim().charAt(0)?.toUpperCase() || '?';

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded-xl">
      <div
        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: event.color || '#0d9488' }}
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: dentistColor(clinic.dentist) }}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{name}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {[clinic.procedure, timeRange(clinic), clinic.dentist].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${chip.cls}`}>
        {chip.label}
      </span>
    </div>
  );
}

/** es toolbar — Today / back / next plus the view switcher (C32 groundwork). */
export function CalendarToolbar({ label, view, views, onNavigate, onView }: ToolbarProps<RbcEvent, object>) {
  const viewList = (Array.isArray(views) ? views : Object.keys(views)) as View[];
  const activeCls =
    'bg-teal-600 text-white shadow-sm';
  const idleCls =
    'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

  const navBtn = (which: 'TODAY' | 'PREV' | 'NEXT', aria: string) => (
    <button
      type="button"
      onClick={() => onNavigate(which)}
      aria-label={aria}
      className={`min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 ${idleCls} transition`}
    >
      {NAV_ICONS[which]}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNavigate('TODAY')}
          className="h-8 px-3 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          Hoy
        </button>
        {navBtn('PREV', 'Anterior')}
        {navBtn('NEXT', 'Siguiente')}
      </div>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 px-1">{label}</span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {viewList.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={`h-8 px-2.5 rounded-lg text-sm font-medium transition ${v === view ? activeCls : idleCls}`}
          >
            {VIEW_LABELS[v] ?? v}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Week/day column header — es weekday + date (Monday-first comes from the localizer). */
export function WeekdayHeader({ date }: HeaderProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1.5 text-gray-600 dark:text-gray-300">
      <span className="text-[10px] font-semibold uppercase tracking-wide">
        {format(date, 'EEEEEE', { locale: es })}
      </span>
      <span className="text-sm font-bold">{format(date, 'd', { locale: es })}</span>
    </div>
  );
}

/** Month cell date header — day number with a today highlight. */
export function MonthDateHeader({ date }: HeaderProps) {
  const today = isSameDay(date, new Date());
  return (
    <div className="flex items-center justify-end px-1.5 py-1">
      <span
        className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium ${
          today ? 'bg-teal-600 text-white font-bold' : 'text-gray-600 dark:text-gray-300'
        }`}
      >
        {format(date, 'd', { locale: es })}
      </span>
    </div>
  );
}

export const calendarComponents: Components<RbcEvent, object> = {
  event: EventPill,
  toolbar: CalendarToolbar,
  header: WeekdayHeader,
  month: { header: MonthDateHeader },
  agenda: { event: AgendaEventRow },
};