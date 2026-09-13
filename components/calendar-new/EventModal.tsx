'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Loader2,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  UserRound,
  Clock,
  Bell,
  Pencil,
  Check,
  CopyPlus,
} from 'lucide-react';
import { useForm, useController, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ClinicEvent } from '@/lib/types-calendar';
import { EVENT_COLORS, PROCEDURES } from '@/lib/types-calendar';
import {
  eventFormSchema,
  defaultEventForm,
  REMINDER_OPTIONS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type EventFormValues,
  type EventType,
  type EventStatus,
  type EventPriority,
} from '@/calendario/event/eventSchema';
import { Field, TextInput, TextArea, Select, TimeInput } from '@/calendario/event/fields';
import {
  saveEventDraft,
  loadEventDraft,
  clearEventDraft,
  type DraftInvitee,
} from '@/calendario/event/eventDraft';
import { CalendarRepository, isDentistConflictError, type EventInput } from '@/calendario/calendarRepository';
import { useCalendarMutations } from '@/calendario/hooks/useCalendarData';
import { useToast } from '@/components/calendar-new/Toast';
import ConflictOverrideDialog from '@/components/calendar-new/ConflictOverrideDialog';
import { formatClock12, normalizeTime, addHourToTime, clinicWallClockTimestamp } from '@/calendario/timezone';
import { countries } from '@/utils/phoneUtils';
import { formatPhoneNumber, getPhonePlaceholder } from '@/utils/formatUtils';

/**
 * Smart default Recordatorios (request): [10 min, 1 h, 1 día]. A lead time is
 * skipped when its fire instant (event start − minutes) is already in the past,
 * which covers both rules:
 *   - same-day event → the "1 día antes" anchor is gone → dropped;
 *   - event starting within the same hour → the "1 h antes" anchor is gone → dropped.
 * The 10-min level is always kept so the section never looks empty.
 */
const DEFAULT_REMINDER_LEVELS = [10, 60, 1440];
function smartDefaultReminders(date: string, startTime: string): number[] {
  if (!date || !startTime) return [...DEFAULT_REMINDER_LEVELS];
  const startMs = clinicWallClockTimestamp(date, startTime).getTime();
  const nowMs = Date.now();
  const future = DEFAULT_REMINDER_LEVELS.filter((min) => startMs - min * 60_000 > nowMs);
  return future.length ? future : [10];
}

/**
 * Normalize a stored event phone on open (ported from patient-form): handles
 * both the legacy combined form ("+504 9999-9999") and the split storage
 * (phone + phone_country). Returns the country code and the number formatted
 * for that country so the input shows the expected mask right away.
 */
function phoneOnOpen(phone?: string, storedCountry?: string): { country: string; number: string } {
  if (!phone) return { country: storedCountry || '504', number: '' };
  const cleaned = phone.replace(/^\+/, '').trim();
  const parts = cleaned.split(/\s+/);
  const inferred =
    parts.length >= 2 && countries.some((c) => c.code === parts[0]) ? parts[0] : undefined;
  const country = storedCountry || inferred || '504';
  const number = inferred ? parts.slice(1).join(' ') : cleaned;
  return { country, number: formatPhoneNumber(number, country) };
}

export interface ModalPrefill {
  start: string;
  end: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  dateStr: string | null;
  editingEvent: ClinicEvent | null;
  /** Kept for legacy callers ({@link Dashboard}); identity is server-side now. */
  userId?: string;
  /** Phase 3 C17 — slot click => pre-filled start/end times. */
  prefill?: ModalPrefill | null;
  /** Duplicate flow — hydrate the modal as a NEW event copied from this one. */
  duplicateOf?: ClinicEvent | null;
  /** Edit-mode footer: copy this event into a new one. */
  onDuplicate?: (e: ClinicEvent) => void;
}

type Step = 'details' | 'timing' | 'invite';

interface SearchResult {
  paciente_id: string;
  nombre_completo: string;
  telefono?: string;
  codigopais?: string;
}

const avatarFor = (u: DraftInvitee) =>
  u.profileImageUrl ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent((u.first_name || '') + ' ' + (u.last_name || ''))}&background=random`;

export default function EventModal({ open, onClose, onSaved, dateStr, editingEvent, prefill, duplicateOf, onDuplicate }: Props) {
  const { push } = useToast();
  const mutations = useCalendarMutations();

  const [step, setStep] = useState<Step>('details');
  const [busy, setBusy] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [error, setError] = useState('');

  // step 1 — patient search
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<SearchResult[]>([]);
  const [patientSearching, setPatientSearching] = useState(false);

  // step 3 — invitees + reminders
  const [invitees, setInvitees] = useState<DraftInvitee[]>([]);
  const [userPool, setUserPool] = useState<DraftInvitee[]>([]);
  const [showInviteePicker, setShowInviteePicker] = useState(false);
  const [inviteeQuery, setInviteeQuery] = useState('');
  const [reminders, setReminders] = useState<number[]>([30]);

  // drafts (create mode only — C20)
  const [draftAvailable, setDraftAvailable] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Server-side dentist conflict (409 DENTIST_CONFLICT) — offer a force-save.
  const [conflict, setConflict] = useState<{ message: string; formData: EventFormValues } | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);

  const isCreate = !editingEvent;

  // Guard: only allow form submission via explicit click on the submit button
  const submitTriggeredRef = useRef(false);

  // Auto-end (request #1): while the user is still picking a start, keep
  // end = start + 1h. Any manual end edit turns this off for that session.
  const autoEndRef = useRef(true);
  // Baseline used to detect real start changes (vs the reset on each open).
  const sessionStartRef = useRef('');
  // Once the user edits the Recordatorios list, stop re-deriving smart defaults
  // when the date/time changes (their explicit choices win from then on).
  const remindersTouchedRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    trigger,
    setValue,
    formState: { errors, isDirty },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: defaultEventForm(),
  });

  const values = watch();

  // Auto-fill Título from a free-text patient name (a new patient not found in
  // the list), mirroring selectPatient. Auto-mode stays live while the title is
  // empty or still equals the value we last generated (i.e. the user hasn't
  // typed over it), so it tracks the full name as they type — a manually
  // written title is never clobbered.
  const lastAutoTitleRef = useRef('');
  useEffect(() => {
    if (!open) return;
    const name = (values.patient_name ?? '').trim();
    if (!name) return;
    const currentTitle = (values.title ?? '').trim();
    if (currentTitle !== '' && currentTitle !== lastAutoTitleRef.current) return;
    const next = `Cita con ${name}`;
    lastAutoTitleRef.current = next;
    if (currentTitle !== next) setValue('title', next);
  }, [open, values.patient_name, values.title, setValue]);

  // 12h AM/PM pickers (TimeInput) — emitted value is 24h HH:MM (schema-compatible)
  const startTimeField = useController({ control, name: 'start_time' });
  const endTimeField = useController({ control, name: 'end_time' });

  // a11y — Escape closes the dialog (C18: never while delete-confirm is up)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDelete) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmDelete, onClose]);

  // ---------------------------------------------------------------- open/reset
  useEffect(() => {
    if (!open) return;
    setStep('details');
    setError('');
    setBusy(false);

    if (!isCreate) {
      // edit mode — hydrate from the event + its children; drafts/prefill ignored
      const e = editingEvent!;
      const start = normalizeTime(e.start_time);
      autoEndRef.current = false;
      sessionStartRef.current = start;
      const editPhone = phoneOnOpen(e.phone, e.phone_country);
      reset({
        title: e.title || '',
        patient_name: e.patient_name || '',
        patient_id: e.patient_id || '',
        procedure: e.procedure || '',
        dentist: e.dentist || '',
        phone: editPhone.number,
        phone_country: editPhone.country,
        date: e.date || dateStr || '',
        start_time: start,
        end_time: normalizeTime(e.end_time),
        color: e.color || EVENT_COLORS[0].value,
        notes: e.notes || '',
        description: e.description || '',
        location: e.location || '',
        event_type: (e.event_type ?? 'appointment') as EventType,
        status: (e.status ?? 'scheduled') as EventStatus,
        priority: (e.priority ?? 'medium') as EventPriority,
        reminder_minutes: e.reminder_minutes ?? 30,
      });
      setInvitees([]);
      setReminders([e.reminder_minutes ?? 30]);
      setDraftAvailable(false);
      void loadChildren(e.id);
      return;
    }

    if (duplicateOf) {
      // duplicate mode — copy of an existing event as a NEW one (own reminders)
      const e = duplicateOf;
      const start = normalizeTime(e.start_time);
      autoEndRef.current = false;
      sessionStartRef.current = start;
      const dupPhone = phoneOnOpen(e.phone, e.phone_country);
      reset({
        title: e.title || '',
        patient_name: e.patient_name || '',
        patient_id: e.patient_id || '',
        procedure: e.procedure || '',
        dentist: e.dentist || '',
        phone: dupPhone.number,
        phone_country: dupPhone.country,
        date: dateStr || e.date || '',
        start_time: start,
        end_time: normalizeTime(e.end_time || addHourToTime(start)),
        color: e.color || EVENT_COLORS[0].value,
        notes: e.notes || '',
        description: e.description || '',
        location: e.location || '',
        event_type: (e.event_type ?? 'appointment') as EventType,
        status: (e.status ?? 'scheduled') as EventStatus,
        priority: (e.priority ?? 'medium') as EventPriority,
        reminder_minutes: e.reminder_minutes ?? 30,
      });
      setInvitees([]);
      setReminders([e.reminder_minutes ?? 30]);
      remindersTouchedRef.current = true; // a duplicate keeps its source schedule
      setDraftAvailable(false);
      void loadChildren(e.id);
      return;
    }

    // create mode — prefill from the RBC slot (C17) + optional draft prompt (C20)
    const base = defaultEventForm();
    if (dateStr) base.date = dateStr;
    if (prefill) {
      base.start_time = prefill.start || base.start_time;
      base.end_time = prefill.end || base.end_time;
      autoEndRef.current = false; // respect the exact slot the user drew
    } else {
      // Default window: Fin = Inicio + 1 h (request #1).
      base.end_time = addHourToTime(base.start_time, 1);
      autoEndRef.current = true;
    }
    sessionStartRef.current = base.start_time;
    reset(base);
    setInvitees([]);
    // Smart default Recordatorios: [10 min, 1 h, 1 día], minus any lead time
    // whose anchor is already in the past for the chosen window.
    setReminders(smartDefaultReminders(base.date, base.start_time));
    remindersTouchedRef.current = false;
    setShowPatientSearch(false);
    setShowInviteePicker(false);

    // Load user pool for invitee picker (doctors)
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((users) => setUserPool(users as DraftInvitee[]));

    const draft = dateStr ? loadEventDraft(dateStr) : null;
    setDraftAvailable(!!draft && draft.values.date === dateStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEvent, dateStr, prefill, duplicateOf]);

  // Auto-end (request #1): end follows start +1h until the user edits end
  // manually. Only genuine start changes trigger it — the reset on every open
  // rebaselines `sessionStartRef` so a reopened modal never inherits stale times.
  useEffect(() => {
    if (!open || isCreate === false || !autoEndRef.current) return;
    if (sessionStartRef.current === values.start_time) return;
    sessionStartRef.current = values.start_time;
    const next = addHourToTime(values.start_time, 1);
    if (next !== values.end_time) {
      setValue('end_time', next, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.start_time, open]);

  // Smart Recordatorios (request): re-derive the default schedule whenever the
  // chosen date/start time changes — but ONLY while the user hasn't manually
  // touched the list, so a later manual edit is never clobbered by a date move.
  useEffect(() => {
    if (!open || !isCreate || duplicateOf) return;
    if (remindersTouchedRef.current) return;
    if (values.date && values.start_time) {
      setReminders(smartDefaultReminders(values.date, values.start_time));
    }
  }, [values.date, values.start_time, open, isCreate, duplicateOf, remindersTouchedRef]);

  // autosave create-mode drafts while the user types (debounced) — C20.
  // A pending (un-restored) draft is never clobbered: the user explicitly
  // Restaura/Descartar first, then autosave resumes.
  useEffect(() => {
    if (!open || !isCreate || !dateStr) return;
    if (draftAvailable || !isDirty) return;
    const t = setTimeout(() => {
      saveEventDraft(dateStr, values, invitees, reminders);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, invitees, reminders, open, isCreate, dateStr]);

  const restoreDraft = () => {
    if (!dateStr) return;
    const draft = loadEventDraft(dateStr);
    if (!draft) return;
    autoEndRef.current = false; // a draft was explicitly saved with its own end
    sessionStartRef.current = draft.values.start_time;
    reset(draft.values);
    setInvitees(draft.invitees ?? []);
    setReminders(draft.reminders?.length ? draft.reminders : [draft.values.reminder_minutes ?? 30]);
    remindersTouchedRef.current = true; // a restored draft carries the user's own schedule
    setDraftAvailable(false);
  };

  const discardDraft = () => {
    if (dateStr) clearEventDraft(dateStr);
    setDraftAvailable(false);
  };

  const loadChildren = async (eventId: number) => {
    setLoadingChildren(true);
    try {
      const [inviteeRows, reminderMins, users] = await Promise.all([
        CalendarRepository.getEventInvitees(eventId),
        CalendarRepository.getEventReminders(eventId),
        fetch('/api/users')
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]);
      const byId = new Map((users as DraftInvitee[]).map((u) => [u.id, u]));
      setInvitees(inviteeRows.map((row) => ({ id: row.user_id, ...byId.get(row.user_id) })));
      setReminders(reminderMins.length ? reminderMins : [editingEvent?.reminder_minutes ?? 30]);
      setUserPool(users as DraftInvitee[]);
    } catch {
      // children load best-effort; the form itself is still usable
    } finally {
      setLoadingChildren(false);
    }
  };

  // patient search debounce (step 1)
  useEffect(() => {
    if (!showPatientSearch || patientQuery.trim() === '') {
      setPatientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientQuery)}`);
        if (res.ok) setPatientResults((await res.json()).slice(0, 6));
      } catch {
        // ignore
      } finally {
        setPatientSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, showPatientSearch]);

  const selectPatient = (p: SearchResult) => {
    // Ported from patient-form: the patient's saved phone (and its country) fill
    // the Teléfono field automatically; phoneOnOpen handles both the split
    // storage (telefono + codigopais) and legacy combined "+504 …" values.
    const pph = phoneOnOpen(p.telefono, p.codigopais);
    reset((prev) => ({
      ...prev,
      patient_id: p.paciente_id,
      patient_name: p.nombre_completo,
      title: prev.title || `Cita con ${p.nombre_completo}`,
      phone: pph.number,
      phone_country: pph.country,
    }));
    setShowPatientSearch(false);
  };

  // ---------------------------------------------------------------- steps
  const validateStep = async (target: Step): Promise<boolean> => {
    if (target === 'details') return trigger(['patient_name']);
    if (target === 'timing') return trigger(['date', 'start_time', 'end_time']);
    return true;
  };

  const goNext = async () => {
    if (step === 'details' && (await validateStep('details'))) setStep('timing');
    else if (step === 'timing' && (await validateStep('timing'))) setStep('invite');
  };

  const goBack = () => {
    if (step === 'timing') setStep('details');
    else if (step === 'invite') setStep('timing');
  };

  // ---------------------------------------------------------------- submit
  const onSave = handleSubmit(async (formData) => {
    // Only proceed if submission was triggered by explicit click on submit button
    if (!submitTriggeredRef.current) {
      return;
    }
    submitTriggeredRef.current = false; // reset guard
    await persistSave(formData, false);
  });

  const persistSave = async (formData: EventFormValues, force: boolean) => {
    setBusy(true);
    setError('');
    try {
      const firstDoctor = invitees.find(
        (i) => (i.role || '').toLowerCase() === 'doctor'
      );
      const dentistName = firstDoctor
        ? `${firstDoctor.first_name || ''} ${firstDoctor.last_name || ''}`.trim()
        : '';
      const body: EventInput = {
        ...formData,
        title: formData.title || `Cita con ${formData.patient_name}`,
        dentist: formData.dentist || dentistName || '',
      };
      if (force) body.force_conflict = true;
      let eventId: number | undefined = editingEvent?.id;
      if (editingEvent?.id) {
        await mutations.updateEvent.mutateAsync({ id: editingEvent.id, updates: body });
      } else {
        const created = await mutations.createEvent.mutateAsync(body);
        eventId = created.id;
      }
      // Sub-resources (reminders + invitees) are awaited so failures become
      // visible instead of being swallowed: a reminder that never lands is exactly
      // the silent bug we're fixing. A failure here must NOT block the modal
      // close — the event itself already saved.
      if (eventId) {
        try {
          await CalendarRepository.setEventReminders(eventId, reminders);
        } catch (err) {
          console.error('[EventModal] reminders save failed', err);
          push('Cita guardada, pero el recordatorio no se pudo guardar', 'error');
        }
        await CalendarRepository.setEventInvitees(eventId, invitees.map((i) => i.id)).catch(
          (err) => {
            if (isDentistConflictError(err)) {
              push(err.message, 'error');
            } else {
              console.error('[EventModal] invitees save failed', err);
              push('Cita guardada, pero los invitados no se pudieron guardar', 'error');
            }
          }
        );
      }
      if (dateStr) clearEventDraft(dateStr);
      push(editingEvent ? 'Cita actualizada' : 'Cita creada', 'success');
      onSaved();
      onClose();
    } catch (err) {
      if (isDentistConflictError(err)) {
        push(err.message, 'error');
        setConflict({ message: err.message, formData });
      } else {
        setError('No se pudo guardar la cita. Inténtalo de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmConflictOverride = async () => {
    if (!conflict) return;
    const formData = conflict.formData;
    setConflictBusy(true);
    setConflict(null);
    try {
      await persistSave(formData, true);
    } finally {
      setConflictBusy(false);
    }
  };

  const onDelete = async () => {
    if (!editingEvent?.id) return;
    setDeleting(true);
    setError('');
    try {
      // Fire-and-forget: modal closes instantly; SSE + background refetch settle cache.
      void mutations.deleteEvent.mutateAsync(editingEvent.id);
      if (dateStr) clearEventDraft(dateStr);
      push('Cita eliminada', 'success');
      onSaved();
      onClose();
    } catch {
      setError('Error al eliminar la cita');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  // Invitees = any clinic user (admin/doctor/assistant/tech_support). No role
  // filter — the search narrows the pool; the dentist auto-fill below only
  // considers invitees whose role is `doctor`.
  const filteredPool = userPool.filter((u) => {
    const q = inviteeQuery.toLowerCase();
    return (
      `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const selectedCount = invitees.length;

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className="bg-white dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
          role="dialog"
          aria-modal="true"
          aria-label={isCreate ? 'Nueva cita' : 'Editar cita'}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900/95 z-10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                <Pencil size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-tight">
                  {isCreate ? 'Nueva cita' : 'Editar cita'}
                </h2>
                <p className="text-xs text-gray-400">
                  {step === 'details' && '1 de 3 · Detalles'}
                  {step === 'timing' && '2 de 3 · Horario'}
                  {step === 'invite' && '3 de 3 · Invitados y recordatorios'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>

          {draftAvailable && (
            <div className="mx-5 mt-4 flex items-center justify-between gap-3 text-sm rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2.5">
              <span className="text-amber-800 dark:text-amber-200">Tienes un borrador sin guardar para este día.</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={restoreDraft}
                  className="flex items-center gap-1 text-amber-900 dark:text-amber-100 font-medium hover:underline"
                >
                  <RotateCcw size={13} /> Restaurar
                </button>
                <button onClick={discardDraft} className="text-amber-700 dark:text-amber-300 hover:underline">
                  Descartar
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={onSave}
            onKeyDown={(e) => {
              // Prevent Enter from submitting the form; only allow explicit submit button click
              if (e.key === 'Enter' && e.target instanceof HTMLButtonElement === false) {
                e.preventDefault();
              }
            }}
            className="p-5 space-y-5"
          >
            <StepBar step={step} />

            {/* ------------------------------------------------ STEP 1: details */}
            {step === 'details' && (
              <>
                <div>
                  <Field label="Paciente *" error={errors.patient_name?.message}>
                    <div className="flex gap-2">
                      <TextInput
                        invalid={!!errors.patient_name}
                        placeholder="Nombre del paciente"
                        {...register('patient_name')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPatientSearch((v) => !v)}
                        className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label="Buscar paciente"
                      >
                        <Search size={18} />
                      </button>
                    </div>
                  </Field>

                  {showPatientSearch && (
                    <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                      <input
                        autoFocus
                        value={patientQuery}
                        onChange={(e) => setPatientQuery(e.target.value)}
                        placeholder="Buscar por nombre o identidad…"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:bg-gray-800 dark:border-gray-700 focus:border-teal-500 outline-none"
                      />
                      <div className="mt-2 max-h-48 overflow-y-auto">
                        {patientSearching ? (
                          <p className="text-center py-3 text-sm text-gray-400">Buscando…</p>
                        ) : patientResults.length > 0 ? (
                          patientResults.map((p) => (
                            <button
                              key={p.paciente_id}
                              type="button"
                              onClick={() => selectPatient(p)}
                              className="w-full text-left p-2.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 text-sm"
                            >
                              <span className="font-medium text-gray-800 dark:text-gray-100">{p.nombre_completo}</span>
                              {p.telefono ? <span className="text-xs text-gray-400 ml-2">{p.telefono}</span> : null}
                            </button>
                          ))
                        ) : patientQuery.trim() !== '' ? (
                          <p className="text-center py-3 text-sm text-gray-400">Sin resultados</p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CustomOptionField
                    label="Procedimiento"
                    options={PROCEDURES}
                    control={control}
                    name="procedure"
                    error={errors.procedure?.message}
                  />
                  <Field label="Teléfono" error={errors.phone?.message}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={values.phone_country || '504'}
                          onChange={(e) => setValue('phone_country', e.target.value, { shouldDirty: true })}
                          aria-label="Código de país"
                          className="flex-1"
                        >
                          {countries.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                        <div className="shrink-0 px-3 py-2 border border-gray-300 dark:border-gray-700 bg-transparent text-gray-700 dark:text-gray-200 font-medium text-sm flex items-center rounded-lg">
                          +{values.phone_country || '504'}
                        </div>
                      </div>
                      <TextInput
                        placeholder={getPhonePlaceholder(values.phone_country || '504')}
                        inputMode="tel"
                        autoComplete="tel"
                        invalid={!!errors.phone}
                        {...register('phone')}
                        onChange={(e) => {
                          setValue('phone', formatPhoneNumber(e.target.value, values.phone_country || '504'), {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                        }}
                      />
                    </div>
                  </Field>
                </div>

                <Field label="Título">
                  <TextInput {...register('title')} />
                </Field>

                <Field label="Descripción">
                  <TextArea rows={2} placeholder="Detalles de la cita…" {...register('description')} />
                </Field>

                <Field label="Ubicación">
                  <TextInput placeholder="Clínica / Consultorio" {...register('location')} />
                </Field>
              </>
            )}

            {/* ------------------------------------------------ STEP 2: timing */}
            {step === 'timing' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Fecha *" error={errors.date?.message}>
                    <TextInput type="date" invalid={!!errors.date} {...register('date')} />
                  </Field>
                  <Field label="Inicio *" error={errors.start_time?.message}>
                    <TimeInput
                      aria-label="Hora de inicio"
                      invalid={!!errors.start_time}
                      value={startTimeField.field.value}
                      onChange={(v) => startTimeField.field.onChange(v)}
                    />
                  </Field>
                  <Field label="Fin *" error={errors.end_time?.message}>
                    <TimeInput
                      aria-label="Hora de fin"
                      invalid={!!errors.end_time}
                      value={endTimeField.field.value}
                      onChange={(v) => {
                        autoEndRef.current = false;
                        endTimeField.field.onChange(v);
                      }}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Tipo">
                    <Select {...register('event_type')}>
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {EVENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Estado">
                    <Select {...register('status')}>
                      {(Object.keys(STATUS_LABELS) as EventStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Prioridad">
                    <Select {...register('priority')}>
                      {(Object.keys(PRIORITY_LABELS) as EventPriority[]).map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="Color">
                  <div className="flex gap-2 mt-1">
                    {EVENT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => reset((prev) => ({ ...prev, color: c.value }))}
                        className={`w-8 h-8 rounded-full transition ${
                          values.color === c.value
                            ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.value }}
                        aria-label={c.name}
                      />
                    ))}
                  </div>
                </Field>
              </>
            )}

            {/* ------------------------------------------------ STEP 3: invitees + reminders */}
            {step === 'invite' && (
              <>
                <div>
                  <Field label="Invitados" hint={`${selectedCount} seleccionado${selectedCount === 1 ? '' : 's'}`}>
                    <button
                      type="button"
                      onClick={() => setShowInviteePicker((v) => !v)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {selectedCount === 0 ? 'Buscar usuarios para invitar…' : `${selectedCount} usuario(s)`}
                    </button>
                  </Field>

                  {showInviteePicker && (
                    <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                      <input
                        value={inviteeQuery}
                        onChange={(e) => setInviteeQuery(e.target.value)}
                        placeholder="Filtrar usuarios…"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm dark:bg-gray-800 dark:border-gray-700 focus:border-teal-500 outline-none"
                      />
                      <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                        {filteredPool.length === 0 ? (
                          <p className="text-center py-3 text-sm text-gray-400">Sin usuarios</p>
                        ) : (
                          filteredPool.map((u) => {
                            const selected = invitees.some((i) => i.id === u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() =>
                                  setInvitees((prev) => (selected ? prev.filter((i) => i.id !== u.id) : [...prev, u]))
                                }
                                className={`w-full text-left p-2.5 rounded-lg border text-sm flex items-center gap-3 ${
                                  selected
                                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30'
                                    : 'border-gray-200 dark:border-gray-700'
                                }`}
                              >
                                <img
                                  src={avatarFor(u)}
                                  alt={`${u.first_name || ''} ${u.last_name || ''}`}
                                  className="h-8 w-8 rounded-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.src = avatarFor({ ...u, profileImageUrl: '' });
                                  }}
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="block font-medium text-gray-800 dark:text-gray-100 truncate">
                                    {u.first_name || ''} {u.last_name || ''}
                                  </span>
                                  {u.email ? (
                                    <span className="block text-xs text-gray-400 truncate">{u.email}</span>
                                  ) : null}
                                </span>
                                {selected && <Check size={16} className="text-teal-600" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {invitees.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {invitees.map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-2 pl-1 pr-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-700 dark:text-gray-200"
                        >
                          <img
                            src={avatarFor(u)}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = avatarFor({ ...u, profileImageUrl: '' });
                            }}
                          />
                          <span className="max-w-[120px] truncate">
                            {u.first_name || ''} {u.last_name || ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setInvitees((prev) => prev.filter((i) => i.id !== u.id))}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            aria-label="Quitar"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Field label="Recordatorios">
                    <div className="space-y-2">
                      {reminders.map((minutes, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select
                            value={String(minutes)}
                            onChange={(e) => {
                              remindersTouchedRef.current = true;
                              const next = reminders.slice();
                              next[index] = Number(e.target.value);
                              setReminders(next);
                            }}
                          >
                            {REMINDER_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                          {reminders.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                remindersTouchedRef.current = true;
                                setReminders(reminders.filter((_, i) => i !== index));
                              }}
                              className="text-rose-500 hover:text-rose-600"
                              aria-label="Quitar recordatorio"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          remindersTouchedRef.current = true;
                          setReminders([...reminders, 30]);
                        }}
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        + Añadir recordatorio
                      </button>
                    </div>
                  </Field>
                </div>

                <Field label="Notas">
                  <TextArea rows={2} placeholder="Notas adicionales…" {...register('notes')} />
                </Field>
              </>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {loadingChildren && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Cargando invitados y recordatorios…
              </p>
            )}

            {/* --------------------------------------------------- footer */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              {editingEvent ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { if (editingEvent && onDuplicate) onDuplicate(editingEvent); }}
                    className="flex items-center gap-1.5 text-teal-600 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-900/30 px-3 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <CopyPlus size={16} /> Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 px-3 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-gray-400 pl-1">
                  <Clock size={13} /> {formatClock12(values.start_time)} – {formatClock12(values.end_time)}
                </span>
              )}

              <div className="flex items-center gap-2">
                {step !== 'details' && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 text-sm font-medium"
                  >
                    <ChevronLeft size={16} /> Atrás
                  </button>
                )}
                {step !== 'invite' ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex items-center gap-1 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition"
                  >
                    Continuar <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    onClick={() => {
                      submitTriggeredRef.current = true;
                    }}
                    disabled={busy || deleting}
                    className="flex items-center gap-2 bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition disabled:opacity-50"
                  >
                    {busy && <Loader2 className="animate-spin" size={16} />}
                    {busy ? 'Guardando…' : editingEvent ? 'Actualizar' : 'Crear cita'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </motion.div>
      </motion.div>

      {confirmDelete && <DeleteConfirm busy={deleting} error={error} onCancel={() => setConfirmDelete(false)} onConfirm={onDelete} />}

      <ConflictOverrideDialog
        open={!!conflict}
        busy={conflictBusy}
        message={conflict?.message ?? ''}
        onCancel={() => setConflict(null)}
        onConfirm={() => void confirmConflictOverride()}
      />
    </>
  );
}

// ------------------------------------------------------------------ sub-components

function StepBar({ step }: { step: Step }) {
  const items: Array<{ step: Step; label: string; icon: typeof UserRound }> = [
    { step: 'details', label: 'Detalles', icon: UserRound },
    { step: 'timing', label: 'Horario', icon: Clock },
    { step: 'invite', label: 'Invitados', icon: Bell },
  ];
  const idx = items.findIndex((i) => i.step === step);
  return (
    <div className="flex items-center gap-2">
      {items.map((item, i) => {
        const Icon = item.icon;
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={item.step} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full flex-1 justify-center ${
                active
                  ? 'bg-teal-600 text-white'
                  : done
                    ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
              }`}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{item.label}</span>
            </div>
            {i < items.length - 1 && <div className="h-px w-3 bg-gray-200 dark:bg-gray-700" />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Clinic option list with a free-text escape (C21 — clinic-defined
 * dentist/procedure labels survive because the DB column is VARCHAR, not enum).
 */
function CustomOptionField({
  label,
  options,
  control,
  name,
  error,
}: {
  label: string;
  options: string[];
  control: Control<EventFormValues>;
  name: 'procedure' | 'dentist';
  error?: string;
}) {
  const { field } = useController({ control, name });
  const [customOpen, setCustomOpen] = useState(false);
  const hasCustom = field.value !== '' && !options.includes(field.value);
  const showCustom = customOpen || hasCustom;

  return (
    <Field label={label} error={error}>
      {showCustom ? (
        <div className="flex gap-2">
          <TextInput
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            placeholder="Escribe una opción personalizada…"
            invalid={!!error}
          />
          <button
            type="button"
            onClick={() => setCustomOpen(false)}
            className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 text-xs"
          >
            Usar lista
          </button>
        </div>
      ) : (
        <Select
          value={field.value || ''}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setCustomOpen(true);
              field.onChange('');
            } else {
              field.onChange(e.target.value);
            }
          }}
          invalid={!!error}
        >
          <option value="">Seleccionar…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="__custom__">✎ Personalizado…</option>
        </Select>
      )}
    </Field>
  );
}

function DeleteConfirm({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-md z-[60] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-gray-950 rounded-xl shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Eliminar cita</h3>
        {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          ¿Seguro? Se eliminará de forma permanente junto con sus recordatorios e invitados.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            {busy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}