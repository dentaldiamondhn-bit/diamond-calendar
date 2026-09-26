import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Plus, X, Loader2, Clock, Check } from 'lucide-react';
import type { Reminder, EventReminder } from '@/lib/types-calendar';
import { reminderLabel } from '@/calendario/reminderLabel';
import {
  btnGhost,
  btnIcon,
  chipCls,
  glassBar,
  glassCard,
  glassDivider,
  glassRow,
} from '@/calendario/glass';
import { cn } from '@/lib/utils';

interface Props {
  reminders: Reminder[];
  eventReminders: EventReminder[];
  onAdd: (message: string, remind_at: string) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onDeleteEventReminder: (eventId: number, reminderId: number) => Promise<void>;
}

const EVENT_REM_DISMISS_KEY = 'cal-event-rem-dismissed';

function readDismissedEventReminders(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(EVENT_REM_DISMISS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDateTime(d: Date) {
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 >= 12 ? 'p. m.' : 'a. m.';
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${mm} ${suffix} · ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Build a *local-clock* Date from '<YYYY-MM-DD>' + '<HH:MM>'. */
function localDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map((n) => parseInt(n, 10));
  const [h, mi] = time.split(':').map((n) => parseInt(n, 10));
  return new Date(y || 0, (mo || 1) - 1, d || 1, h || 0, mi || 0);
}

interface EventRow {
  reminder: EventReminder;
  title: string;
  patient: string;
  at: Date;
}

export default function ReminderPanel({
  reminders,
  eventReminders,
  onAdd,
  onDismiss,
  onDelete,
  onDeleteEventReminder,
}: Props) {
  const [showInput, setShowInput] = useState(false);
  const [message, setMessage] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [dismissedEventReminders, setDismissedEventReminders] = useState<number[]>(
    readDismissedEventReminders
  );

  const now = new Date();

  const active = reminders.filter((r) => !r.dismissed);
  const overdue = active.filter((r) => new Date(r.remind_at).getTime() < now.getTime());
  const upcoming = active.filter((r) => new Date(r.remind_at).getTime() >= now.getTime());

  const dismissEventReminderLocally = (reminder: EventReminder) => {
    const next = dismissedEventReminders.includes(reminder.id)
      ? dismissedEventReminders
      : [...dismissedEventReminders, reminder.id];
    setDismissedEventReminders(next);
    try {
      localStorage.setItem(EVENT_REM_DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* storage full / disabled — dismissal still applies for this render */
    }
  };

  // Event reminders: real fire time = event start − minutes_before. Unlike citas
  // already over, reminders keep showing after they fire (so the user can see a
  // reminder was delivered) — fired ones render as overdue with an "Enviado" tag.
  const eventRows = eventReminders
    .filter((r) => r.event && r.minutes_before > 0 && r.event.status !== 'cancelled')
    .filter((r) => !dismissedEventReminders.includes(r.id))
    .map((r) => {
      const ev = r.event!;
      const start = localDateTime(ev.date, ev.start_time ?? '00:00');
      const end = localDateTime(ev.date, ev.end_time ?? ev.start_time ?? '00:00');
      return {
        reminder: r,
        title: ev.title || ev.patient_name || 'Cita',
        patient: ev.patient_name || '',
        at: new Date(start.getTime() - r.minutes_before * 60_000),
        ended: end.getTime() < now.getTime(),
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const eventFired = eventRows.filter((x) => x.at.getTime() < now.getTime());
  const eventUpcoming = eventRows.filter((x) => x.at.getTime() >= now.getTime());
  const overdueCount = overdue.length + eventFired.length;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !remindAt) return;
    setBusy(true);
    const iso = new Date(remindAt).toISOString();
    await onAdd(message.trim(), iso);
    setMessage('');
    setRemindAt('');
    setBusy(false);
    setShowInput(false);
  };

  const renderEventReminder = (row: EventRow, isOverdue: boolean) => (
    <div
      key={`ev-${row.reminder.id}`}
      className={cn(
        'group flex items-start gap-2 border-b px-4 py-2.5 last:border-b-0',
        glassDivider,
        glassRow,
        isOverdue && 'bg-rose-500/5'
      )}
    >
      <Bell size={14} className={cn('mt-0.5', isOverdue ? 'text-rose-400' : 'text-amber-400')} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', isOverdue ? 'text-rose-300' : 'text-slate-700 dark:text-slate-200')}>
          {row.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <span className={cn(chipCls(isOverdue ? 'rose' : 'amber'), 'font-normal')}>
            <Clock size={11} /> {reminderLabel(row.reminder.minutes_before)}
          </span>
          {row.patient ? <span className="truncate">{row.patient}</span> : null}
          <span>· {formatDateTime(row.at)}</span>
          {row.reminder.sent ? (
            <span className="inline-flex items-center gap-0.5 text-teal-500 dark:text-teal-300">
              <Check size={11} /> enviado
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => dismissEventReminderLocally(row.reminder)}
          className={cn(btnGhost, 'p-1 hover:text-teal-400')}
          title="Descartar recordatorio de la cita"
          aria-label="Descartar recordatorio de la cita"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => onDeleteEventReminder(row.reminder.event_id, row.reminder.id)}
          className={cn(btnGhost, 'p-1 hover:text-rose-400')}
          title="Quitar recordatorio de la cita"
          aria-label="Quitar recordatorio de la cita"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );

  const renderReminder = (r: Reminder, isOverdue: boolean) => (
    <div
      key={r.id}
      className={cn(
        'group flex items-start gap-2 border-b px-4 py-2.5 last:border-b-0',
        glassDivider,
        glassRow,
        isOverdue && 'bg-rose-500/5'
      )}
    >
      <Bell size={14} className={cn('mt-0.5', isOverdue ? 'text-rose-400' : 'text-amber-400')} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', isOverdue ? 'text-rose-300' : 'text-slate-700 dark:text-slate-200')}>
          {r.message}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Clock size={11} /> {formatDateTime(new Date(r.remind_at))}
        </p>
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => onDismiss(r.id)} className={cn(btnGhost, 'p-1 hover:text-teal-400')} title="Descartar" aria-label="Descartar">
          <Check size={14} />
        </button>
        <button onClick={() => onDelete(r.id)} className={cn(btnGhost, 'p-1 hover:text-rose-400')} title="Eliminar" aria-label="Eliminar">
          <X size={14} />
        </button>
      </div>
    </div>
  );

  const isEmpty = active.length === 0 && eventRows.length === 0;

  return (
    <div className={cn(glassCard, 'overflow-hidden')}>
      <div className={cn(glassBar, 'flex items-center justify-between p-4')}>
        <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
          <Bell size={18} className="text-amber-400" /> Recordatorios
          {overdueCount > 0 && (
            <span className="rounded-lg border border-rose-400/40 bg-rose-400/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
              {overdueCount}
            </span>
          )}
        </h3>
        <button onClick={() => setShowInput(!showInput)} className={cn(btnIcon, 'hover:text-amber-400')} aria-label="Nuevo recordatorio">
          <Plus size={18} />
        </button>
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAdd}
            className={cn(
              'overflow-hidden border-b px-4 py-3',
              glassDivider,
              'border-slate-200/70 bg-amber-500/5 dark:border-slate-800/70'
            )}
          >
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensaje del recordatorio..."
              autoFocus
              className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100"
            />
            <div className="mt-2 flex gap-2">
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={busy}
                className={cn(
                  'rounded-lg border border-amber-400/40 bg-amber-500/90 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50'
                )}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Fijar'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="max-h-[250px] overflow-y-auto">
        {isEmpty ? (
          <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
            No hay recordatorios activos.
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-600">
              Crea uno aquí o agrega un recordatorio a una cita para verlo en esta tarjeta.
            </span>
          </div>
        ) : (
          <>
            {eventFired.map((row) => renderEventReminder(row, true))}
            {overdue.map((r) => renderReminder(r, true))}
            {eventUpcoming.map((row) => renderEventReminder(row, false))}
            {upcoming.map((r) => renderReminder(r, false))}
          </>
        )}
      </div>
    </div>
  );
}
