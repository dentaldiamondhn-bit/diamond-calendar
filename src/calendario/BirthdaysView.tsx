'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, Search, X, Clock, Phone, Bell, Check, Loader2, ChevronDown } from 'lucide-react';
import type { ClinicEvent } from '@/lib/types-calendar';
import { clinicDateKey, CLINIC_TIME_ZONE } from '@/calendario/timezone';
import {
  buildBirthdayWhatsAppMessage,
  ACTIVE_BIRTHDAY_PROMO,
  promoPayload,
} from '@/calendario/birthdayTemplates';
import { createWhatsAppUrl, formatPhoneDisplay } from '@/utils/phoneUtils';
import { chipCls, glassCard, glassBar, glassChip, btnSecondary, btnGhost, btnPrimary } from '@/calendario/glass';
import { cn } from '@/lib/utils';

/** Clinic-local month key (YYYY-MM). */
function monthKey(date: Date): string {
  return clinicDateKey(date).slice(0, 7);
}

/** es-HN short weekday + day for a date key (e.g. "Sáb 21 Nov"). */
function shortEsHN(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const wd = new Date(Date.UTC(y, mo, d)).getUTCDay();
  const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${WEEKDAYS_SHORT[wd]} ${d} ${MONTHS_SHORT[mo]}`;
}

/** Validate a patient phone: must exist, have >=8 digits, and not be a repeated dummy pattern. */
function isValidPhone(phone?: string, countryCode?: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return false;
  // Reject obvious dummy/repeated patterns
  const repeated = /^(\d)\1{7,}$/;
  if (repeated.test(digits)) return false;
  return true;
}

interface Props {
  /** Projected DOB events for the selected month (from useDobEvents). */
  dobEvents: ClinicEvent[];
  /** Currently selected month key (YYYY-MM). */
  monthKey: string;
  /** Callback to open EventModal pre-filled with patient details. */
  onScheduleCita: (event: ClinicEvent) => void;
}

export default function BirthdaysView({ dobEvents, monthKey: selectedMonthKey, onScheduleCita }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const [includePromo, setIncludePromo] = useState(ACTIVE_BIRTHDAY_PROMO.enabledByDefault);
  const [sending, setSending] = useState<Set<string | number>>(new Set());
  const [collapsedPast, setCollapsedPast] = useState(true);

  const todayKey = clinicDateKey();
  const isCurrentMonth = selectedMonthKey === todayKey.slice(0, 7);

  // Group DOB events by date within the selected month.
  const byDate = useMemo(() => {
    const map = new Map<string, ClinicEvent[]>();
    for (const ev of dobEvents) {
      if (!ev.date || !ev.date.startsWith(selectedMonthKey)) continue;
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [dobEvents, selectedMonthKey]);

  const sortedDates = useMemo(
    () => [...byDate.keys()].sort(),
    [byDate],
  );

  // Partition dates: hoy, próximos (future within month), pasados (past within month).
  const hoyDate = todayKey.slice(0, 7) === selectedMonthKey ? todayKey : null;
  const hoyEvents = hoyDate ? (byDate.get(hoyDate) ?? []) : [];
  const proximosDates = useMemo(
    () => sortedDates.filter((d) => d > todayKey),
    [sortedDates, todayKey],
  );
  const pasadosDates = useMemo(
    () => sortedDates.filter((d) => d < todayKey),
    [sortedDates, todayKey],
  );

  // Filter + search (applies across all sections).
  const q = searchQuery.toLowerCase().trim();
  const pendingOnly = filter === 'pending';
  const visibleByDate = useMemo(() => {
    const map = new Map<string, ClinicEvent[]>();
    for (const [dateKey, events] of byDate) {
      const filtered = events.filter((ev) => {
        if (pendingOnly && ev.notes === 'Ya felicitado este año') return false;
        if (q && !ev.patient_name.toLowerCase().includes(q)) return false;
        return true;
      });
      if (filtered.length > 0) map.set(dateKey, filtered);
    }
    return map;
  }, [byDate, q, pendingOnly]);

  const totalPending = useMemo(() => {
    let n = 0;
    for (const ev of dobEvents) {
      if (!ev.date || !ev.date.startsWith(selectedMonthKey)) continue;
      if (ev.notes !== 'Ya felicitado este año') n += 1;
    }
    return n;
  }, [dobEvents, selectedMonthKey]);

  const visibleCount = useMemo(() => {
    let n = 0;
    for (const events of visibleByDate.values()) n += events.length;
    return n;
  }, [visibleByDate]);

  const handleSendWish = useCallback(
    async (event: ClinicEvent) => {
      if (!isValidPhone(event.phone, event.phone_country)) return;
      setSending((prev) => new Set([...prev, event.id]));
      try {
        const message = buildBirthdayWhatsAppMessage({
          patientName: event.patient_name,
          includePromo,
          promoConfig: ACTIVE_BIRTHDAY_PROMO,
        });
        const wishBody: Record<string, unknown> = {
          patient_id: event.patient_id,
          wish_year: new Date(event.date).getFullYear(),
          channel: 'whatsapp',
          message_template: 'birthday_greeting',
          ...promoPayload(ACTIVE_BIRTHDAY_PROMO, includePromo),
        };
        const res = await fetch('/api/birthday-wishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wishBody),
        });
        if (res.status === 409) {
          // Already wished this year — still open WhatsApp.
          window.open(createWhatsAppUrl(event.phone, message), '_blank');
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        window.open(createWhatsAppUrl(event.phone, message), '_blank');
      } catch (err) {
        console.error('[BirthdaysView] birthday wish failed', err);
      } finally {
        setSending((prev) => {
          const next = new Set(prev);
          next.delete(event.id);
          return next;
        });
      }
    },
    [includePromo],
  );

  const isAlreadyWished = (ev: ClinicEvent) => ev.notes === 'Ya felicitado este año';

  const isInvalidPhone = (ev: ClinicEvent) => !isValidPhone(ev.phone, ev.phone_country);

  const renderDateSection = (dateKey: string, label: string, sectionClass: string) => {
    const dayEvents = (visibleByDate.get(dateKey) ?? []).sort(
      (a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''),
    );
    if (dayEvents.length === 0) return null;
    const isToday = dateKey === todayKey;
    return (
      <section key={dateKey} className={cn('mb-4', sectionClass)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                isToday ? 'text-teal-600 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {isToday ? `Hoy · ${label}` : label}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          {dayEvents.map((ev) => {
            const wished = isAlreadyWished(ev);
            const ageMatch = ev.description?.match(/(\d+) años/);
            const age = ageMatch ? Number(ageMatch[1]) : 0;
            const badPhone = isInvalidPhone(ev);
            return (
              <div
                key={ev.id}
                className={cn(
                  glassCard,
                  'flex items-center justify-between gap-3 p-3',
                  wished
                    ? 'border-slate-200/40 bg-slate-50/50 dark:border-slate-700/30 dark:bg-slate-900/30'
                    : 'border-slate-200/70 bg-white/85 dark:border-slate-700/50 dark:bg-slate-900/60',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="h-8 w-8 shrink-0 rounded-full ring-1 ring-white/40 flex items-center justify-center text-lg"
                    style={{ backgroundColor: '#ec4899' }}
                    aria-hidden="true"
                  >
                    🎂
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {ev.patient_name}
                      </span>
                      <span className={chipCls('teal', 'text-[10px] font-semibold')}>
                        Cumple {age} años
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {badPhone ? (
                        <span className="flex items-center gap-1">
                          <span className="text-[10px] text-rose-500 dark:text-rose-400 font-medium">
                            Teléfono pendiente
                          </span>
                        </span>
                      ) : (
                        formatPhoneDisplay(ev.phone || '', ev.phone_country || '504')
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      chipCls(wished ? 'emerald' : 'rose', 'text-[10px] font-semibold'),
                      wished
                        ? 'bg-emerald-50/60 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                        : 'bg-rose-50/60 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
                    )}
                  >
                    {wished ? '✓ Felicitado' : 'Pendiente'}
                  </span>
                  {ev.phone && !badPhone && (
                    <button
                      onClick={() => handleSendWish(ev)}
                      disabled={sending.has(ev.id) || wished}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        wished
                          ? 'border-slate-500/30 bg-slate-100/60 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed'
                          : 'border-teal-500/30 bg-teal-400/10 text-teal-700 hover:bg-teal-400/20 dark:text-teal-300 dark:hover:bg-teal-400/15 disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      {sending.has(ev.id) ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : wished ? (
                        <>
                          <Check size={12} /> Reenviar
                        </>
                      ) : (
                        <>
                          <Bell size={12} /> Felicitación
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => onScheduleCita(ev)}
                    className={cn(
                      btnGhost,
                      'px-2.5 py-1 text-[10px] text-teal-600 hover:bg-teal-400/15 dark:text-teal-300',
                    )}
                  >
                    <CalendarDays size={12} /> Agendar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Header: search + filters only (month navigation handled by CalendarShell toolbar). */}
      <div className={cn(glassBar, 'flex-none flex items-center justify-between gap-2 p-3 sm:p-4')}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar paciente…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 sm:w-64 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/60 text-slate-800 dark:text-slate-100 text-sm focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 outline-none"
            />
            <button
              onClick={() => setFilter(filter === 'all' ? 'pending' : 'all')}
              className={cn(
                btnSecondary,
                filter === 'pending' && 'bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/60',
                'px-3 py-2 text-xs'
              )}
            >
              {filter === 'pending' ? `Ver todas (${visibleCount})` : `Pendientes (${totalPending})`}
            </button>
            <button
              onClick={() => setIncludePromo((v) => !v)}
              className={cn(
                btnSecondary,
                includePromo && 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/60',
                'px-3 py-2 text-xs',
              )}
            >
              {includePromo ? '🎁 Incluir regalo' : '🎁 Sin regalo'}
            </button>
          </div>
        </div>
      </div>

      {/* Body: scrollable list of birthday rows. */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto p-3 sm:p-4">
        {sortedDates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="text-slate-400 dark:text-slate-500 text-sm">
              No hay cumpleaños este mes.
            </span>
          </div>
        ) : (
          <>
            {/* Hoy — highlighted at the top when viewing the current month. */}
            {isCurrentMonth && hoyEvents.length > 0 && renderDateSection(todayKey!, 'Hoy', 'mb-6')}

            {/* Próximos este mes — chronological from tomorrow through end of month. */}
            {proximosDates.length > 0 && (
              <>
                <div className="mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Próximos este mes
                  </span>
                </div>
                {proximosDates.map((dateKey) => renderDateSection(dateKey, shortEsHN(dateKey), 'mb-4'))}
              </>
            )}

            {/* Pasados este mes — collapsed by default behind a toggle header. */}
            {pasadosDates.length > 0 && (
              <>
                <button
                  onClick={() => setCollapsedPast((v) => !v)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                >
                  <span>
                    Pasados este mes ({pasadosDates.reduce((n, d) => n + (visibleByDate.get(d)?.length ?? 0), 0)})
                  </span>
                  <ChevronDown size={14} className={cn('transition-transform', collapsedPast ? '' : 'rotate-180')} />
                </button>
                {!collapsedPast && (
                  <div className="space-y-1 mt-2">
                    {pasadosDates.map((dateKey) => renderDateSection(dateKey, shortEsHN(dateKey), 'mb-4'))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
