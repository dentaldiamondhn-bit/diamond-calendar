'use client';

import React, { useState, useEffect } from 'react';
import { CalendarEvent, CalendarEventWithPatient } from '../../types/calendar';
import { CalendarEventWithInvitees } from '../../types/calendarInvitees';
import { CalendarService } from '../../services/calendarService';
import { CalendarInviteesService } from '../../services/calendarInviteesService';
import { CalendarReminderService } from '../../services/calendarReminderService';
import { InviteeNotificationService } from '../../services/inviteeNotificationService';
import { UserSelect } from './UserSelect';
import { format, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { SimpleTimezoneFix } from '../../services/simpleTimezoneFix';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: CalendarEventWithPatient | null;
  onSave: (event: CalendarEvent) => void;
  userId: string;
}

interface PatientSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPatient: (patient: any) => void;
}

const PatientSearchModal: React.FC<PatientSearchModalProps> = ({ isOpen, onClose, onSelectPatient }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setPatients([]);
      return;
    }

    const searchPatients = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          setPatients(data.slice(0, 5)); // Limit to 5 results
        }
      } catch (error) {
        console.error('Error searching patients:', error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchPatients, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Buscar Paciente
        </h3>
        
        <input
          type="text"
          placeholder="Buscar por nombre o ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
          autoFocus
        />

        <div className="mt-4 max-h-60 overflow-y-auto">
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          ) : patients.length > 0 ? (
            patients.map((patient) => (
              <div
                key={patient.paciente_id}
                className={`p-3 border border-gray-200 dark:border-gray-600 rounded-md mb-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  selectedPatient?.paciente_id === patient.paciente_id ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600' : ''
                }`}
                onClick={() => setSelectedPatient(patient)}
              >
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {patient.nombre_completo}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  ID: {patient.numero_identidad} • {patient.telefono}
                </div>
              </div>
            ))
          ) : searchQuery.trim() !== '' ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              No se encontraron pacientes
            </div>
          ) : null}
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (selectedPatient) {
                onSelectPatient(selectedPatient);
                onClose();
              }
            }}
            disabled={!selectedPatient}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Seleccionar
          </button>
        </div>
      </div>
    </div>
  );
};

export const EventModal: React.FC<EventModalProps> = ({ isOpen, onClose, event, onSave, userId }) => {
  const [formData, setFormData] = useState<Partial<CalendarEvent>>({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    all_day: false,
    location: '',
    event_type: 'appointment',
    status: 'scheduled',
    priority: 'medium',
    patient_id: '',
    notes: '',
  });
  const [reminders, setReminders] = useState<Array<{ id?: string; minutes_before: number }>>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title || '',
        description: event.description || '',
        start_date: formatDateTimeLocal(event.start_date),
        end_date: formatDateTimeLocal(event.end_date),
        all_day: event.all_day || false,
        location: event.location || '',
        event_type: event.event_type || 'appointment',
        status: event.status || 'scheduled',
        priority: event.priority || 'medium',
        patient_id: event.patient_id || '',
        notes: event.notes || '',
      });
      setSelectedPatient(event.patient || null);
      
      // Load existing reminders
      if (event.id) {
        loadReminders(event.id);
        loadInvitees(event.id);
      } else {
        // Set default reminder for new events
        setReminders([{ minutes_before: 30 }]);
      }
    } else {
      // Set default values for new event
      const now = new Date();
      // Format for HTML datetime-local input (yyyy-MM-ddThh:mm)
      const startTime = format(now, "yyyy-MM-dd'T'HH:mm", { locale: es });
      const endTime = format(addMinutes(now, 60), "yyyy-MM-dd'T'HH:mm", { locale: es });
      
      setFormData(prev => ({
        ...prev,
        start_date: startTime,
        end_date: endTime,
      }));
      setSelectedUsers([]);
      setReminders([{ minutes_before: 30 }]);
    }
  }, [event]);

  const loadReminders = async (eventId: string) => {
    try {
      const response = await fetch(`/api/calendar/events/${eventId}/reminders`);
      if (response.ok) {
        const data = await response.json();
        setReminders(data.map((r: any) => ({ id: r.id, minutes_before: r.minutes_before })));
      }
    } catch (error) {
      console.error('Error loading reminders:', error);
      setReminders([{ minutes_before: 30 }]);
    }
  };

  const addReminder = () => {
    const commonTimes = [10, 15, 30, 60, 120, 1440]; // Common reminder times
    const usedTimes = reminders.map(r => r.minutes_before);
    const nextTime = commonTimes.find(time => !usedTimes.includes(time)) || 0;
    setReminders([...reminders, { minutes_before: nextTime }]);
  };

  const removeReminder = (index: number) => {
    if (reminders.length > 1) {
      setReminders(reminders.filter((_, i) => i !== index));
    }
  };

  const updateReminder = (index: number, minutes_before: number) => {
    setReminders(reminders.map((r, i) => i === index ? { ...r, minutes_before } : r));
  };

  const loadInvitees = async (eventId: string) => {
    try {
      const invitees = await CalendarInviteesService.getInviteesForItem('event', eventId);
      setSelectedUsers(invitees.map(invitee => invitee.user));
    } catch (error) {
      console.error('Error loading invitees:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'El título es requerido';
    }
    if (!formData.start_date) {
      newErrors.start_date = 'La fecha de inicio es requerida';
    }
    if (!formData.end_date) {
      newErrors.end_date = 'La fecha de fin es requerida';
    }
    if (formData.start_date && formData.end_date && formData.start_date >= formData.end_date) {
      newErrors.end_date = 'La fecha de fin debe ser posterior a la de inicio';
    }

    // Additional mobile-specific validation
    if (formData.start_date) {
      try {
        const startDate = new Date(formData.start_date);
        if (isNaN(startDate.getTime())) {
          newErrors.start_date = 'Fecha de inicio inválida';
        }
      } catch (error) {
        console.error('Error parsing start date on mobile:', error);
        newErrors.start_date = 'Error en formato de fecha';
      }
    }

    if (formData.end_date) {
      try {
        const endDate = new Date(formData.end_date);
        if (isNaN(endDate.getTime())) {
          newErrors.end_date = 'Fecha de fin inválida';
        }
      } catch (error) {
        console.error('Error parsing end date on mobile:', error);
        newErrors.end_date = 'Error en formato de fecha';
      }
    }

    setErrors(newErrors);
    
    // Log validation errors for mobile debugging
    if (Object.keys(newErrors).length > 0) {
      console.error('🚨 Mobile Event Form Validation Errors:', newErrors);
      console.error('📱 Form Data:', formData);
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const saveReminders = async (itemId: string, itemType: 'event' | 'task') => {
    try {
      // Delete existing reminders
      const response = await fetch(`/api/calendar/${itemType}s/${itemId}/reminders`, {
        method: 'DELETE',
      });

      // Create new reminders
      const validReminders = reminders.filter(r => r.minutes_before > 0);
      if (validReminders.length > 0) {
        const reminderData = validReminders.map(reminder => ({
          item_type: itemType,
          item_id: itemId,
          minutes_before: reminder.minutes_before,
          reminder_time: new Date(
            new Date(SimpleTimezoneFix.toTimezoneAwareISO(formData.start_date)).getTime() -
            reminder.minutes_before * 60000
          ).toISOString(),
          created_by: userId,
          sent: false
        }));

        const createResponse = await fetch(`/api/calendar/${itemType}s/${itemId}/reminders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reminderData),
        });

        if (!createResponse.ok) {
          console.error('Error saving reminders:', await createResponse.text());
        }
      }
    } catch (error) {
      console.error('Error saving reminders:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    
    try {
      const eventData: CalendarEvent = {
        ...formData as CalendarEvent,
        start_date: SimpleTimezoneFix.toTimezoneAwareISO(formData.start_date),
        end_date: SimpleTimezoneFix.toTimezoneAwareISO(formData.end_date),
        created_by: userId,
        patient_id: formData.patient_id || null,
      };

      let savedEvent: CalendarEventWithPatient;
      
      if (event?.id) {
        savedEvent = await CalendarService.updateEvent(event.id, eventData);
        
        await CalendarInviteesService.deleteInviteesForItem('event', savedEvent.id);
        
        if (selectedUsers.length > 0) {
          const inviteesData = selectedUsers.map(user => ({
            user_id: user.id,
            item_type: 'event' as const,
            item_id: savedEvent.id,
            status: 'pending' as const,
            created_by: userId
          }));
          
          await CalendarInviteesService.createMultipleInvitees(inviteesData);
        }

        await saveReminders(savedEvent.id, 'event');
        
        // Create notification for updated event
        await CalendarReminderService.createEventNotification(
          { ...savedEvent, patient: selectedPatient },
          'updated'
        );
        // Notify invitees of updated event
        await InviteeNotificationService.notifyEventInvitees(
          { ...savedEvent, patient: selectedPatient },
          'updated'
        );
      } else {
        savedEvent = await CalendarService.createEvent(eventData);
        
        await CalendarInviteesService.deleteInviteesForItem('event', savedEvent.id);
        
        if (selectedUsers.length > 0) {
          const inviteesData = selectedUsers.map(user => ({
            user_id: user.id,
            item_type: 'event' as const,
            item_id: savedEvent.id,
            status: 'pending' as const,
            created_by: userId
          }));
          
          await CalendarInviteesService.createMultipleInvitees(inviteesData);
        }

        await saveReminders(savedEvent.id, 'event');
        
        // Create notification for new event
        await CalendarReminderService.createEventNotification(
          { ...savedEvent, patient: selectedPatient },
          'created'
        );
        // Notify invitees of new event
        await InviteeNotificationService.notifyEventInvitees(
          { ...savedEvent, patient: selectedPatient },
          'created'
        );
      }

      onSave(eventData);
      onClose();
    } catch (error) {
      console.error('Error saving event:', error);
    } finally {
      setLoading(false);
    }
  };

  // Delete event functions
  const openDeleteModal = () => {
    if (!event?.id) return;
    setShowDeleteModal(true);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError(null);
    setDeleteSuccess(false);
  };

  const deleteEvent = async () => {
    if (!event?.id) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      // Delete the event
      await CalendarService.deleteEvent(event.id);

      // Notify invitees of cancellation
      if (event) {
        await InviteeNotificationService.notifyEventInvitees(
          event as any,
          'cancelled'
        );
      }
      
      // Show success state
      setDeleteSuccess(true);
      setIsDeleting(false);
      
    } catch (error) {
      console.error('Error deleting event:', error);
      setDeleteError('Error al eliminar el evento. Por favor intente nuevamente.');
      setIsDeleting(false);
    }
  };

  // Helper function to convert Clerk user ID to valid UUID format for Supabase
const clerkIdToUuid = (clerkId: string): string => {
  // Generate a proper UUID v4 using crypto API
  // This ensures compatibility with Supabase UUID fields
  return crypto.randomUUID();
};

// Helper function to handle Clerk user ID compatibility
const handleUserId = (userId: string): string => {
  // Use crypto.randomUUID() which always generates valid UUID v4
  // This ensures Supabase compatibility
  return crypto.randomUUID();
};

// Helper function to get current local datetime in format yyyy-MM-ddThh:mm
const getCurrentLocalDateTime = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Helper function to format date for HTML datetime-local input
const formatDateTimeLocal = (date: string | Date): string => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const localDate = new Date(dateObj.getTime() + dateObj.getTimezoneOffset() * 60000);
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hours = String(localDate.getHours()).padStart(2, '0');
    const minutes = String(localDate.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    console.error('Error formatting date time local:', error);
    return typeof date === 'string' ? date : '';
  }
};

const handlePatientSelect = (patient: any) => {
    setSelectedPatient(patient);
    setFormData(prev => ({ 
      ...prev, 
      patient_id: patient.paciente_id,
      title: prev.title || `Cita con ${patient.nombre_completo}` // Auto-populate title if empty
    }));
  };

  const handleRemovePatient = () => {
    setSelectedPatient(null);
    setFormData(prev => ({ ...prev, patient_id: '' }));
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-100 dark:border-gray-700">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
            <h2 className="text-2xl font-bold text-white">
              {event ? 'Editar Evento' : 'Nuevo Evento'}
            </h2>
            <p className="text-white/80 text-sm mt-1">
              {event ? 'Actualiza los detalles del evento' : 'Crea un nuevo evento en el calendario'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Title with Patient Search */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Título del Evento <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className={`flex-1 px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all ${
                    errors.title ? 'border-red-500 bg-red-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  placeholder="Ej: Consulta con paciente"
                />
                <button
                  type="button"
                  onClick={() => setShowPatientSearch(true)}
                  className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 flex items-center shadow-md hover:shadow-lg transition-all"
                  title="Buscar paciente"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
              {errors.title && <p className="text-red-500 text-sm mt-2 flex items-center"><svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>{errors.title}</p>}
            </div>

            {/* Selected Patient Display */}
            {selectedPatient && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 rounded-xl border border-blue-200 dark:border-blue-700">
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                      {selectedPatient.nombre_completo.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3">
                      <div className="font-semibold text-blue-900 dark:text-blue-100">
                        {selectedPatient.nombre_completo}
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300 flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
                        {selectedPatient.numero_identidad}
                        <span className="mx-2">•</span>
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.773-1.548a1 1 0 011.06-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>
                        {selectedPatient.telefono}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePatient}
                    className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                placeholder="Detalles del evento..."
              />
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Fecha y Hora Inicio <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.start_date}
                  onChange={(e) => {
                    console.log('📱 Mobile - Start Date Changed:', e.target.value);
                    setFormData(prev => ({ ...prev, start_date: e.target.value }));
                  }}
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all ${
                    errors.start_date ? 'border-red-500 bg-red-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  min={getCurrentLocalDateTime()}
                />
                {errors.start_date && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-600 dark:text-red-400 text-sm font-medium flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      {errors.start_date}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Fecha y Hora Fin <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={(e) => {
                    console.log('📱 Mobile - End Date Changed:', e.target.value);
                    setFormData(prev => ({ ...prev, end_date: e.target.value }));
                  }}
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all ${
                    errors.end_date ? 'border-red-500 bg-red-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                  min={formData.start_date || getCurrentLocalDateTime()}
                />
                {errors.end_date && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-600 dark:text-red-400 text-sm font-medium flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      {errors.end_date}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* All Day Checkbox */}
            <div className="flex items-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <input
                type="checkbox"
                id="all_day"
                checked={formData.all_day}
                onChange={(e) => setFormData(prev => ({ ...prev, all_day: e.target.checked }))}
                className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
              <label htmlFor="all_day" className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                Todo el día
              </label>
            </div>

            {/* Invitees */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Invitados (Opcional)
              </label>
              <UserSelect
                selectedUsers={selectedUsers}
                onUsersChange={setSelectedUsers}
                placeholder="Seleccionar usuarios para invitar..."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                Los usuarios seleccionados recibirán una invitación a este evento
              </p>
            </div>

            {/* Event Type and Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de Evento
                </label>
                <select
                  value={formData.event_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, event_type: e.target.value as any }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                >
                  <option value="appointment">📅 Cita</option>
                  <option value="consultation">👩‍⚕️ Consulta</option>
                  <option value="surgery">🔬 Surgery</option>
                  <option value="follow_up">📋 Seguimiento</option>
                  <option value="reminder">🔔 Recordatorio</option>
                  <option value="other">📌 Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Estado
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                >
                  <option value="scheduled">⏳ Programado</option>
                  <option value="confirmed">✅ Confirmado</option>
                  <option value="cancelled">❌ Cancelado</option>
                  <option value="completed">🎉 Completado</option>
                </select>
              </div>
            </div>

            {/* Priority and Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Prioridad
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                >
                  <option value="low">🟢 Baja</option>
                  <option value="medium">🟡 Media</option>
                  <option value="high">🔴 Alta</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Ubicación
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                  placeholder="Ej: Consultorio 1"
                />
              </div>
            </div>

            {/* Multiple Reminders */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                  🔔 Recordatorios
                </label>
                <button
                  type="button"
                  onClick={addReminder}
                  className="text-sm bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-3 py-1.5 rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all shadow-sm"
                >
                  <i className="fas fa-plus mr-1"></i>
                  Agregar
                </button>
              </div>
              
              {reminders.map((reminder, index) => (
                <div key={index} className="flex items-center gap-2 mb-2">
                  <select
                    value={reminder.minutes_before}
                    onChange={(e) => updateReminder(index, parseInt(e.target.value))}
                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all hover:border-gray-300"
                  >
                    <option value={0}>🚫 Sin recordatorio</option>
                    <option value={10}>⏰ 10 minutos</option>
                    <option value={15}>⏰ 15 minutos</option>
                    <option value={30}>⏰ 30 minutos</option>
                    <option value={60}>⏰ 1 hora</option>
                    <option value={120}>⏰ 2 horas</option>
                    <option value={180}>⏰ 3 horas</option>
                    <option value={360}>⏰ 6 horas</option>
                    <option value={720}>🌙 12 horas</option>
                    <option value={1440}>📅 1 día</option>
                    <option value={2880}>📅 2 días</option>
                    <option value={4320}>📅 3 días</option>
                    <option value={10080}>📆 1 semana</option>
                  </select>
                  
                  {reminders.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeReminder(index)}
                      className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all hover:scale-110"
                      title="Eliminar recordatorio"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
              ))}
              
              {reminders.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
                  No hay recordatorios configurados
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                📝 Notas
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300 resize-none"
                placeholder="Notas adicionales sobre el evento..."
              />
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-xl border border-red-200 dark:border-red-700">
                <p className="text-red-700 dark:text-red-300 font-medium">{errors.submit}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
              {/* Delete button - only show for existing events */}
              {event && (
                <button
                  type="button"
                  onClick={openDeleteModal}
                  className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Eliminar
                </button>
              )}
              
              {/* Save/Cancel buttons */}
              <div className="flex gap-3 justify-end ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg relative"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Guardando...
                    </span>
                  ) : (
                    <span className="font-medium">{event ? '💾 Actualizar' : '➕ Crear Evento'}</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <PatientSearchModal
        isOpen={showPatientSearch}
        onClose={() => setShowPatientSearch(false)}
        onSelectPatient={handlePatientSelect}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full sm:mx-0 sm:h-10 sm:w-10 ${
                    deleteSuccess ? 'bg-green-100 dark:bg-green-900' : deleteError ? 'bg-red-100 dark:bg-red-900' : 'bg-red-100 dark:bg-red-900'
                  }`}>
                    <i className={`fas ${
                      deleteSuccess ? 'fa-check-circle text-green-600 dark:text-green-400' : 
                      deleteError ? 'fa-times-circle text-red-600 dark:text-red-400' : 
                      isDeleting ? 'fa-spinner fa-spin text-red-600 dark:text-red-400' : 
                      'fa-exclamation-triangle text-red-600 dark:text-red-400'
                    }`}></i>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      {deleteSuccess ? 'Evento Eliminado' : deleteError ? 'Error al Eliminar' : isDeleting ? 'Eliminando Evento...' : 'Eliminar Evento'}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {deleteSuccess 
                          ? `El evento "${event?.title}" ha sido eliminado exitosamente.`
                          : isDeleting 
                          ? 'Por favor espere mientras se elimina el evento y todos sus datos relacionados...'
                          : `¿Está seguro de que desea eliminar el evento "${event?.title}"?`
                        }
                      </p>
                      {!isDeleting && !deleteSuccess && (
                        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                          <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                            <i className="fas fa-exclamation-triangle mr-1"></i>
                            Esta acción eliminará permanentemente:
                          </p>
                          <ul className="text-xs text-amber-700 dark:text-amber-300 mt-1 ml-4 list-disc">
                            <li>El evento y toda su información</li>
                            <li>Los recordatorios asociados</li>
                            <li>Las invitaciones a usuarios</li>
                            <li>Las tareas relacionadas (si existen)</li>
                          </ul>
                          <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mt-2">
                            Esta acción no se puede deshacer.
                          </p>
                        </div>
                      )}
                      {deleteError && (
                        <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                          <p className="text-sm text-red-800 dark:text-red-200">
                            <i className="fas fa-exclamation-circle mr-1"></i>
                            Error: {deleteError}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                {!isDeleting && !deleteSuccess ? (
                  <>
                    <button 
                      type="button" 
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm" 
                      onClick={deleteEvent}
                      disabled={isDeleting}
                    >
                      <i className="fas fa-trash mr-2"></i>
                      Eliminar Evento
                    </button>
                    <button 
                      type="button" 
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" 
                      onClick={closeDeleteModal}
                    >
                      Cancelar
                    </button>
                  </>
                ) : deleteSuccess ? (
                  <button 
                    type="button" 
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:w-auto sm:text-sm" 
                    onClick={() => {
                      closeDeleteModal();
                      onClose(); // Close the main event modal as well
                    }}
                  >
                    <i className="fas fa-check mr-2"></i>
                    Aceptar
                  </button>
                ) : (
                  <div className="w-full text-center">
                    <div className="inline-flex items-center text-red-600 dark:text-red-400">
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Eliminando evento...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
