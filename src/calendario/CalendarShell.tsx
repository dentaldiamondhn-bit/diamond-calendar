'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { addMonths, addDays } from 'date-fns';
import { Plus, Loader2, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import type { View } from 'react-big-calendar';
import type { ClinicEvent, Task } from '@/lib/types-calendar';
import { eventsToRbc, dateToDateStr, dateToTimeStr } from '@/calendario/rbcAdapter';
import { viewToRange } from '@/calendario/range';
import { useSwipeNavigation } from '@/calendario/useSwipeNavigation';
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
import { btnIcon, btnPrimary, btnSecondary } from '@/calendario/glass';
import { cn } from '@/lib/utils';
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

/** Period a "next/previous" swipe moves, per view (mirrors RBC's toolbar). */
function swipeStep(view: View, date: Date, direction: 1 | -1): Date {
  switch (view) {
    case 'week':
    case 'work_week':
      return addDays(date, direction * 7);
    case 'day':
      return addDays(date, direction);
    case 'month':
    case 'agenda':
    default:
      return addMonths(date, direction);
  }
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

  // Collapsible right sidebar (details/reminders/tasks). Starts collapsed on
  // every screen size — the toolbar toggle opens it. Below lg the panels stay
  // visible stacked under the calendar (mobile); collapsing only ever hides
  // the sidebar on wide screens so the grid can use the full width.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Server-side dentist conflict (409 DENTIST_CONFLICT) — offer a force-save.
  const [conflictOverride, setConflictOverride] = useState<{ message: string; retry: () => Promise<void> } | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);

  // The fetch window is derived from view + date (deterministic URL restore),
  // and mirrored into ?from=&to= for deep links / debugging.
  const range = useMemo(() => viewToRange(view, date), [view, date]);

  // Touch-only swipe navigation: left/right flicks flip month/week/day. The
  // "just swiped" flag is consumed by the slot/event handlers below so RBC's
  // touch selection side-effects (modal / drawer) never fire from a swipe.
  const { onTouchStartCapture, onTouchMoveCapture, onTouchEndCapture, onTouchCancelCapture, justSwipedRef } =
    useSwipeNavigation(
      useCallback(
        (direction: 1 | -1) => setDate((current) => swipeStep(view, current, direction)),
        [view],
      ),
    );

  const consumeSwipe = () => {
    const swiped = justSwipedRef.current;
    justSwipedRef.current = false;
    return swiped;
  };

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

  // Chronological order (date, then start time) of every loaded event — the
  // sequence the event-detail drawer's prev/next nav steps through.
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          (a.date || '').localeCompare(b.date || '') ||
          (a.start_time || '00:00').localeCompare(b.start_time || '00:00')
      ),
    [events],
  );

  /** Move the detail drawer to the previous/next event (wraps at both ends). */
  const moveDrawerEvent = useCallback(
    (dir: 1 | -1) => {
      if (!liveDrawerEvent || sortedEvents.length === 0) return;
      const idx = sortedEvents.findIndex((e) => e.id === liveDrawerEvent.id);
      const nextIdx = idx === -1 ? 0 : (idx + dir + sortedEvents.length) % sortedEvents.length;
      const next = sortedEvents[nextIdx];
      setDrawerEvent(next);
      setSelectedDate(next.date);
    },
    [liveDrawerEvent, sortedEvents],
  );

  const drawerPosition = useMemo(() => {
    if (!liveDrawerEvent || sortedEvents.length === 0) return { position: 0, total: 0 };
    const idx = sortedEvents.findIndex((e) => e.id === liveDrawerEvent.id);
    return { position: idx === -1 ? 0 : idx + 1, total: sortedEvents.length };
  }, [liveDrawerEvent, sortedEvents]);

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
    if (consumeSwipe()) return;
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
    if (consumeSwipe()) return;
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-teal-500" size={32} />
          <p className="text-gray-400 dark:text-slate-500 text-sm">Cargando tu agenda...</p>
        </div>
      </div>
    );
  }

  return (
    // FIX 2: the shell owns the viewport height. `h-[calc(100vh-80px)]` is the
    // space left under the app's ~80px top bar; `overflow-hidden` guarantees
    // nothing (grid, sidebar, panels) can push the page into a second scroll.
    <div className="mx-auto flex h-[calc(100vh-80px)] w-full max-w-[1400px] flex-col overflow-hidden p-4 dark:bg-slate-950 dark:text-slate-200">
      {queryError ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-200">
          No se pudieron cargar algunos datos del calendario. Reintentando…
        </div>
      ) : null}

      {/* `minmax(0,1fr)` on the first row is what keeps the calendar filling the
          shell on narrow screens: below `lg` the panels stack *underneath*, and
          without an explicit row track they were sized by content and squeezed
          the month grid to ~40px rows. At `lg` the grid becomes 2 columns and
          the row track is irrelevant (`lg:grid-rows-1`). */}
      <div
        className={`grid min-h-0 w-full flex-1 grid-rows-[minmax(0,1fr)_auto] gap-6 lg:grid-rows-1 ${
          sidebarOpen
            ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]'
            : 'grid-cols-1'
        }`}
      >
        <div className="flex min-h-0 min-w-0 flex-col">
          {/* Controls bar — `flex-none` so it never absorbs grid height. */}
          <div className="mb-3 flex flex-none items-center justify-between">
            <p className="text-sm text-slate-500 hidden sm:block">
              {events.length} {events.length === 1 ? 'cita' : 'citas'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={openNewEvent} className={btnPrimary}>
                <Plus size={16} /> <span className="hidden sm:inline">Nueva cita</span>
              </button>
              <button
                onClick={() => setSidebarOpen((open) => !open)}
                className={cn(btnSecondary, 'hidden lg:inline-flex')}
                title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
                aria-label={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
              >
                {sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            </div>
          </div>

          {/* This repo nests the calendar one level deeper than the monolith:
              the grid's flex column hands its remaining height to this div, so
              it must grow AND be a column itself, otherwise `RbcCalendar`'s
              `flex-1` resolves against an auto-height parent and the card
              collapses (the "dead space at the bottom" symptom). */}
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            onTouchStartCapture={onTouchStartCapture}
            onTouchMoveCapture={onTouchMoveCapture}
            onTouchEndCapture={onTouchEndCapture}
            onTouchCancelCapture={onTouchCancelCapture}
          >
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
          </div>

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

        {/* Capped below `lg` so the stacked panels can never take the calendar's
            height (they scroll instead). At `lg` the cap is released. */}
        <div className={`min-h-0 min-w-0 max-h-[45vh] space-y-4 overflow-y-auto lg:max-h-none lg:pr-1 ${sidebarOpen ? '' : 'lg:hidden'}`}>
          <div className="hidden lg:flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Panel</p>
            <button
              onClick={() => setSidebarOpen(false)}
              className={btnIcon}
              title="Cerrar panel"
              aria-label="Cerrar panel"
            >
              <X size={18} />
            </button>
          </div>
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
        onPrev={() => moveDrawerEvent(-1)}
        onNext={() => moveDrawerEvent(1)}
        position={drawerPosition.position}
        total={drawerPosition.total}
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