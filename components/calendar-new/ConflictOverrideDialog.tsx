'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[70] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Conflicto de horario</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{message}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-5">
          El dentista ya tiene una cita en ese horario. Puedes guardar de todos modos o cancelar y elegir otro horario.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            {busy ? 'Guardando…' : 'Guardar de todos modos'}
          </button>
        </div>
      </div>
    </div>
  );
}