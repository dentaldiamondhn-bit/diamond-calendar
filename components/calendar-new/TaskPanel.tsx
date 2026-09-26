import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, Trash2, Flag, Loader2, Clock } from 'lucide-react';
import { PRIORITY_CHIP, btnGhost, btnIcon, btnPrimary, glassBar, glassCard, glassDivider, glassRow } from '@/calendario/glass';
import { cn } from '@/lib/utils';

interface Task {
  id: number;
  user_id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string;
  completed: boolean;
  created_at: string;
  remind_at: string | null;
  repeat_every_days: number | null;
}

interface Props {
  tasks: Task[];
  selectedDate: string | null;
  onAdd: (
    title: string,
    priority: Task['priority'],
    due_date: string,
    remind_at: string | null,
    repeat_every_days: number | null
  ) => Promise<void>;
  onToggle: (task: Task) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-rose-400',
  medium: 'text-amber-400',
  low: 'text-slate-400',
};

function formatTaskTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const h24 = d.getHours();
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = h24 >= 12 ? 'p. m.' : 'a. m.';
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${mm} ${suffix} · ${d.getDate()}/${d.getMonth() + 1}`;
  } catch {
    return iso;
  }
}

export default function TaskPanel({ tasks, selectedDate, onAdd, onToggle, onDelete }: Props) {
  const [showInput, setShowInput] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [remindAt, setRemindAt] = useState('');
  const [repeatDays, setRepeatDays] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = selectedDate ? tasks.filter((t) => t.due_date === selectedDate) : tasks;
  const sorted = [...filtered].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pOrder = { high: 0, medium: 1, low: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedDate) return;
    setBusy(true);
    const remindAtIso = remindAt ? new Date(remindAt).toISOString() : null;
    const repeat = repeatDays.trim() === '' || Number.isNaN(Number(repeatDays)) ? null : Math.max(1, Math.round(Number(repeatDays)));
    await onAdd(title.trim(), priority, selectedDate, remindAtIso, repeat);
    setTitle('');
    setPriority('medium');
    setRemindAt('');
    setRepeatDays('');
    setBusy(false);
    setShowInput(false);
  };

  const openForm = () => {
    if (selectedDate) setRemindAt((prev) => prev || `${selectedDate}T09:00`);
    setShowInput((v) => !v);
  };

  return (
    <div className={cn(glassCard, 'overflow-hidden')}>
      <div className={cn(glassBar, 'flex items-center justify-between p-4')}>
        <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
          <Check size={18} className="text-teal-500" /> Tareas
        </h3>
        {selectedDate && (
          <button onClick={openForm} className={cn(btnIcon, 'hover:text-teal-500')} aria-label="Nueva tarea">
            <Plus size={18} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showInput && selectedDate && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleAdd}
            className={cn(
              'overflow-hidden border-b px-4 py-3',
              glassDivider,
              'border-slate-200/70 bg-slate-100/50 dark:border-slate-800/70 dark:bg-slate-800/30'
            )}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título de la tarea..."
              autoFocus
              className="w-full rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100"
            />
            <div className="mt-2 flex gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                    priority === p
                      ? 'border-teal-400/40 bg-teal-400/15 text-teal-700 dark:text-teal-200'
                      : 'border-slate-200/80 bg-white/60 text-slate-500 hover:bg-slate-100/70 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:bg-slate-800/50'
                  )}
                >
                  {PRIORITY_CHIP[p].label}
                </button>
              ))}
              <button type="submit" disabled={busy} className={cn(btnPrimary, 'px-3 py-1.5')}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Añadir'}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100"
                title="Recordar a esta hora (opcional)"
              />
              <div className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={repeatDays}
                  onChange={(e) => setRepeatDays(e.target.value)}
                  placeholder="Cada N días"
                  className="w-24 rounded-lg border border-slate-300/80 bg-white/80 px-2 py-2 text-sm text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100"
                  title="Repetir cada N días hasta completar (vacío = una sola vez)"
                />
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="max-h-[300px] overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
            {selectedDate ? 'No hay tareas para este día.' : 'Selecciona un día para ver tareas.'}
          </div>
        ) : (
          sorted.map((task) => (
            <div
              key={task.id}
              className={cn(
                'group flex items-center gap-2 border-b px-4 py-2.5 last:border-b-0',
                glassDivider,
                glassRow
              )}
            >
              <button
                onClick={() => onToggle(task)}
                aria-label={task.completed ? 'Marcar como pendiente' : 'Marcar como completada'}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors',
                  task.completed
                    ? 'border-teal-400/60 bg-teal-400/25'
                    : 'border-slate-400/40 hover:border-teal-400/70'
                )}
              >
                {task.completed && <Check size={12} className="text-teal-200" />}
              </button>
              <Flag size={14} className={PRIORITY_COLORS[task.priority]} />
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm',
                    task.completed
                      ? 'text-slate-400 dark:text-slate-500 line-through'
                      : 'text-slate-700 dark:text-slate-200'
                  )}
                >
                  {task.title}
                </span>
                {task.completed || !task.remind_at ? null : (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-500 dark:text-amber-300">
                    <Clock size={11} /> {formatTaskTime(task.remind_at)}
                    {task.repeat_every_days ? ` · cada ${task.repeat_every_days} día${task.repeat_every_days === 1 ? '' : 's'}` : null}
                  </span>
                )}
              </div>
              <button
                onClick={() => onDelete(task.id)}
                aria-label="Eliminar tarea"
                className={cn(btnGhost, 'opacity-0 group-hover:opacity-100 hover:text-rose-500')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
