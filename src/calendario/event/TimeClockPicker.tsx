'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatClock12 } from '@/calendario/timezone';

/**
 * Material-style radial clock popover for `Inicio`/`Fin`.
 *
 * Trigger is a button styled like the shared inputs showing the current time
 * in es-HN 12h (`11:30 a. m.`). Clicking opens a centered, portal-mounted
 * dialog (z-[70], above the EventModal backdrop) with:
 *   - a digital HH:MM header (Hours/Minutes mode blocks),
 *   - an AM/PM segmented toggle,
 *   - a radial analog dial with click/drag snapping to 12 positions,
 *   - a keyboard icon to switch to typed entry,
 *   - Cancelar / Aceptar footer actions.
 *
 * Emits 24h `HH:MM` so the Zod schema + DB stay untouched. When `minTime` is
 * set (used for `Fin`), markers that would land at-or-before `minTime` are
 * disabled so the end time can never precede the start.
 */
export function TimeClockPicker({
  value,
  onChange,
  invalid,
  minTime,
  id,
  'aria-label': ariaLabel,
}: {
  value?: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  /** Fin-only: times at-or-before this `HH:mm` are disabled in the dial. */
  minTime?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
  const [typed, setTyped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Draft state is (re)seeded from the committed value each time the popover opens.
  const [draft, setDraft] = useState(() => split24(value));
  const committed = () => compose(draft.hour12, draft.minute, draft.period);

  useEffect(() => {
    if (!open) return;
    setDraft(split24(value));
    setMode('hours');
    setTyped(false);
  }, [open, value]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'INPUT') accept();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const accept = () => {
    onChange(committed());
    setOpen(false);
  };

  const candidateTime = (hour12: number, minute: number, period: 'am' | 'pm') =>
    compose(hour12, minute, period);

  const isDisabled = (hour12: number, minute: number, period: 'am' | 'pm') =>
    !!minTime && candidateTime(hour12, minute, period) <= minTime;

  /** Map a pointer position (relative to the SVG center) to the nearest of 12 dial slots. */
  const slotFromPoint = (e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = rect.top + rect.height / 2 - e.clientY; // y axis points up
    const deg = (Math.atan2(dx, dy) * 180) / Math.PI; // -180..180, 0 = 12 o'clock
    return (((Math.round(deg / 30) % 12) + 12) % 12) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  };

  const selectSlot = (slot: number) => {
    if (mode === 'hours') {
      const nextHour = slot === 0 ? 12 : slot;
      if (isDisabled(nextHour, draft.minute, draft.period)) return;
      setDraft((d) => ({ ...d, hour12: nextHour }));
    } else {
      const nextMinute = slot * 5;
      if (isDisabled(draft.hour12, nextMinute, draft.period)) return;
      setDraft((d) => ({ ...d, minute: nextMinute }));
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const slot = slotFromPoint(e.nativeEvent);
    if (slot === null) return;
    selectSlot(slot);
    setDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const slot = slotFromPoint(e.nativeEvent);
    if (slot !== null) selectSlot(slot);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    // Material auto-advances hours → minutes once an hour is picked.
    if (mode === 'hours') setMode('minutes');
  };

  // Current selection as a dial slot index (0 = 12 o'clock) — used for the hand.
  const handPointer = mode === 'hours'
    ? (draft.hour12 === 12 ? 0 : draft.hour12)
    : Math.round(draft.minute / 5) % 12;

  return (
    <>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer',
          'bg-white border-gray-200 text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100',
          'hover:border-teal-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/40 outline-none transition-colors',
          invalid && 'border-rose-300 dark:border-rose-700'
        )}
      >
        <span className="font-medium tabular-nums">{formatClock12(value)}</span>
        <Clock size={16} className="text-gray-400 dark:text-gray-500 shrink-0" />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              onMouseDown={() => close()}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                onMouseDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel || 'Selector de hora'}
                className={cn(
                  'rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden',
                  typed ? 'w-[22rem]' : 'w-[19rem]'
                )}
              >
                {/* digital display + AM/PM segmented toggle — hidden in Teclado mode (typed inputs carry the state) */}
                {!typed && (
                  <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                    <div className="flex items-baseline gap-1 tabular-nums" role="group" aria-label="Hora y minuto">
                      <button
                        type="button"
                        onClick={() => setMode('hours')}
                        className={cn(
                          'px-2 py-1 rounded-lg text-3xl font-bold transition-colors',
                          mode === 'hours'
                            ? 'text-teal-700 dark:text-teal-300'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        )}
                      >
                        {String(draft.hour12).padStart(2, '0')}
                      </button>
                      <span className="text-3xl font-bold text-gray-300 dark:text-gray-600 select-none">:</span>
                      <button
                        type="button"
                        onClick={() => setMode('minutes')}
                        className={cn(
                          'px-2 py-1 rounded-lg text-3xl font-bold transition-colors',
                          mode === 'minutes'
                            ? 'text-teal-700 dark:text-teal-300'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        )}
                      >
                        {String(draft.minute).padStart(2, '0')}
                      </button>
                    </div>

                    <div
                      role="group"
                      aria-label="Período"
                      className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-sm font-medium"
                    >
                      {(['am', 'pm'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, period: p }))}
                          className={cn(
                            'px-3 py-2 transition-colors',
                            draft.period === p
                              ? 'bg-teal-600 text-white'
                              : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                          )}
                        >
                          {p === 'am' ? 'a. m.' : 'p. m.'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* body: typed entry XOR analog dial */}
                <div className={cn('pb-2', typed ? 'px-6' : 'px-5')}>
                  {typed ? (
                    <TypedEntry
                      hour12={draft.hour12}
                      minute={draft.minute}
                      period={draft.period}
                      minTime={minTime}
                      onHour={(h) => setDraft((d) => ({ ...d, hour12: h }))}
                      onMinute={(m) => setDraft((d) => ({ ...d, minute: m }))}
                      onPeriod={(p) => setDraft((d) => ({ ...d, period: p }))}
                    />
                  ) : (
                    <AnalogDial
                      svgRef={svgRef}
                      mode={mode}
                      draft={draft}
                      handPointer={handPointer}
                      isDisabled={isDisabled}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      endDrag={endDrag}
                    />
                  )}
                </div>

                {/* footer */}
                <div className="px-3 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setTyped((t) => !t)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors',
                      typed
                        ? 'bg-teal-600 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                    aria-label={typed ? 'Usar reloj' : 'Escribir la hora'}
                    title={typed ? 'Reloj' : 'Teclado'}
                  >
                    <Keyboard size={14} />
                    <span className="hidden sm:inline">{typed ? 'Reloj' : 'Teclado'}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={close}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={accept}
                      className="px-5 py-1.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                    >
                      Aceptar
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------- geometry

const RING_RADIUS = 96; // labels sit on this radius
const HAND_RADIUS = 70; // the drawn hand is a bit shorter

/** Hour labels (12 at top, clockwise 1..11). */
const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** Minute labels in 5-min ticks, 12 → 00. */
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** Center-relative (x,y) for a dial slot index (0 = 12 o'clock, clockwise). */
function dialPoint(slot: number, radius: number): { x: number; y: number } {
  const deg = slot * 30;
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

// ---------------------------------------------------------------- helpers

function compose(hour12: number, minute: number, period: 'am' | 'pm'): string {
  const h = hour12 % 12; // 12 → 0
  const h24 = period === 'am' ? h : h + 12;
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function split24(value?: string | null): { hour12: number; minute: number; period: 'am' | 'pm' } {
  const [h = '07', m = '00'] = (value ?? '').split(':');
  const h24 = Math.min(23, Math.max(0, Number(h) || 0));
  const minute = Math.min(59, Math.max(0, Number(m) || 0));
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, period: h24 >= 12 ? 'pm' : 'am' };
}

function TypedEntry({
  hour12,
  minute,
  period,
  minTime,
  onHour,
  onMinute,
  onPeriod,
}: {
  hour12: number;
  minute: number;
  period: 'am' | 'pm';
  minTime?: string;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
  onPeriod: (p: 'am' | 'pm') => void;
}) {
  const [hText, setHText] = useState(String(hour12));
  const [mText, setMText] = useState(String(minute).padStart(2, '0'));

  const onHChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setHText(digits);
    // Keep the parent draft in sync on every keystroke so Aceptar commits live values.
    const n = Math.max(1, Math.min(12, parseInt(digits, 10) || 1));
    onHour(n);
  };
  const onMChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setMText(digits);
    const n = Math.max(0, Math.min(59, parseInt(digits, 10) || 0));
    onMinute(n);
  };

  const invalid = !!minTime && compose(hour12, minute, period) <= minTime;

  return (
    <div className="flex items-center justify-center gap-2 py-6">
      <input
        inputMode="numeric"
        value={hText}
        onChange={(e) => onHChange(e.target.value)}
        onBlur={() => setHText(String(Math.max(1, Math.min(12, parseInt(hText, 10) || 1))))}
        aria-label="Hora"
        className="w-24 h-20 px-3 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center text-5xl font-bold tabular-nums text-gray-800 dark:text-gray-100 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/40"
      />
      <span className="text-4xl font-bold text-gray-300 dark:text-gray-600 select-none">:</span>
      <input
        inputMode="numeric"
        value={mText}
        onChange={(e) => onMChange(e.target.value)}
        onBlur={() => setMText(String(Math.max(0, Math.min(59, parseInt(mText, 10) || 0))).padStart(2, '0'))}
        aria-label="Minuto"
        className="w-24 h-20 px-3 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center text-5xl font-bold tabular-nums text-gray-800 dark:text-gray-100 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/40"
      />
      <div className="flex h-20 min-w-[64px] flex-col justify-between rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-sm font-medium ml-2">
        {(['am', 'pm'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriod(p)}
            className={cn(
              'flex-1 whitespace-nowrap px-3 text-center transition-colors',
              period === p
                ? 'bg-teal-600 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            {p === 'am' ? 'a. m.' : 'p. m.'}
          </button>
        ))}
      </div>
      {invalid && (
        <p className="sr-only">La hora de fin debe ser posterior a la de inicio.</p>
      )}
    </div>
  );
}

function AnalogDial({
  svgRef,
  mode,
  draft,
  handPointer,
  isDisabled,
  onPointerDown,
  onPointerMove,
  endDrag,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  mode: 'hours' | 'minutes';
  draft: { hour12: number; minute: number; period: 'am' | 'pm' };
  handPointer: number;
  isDisabled: (hour12: number, minute: number, period: 'am' | 'pm') => boolean;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  endDrag: () => void;
}) {
  const labels = mode === 'hours' ? HOUR_LABELS : MINUTE_LABELS;
  const markers = labels.map((label, slot) => {
    const isHour = mode === 'hours';
    const hour12 = isHour ? (label === 12 ? 12 : label) : draft.hour12;
    const minute = isHour ? draft.minute : label;
    const active = isHour ? draft.hour12 === label : draft.minute === label;
    const disabled = isDisabled(hour12, minute, draft.period);
    const p = dialPoint(slot, RING_RADIUS);
    return { slot, label, active, disabled, p };
  });

  const hand = dialPoint(handPointer, HAND_RADIUS);

  return (
    <div className="flex justify-center py-1">
      <svg
        ref={svgRef}
        viewBox="-122 -122 244 244"
        className="w-56 h-56 touch-none select-none cursor-pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={mode === 'hours' ? 'Reloj de horas' : 'Reloj de minutos'}
      >
        {/* dial face — single background track, no per-number outlines */}
        <circle r={RING_RADIUS + 18} fill="currentColor" fillOpacity="0.06" />

        {/* radial hand */}
        <line
          x1={0}
          y1={0}
          x2={hand.x}
          y2={hand.y}
          stroke="#0d9488"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle r="5" fill="#0d9488" />

        {markers.map(({ slot, label, active, disabled, p }) => (
          <g
            key={slot}
            pointerEvents={disabled ? 'none' : 'all'}
            opacity={disabled ? 0.35 : 1}
          >
            {active && <circle cx={p.x} cy={p.y} r={22} fill="#0d9488" />}
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={active ? 20 : 18}
              fontWeight={active ? 700 : 500}
              fill={active ? '#ffffff' : 'currentColor'}
              className="tabular-nums select-none"
            >
              {String(label).padStart(2, '0')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}