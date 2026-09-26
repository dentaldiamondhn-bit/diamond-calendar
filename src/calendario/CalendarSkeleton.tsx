import { glassCard } from '@/calendario/glass';

export default function CalendarSkeleton() {
  return (
    <div className={`${glassCard} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-200/70 p-4 dark:border-slate-800/60">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200/70 dark:bg-slate-800/80" />
        <div className="flex gap-2">
          <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800/80" />
          <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800/80" />
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-200/70 dark:border-slate-800/60">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 bg-slate-100/60 dark:bg-slate-900/40" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px p-4">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-slate-100/60 dark:bg-slate-900/40" />
        ))}
      </div>
    </div>
  );
}
