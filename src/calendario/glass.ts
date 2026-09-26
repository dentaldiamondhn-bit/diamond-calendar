import type { EventPriority, EventStatus } from '@/calendario/event/eventSchema';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/calendario/event/eventSchema';
import { cn } from '@/lib/utils';

/**
 * "Tinted glassmorphism" tokens for the whole /calendario surface.
 *
 * Every panel, chip and action button on the route composes these instead of
 * repeating raw Tailwind, so the calendar, its side panels, the modal and the
 * drawer read as one system. Dark mode is the primary target (translucent
 * slate surfaces + teal accents); light mode keeps the same geometry with
 * neutral tints.
 */

/** Translucent card surface — side panels, the calendar shell, list cards. */
export const glassCard =
  'rounded-2xl border border-slate-200/80 bg-white/85 shadow-sm dark:border-slate-700/50 dark:bg-slate-900/60 dark:backdrop-blur-xl';

/** Elevated surface — modal, drawer, dialogs (deeper blur + shadow). */
export const glassOverlay =
  'rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/20 dark:border-slate-700/60 dark:bg-slate-950/85 dark:backdrop-blur-2xl dark:shadow-slate-950/60';

/** Sticky sub-header inside a glass surface. */
export const glassBar =
  'border-b border-slate-200/70 bg-white/60 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/40';

/** Hairline divider that keeps the tinted look (never solid gray-200). */
export const glassDivider = 'border-slate-200/70 dark:border-slate-800/70';

/** Hoverable row inside a list surface. */
export const glassRow = 'transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800/40';

/** Chip shell — translucent fill + matching hairline border, squircle geometry. */
export const glassChip =
  'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium leading-tight backdrop-blur-sm';

export type GlassTone = 'slate' | 'blue' | 'teal' | 'emerald' | 'amber' | 'rose' | 'violet';

export const CHIP_TONE: Record<GlassTone, string> = {
  slate: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:text-blue-300',
  teal: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/30 dark:text-teal-300',
  emerald:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:text-amber-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/30 dark:text-violet-300',
};

/** Full chip class list for a tone. */
export function chipCls(tone: GlassTone, extra?: string): string {
  return cn(glassChip, CHIP_TONE[tone], extra);
}

/** Status pill — single source of truth for calendar, agenda, modal, drawer. */
export const STATUS_CHIP: Record<EventStatus, { label: string; tone: GlassTone }> = {
  scheduled: { label: STATUS_LABELS.scheduled, tone: 'blue' },
  confirmed: { label: STATUS_LABELS.confirmed, tone: 'teal' },
  cancelled: { label: STATUS_LABELS.cancelled, tone: 'rose' },
  completed: { label: STATUS_LABELS.completed, tone: 'emerald' },
};

/** Priority pill — shared by the modal, the drawer and the task panel. */
export const PRIORITY_CHIP: Record<EventPriority, { label: string; tone: GlassTone }> = {
  low: { label: PRIORITY_LABELS.low, tone: 'slate' },
  medium: { label: PRIORITY_LABELS.medium, tone: 'amber' },
  high: { label: PRIORITY_LABELS.high, tone: 'rose' },
};

/* ------------------------------------------------------------------ buttons */

export const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all hover:brightness-110 dark:hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50';

/** Primary CTA — translucent teal glass, not a solid fill, so every action
 *  button on the route shares one surface. */
export const btnPrimary = cn(
  btnBase,
  'rounded-xl border border-teal-500/60 bg-teal-500/20 px-4 py-2 shadow-lg backdrop-blur-md ' +
    'text-teal-700 hover:bg-teal-500/30 dark:text-teal-300 dark:hover:bg-teal-500/30'
);

/** Secondary action — translucent slate surface. */
export const btnSecondary = cn(
  btnBase,
  'border border-slate-300/80 bg-slate-100/70 px-3 py-2 text-slate-600 hover:bg-slate-200/70 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-700/50'
);

/** Tertiary / dismiss — no border until hover. */
export const btnGhost = cn(
  btnBase,
  'px-2.5 py-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
);

/** Tinted destructive action (delete trigger in the modal/drawer). */
export const btnDanger = cn(
  btnBase,
  'border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/25'
);

/** Solid destructive action (confirmation dialogs). */
export const btnDangerSolid = cn(
  btnBase,
  'border border-rose-400/40 bg-rose-600 px-4 py-2 text-white hover:bg-rose-500 dark:bg-rose-500/85 dark:hover:bg-rose-400/85'
);

/** Square icon-only control (panel toggles, prev/next, close). */
export const btnIcon =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100';
