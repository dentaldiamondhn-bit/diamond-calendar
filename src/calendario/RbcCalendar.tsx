'use client';

import { memo, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import type { View, ViewProps } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { RbcEvent } from '@/calendario/rbcAdapter';
import { calendarComponents } from '@/calendario/calendarComponents';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { es },
});

const messages = {
  today: 'Hoy',
  previous: 'Anterior',
  next: 'Siguiente',
  month: 'Mes',
  week: 'Semana',
  work_week: 'Semana laboral',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Evento',
  allDay: 'Todo el día',
  noEventsInRange: 'No hay citas en este rango',
};

// 12-hour hh:mm a.m./p.m. on the time surfaces (request #2) — es meridiem.
// Date/day-tile labels keep their existing RBC defaults (unchanged).
const formats = {
  timeGutterFormat: 'h:mm a',
  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'h:mm a', { locale: es })} – ${format(end, 'h:mm a', { locale: es })}`,
  agendaTimeFormat: 'h:mm a',
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'h:mm a', { locale: es })} – ${format(end, 'h:mm a', { locale: es })}`,
  selectRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${format(start, 'h:mm a', { locale: es })} – ${format(end, 'h:mm a', { locale: es })}`,
};

/** Desktop DnD addon — wrapped calendar (Add drag/resize handlers in the shell). */
const DragCalendar = withDragAndDrop<RbcEvent, object>(Calendar);

export interface DragDropResult {
  event: RbcEvent;
  start: Date;
  end: Date;
  isAllDay?: boolean;
}

export interface RbcCalendarProps {
  events: RbcEvent[];
  date: Date;
  view: View;
  onView: (view: View) => void;
  onNavigate: (date: Date) => void;
  /** Phase 3 C17 — slot selection carries both bounds so the modal can pre-fill. */
  onSelectSlot: (slot: { start: Date; end: Date }) => void;
  onSelectEvent: (event: RbcEvent) => void;
  /** Phase 4 C10 — drag event to another slot (optimistic + overlap-checked). */
  onEventDrop?: (info: DragDropResult) => void;
  /** Phase 4 C11 — grab the resize handle to stretch/shrink the end bound. */
  onEventResize?: (info: DragDropResult) => void;
}

const eventPropGetter = (event: object) => {
  const rbcEvent = event as RbcEvent;
  return { style: { backgroundColor: rbcEvent.color, borderColor: rbcEvent.color } };
};

const InnerRbcCalendar = memo(function InnerRbcCalendar({
  events,
  date,
  view,
  onView,
  onNavigate,
  onSelectSlot,
  onSelectEvent,
  onEventDrop,
  onEventResize,
}: RbcCalendarProps) {
  const handleNavigate = useCallback((newDate: Date) => onNavigate(newDate), [onNavigate]);
  const handleSelectSlot = useCallback(
    (slot: { start: Date; end: Date }) => onSelectSlot({ start: slot.start, end: slot.end }),
    [onSelectSlot],
  );
  const handleSelectEvent = useCallback(
    (event: object) => onSelectEvent(event as RbcEvent),
    [onSelectEvent],
  );
  const handleDrop = useCallback(
    (args: { event: object; start: string | Date; end: string | Date; isAllDay?: boolean }) =>
      onEventDrop?.({
        event: args.event as RbcEvent,
        start: new Date(args.start),
        end: new Date(args.end),
        isAllDay: args.isAllDay,
      }),
    [onEventDrop],
  );
  const handleResize = useCallback(
    (args: { event: object; start: string | Date; end: string | Date; isAllDay?: boolean }) =>
      onEventResize?.({
        event: args.event as RbcEvent,
        start: new Date(args.start),
        end: new Date(args.end),
        isAllDay: args.isAllDay,
      }),
    [onEventResize],
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden" style={{ height: '600px' }}>
      <DragCalendar
        localizer={localizer}
        culture="es"
        messages={messages}
        formats={formats}
        events={events}
        date={date}
        view={view}
        onView={onView}
        onNavigate={handleNavigate}
        views={[Views.MONTH, Views.WEEK, Views.WORK_WEEK, Views.DAY, Views.AGENDA]}
        selectable="ignoreEvents"
        popup
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventPropGetter}
        style={{ height: '100%' }}
        components={calendarComponents}
        resizable
        onEventDrop={handleDrop}
        onEventResize={handleResize}
      />
    </div>
  );
});

/**
 * Outer wrapper keeps DndProvider stable across re-renders (never re-mounts).
 * Drag/move runs on HTML5 (mouse) on desktop and, on coarse-pointer devices,
 * on the touch backend with a 200ms grace so swiping/scrolling doesn't start a
 * drag (long-press then drag). Resize handles use the same backend.
 */
export default memo(function RbcCalendar(props: RbcCalendarProps) {
  const isTouch = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
    []
  );

  return (
    <DndProvider
      backend={isTouch ? TouchBackend : HTML5Backend}
      options={isTouch ? { enableTouchEvents: true, enableMouseEvents: true, delay: 200 } : undefined}
    >
      <InnerRbcCalendar {...props} />
    </DndProvider>
  );
});

export type { ViewProps };