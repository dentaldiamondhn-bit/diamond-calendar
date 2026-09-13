'use client';

import type { EventFormValues } from '@/calendario/event/eventSchema';

/** Lightweight invitee snapshot kept in the draft (mirrors `/api/users` shape). */
export interface DraftInvitee {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  profileImageUrl?: string | null;
  role?: string;
}

export interface EventDraftState {
  date: string;
  values: EventFormValues;
  invitees: DraftInvitee[];
  reminders: number[];
  savedAt: number;
}

const KEY_PREFIX = 'calendar-draft:';

function keyFor(date: string) {
  return `${KEY_PREFIX}${date}`;
}

/** C20 — optimistic autosave for create mode; keyed by the event's date. */
export function saveEventDraft(
  date: string,
  values: EventFormValues,
  invitees: DraftInvitee[],
  reminders: number[]
) {
  try {
    const state: EventDraftState = { date, values, invitees, reminders, savedAt: Date.now() };
    localStorage.setItem(keyFor(date), JSON.stringify(state));
  } catch {
    // quota / private mode — drafts are best-effort
  }
}

export function loadEventDraft(date: string): EventDraftState | null {
  try {
    const raw = localStorage.getItem(keyFor(date));
    if (!raw) return null;
    const state = JSON.parse(raw) as EventDraftState;
    if (state.date !== date || !state.values) return null;
    return state;
  } catch {
    return null;
  }
}

export function clearEventDraft(date: string) {
  try {
    localStorage.removeItem(keyFor(date));
  } catch {
    // ignore
  }
}