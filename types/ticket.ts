// Unified Ticketing & Task System Types
// Generated for dental clinic management system

export enum UserRole {
  STAFF = 'STAFF',
  DOCTOR = 'DOCTOR',
  ADMIN = 'ADMIN',
  TECH_SUPPORT = 'TECH_SUPPORT'
}

export enum TicketType {
  TASK = 'TASK',
  SYSTEM_ISSUE = 'SYSTEM_ISSUE',
  IMPLEMENTATION = 'IMPLEMENTATION',
  REMINDER = 'REMINDER',
  PATIENT_CASE = 'PATIENT_CASE',
  MAINTENANCE = 'MAINTENANCE'
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_REVIEW = 'PENDING_REVIEW',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

export enum ActivityType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  COMMENT = 'COMMENT',
  ASSIGNMENT = 'ASSIGNMENT',
  EDIT = 'EDIT'
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  department?: string;
  profileImageUrl?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description?: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  
  // Metadata for Tasks/Reminders
  is_reminder?: boolean;
  
  // Maintenance window fields
  maintenance_start?: string;
  maintenance_end?: string;
  
  // Assignment
  creator_id: string;
  assignee_id?: string;
  
  // Relations
  creator?: User;
  assignee?: User;
  assignees?: TicketAssignee[];
  attachments?: TicketAttachment[];
  activities?: TicketActivity[];
  
  // Timestamps
  created_at: string;
  updated_at: string;
  patient_id?: string;
  patient?: any;
  ticket_number?: string;
}

export interface TicketAssignee {
  id: string;
  ticket_id: string;
  user_id: string;
  assigned_at: string;
  assigned_by?: string;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  patient_id?: string;
  attachment_type: 'consent' | 'odontogram' | 'treatment' | 'event' | 'task' | 'document';
  attachment_id: string;
  attachment_title: string;
  attachment_description?: string;
  file_url?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TicketActivity {
  id: string;
  ticket_id: string;
  user_id: string;
  activity_type: ActivityType;
  content: string;
  metadata?: Record<string, any>;
  
  // Relations
  user?: User;
  ticket?: Ticket;
  
  created_at: string;
}

export interface CreateTicketData {
  title: string;
  description?: string;
  type: TicketType;
  priority: TicketPriority;
  is_reminder?: boolean;
  assignee_ids?: string[];
  attachments?: CreateTicketAttachmentData[];
  patient_id?: string;
  
  // Maintenance window fields
  maintenance_start?: string;
  maintenance_end?: string;
}

export interface CreateTicketAttachmentData {
  attachment_type: 'consent' | 'odontogram' | 'treatment' | 'event' | 'task' | 'document';
  attachment_id: string;
  attachment_title: string;
  attachment_description?: string;
  file_url?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTicketData {
  title?: string;
  description?: string;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignee_id?: string;
  due_date?: string;
}

export interface CreateActivityData {
  ticket_id: string;
  activity_type: ActivityType;
  content: string;
  metadata?: Record<string, any>;
}

export interface TicketFilters {
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  assignee_id?: string;
  creator_id?: string;
  search?: string;
}

export interface TicketDashboardView {
  myTickets: Ticket[];
  createdTickets: Ticket[];
  assignedTickets: Ticket[];
  departmentTickets: Ticket[];
}

// Timeline item for UI rendering
export interface TimelineItem {
  id: string;
  type: ActivityType;
  content: string;
  user: User;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Notification types for reminders
export interface TicketNotification {
  ticket_id: string;
  type: 'DUE_SOON' | 'OVERDUE' | 'ASSIGNED' | 'STATUS_CHANGED';
  ticket: Ticket;
}
