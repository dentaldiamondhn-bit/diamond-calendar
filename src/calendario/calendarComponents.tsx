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
import { cn } from '@/lib/utils';
import { formatClock12 } from '@/calendario/timezone';

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

/** Agenda date header — feed-style es-HN day badge (WhatsApp look). Rendered
 *  once per day group (rowSpan), so it reads as a clean section divider. */
export function AgendaDateHeader({ day }: { day: Date; label?: string }) {
  const today = isSameDay(day, new Date());
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const weekday = cap(format(day, 'EEEE', { locale: es })); // "Sábado"
  const dayMonth = cap(format(day, "d 'de' MMM", { locale: es })); // "26 de sep"

  return (
    <div className="flex flex-col items-start gap-1 whitespace-nowrap pr-2">
      <span
        className={cn(
          'text-xs font-semibold uppercase tracking-wider',
          today ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
        )}
      >
        {today ? 'Hoy' : weekday}
      </span>
      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{dayMonth}</span>
    </div>
  );
}

/** Agenda time cell — muted es-HN clock range in a mono feed slot. */
export function AgendaTimeCell({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span className="whitespace-nowrap text-[11px] font-mono text-teal-600 dark:text-teal-400">
      {label}
    </span>
  );
}

/** Agenda event card — 3px color bar, muted hierarchy, status chip right. */
export function AgendaEventCard({ event, title }: EventProps<RbcEvent>) {
  const clinic = event.resource;
  const status = (clinic.status ?? 'scheduled') as EventStatus;
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.scheduled;
  const name = clinic.patient_name || title || 'Evento';
  const procedure = clinic.procedure?.trim();
  const dentist = clinic.dentist?.trim();
  const range =
    clinic.start_time || clinic.end_time
      ? `${formatClock12(clinic.start_time)} – ${formatClock12(clinic.end_time)}`
      : '';

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-2 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700/50 dark:bg-[#181e2a] dark:hover:bg-slate-800/60"
      style={{ borderLeftWidth: 3, borderLeftColor: event.color || '#0d9488' }}
      title={`${name}${procedure ? ` · ${procedure}` : ''}${dentist ? ` · ${dentist}` : ''}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dentistColor(clinic.dentist) }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{name}</span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', chip.cls)}>
            {chip.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">
          {[procedure, dentist].filter(Boolean).join(' · ') || 'Cita'}
        </p>
        {range ? (
          <p className="mt-1 text-xs font-mono tabular-nums text-teal-600 dark:text-teal-400">{range}</p>
        ) : null}
      </div>
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
  agenda: {
    event: AgendaEventCard,
    time: AgendaTimeCell,
    date: AgendaDateHeader,
  },
};