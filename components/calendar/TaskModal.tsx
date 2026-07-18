'use client';

import React, { useState, useEffect } from 'react';
import { CalendarTask, CalendarTaskWithPatient } from '../../types/calendarTasks';
import { CalendarTaskService } from '../../services/calendarTaskService';
import { InviteeNotificationService } from '../../services/inviteeNotificationService';
import { SimpleTimezoneFix } from '../../services/simpleTimezoneFix';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: CalendarTaskWithPatient | null;
  onSave: (task: CalendarTask) => void;
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 p-5">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Buscar Paciente
          </h3>
          <p className="text-white/70 text-sm mt-1">
            Selecciona un paciente para asociar a la tarea
          </p>
        </div>
        
        {/* Search Input */}
        <div className="p-5 pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre o ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all duration-200"
              autoFocus
            />
          </div>
        </div>

        {/* Patient List */}
        <div className="px-5 pb-5">
          <div className="max-h-64 overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto"></div>
                <p className="text-gray-500 dark:text-gray-400 mt-2">Buscando pacientes...</p>
              </div>
            ) : patients.length > 0 ? (
              patients.map((patient) => (
                <div
                  key={patient.paciente_id}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedPatient?.paciente_id === patient.paciente_id 
                      ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 dark:border-violet-600' 
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                  }`}
                  onClick={() => setSelectedPatient(patient)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {patient.nombre_completo?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {patient.nombre_completo}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                          </svg>
                          {patient.numero_identidad}
                        </span>
                        <span className="mx-2">•</span>
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {patient.telefono}
                        </span>
                      </div>
                    </div>
                    {selectedPatient?.paciente_id === patient.paciente_id && (
                      <svg className="w-6 h-6 text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              ))
            ) : searchQuery.trim() !== '' ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p>No se encontraron pacientes</p>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p>Escribe para buscar pacientes</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-5 pb-5">
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-gray-600 dark:text-gray-400 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
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
              className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-lg hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-violet-500 disabled:hover:to-purple-600 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Seleccionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, task, onSave, userId }) => {
  const [formData, setFormData] = useState<Partial<CalendarTask>>({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    status: 'pending',
    assigned_to: '',
    patient_id: '',
    event_id: '',
    category: 'other',
    tags: [],
    estimated_duration: 30,
    actual_duration: 0,
    completion_notes: '',
  });
  const [reminders, setReminders] = useState<Array<{ id?: string; minutes_before: number }>>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        due_date: task.due_date || '',
        priority: task.priority,
        status: task.status,
        assigned_to: task.assigned_to || '',
        patient_id: task.patient_id || '',
        event_id: task.event_id || '',
        category: task.category,
        tags: task.tags || [],
        estimated_duration: task.estimated_duration || 30,
        actual_duration: task.actual_duration || 0,
        completion_notes: task.completion_notes || '',
      });
      setSelectedPatient(task.patient || null);
      
      // Load existing reminders
      if (task.id) {
        loadReminders(task.id);
      } else {
        setReminders([{ minutes_before: 30 }]);
      }
    } else {
      // Set default values for new task
      const tomorrow = addDays(new Date(), 1);
      setFormData(prev => ({
        ...prev,
        due_date: tomorrow.toISOString().slice(0, 16),
      }));
      setReminders([{ minutes_before: 30 }]);
    }
  }, [task]);

  const loadReminders = async (taskId: string) => {
    try {
      const response = await fetch(`/api/calendar/tasks/${taskId}/reminders`);
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
            new Date(SimpleTimezoneFix.toTimezoneAwareISO(formData.due_date)).getTime() -
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'El título es requerido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const taskData: CalendarTask = {
        ...formData as CalendarTask,
        due_date: SimpleTimezoneFix.toTimezoneAwareISO(formData.due_date),
        created_by: userId,
      };

      let savedTask: CalendarTaskWithPatient;
      
      if (task?.id) {
        savedTask = await CalendarTaskService.updateTask(task.id, taskData);
        // Notify invitees of updated task
        await InviteeNotificationService.notifyTaskInvitees(savedTask, 'updated');
      } else {
        savedTask = await CalendarTaskService.createTask(taskData);
        // Notify invitees of new task
        await InviteeNotificationService.notifyTaskInvitees(savedTask, 'created');
      }

      // Handle reminders
      if (savedTask.id) {
        await saveReminders(savedTask.id, 'task');
      }

      onSave(taskData);
      onClose();
    } catch (error) {
      setErrors({ submit: 'Error al guardar la tarea' });
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSelect = (patient: any) => {
    setSelectedPatient(patient);
    setFormData(prev => ({ ...prev, patient_id: patient.paciente_id }));
  };

  const handleRemovePatient = () => {
    setSelectedPatient(null);
    setFormData(prev => ({ ...prev, patient_id: '' }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6">
            <h2 className="text-2xl font-bold text-white">
              {task ? '✏️ Editar Tarea' : '➕ Nueva Tarea'}
            </h2>
            <p className="text-white/80 text-sm mt-1">
              {task ? 'Modifica los detalles de la tarea' : 'Crea una nueva tarea en el calendario'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
            {/* Title with Patient Search */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                📋 Título de la Tarea
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className={`flex-1 px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300 ${
                    errors.title ? 'border-red-500 bg-red-50' : 'border-gray-200 dark:border-gray-700'
                  }`}
                  placeholder="Ej: Llamada de seguimiento"
                />
                <button
                  type="button"
                  onClick={() => setShowPatientSearch(true)}
                  className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 flex items-center transition-all shadow-md hover:shadow-lg"
                  title="Buscar paciente"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {errors.title && <p className="text-red-500 text-sm mt-2">{errors.title}</p>}
            </div>

            {/* Selected Patient Display */}
            {selectedPatient && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 rounded-xl border-2 border-blue-200 dark:border-blue-700">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Paciente: {selectedPatient.nombre_completo}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      🆔 {selectedPatient.numero_identidad} • 📞 {selectedPatient.telefono}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePatient}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
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
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <span>📝</span> Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300 resize-none"
                placeholder="Detalles de la tarea..."
              />
            </div>

            {/* Due Date and Reminders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>📅</span> Fecha de Vencimiento
                </label>
                <input
                  type="datetime-local"
                  value={formData.due_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                />
              </div>

              {/* Multiple Reminders */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span>🔔</span> Recordatorios
                  </label>
                  <button
                    type="button"
                    onClick={addReminder}
                    className="text-xs bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-3 py-1.5 rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all"
                  >
                    ➕ Agregar
                  </button>
                </div>
                
                {reminders.map((reminder, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <select
                      value={reminder.minutes_before}
                      onChange={(e) => updateReminder(index, parseInt(e.target.value))}
                      className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300 text-sm"
                    >
                      <option value={0}>Sin recordatorio</option>
                      <option value={10}>⏰ 10 minutos</option>
                      <option value={15}>⏰ 15 minutos</option>
                      <option value={30}>⏰ 30 minutos</option>
                      <option value={60}>⏰ 1 hora</option>
                      <option value={120}>⏰ 2 horas</option>
                      <option value={180}>⏰ 3 horas</option>
                      <option value={360}>⏰ 6 horas</option>
                      <option value={720}>⏰ 12 horas</option>
                      <option value={1440}>📅 1 día</option>
                      <option value={2880}>📅 2 días</option>
                      <option value={4320}>📅 3 días</option>
                      <option value={10080}>📅 1 semana</option>
                    </select>
                    
                    {reminders.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeReminder(index)}
                        className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Eliminar recordatorio"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                
                {reminders.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No hay recordatorios configurados
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>📁</span> Categoría
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                >
                  <option value="admin">🏢 Administrativo</option>
                  <option value="clinical">👩‍⚕️ Clínico</option>
                  <option value="follow_up">📞 Seguimiento</option>
                  <option value="documentation">📄 Documentación</option>
                  <option value="other">📌 Otro</option>
                </select>
              </div>
            </div>

            {/* Status and Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>📊</span> Estado
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                >
                  <option value="pending">⏳ Pendiente</option>
                  <option value="in_progress">🔄 En Progreso</option>
                  <option value="completed">✅ Completado</option>
                  <option value="cancelled">❌ Cancelado</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>⚡</span> Prioridad
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                >
                  <option value="low">⬇️ Baja</option>
                  <option value="medium">⬆️ Media</option>
                  <option value="high">🔥 Alta</option>
                </select>
              </div>
            </div>

            {/* Duration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>⏱️</span> Duración Estimada (minutos)
                </label>
                <input
                  type="number"
                  value={formData.estimated_duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimated_duration: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>🕐</span> Duración Real (minutos)
                </label>
                <input
                  type="number"
                  value={formData.actual_duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, actual_duration: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300 disabled:opacity-50"
                  min="0"
                  disabled={formData.status !== 'completed'}
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <span>🏷️</span> Etiquetas
              </label>
              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300"
                  placeholder="Agregar etiqueta..."
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-5 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg"
                >
                  ➕
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags?.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-800 dark:text-gray-200 hover:shadow-md transition-all"
                  >
                    🏷️ {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-2 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Completion Notes */}
            {formData.status === 'completed' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <span>✅</span> Notas de Completado
                </label>
                <textarea
                  value={formData.completion_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, completion_notes: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all hover:border-gray-300 resize-none"
                  placeholder="Notas sobre la completación de la tarea..."
                />
              </div>
            )}

            {/* Error Message */}
            {errors.submit && (
              <div className="bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 p-4 rounded-xl border-2 border-red-200 dark:border-red-700">
                <p className="text-red-700 dark:text-red-300 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {errors.submit}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all"
              >
                ✕ Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Guardando...
                  </>
                ) : (
                  <>
                    {task ? '💾 Actualizar' : '➕ Crear'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <PatientSearchModal
        isOpen={showPatientSearch}
        onClose={() => setShowPatientSearch(false)}
        onSelectPatient={handlePatientSelect}
      />
    </>
  );
};
