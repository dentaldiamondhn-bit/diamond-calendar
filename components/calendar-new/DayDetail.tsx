import { motion } from 'framer-motion';
import { X, Clock, User, Stethoscope, Calendar as CalIcon, Plus, CopyPlus } from 'lucide-react';
import type { ClinicEvent } from '@/lib/types-calendar';
import { clinicDateKey, formatClock12 } from '@/calendario/timezone';

interface Props {
  dateStr: string | null;
  events: ClinicEvent[];
  onClose: () => void;
  onEditEvent: (event: ClinicEvent) => void;
  onDuplicate: (event: ClinicEvent) => void;
  onAddEvent: () => void;
}

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/**
 * "Próximos esta semana" preview — the current clinic-local week (today → Sunday)
 * listed day by day, so empty days still appear (e.g. "Hoy · sin citas") and
 * tomorrow's appointments are visible without selecting a date. Day labels use
 * hard-coded es-HN strings to stay deterministic on every ICU (C24).
 */
export default function DayDetail({ dateStr, events, onClose, onEditEvent, onDuplicate, onAddEvent }: Props) {
  const todayKey = clinicDateKey();
  const today = parseDay(todayKey);

  // Build the [todayKey … Sunday] window of the current week.
  const days: string[] = [];
  const cursor = new Date(today);
  while (cursor.getDay() !== 0) {
    days.push(clinicDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  days.push(clinicDateKey(cursor)); // Sunday

  const byDay = new Map<string, ClinicEvent[]>();
  for (const key of days) byDay.set(key, []);
  for (const e of events) {
    if (e.date && byDay.has(e.date)) {
      const list = byDay.get(e.date);
      if (list) list.push(e);
    }
  }

  const total = days.reduce((n, key) => n + (byDay.get(key)?.length ?? 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <CalIcon size={18} className="text-teal-500" /> Próximos esta semana
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {todayKey}
            {total === 0 ? ' · sin citas' : ` · ${total} cita${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        {dateStr && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
        {days.map((key) => {
          const dayEvents = (byDay.get(key) ?? []).sort((a, b) =>
            (a.start_time || '00:00').localeCompare(b.start_time || '00:00')
          );
          const d = parseDay(key);
          const isToday = key === todayKey;
          const isSelected = key === dateStr;
          const label = `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
          const cancelled = dayEvents.filter((e) => e.status === 'cancelled').length;

          return (
            <div key={key} className={`px-4 py-3 ${isSelected ? 'bg-teal-50/60 dark:bg-teal-500/10' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isToday ? `Hoy · ${label}` : label}
                </p>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {dayEvents.length === 0
                    ? 'Sin citas'
                    : `${dayEvents.length - cancelled} cita${dayEvents.length - cancelled !== 1 ? 's' : ''}${cancelled ? ` + ${cancelled} cancelada${cancelled > 1 ? 's' : ''}` : ''}`}
                </span>
              </div>

              {dayEvents.length === 0 ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-300 dark:text-gray-600">Libre</p>
                  <button
                    onClick={onAddEvent}
                    className="text-xs text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-500/10 font-medium px-2 py-1 rounded-lg transition flex items-center gap-1"
                  >
                    <Plus size={12} /> Agendar
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {dayEvents.map((e) => (
                    <div key={e.id} className="relative">
                      <button
                        onClick={() => onEditEvent(e)}
                        className={`w-full text-left flex gap-3 px-3 py-2 pr-12 rounded-lg border transition ${
                          e.status === 'cancelled'
                            ? 'opacity-60 border-red-100 dark:border-red-900/40 hover:bg-red-50/40 dark:hover:bg-red-500/10'
                            : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Clock size={13} className="text-gray-400" />
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              {formatClock12(e.start_time)} – {formatClock12(e.end_time || e.start_time)}
                            </span>
                            {e.status === 'cancelled' && (
                              <span className="text-[10px] font-semibold uppercase text-red-500 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded">
                                Cancelada
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mt-0.5 truncate">
                            {e.patient_name}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Stethoscope size={11} /> {e.procedure}
                            </span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <User size={11} /> {e.dentist}
                            </span>
                          </div>
                          {e.notes && <p className="text-xs text-gray-400 mt-1 italic truncate">{e.notes}</p>}
                        </div>
                      </button>
                      <button
                        onClick={() => onDuplicate(e)}
                        title="Duplicar cita"
                        aria-label="Duplicar cita"
                        className="absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-500/10 transition"
                      >
                        <CopyPlus size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}