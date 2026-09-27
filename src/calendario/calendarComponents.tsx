'use client';

import type { ReactNode } from 'react';
import type {
  Components,
  DateHeaderProps,
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
import { cn } from '@/lib/utils';
import { formatClock12 } from '@/calendario/timezone';
import { withAlpha } from '@/calendario/eventTint';
import { STATUS_CHIP, btnSecondary, chipCls, glassBar, glassCard, glassChip } from '@/calendario/glass';

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
      className="flex w-full min-w-0 items-center gap-1.5 px-1.5 py-0.5 text-slate-100"
      title={`${name} · ${timeRange(clinic)}${clinic.dentist ? ` · ${clinic.dentist}` : ''}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/40"
        style={{ backgroundColor: dentistColor(clinic.dentist) }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[10px] leading-tight sm:text-xs font-medium">
        {name}
      </span>
      {fullDay && clinic.procedure ? (
        <span className="hidden min-w-0 max-w-[45%] shrink truncate rounded bg-white/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90 ring-1 ring-inset ring-white/20 backdrop-blur-[2px] sm:inline">
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
          glassChip,
          'text-[10px] font-semibold uppercase tracking-wider',
          today
            ? 'border-teal-400/40 bg-teal-400/15 text-teal-700 dark:text-teal-200'
            : 'border-slate-500/20 bg-slate-500/10 text-slate-500 dark:text-slate-400'
        )}
      >
        {today ? 'Hoy' : weekday}
      </span>
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-500">{dayMonth}</span>
    </div>
  );
}

/** Agenda time cell — muted es-HN clock range in a mono feed slot. */
export function AgendaTimeCell({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        glassChip,
        'whitespace-nowrap border-teal-400/25 bg-teal-400/10 font-mono text-[11px] text-teal-700 dark:text-teal-300'
      )}
    >
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
      className={cn(
        glassCard,
        'flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: withAlpha(event.color || '#0d9488', 0.85),
      }}
      title={`${name}${procedure ? ` · ${procedure}` : ''}${dentist ? ` · ${dentist}` : ''}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dentistColor(clinic.dentist) }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{name}</span>
          <span className={cn(chipCls(chip.tone), 'shrink-0 font-semibold')}>{chip.label}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {[procedure, dentist].filter(Boolean).join(' · ') || 'Cita'}
        </p>
        {range ? (
          <p className="mt-1 text-xs font-mono tabular-nums text-teal-600 dark:text-teal-300">{range}</p>
        ) : null}
      </div>
    </div>
  );
}

/** es toolbar — Today / back / next plus the view switcher (C32 groundwork).
 *
 *  RESPONSIVE: the bar stacks into a column on phones and only becomes a
 *  single row from `sm` up. Inline it was a single `flex-wrap` line, so on a
 *  320–400px screen the switcher wrapped *under* the label and the row grew to
 *  two uneven lines that pushed the grid down. Every control also carries a
 *  40px touch target on coarse pointers (h-10 below `sm`, back to h-8 above)
 *  so `Mes/Semana/Día/Agenda` stay comfortably tappable. */
export function CalendarToolbar({ label, view, views, onNavigate, onView }: ToolbarProps<RbcEvent, object>) {
  const viewList = (Array.isArray(views) ? views : Object.keys(views)) as View[];
  // 40px (2.5rem) touch height on phones, 32px pill density from `sm` up.
  const touchCls = 'h-10 sm:h-8';
  const activeCls =
    `px-2.5 rounded-full border text-sm font-semibold shadow-sm transition-all ${touchCls} ` +
    'border-teal-500/60 bg-teal-500/20 text-teal-700 dark:text-teal-300';
  const idleCls =
    `px-2.5 rounded-full border text-sm font-medium transition-all ${touchCls} ` +
    'border-slate-300/80 bg-slate-100/60 text-slate-600 hover:bg-slate-200/70 ' +
    'dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/50';

  const navBtn = (which: 'TODAY' | 'PREV' | 'NEXT', aria: string) => (
    <button
      type="button"
      onClick={() => onNavigate(which)}
      aria-label={aria}
      className={cn(btnSecondary, 'rounded-full px-4', touchCls)}
    >
      {NAV_ICONS[which]}
    </button>
  );

  return (
    <div
      className={cn(
        glassBar,
        'flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center'
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onNavigate('TODAY')}
          className={cn(btnSecondary, 'rounded-full px-4', touchCls)}
        >
          Hoy
        </button>
        {navBtn('PREV', 'Anterior')}
        {navBtn('NEXT', 'Siguiente')}
      </div>
      {/* Month/year title ("septiembre 2026"). Never hidden: this surface is
          always dark, so it uses an unconditional light colour — the old
          `text-gray-700 dark:text-gray-200` fell back to dark grey on the dark
          shell whenever the `dark` class was not on an ancestor, which is what
          made the title look absent on narrow viewports. `flex-1` + centered
          below `sm`, left-aligned from `sm` up. */}
      <span className="px-1 text-center text-base font-semibold text-slate-100 flex-1 sm:text-left">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
        {viewList.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={v === view}
            className={v === view ? activeCls : idleCls}
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
  const today = isSameDay(date, new Date());
  return (
    <div className="flex items-center justify-center gap-1.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {format(date, 'EEEEEE', { locale: es })}
      </span>
      <span
        className={cn(
          'flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-sm font-semibold',
          today
            ? 'border border-teal-400/40 bg-teal-400/15 text-teal-200'
            : 'text-slate-700 dark:text-slate-200'
        )}
      >
        {format(date, 'd', { locale: es })}
      </span>
    </div>
  );
}

/** Month cell date header — day number with a today highlight. */
export function MonthDateHeader({ date }: DateHeaderProps) {
  const today = isSameDay(date, new Date());
  return (
    <div className="flex items-center justify-end px-1.5 py-1">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
          today
            ? 'border border-teal-400/40 bg-teal-400/15 font-bold text-teal-200'
            : 'text-slate-600 dark:text-slate-300'
        )}
      >
        {format(date, 'd', { locale: es })}
      </span>
    </div>
  );
}

/** Month view column header — WEEKDAY NAME ONLY, never a date.
 *  RBC's Month.js feeds this cell BOTH `label` (the weekday) and `date` (the
 *  first week's actual dates), so any component that prints `getDate()` here
 *  produces the phantom "31 1 2 3 4 5 6" row. This component can only ever
 *  render the weekday. */
export function MonthWeekdayHeader({ label }: HeaderProps) {
  return <span role="columnheader" aria-sort="none">{label}</span>;
}

export const calendarComponents: Components<RbcEvent, object> = {
  event: EventPill,
  toolbar: CalendarToolbar,
  header: WeekdayHeader,
  // `dateHeader` is the per-cell date number in month view (Month.js:112);
  // `header` is the weekday column bar (Month.js:255).
  // Calendar.js:310 does `defaults(components[view] || {}, omit(components, names),
  // {...})` — the FIRST object wins, so `components.month.*` takes PRIORITY over
  // the top-level `header`. (An earlier comment here claimed the reverse, which is
  // why the phantom date row was only guarded by a view comparison in RbcCalendar.)
  // Pinning `month.header` here makes "weekday name only" structural, so the month
  // bar can never print the first week's dates again.
  month: { dateHeader: MonthDateHeader, header: MonthWeekdayHeader },
  agenda: {
    event: AgendaEventCard,
    time: AgendaTimeCell,
    date: AgendaDateHeader,
  },
};