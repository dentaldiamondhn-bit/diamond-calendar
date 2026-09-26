import { motion } from 'framer-motion';
import { X, Clock, User, Stethoscope, Calendar as CalIcon, Plus, CopyPlus } from 'lucide-react';
import type { ClinicEvent } from '@/lib/types-calendar';
import { clinicDateKey, formatClock12 } from '@/calendario/timezone';
import { withAlpha } from '@/calendario/eventTint';
import {
  STATUS_CHIP,
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
      className={cn(glassCard, 'w-full overflow-hidden')}
    >
      <div className={cn(glassBar, 'flex items-center justify-between p-4')}>
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <CalIcon size={18} className="text-teal-500" /> Próximos esta semana
          </h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {todayKey}
            {total === 0 ? ' · sin citas' : ` · ${total} cita${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        {dateStr && (
          <button onClick={onClose} className={btnIcon} aria-label="Cerrar">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
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
            <div
              key={key}
              className={cn(
                'px-4 py-3',
                glassDivider,
                'border-b last:border-b-0',
                isSelected && 'bg-teal-400/10'
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <p
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    isToday ? 'text-teal-600 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500'
                  )}
                >
                  {isToday ? `Hoy · ${label}` : label}
                </p>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {dayEvents.length === 0
                    ? 'Sin citas'
                    : `${dayEvents.length - cancelled} cita${dayEvents.length - cancelled !== 1 ? 's' : ''}${cancelled ? ` + ${cancelled} cancelada${cancelled > 1 ? 's' : ''}` : ''}`}
                </span>
              </div>

              {dayEvents.length === 0 ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-300 dark:text-slate-600">Libre</p>
                  <button onClick={onAddEvent} className={cn(btnGhost, 'text-[11px] text-teal-600 dark:text-teal-300')}>
                    <Plus size={12} /> Agendar
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {dayEvents.map((e) => {
                    const chip =
                      STATUS_CHIP[(e.status ?? 'scheduled') as keyof typeof STATUS_CHIP] ?? STATUS_CHIP.scheduled;
                    return (
                      <div key={e.id} className="relative">
                        <button
                          onClick={() => onEditEvent(e)}
                          className={cn(
                            'flex w-full gap-3 rounded-lg border px-3 py-2 pr-12 text-left',
                            glassRow,
                            e.status === 'cancelled'
                              ? 'border-rose-500/30 bg-rose-500/5 opacity-60 hover:bg-rose-500/10'
                              : 'border-slate-200/70 dark:border-slate-700/50'
                          )}
                        >
                          <span
                            className="w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: withAlpha(e.color, 0.85) }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <Clock size={13} className="text-slate-400" />
                              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {formatClock12(e.start_time)} – {formatClock12(e.end_time || e.start_time)}
                              </span>
                              {e.status === 'cancelled' ? (
                                <span className={cn(chipCls(chip.tone), 'font-semibold uppercase')}>
                                  {chip.label}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {e.patient_name}
                            </span>
                            <span className="mt-1 flex items-center gap-3">
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <Stethoscope size={11} /> {e.procedure}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <User size={11} /> {e.dentist}
                              </span>
                            </span>
                            {e.notes ? (
                              <span className="mt-1 block truncate text-xs italic text-slate-400">{e.notes}</span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          onClick={() => onDuplicate(e)}
                          title="Duplicar cita"
                          aria-label="Duplicar cita"
                          className={cn(
                            'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg',
                            'text-slate-400 transition-colors hover:bg-teal-400/15 hover:text-teal-500'
                          )}
                        >
                          <CopyPlus size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
