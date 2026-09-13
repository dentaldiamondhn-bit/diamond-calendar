import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, Trash2, Flag, Loader2, Clock } from 'lucide-react';
import { PRIORITY_LABELS } from '@/calendario/event/eventSchema';

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
  high: 'text-rose-500',
  medium: 'text-amber-500',
  low: 'text-gray-400',
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Check size={18} className="text-teal-500" /> Tareas
        </h3>
        {selectedDate && (
          <button
            onClick={openForm}
            className="text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg transition"
          >
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
             className="px-4 py-3 border-b border-gray-50 bg-gray-50 overflow-hidden"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título de la tarea..."
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none text-sm"
            />
            <div className="flex gap-2 mt-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition ${
                    priority === p ? 'bg-teal-100 text-teal-700' : 'bg-white text-gray-500 border border-gray-200'
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
              <button type="submit" disabled={busy} className="bg-teal-600 text-white px-3 rounded-lg text-sm disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : 'Añadir'}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none text-sm"
                title="Recordar a esta hora (opcional)"
              />
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={1}
                  value={repeatDays}
                  onChange={(e) => setRepeatDays(e.target.value)}
                  placeholder="Cada N días"
                  className="w-24 px-2 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none text-sm"
                  title="Repetir cada N días hasta completar (vacío = una sola vez)"
                />
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="max-h-[300px] overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {selectedDate ? 'No hay tareas para este día.' : 'Selecciona un día para ver tareas.'}
          </div>
        ) : (
          sorted.map((task) => (
            <div key={task.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 group hover:bg-gray-50 transition">
              <button
                onClick={() => onToggle(task)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
                  task.completed ? 'bg-teal-500 border-teal-500' : 'border-gray-300 hover:border-teal-400'
                }`}
              >
                {task.completed && <Check size={12} className="text-white" />}
              </button>
              <Flag size={14} className={PRIORITY_COLORS[task.priority]} />
              <div className="flex-1 min-w-0">
                <span className={`block text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {task.title}
                </span>
                {task.completed || !task.remind_at ? null : (
                  <span className="flex items-center gap-1 text-xs text-amber-500 mt-0.5">
                    <Clock size={11} /> {formatTaskTime(task.remind_at)}
                    {task.repeat_every_days ? ` · cada ${task.repeat_every_days} día${task.repeat_every_days === 1 ? '' : 's'}` : null}
                  </span>
                )}
              </div>
              <button
                onClick={() => onDelete(task.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-500 transition"
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
