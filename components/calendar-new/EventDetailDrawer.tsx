'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { X, Trash2, Pencil, CopyPlus, Loader2, MapPin, UserRound, CalendarDays, Clock, Stethoscope, FileText, Bell, Mail, ArrowUpRight, Phone, LayoutGrid, FilePlus2, type LucideIcon } from 'lucide-react';
import { formatPhoneDisplay, createWhatsAppUrl } from '@/utils/phoneUtils';
import AnimatedWhatsApp from '@/components/AnimatedWhatsApp';
import type { ClinicEvent } from '@/lib/types-calendar';
import { formatClock12 } from '@/calendario/timezone';
import {
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type EventType,
  type EventStatus,
  type EventPriority,
} from '@/calendario/event/eventSchema';
import { CalendarRepository } from '@/calendario/calendarRepository';
import { reminderLabel } from '@/calendario/reminderLabel';
import { useCalendarMutations } from '@/calendario/hooks/useCalendarData';
import { useToast } from '@/components/calendar-new/Toast';

interface Props {
  /** Non-null while the drawer is open (C18 — slot/event select => detail drawer). */
  event: ClinicEvent | null;
  /** Logged-in Clerk user id — used to hide Edit/Delete on other users' events. */
  userId: string;
  onClose: () => void;
  /** Swap to edit: closes the drawer and opens the modal pre-filled (C18). */
  onEdit: (event: ClinicEvent) => void;
  /** Copy this event into a new (still-editable) one — works for shared citas too. */
  onDuplicate: (event: ClinicEvent) => void;
  /** Called after a successful delete (parent refetches + closes). */
  onDeleted: () => void;
}

interface DrawerInvitee {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  profileImageUrl?: string | null;
  status: string;
}

const avatarFor = (u: DrawerInvitee) =>
  u.profileImageUrl ||
  `https://ui-avatars.com/api/?name=${encodeURIComponent((u.first_name || '') + ' ' + (u.last_name || ''))}&background=random`;

function timeSpan(e: ClinicEvent): string {
  return `${formatClock12(e.start_time)} – ${formatClock12(e.end_time || e.start_time)}`;
}

export default function EventDetailDrawer({ event, userId, onClose, onEdit, onDuplicate, onDeleted }: Props) {
  const { push } = useToast();
  const removeEvent = useCalendarMutations().deleteEvent;
  const isOwner = !!event && event.user_id === userId;

  const [invitees, setInvitees] = useState<DrawerInvitee[]>([]);
  const [reminders, setReminders] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setInvitees([]);
    setReminders([]);
    setConfirmDelete(false);
    setDeleting(false);
    setError('');
    if (!event) return;

    let cancelled = false;
    (async () => {
      try {
        const [inviteeRows, reminderMins, users] = await Promise.all([
          CalendarRepository.getEventInvitees(event.id),
          CalendarRepository.getEventReminders(event.id),
          fetch('/api/users')
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []),
        ]);
        if (cancelled) return;
        const byId = new Map<unknown, DrawerInvitee>((users as DrawerInvitee[]).map((u) => [u.id, u]));
        setInvitees(
          inviteeRows.map((row) => ({
            id: row.user_id,
            status: row.status,
            ...byId.get(row.user_id),
          }))
        );
        setReminders(reminderMins);
      } catch {
        // children best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event]);

  // a11y — Escape closes the drawer (never while delete-confirm is up)
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDelete) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, confirmDelete, onClose]);

  const onDelete = async () => {
    if (!event) return;
    setDeleting(true);
    setError('');
    try {
      // Fire-and-forget: drawer closes instantly; SSE + background refetch settle cache.
      void removeEvent.mutateAsync(event.id);
      push('Cita eliminada', 'success');
      onDeleted();
    } catch {
      setError('Error al eliminar la cita');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  // WhatsApp deep link to the patient's chat (wa.me/<country><digits>), guarded
  // so a phone that already carries its dialing code isn't prepended twice.
  const waLink = (() => {
    const digits = (event?.phone || '').replace(/\D/g, '');
    if (!digits) return '#';
    const country = event?.phone_country || '504';
    return createWhatsAppUrl(digits.startsWith(country) ? digits : `${country}${digits}`);
  })();

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 right-0 w-full max-w-md z-40 bg-white dark:bg-gray-950 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col"
            role="dialog"
            aria-label="Detalles de la cita"
            aria-modal="true"
          >
            <header className="flex items-start justify-between gap-3 p-5 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="mt-1 h-10 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: event.color || '#0d9488' }}
                />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 leading-tight break-words">
                    {event.title || event.patient_name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {event.date} · {timeSpan(event)}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1" aria-label="Cerrar">
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="flex flex-wrap gap-1.5">
                {event.event_type && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                    {EVENT_TYPE_LABELS[event.event_type as EventType] ?? event.event_type}
                  </span>
                )}
                {event.status && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {STATUS_LABELS[event.status as EventStatus] ?? event.status}
                  </span>
                )}
                {event.priority && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    {PRIORITY_LABELS[event.priority as EventPriority] ?? event.priority}
                  </span>
                )}
                {event.reminder_minutes != null && event.reminder_minutes > 0 && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {reminderLabel(event.reminder_minutes)}
                  </span>
                )}
              </div>

              <Row icon={UserRound} label="Paciente">
                {event.patient_id ? (
                  <Link
                    href={`/patient-preview/${event.patient_id}`}
                    className="flex items-center gap-1 text-teal-700 dark:text-teal-300 font-medium hover:underline"
                  >
                    {event.patient_name}
                    <ArrowUpRight size={14} />
                  </Link>
                ) : (
                  <span className="text-gray-800 dark:text-gray-100">{event.patient_name || '—'}</span>
                )}
              </Row>

              {/* Historia clínica: existing patient → Menú Navegación; new patient
                  (not picked from Pacientes *) → blank history form. */}
              {event.patient_id ? (
                <Link
                  href={`/menu-navegacion?id=${encodeURIComponent(event.patient_id)}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 px-4 py-2 text-sm font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900 transition-colors"
                >
                  <LayoutGrid size={16} />
                  Menú
                </Link>
              ) : (
                <Link
                  href="/patient-form"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 px-4 py-2 text-sm font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900 transition-colors"
                >
                  <FilePlus2 size={16} />
                  Nueva Historia Clínica
                </Link>
              )}

              {(event.procedure || event.dentist || event.phone) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {event.procedure && (
                    <Row icon={Stethoscope} label="Procedimiento">
                      <span className="text-gray-800 dark:text-gray-100">{event.procedure}</span>
                    </Row>
                  )}
                  {event.dentist && (
                    <Row icon={UserRound} label="Odontólogo">
                      <span className="text-gray-800 dark:text-gray-100">{event.dentist}</span>
                    </Row>
                  )}
                  {event.phone && (
                    <Row icon={Phone} label="Teléfono">
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir chat de WhatsApp"
                        className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-700 hover:underline dark:text-green-500 dark:hover:text-green-400"
                      >
                        <AnimatedWhatsApp size={18} className="shrink-0" />
                        {formatPhoneDisplay(event.phone, event.phone_country || '504')}
                      </a>
                    </Row>
                  )}
                </div>
              )}

              <Row icon={Clock} label="Horario">
                <span className="text-gray-800 dark:text-gray-100">
                  {timeSpan(event)}
                  {event.date ? ` · ${event.date}` : ''}
                </span>
              </Row>

              {event.location && (
                <Row icon={MapPin} label="Ubicación">
                  <span className="text-gray-800 dark:text-gray-100">{event.location}</span>
                </Row>
              )}

              {event.description && (
                <Row icon={FileText} label="Descripción">
                  <span className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{event.description}</span>
                </Row>
              )}

              {event.notes && (
                <Row icon={FileText} label="Notas">
                  <span className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{event.notes}</span>
                </Row>
              )}

              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Bell size={13} /> Recordatorios
                </p>
                {reminders.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin recordatorios</p>
                ) : (
                  <ul className="space-y-1">
                    {reminders.map((min) => (
                      <li key={min} className="text-sm text-gray-700 dark:text-gray-200">
                        {reminderLabel(min)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Mail size={13} /> Invitados ({invitees.length})
                </p>
                {invitees.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin invitados</p>
                ) : (
                  <ul className="space-y-1.5">
                    {invitees.map((u) => (
                      <li key={u.id} className="flex items-center gap-2.5 text-sm">
                        <img
                          src={avatarFor(u)}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = avatarFor({ ...u, profileImageUrl: '' });
                          }}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-gray-800 dark:text-gray-100 truncate">
                            {u.first_name || ''} {u.last_name || ''}
                          </span>
                          {u.email ? <span className="block text-xs text-gray-400 truncate">{u.email}</span> : null}
                        </span>
                        <span className="text-xs capitalize text-gray-400">{u.status.replace('_', ' ')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <footer className="flex items-center justify-between gap-2 p-5 border-t border-gray-100 dark:border-gray-800">
              <div className="flex-1">
                {isOwner ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 px-3 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Compartida contigo — solo el propietario puede editarla o eliminarla.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 text-sm font-medium"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => onDuplicate(event)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-teal-600 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-900/30 transition"
                >
                  <CopyPlus size={15} /> Duplicar
                </button>
                {isOwner && (
                  <button
                    onClick={() => onEdit(event)}
                    className="flex items-center gap-1.5 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition"
                  >
                    <Pencil size={15} /> Editar
                  </button>
                )}
              </div>
            </footer>

            <AnimatePresence>
              {confirmDelete && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
                        onClick={() => setConfirmDelete(false)}
                        className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={onDelete}
                        disabled={deleting}
                        className="bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {deleting && <Loader2 className="animate-spin" size={16} />}
                        {deleting ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        <div className="text-sm mt-0.5">{children}</div>
      </div>
    </div>
  );
}