'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { btnPrimary, btnSecondary, glassOverlay } from '@/calendario/glass';
import { cn } from '@/lib/utils';

/**
 * Shared override for server-refused saves (409 DENTIST_CONFLICT): explains that
 * the dentist is already booked and lets the user force-save anyway. Used by both
 * the EventModal (create/edit) and the CalendarShell (drag/resize) save paths.
 */
export default function ConflictOverrideDialog({
  message,
  open,
  busy = false,
  onCancel,
  onConfirm,
}: {
  message: string;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
      <div className={cn(glassOverlay, 'w-full max-w-md p-6')}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/15 text-amber-500 dark:text-amber-300">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Conflicto de horario</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>
        <p className="mb-5 text-xs text-slate-400 dark:text-slate-500">
          El dentista ya tiene una cita en ese horario. Puedes guardar de todos modos o cancelar y elegir otro horario.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className={btnSecondary}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              btnPrimary,
              'border-amber-400/40 bg-amber-500/90 hover:bg-amber-500 dark:bg-amber-500/85 dark:hover:bg-amber-400/85'
            )}
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            {busy ? 'Guardando…' : 'Guardar de todos modos'}
          </button>
        </div>
      </div>
    </div>
  );
}
