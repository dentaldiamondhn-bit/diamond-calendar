'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Loader2 } from 'lucide-react';
import type { View } from 'react-big-calendar';
import type { ClinicEvent, Task } from '@/lib/types-calendar';
import { eventsToRbc, dateToDateStr, dateToTimeStr } from '@/calendario/rbcAdapter';
import { viewToRange } from '@/calendario/range';
import {
  useCalendarEvents,
  useCalendarTasks,
  useCalendarReminders,
  useEventReminders,
  useCalendarMutations,
} from '@/calendario/hooks/useCalendarData';
import { useCalendarRealtime } from '@/calendario/hooks/useCalendarRealtime';
import CalendarSkeleton from '@/calendario/CalendarSkeleton';
import DayDetail from '@/components/calendar-new/DayDetail';
import TaskPanel from '@/components/calendar-new/TaskPanel';
import ReminderPanel from '@/components/calendar-new/ReminderPanel';
import EventModal, { type ModalPrefill } from '@/components/calendar-new/EventModal';
import EventDetailDrawer from '@/components/calendar-new/EventDetailDrawer';
import ConflictOverrideDialog from '@/components/calendar-new/ConflictOverrideDialog';
import { useToast } from '@/components/calendar-new/Toast';
import type { RbcEvent } from '@/calendario/rbcAdapter';
import type { DragDropResult } from '@/calendario/RbcCalendar';
import { findDentistOverlap, conflictMessage, dragTargetUpdates, resizeTargetUpdates } from '@/calendario/calendarDnD';
import { isDentistConflictError } from '@/calendario/calendarRepository';

const RbcCalendar = dynamic(() => import('@/calendario/RbcCalendar'), {
  ssr: false,
  loading: () => <CalendarSkeleton />,
});

const VIEWS: View[] = ['month', 'week', 'work_week', 'day', 'agenda'];

function parseDateStr(s: string | null): Date {
  if (s) {
    const [y, mo, d] = s.split('-').map((n) => parseInt(n, 10));
    if (y && mo && d) return new Date(y, mo - 1, d);
  }
  return new Date();
}

function initialView(): View {
  if (typeof window === 'undefined') return 'month';
  const v = new URLSearchParams(window.location.search).get('view');
  return (VIEWS as string[]).includes(v || '') ? (v as View) : 'month';
}

function initialDateStr(): string {
  if (typeof window === 'undefined') return dateToDateStr(new Date());
  const d = new URLSearchParams(window.location.search).get('date');
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dateToDateStr(new Date());
}

interface Props {
  userId: string;
}

export default function CalendarShell({ userId }: Props) {
  const { push } = useToast();
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState<Date>(() => parseDateStr(initialDateStr()));
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDateStr());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClinicEvent | null>(null);
  const [modalPrefill, setModalPrefill] = useState<ModalPrefill | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<ClinicEvent | null>(null);
  /** Duplicate flow (request #3) — modal hydrates a NEW event copied from this one. */
  const [duplicateOf, setDuplicateOf] = useState<ClinicEvent | null>(null);

  // Server-side dentist conflict (409 DENTIST_CONFLICT) — offer a force-save.
  const [conflictOverride, setConflictOverride] = useState<{ message: string; retry: () => Promise<void> } | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);

  // The fetch window is derived from view + date (deterministic URL restore),
  // and mirrored into ?from=&to= for deep links / debugging.
  const range = useMemo(() => viewToRange(view, date), [view, date]);

  const eventsQuery = useCalendarEvents(range);
  const tasksQuery = useCalendarTasks();
  const remindersQuery = useCalendarReminders();
  const mutations = useCalendarMutations();
  useCalendarRealtime(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', view);
    params.set('date', dateToDateStr(date));
    params.set('from', range.from);
    params.set('to', range.to);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [view, date, range]);

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // Phase 5 — push deep-link: `?eventId=` (calendar notification tap) opens the
  // event drawer + day view once that event is in the cache, then drops the
  // param so a later refetch never re-opens it.
  useEffect(() => {
    if (events.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('eventId');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    setView('day');
    setDate(parseDateStr(ev.date));
    setSelectedDate(ev.date);
    setDrawerEvent(ev);
    setEditingEvent(null);
    params.delete('eventId');
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [events]);
  const tasks = tasksQuery.data ?? [];
  const reminders = remindersQuery.data ?? [];
  const eventIds = useMemo(() => events.map((e) => e.id), [events]);
  const eventRemindersQuery = useEventReminders(eventIds);
  const eventReminders = eventRemindersQuery.data ?? [];

  const rbcEvents = useMemo(() => eventsToRbc(events), [events]);

  // Keep the drawer's event in sync with the freshest query data (SSE or refetch).
  // Without this, the drawer shows a frozen snapshot and never live-updates.
  const liveDrawerEvent = useMemo(() => {
    if (!drawerEvent) return null;
    return events.find((e) => e.id === drawerEvent.id) ?? drawerEvent;
  }, [drawerEvent, events]);

  const invalidateForModal = () => {
    eventsQuery.refetch();
    tasksQuery.refetch();
    remindersQuery.refetch();
  };

  const addTask = async (
    title: string,
    priority: Task['priority'],
    due_date: string,
    remind_at: string | null = null,
    repeat_every_days: number | null = null
  ) => {
    try {
      await mutations.addTask.mutateAsync({ title, priority, due_date, remind_at, repeat_every_days });
      push('Tarea añadida', 'success');
    } catch {
      push('No se pudo añadir la tarea', 'error');
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      await mutations.toggleTask.mutateAsync({ id: task.id, completed: !task.completed });
    } catch {
      push('No se pudo actualizar la tarea', 'error');
    }
  };

  const deleteTask = async (id: number) => {
    try {
      await mutations.deleteTask.mutateAsync(id);
      push('Tarea eliminada', 'success');
    } catch {
      push('No se pudo eliminar la tarea', 'error');
    }
  };

  const addReminder = async (message: string, remind_at: string) => {
    try {
      await mutations.addReminder.mutateAsync({ message, remind_at });
      push('Recordatorio fijado', 'success');
    } catch {
      push('No se pudo fijar el recordatorio', 'error');
    }
  };

  const dismissReminder = async (id: number) => {
    try {
      await mutations.dismissReminder.mutateAsync({ id, dismissed: true });
    } catch {
      push('No se pudo descartar el recordatorio', 'error');
    }
  };

  const deleteReminder = async (id: number) => {
    try {
      await mutations.deleteReminder.mutateAsync(id);
      push('Recordatorio eliminado', 'success');
    } catch {
      push('No se pudo eliminar el recordatorio', 'error');
    }
  };

  const deleteEventReminder = async (eventId: number, reminderId: number) => {
    try {
      await mutations.deleteEventReminder.mutateAsync({ eventId, reminderId });
      push('Recordatorio de cita eliminado', 'success');
    } catch {
      push('No se pudo eliminar el recordatorio de la cita', 'error');
    }
  };

  const openNewEvent = () => {
    setEditingEvent(null);
    setModalPrefill(null);
    setDuplicateOf(null);
    setDrawerEvent(null);
    setModalOpen(true);
  };

  const openEditEvent = (event: ClinicEvent) => {
    setEditingEvent(event);
    setModalPrefill(null);
    setDuplicateOf(null);
    setDrawerEvent(null);
    setModalOpen(true);
  };

  /** Request #3 — copy any cita into a new, still-editable one (own reminders). */
  const openDuplicateEvent = (event: ClinicEvent) => {
    setSelectedDate(event.date);
    setDuplicateOf(event);
    setEditingEvent(null);
    setModalPrefill(null);
    setDrawerEvent(null);
    setModalOpen(true);
  };

  /**
   * Phase 3 C17 — clicking/pressing a slot pre-fills the create modal with the
   * slot's times. Month/agenda views have no time granularity, so they fall back
   * to the clinic default window.
   */
  const handleSelectSlot = (slot: { start: Date; end: Date }) => {
    setSelectedDate(dateToDateStr(slot.start));
    const timeView = view === 'week' || view === 'work_week' || view === 'day';
    setModalPrefill({
      start: timeView ? dateToTimeStr(slot.start) : '09:00',
      end: timeView ? dateToTimeStr(slot.end) : '09:30',
    });
    setEditingEvent(null);
    setDuplicateOf(null);
    setDrawerEvent(null);
    setModalOpen(true);
  };

  /** Phase 3 C18 — selecting an event opens the detail drawer (Edit/Delete inside). */
  const handleSelectEvent = (rbcEvent: RbcEvent) => {
    setSelectedDate(dateToDateStr(rbcEvent.start));
    setDrawerEvent(rbcEvent.resource);
  };

  /** Day list rows: owned events go straight to edit; shared ones open the read-only drawer. */
  const handleDayDetailClick = (ev: ClinicEvent) => {
    if (ev.user_id === userId) {
      openEditEvent(ev);
    } else {
      setSelectedDate(ev.date);
      setDrawerEvent(ev);
    }
  };

  /**
   * Phase 4 C10 — drop carries a new slot. Month/all-day drops only rebase the
   * date (no time granularity); time views carry exact times. A same-dentist
   * collision blocks the move with a clear message (C12).
   */
  const handleEventDrop = async ({ event, start, end, isAllDay }: DragDropResult) => {
    const clinic = event.resource;
    // Invitees can see shared events but only the owner may move them.
    if (clinic.user_id !== userId) {
      push('No puedes mover una cita que no es tuya.', 'error');
      return;
    }
    const updates = dragTargetUpdates(clinic, start, end, isAllDay, view === 'month');
    const colliding = findDentistOverlap(
      events,
      clinic,
      updates.date ?? clinic.date,
      updates.start_time ?? clinic.start_time,
      updates.end_time ?? clinic.end_time
    );
    if (colliding) {
      push(conflictMessage(clinic, colliding), 'error');
      return;
    }
    const perform = (force: boolean) =>
      mutations.updateEvent.mutateAsync({
        id: clinic.id,
        updates: force ? { ...updates, force_conflict: true } : updates,
      });
    try {
      await perform(false);
      push('Cita movida', 'success');
    } catch (err) {
      if (isDentistConflictError(err)) {
        push(err.message, 'error');
        setConflictOverride({
          message: err.message,
          retry: async () => {
            await perform(true);
            push('Cita movida', 'success');
          },
        });
      } else {
        push('No se pudo mover la cita', 'error');
      }
    }
  };

  /** Phase 4 C11 — resize only moves the end bound (clamped, overlap-checked). */
  const handleEventResize = async ({ event, end }: DragDropResult) => {
    const clinic = event.resource;
    if (clinic.user_id !== userId) {
      push('No puedes mover una cita que no es tuya.', 'error');
      return;
    }
    const updates = resizeTargetUpdates(clinic, end);
    const colliding = findDentistOverlap(
      events,
      clinic,
      clinic.date,
      clinic.start_time,
      updates.end_time ?? clinic.end_time
    );
    if (colliding) {
      push(`No se puede extender: ${conflictMessage(clinic, colliding)}`, 'error');
      return;
    }
    const perform = (force: boolean) =>
      mutations.updateEvent.mutateAsync({
        id: clinic.id,
        updates: force ? { ...updates, force_conflict: true } : updates,
      });
    try {
      await perform(false);
      push('Cita actualizada', 'success');
    } catch (err) {
      if (isDentistConflictError(err)) {
        push(err.message, 'error');
        setConflictOverride({
          message: err.message,
          retry: async () => {
            await perform(true);
            push('Cita actualizada', 'success');
          },
        });
      } else {
        push('No se pudo actualizar la cita', 'error');
      }
    }
  };

  const confirmConflictOverride = async () => {
    if (!conflictOverride) return;
    const retry = conflictOverride.retry;
    setConflictBusy(true);
    setConflictOverride(null);
    try {
      await retry();
    } catch {
      push('No se pudo guardar de todos modos', 'error');
    } finally {
      setConflictBusy(false);
    }
  };

  const queryError = eventsQuery.error || tasksQuery.error || remindersQuery.error;

  // Only block on true cold-boot (no cached data at all). View switches use
// keepPreviousData so the previous range stays visible while the new one loads.
if (eventsQuery.isPending && !eventsQuery.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-teal-500" size={32} />
          <p className="text-gray-400 text-sm">Cargando tu agenda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {queryError ? (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          No se pudieron cargar algunos datos del calendario. Reintentando…
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 hidden sm:block">
              {events.length} {events.length === 1 ? 'cita' : 'citas'}
            </p>
            <button
              onClick={openNewEvent}
              className="flex items-center gap-1.5 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition shadow-sm"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Nueva cita</span>
            </button>
          </div>

          <RbcCalendar
            events={rbcEvents}
            date={date}
            view={view}
            onView={setView}
            onNavigate={setDate}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
          />

          <div className="mt-6 lg:hidden">
            <DayDetail
              dateStr={selectedDate}
              events={events}
              onClose={() => setSelectedDate(null)}
              onEditEvent={handleDayDetailClick}
              onDuplicate={openDuplicateEvent}
              onAddEvent={openNewEvent}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="hidden lg:block">
            <DayDetail
              dateStr={selectedDate}
              events={events}
              onClose={() => setSelectedDate(null)}
              onEditEvent={handleDayDetailClick}
              onDuplicate={openDuplicateEvent}
              onAddEvent={openNewEvent}
            />
          </div>
          <ReminderPanel
            reminders={reminders}
            eventReminders={eventReminders}
            onAdd={addReminder}
            onDismiss={dismissReminder}
            onDelete={deleteReminder}
            onDeleteEventReminder={deleteEventReminder}
          />
          <TaskPanel
            tasks={tasks}
            selectedDate={selectedDate}
            onAdd={addTask}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />
        </div>
      </div>

      <EventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingEvent(null); setDuplicateOf(null); }}
        dateStr={selectedDate}
        editingEvent={editingEvent}
        userId={userId}
        prefill={modalPrefill}
        duplicateOf={duplicateOf}
        onDuplicate={openDuplicateEvent}
        onSaved={invalidateForModal}
      />

      <EventDetailDrawer
        event={liveDrawerEvent}
        userId={userId}
        onClose={() => setDrawerEvent(null)}
        onEdit={openEditEvent}
        onDuplicate={openDuplicateEvent}
        onDeleted={() => {
          setDrawerEvent(null);
          invalidateForModal();
        }}
      />

      <ConflictOverrideDialog
        open={!!conflictOverride}
        busy={conflictBusy}
        message={conflictOverride?.message ?? ''}
        onCancel={() => setConflictOverride(null)}
        onConfirm={() => void confirmConflictOverride()}
      />
    </div>
  );
}