import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Plus, X, Loader2, Clock, Check } from 'lucide-react';
import type { Reminder, EventReminder } from '@/lib/types-calendar';
import { reminderLabel } from '@/calendario/reminderLabel';

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
      className={`flex items-start gap-2 px-4 py-2.5 border-b border-gray-50 group hover:bg-gray-50 transition ${
        isOverdue ? 'bg-rose-50' : ''
      }`}
    >
      <Bell size={14} className={`mt-0.5 ${isOverdue ? 'text-rose-500' : 'text-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isOverdue ? 'text-rose-700' : 'text-gray-700'}`}>{row.title}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
          <Clock size={11} /> {reminderLabel(row.reminder.minutes_before)}
          {row.patient ? ` · ${row.patient}` : ''} · {formatDateTime(row.at)}
          {row.reminder.sent && (
            <span className="inline-flex items-center gap-0.5 text-teal-600">
              <Check size={11} /> enviado
            </span>
          )}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => dismissEventReminderLocally(row.reminder)}
          className="text-gray-400 hover:text-teal-500 p-1"
          title="Descartar recordatorio de la cita"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => onDeleteEventReminder(row.reminder.event_id, row.reminder.id)}
          className="text-gray-400 hover:text-rose-500 p-1"
          title="Quitar recordatorio de la cita"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );

  const renderReminder = (r: Reminder, isOverdue: boolean) => (
    <div
      key={r.id}
      className={`flex items-start gap-2 px-4 py-2.5 border-b border-gray-50 group hover:bg-gray-50 transition ${
        isOverdue ? 'bg-rose-50' : ''
      }`}
    >
      <Bell size={14} className={`mt-0.5 ${isOverdue ? 'text-rose-500' : 'text-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isOverdue ? 'text-rose-700' : 'text-gray-700'}`}>{r.message}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
          <Clock size={11} /> {formatDateTime(new Date(r.remind_at))}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={() => onDismiss(r.id)} className="text-gray-400 hover:text-teal-500 p-1" title="Descartar">
          <Check size={14} />
        </button>
        <button onClick={() => onDelete(r.id)} className="text-gray-400 hover:text-rose-500 p-1" title="Eliminar">
          <X size={14} />
        </button>
      </div>
    </div>
  );

  const isEmpty = active.length === 0 && eventRows.length === 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Bell size={18} className="text-amber-500" /> Recordatorios
          {overdueCount > 0 && (
            <span className="bg-rose-500 text-white text-xs rounded-full px-2 py-0.5">{overdueCount}</span>
          )}
        </h3>
        <button onClick={() => setShowInput(!showInput)} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg transition">
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
            className="px-4 py-3 border-b border-gray-50 bg-amber-50 overflow-hidden"
          >
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensaje del recordatorio..."
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-amber-500 outline-none text-sm"
            />
            <div className="flex gap-2 mt-2">
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-amber-500 outline-none text-sm"
              />
              <button type="submit" disabled={busy} className="bg-amber-500 text-white px-3 rounded-lg text-sm disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Fijar'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="max-h-[250px] overflow-y-auto">
        {isEmpty ? (
          <div className="p-6 text-center text-sm text-gray-400">
            No hay recordatorios activos.
            <span className="block text-xs text-gray-300 mt-1">
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