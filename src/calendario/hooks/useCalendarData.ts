'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ClinicEvent, Task, Reminder, EventReminder } from '@/lib/types-calendar';
import {
  CalendarRepository,
  type EventInput,
  type EventRange,
} from '@/calendario/calendarRepository';

export const calendarKeys = {
  all: ['calendario'] as const,
  events: (range: EventRange) => ['calendario', 'events', range] as const,
  eventsList: ['calendario', 'events'] as const,
  tasks: ['calendario', 'tasks'] as const,
  reminders: ['calendario', 'reminders'] as const,
  eventReminders: (ids: string) => ['calendario', 'eventReminders', ids] as const,
};

/** Events inside a date window — cache is keyed per range (C16: no full refetch on nav).
 *  `keepPreviousData` keeps the old range visible while the new range loads,
 *  preventing the full-screen spinner flash on every view switch. */
export function useCalendarEvents(range: EventRange): UseQueryResult<ClinicEvent[], Error> {
  return useQuery({
    queryKey: calendarKeys.events(range),
    queryFn: () => CalendarRepository.getEvents(range),
    placeholderData: keepPreviousData,
  });
}

export function useCalendarTasks(): UseQueryResult<Task[], Error> {
  return useQuery({
    queryKey: calendarKeys.tasks,
    queryFn: () => CalendarRepository.getTasks(),
  });
}

export function useCalendarReminders(): UseQueryResult<Reminder[], Error> {
  return useQuery({
    queryKey: calendarKeys.reminders,
    queryFn: () => CalendarRepository.getReminders(),
  });
}

/** Event reminders for a specific set of events (deduped/sorted ids as the key). */
export function useEventReminders(eventIds: number[]): UseQueryResult<EventReminder[], Error> {
  const ids = useMemo(() => [...new Set(eventIds)].sort((a, b) => a - b), [eventIds]);
  const key = ids.length ? ids.join(',') : 'none';
  return useQuery({
    queryKey: calendarKeys.eventReminders(key),
    queryFn: () => CalendarRepository.getEventRemindersBatch(ids),
    enabled: ids.length > 0,
    placeholderData: [] as EventReminder[],
  });
}

export function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: calendarKeys.all });
}

export interface CalendarMutations {
  createEvent: UseMutationResult<ClinicEvent, Error, EventInput>;
  updateEvent: UseMutationResult<ClinicEvent, Error, { id: number; updates: Partial<EventInput> }>;
  deleteEvent: UseMutationResult<void, Error, number>;
  addTask: UseMutationResult<
    Task,
    Error,
    {
      title: string;
      priority: Task['priority'];
      due_date: string;
      remind_at?: string | null;
      repeat_every_days?: number | null;
    }
  >;
  toggleTask: UseMutationResult<Task, Error, { id: number; completed: boolean }>;
  deleteTask: UseMutationResult<void, Error, number>;
  addReminder: UseMutationResult<Reminder, Error, { message: string; remind_at: string }>;
  dismissReminder: UseMutationResult<Reminder, Error, { id: number; dismissed: boolean }>;
  deleteReminder: UseMutationResult<void, Error, number>;
  deleteEventReminder: UseMutationResult<void, Error, { eventId: number; reminderId: number }>;
}

/**
 * CRUD mutations with optimistic task toggle + invalidate-on-action. Invalidates
 * the whole `calendario` key so range- and list-caches all settle (the same
 * invalidation realtime uses, so no stale window survives an action).
 *
 * Performance: createEvent/deleteEvent use `onSettled` with fire-and-forget
 * invalidation so mutateAsync resolves immediately after the HTTP response,
 * keeping UI transitions (modal close, toast) instant. Realtime SSE + the
 * periodic refetch cover any remaining stale window.
 */
export function useCalendarMutations(): CalendarMutations {
  const queryClient = useQueryClient();
  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: calendarKeys.all });

  const createEvent = useMutation({
    mutationFn: (payload: EventInput) => CalendarRepository.createEvent(payload),
    // Fire-and-forget: modal closes instantly; SSE + background refetch settle cache.
    onSettled: () => { void invalidateAll(); },
  });
  const updateEvent = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<EventInput> }) =>
      CalendarRepository.updateEvent(id, updates),
    // Phase 4 C10/C11 — optimistic move/resize: apply to every cached range
    // immediately, roll back if the server rejects the save.
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.all });
      const snapshot = new Map<QueryKey, ClinicEvent[]>();
      queryClient
        .getQueriesData<ClinicEvent[]>({ queryKey: calendarKeys.all })
        .forEach(([key, data]) => {
          if (data) snapshot.set(key, data);
        });
      snapshot.forEach((data, key) => {
        queryClient.setQueryData<ClinicEvent[]>(key, (old) =>
          old?.map((e) => (e.id === id ? { ...e, ...updates } : e))
        );
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return;
      ctx.snapshot.forEach((data, key) => {
        queryClient.setQueryData<ClinicEvent[]>(key, data);
      });
    },
    // Fire-and-forget: optimistic update already applied; background refetch confirms.
    onSettled: () => { void invalidateAll(); },
  });
  const deleteEvent = useMutation({
    mutationFn: (id: number) => CalendarRepository.deleteEvent(id),
    onSettled: () => { void invalidateAll(); },
  });

  const addTask = useMutation({
    mutationFn: ({
      title,
      priority,
      due_date,
      remind_at = null,
      repeat_every_days = null,
    }: {
      title: string;
      priority: Task['priority'];
      due_date: string;
      remind_at?: string | null;
      repeat_every_days?: number | null;
    }) => CalendarRepository.createTask(title, priority, due_date, remind_at, repeat_every_days),
    onSettled: () => { void invalidateAll(); },
  });
  const toggleTask = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      CalendarRepository.updateTask(id, { completed }),
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.tasks });
      const previous = queryClient.getQueryData<Task[]>(calendarKeys.tasks);
      queryClient.setQueryData<Task[]>(calendarKeys.tasks, (old) =>
        old?.map((t) => (t.id === id ? { ...t, completed } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(calendarKeys.tasks, ctx.previous);
    },
    onSettled: () => { void invalidateAll(); },
  });
  const deleteTask = useMutation({
    mutationFn: (id: number) => CalendarRepository.deleteTask(id),
    onSettled: () => { void invalidateAll(); },
  });

  const addReminder = useMutation({
    mutationFn: ({ message, remind_at }: { message: string; remind_at: string }) =>
      CalendarRepository.createReminder(message, remind_at),
    onSettled: () => { void invalidateAll(); },
  });
  const dismissReminder = useMutation({
    mutationFn: ({ id, dismissed }: { id: number; dismissed: boolean }) =>
      CalendarRepository.updateReminder(id, { dismissed }),
    onSettled: () => { void invalidateAll(); },
  });
  const deleteReminder = useMutation({
    mutationFn: (id: number) => CalendarRepository.deleteReminder(id),
    onSettled: () => { void invalidateAll(); },
  });
  const deleteEventReminder = useMutation({
    mutationFn: ({ eventId, reminderId }: { eventId: number; reminderId: number }) =>
      CalendarRepository.deleteEventReminder(eventId, reminderId),
    onSettled: () => { void invalidateAll(); },
  });

  return {
    createEvent,
    updateEvent,
    deleteEvent,
    addTask,
    toggleTask,
    deleteTask,
    addReminder,
    dismissReminder,
    deleteReminder,
    deleteEventReminder,
  };
}