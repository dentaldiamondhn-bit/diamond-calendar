export interface CalendarTask {
  id?: string;
  title: string;
  description?: string;
  due_date?: string; // ISO string
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assigned_to?: string; // User ID
  patient_id?: string;
  event_id?: string; // Link to calendar event if applicable
  category: 'admin' | 'clinical' | 'follow_up' | 'documentation' | 'other';
  tags?: string[];
  estimated_duration?: number; // In minutes
  actual_duration?: number; // In minutes
  completion_notes?: string;
  created_by: string; // User ID who created the task
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

export interface CalendarTaskWithPatient extends CalendarTask {
  patient?: {
    paciente_id: string;
    nombre_completo: string;
    telefono?: string;
    email?: string;
  };
  event?: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
  };
}

export interface TaskFilter {
  status?: CalendarTask['status'];
  priority?: CalendarTask['priority'];
  category?: CalendarTask['category'];
  assigned_to?: string;
  patient_id?: string;
  event_id?: string;
  date_range?: {
    start: string;
    end: string;
  };
  tags?: string[];
}
