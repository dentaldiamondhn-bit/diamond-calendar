-- Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    location VARCHAR(255),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('appointment', 'consultation', 'surgery', 'follow_up', 'reminder', 'other')),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    patient_id UUID REFERENCES patients(paciente_id) ON DELETE SET NULL,
    doctor_id VARCHAR(255),
    notes TEXT,
    reminder_minutes INTEGER DEFAULT 30,
    created_by TEXT NOT NULL, -- Use TEXT to support Clerk user IDs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Calendar Reminders Table
CREATE TABLE IF NOT EXISTS calendar_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Calendar Tasks Table
CREATE TABLE IF NOT EXISTS calendar_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    assigned_to UUID,
    patient_id UUID REFERENCES patients(paciente_id) ON DELETE SET NULL,
    event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'other' CHECK (category IN ('admin', 'clinical', 'follow_up', 'documentation', 'other')),
    tags TEXT[], -- Array of tags
    estimated_duration INTEGER, -- In minutes
    actual_duration INTEGER, -- In minutes
    completion_notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Calendar Invitees Table (for events, tasks, and reminders)
CREATE TABLE IF NOT EXISTS calendar_invitees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('event', 'task', 'reminder')),
    item_id UUID NOT NULL,
    user_id TEXT NOT NULL, -- Use TEXT to support Clerk user IDs
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'tentative')),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_by TEXT NOT NULL, -- Use TEXT to support Clerk user IDs
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(item_type, item_id, user_id) -- Prevent duplicate invites
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_date ON calendar_events(end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_patient_id ON calendar_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events(event_type);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_event_id ON calendar_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_reminder_time ON calendar_reminders(reminder_time);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_sent ON calendar_reminders(sent);

-- Indexes for calendar_tasks
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_due_date ON calendar_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_status ON calendar_tasks(status);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_priority ON calendar_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_category ON calendar_tasks(category);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_assigned_to ON calendar_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_patient_id ON calendar_tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_event_id ON calendar_tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_created_by ON calendar_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_tags ON calendar_tasks USING GIN(tags);

-- Indexes for calendar_invitees
CREATE INDEX IF NOT EXISTS idx_calendar_invitees_item_type ON calendar_invitees(item_type);
CREATE INDEX IF NOT EXISTS idx_calendar_invitees_item_id ON calendar_invitees(item_id);
CREATE INDEX IF NOT EXISTS idx_calendar_invitees_user_id ON calendar_invitees(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_invitees_status ON calendar_invitees(status);
CREATE INDEX IF NOT EXISTS idx_calendar_invitees_created_by ON calendar_invitees(created_by);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop triggers if they exist, then recreate them
DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
DROP TRIGGER IF EXISTS update_calendar_tasks_updated_at ON calendar_tasks;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_calendar_events_updated_at 
    BEFORE UPDATE ON calendar_events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for calendar_tasks to automatically update updated_at and completed_at
CREATE TRIGGER update_calendar_tasks_updated_at 
    BEFORE UPDATE ON calendar_tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) for calendar_events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can create calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can update calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can delete calendar events" ON calendar_events;

-- Policy for calendar_events
-- Users can see events they created or events associated with their patients
CREATE POLICY "Users can view calendar events" ON calendar_events
    FOR SELECT USING (
        created_by = auth.uid() OR
        patient_id IN (
            SELECT paciente_id FROM patients WHERE 
            -- This assumes you have a way to link patients to users
            -- Adjust according to your patient-user relationship
            TRUE -- For now, allow all authenticated users to see all events
        )
    );

-- Users can create events
CREATE POLICY "Users can create calendar events" ON calendar_events
    FOR INSERT WITH CHECK (created_by = auth.uid());

-- Users can update events they created
CREATE POLICY "Users can update calendar events" ON calendar_events
    FOR UPDATE USING (created_by = auth.uid());

-- Users can delete events they created
CREATE POLICY "Users can delete calendar events" ON calendar_events
    FOR DELETE USING (created_by = auth.uid());

-- Row Level Security (RLS) for calendar_reminders
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;

-- Drop reminder policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view calendar reminders" ON calendar_reminders;
DROP POLICY IF EXISTS "Users can create calendar reminders" ON calendar_reminders;
DROP POLICY IF EXISTS "Users can update calendar reminders" ON calendar_reminders;
DROP POLICY IF EXISTS "Users can delete calendar reminders" ON calendar_reminders;

-- Policy for calendar_reminders
CREATE POLICY "Users can view calendar reminders" ON calendar_reminders
    FOR SELECT USING (
        event_id IN (
            SELECT id FROM calendar_events WHERE 
            created_by = auth.uid()
        )
    );

-- Users can create reminders for their events
CREATE POLICY "Users can create calendar reminders" ON calendar_reminders
    FOR INSERT WITH CHECK (
        event_id IN (
            SELECT id FROM calendar_events WHERE 
            created_by = auth.uid()
        )
    );

-- Users can update reminders for their events
CREATE POLICY "Users can update calendar reminders" ON calendar_reminders
    FOR UPDATE USING (
        event_id IN (
            SELECT id FROM calendar_events WHERE 
            created_by = auth.uid()
        )
    );

-- Users can delete reminders for their events
CREATE POLICY "Users can delete calendar reminders" ON calendar_reminders
    FOR DELETE USING (
        event_id IN (
            SELECT id FROM calendar_events WHERE 
            created_by = auth.uid()
        )
    );

-- Row Level Security (RLS) for calendar_tasks
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;

-- Drop task policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view calendar tasks" ON calendar_tasks;
DROP POLICY IF EXISTS "Users can create calendar tasks" ON calendar_tasks;
DROP POLICY IF EXISTS "Users can update calendar tasks" ON calendar_tasks;
DROP POLICY IF EXISTS "Users can delete calendar tasks" ON calendar_tasks;

-- Policy for calendar_tasks
-- Users can see tasks they created, are assigned to, or related to their patients
CREATE POLICY "Users can view calendar tasks" ON calendar_tasks
    FOR SELECT USING (
        created_by = auth.uid() OR
        assigned_to = auth.uid() OR
        patient_id IN (
            SELECT paciente_id FROM patients WHERE 
            -- Adjust according to your patient-user relationship
            TRUE -- For now, allow all authenticated users to see all tasks
        )
    );

-- Users can create tasks
CREATE POLICY "Users can create calendar tasks" ON calendar_tasks
    FOR INSERT WITH CHECK (created_by = auth.uid());

-- Users can update tasks they created or are assigned to
CREATE POLICY "Users can update calendar tasks" ON calendar_tasks
    FOR UPDATE USING (created_by = auth.uid() OR assigned_to = auth.uid());

-- Users can delete tasks they created
CREATE POLICY "Users can delete calendar tasks" ON calendar_tasks
    FOR DELETE USING (created_by = auth.uid());

-- Row Level Security (RLS) for calendar_invitees
ALTER TABLE calendar_invitees ENABLE ROW LEVEL SECURITY;

-- Drop invitees policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view calendar invitees" ON calendar_invitees;
DROP POLICY IF EXISTS "Users can create calendar invitees" ON calendar_invitees;
DROP POLICY IF EXISTS "Users can update calendar invitees" ON calendar_invitees;
DROP POLICY IF EXISTS "Users can delete calendar invitees" ON calendar_invitees;

-- Policy for calendar_invitees
-- Users can see invites for items they created or were invited to
CREATE POLICY "Users can view calendar invitees" ON calendar_invitees
    FOR SELECT USING (
        created_by = auth.uid() OR
        user_id = auth.uid()
    );

-- Users can create invites for their items
CREATE POLICY "Users can create calendar invitees" ON calendar_invitees
    FOR INSERT WITH CHECK (created_by = auth.uid());

-- Users can update invites they created or are for them
CREATE POLICY "Users can update calendar invitees" ON calendar_invitees
    FOR UPDATE USING (created_by = auth.uid() OR user_id = auth.uid());

-- Users can delete invites they created
CREATE POLICY "Users can delete calendar invitees" ON calendar_invitees
    FOR DELETE USING (created_by = auth.uid());

-- Grant permissions
GRANT ALL ON calendar_events TO authenticated;
GRANT ALL ON calendar_reminders TO authenticated;
GRANT ALL ON calendar_tasks TO authenticated;
GRANT ALL ON calendar_invitees TO authenticated;
GRANT SELECT ON calendar_events TO anon;
GRANT SELECT ON calendar_reminders TO anon;
GRANT SELECT ON calendar_tasks TO anon;
GRANT SELECT ON calendar_invitees TO anon;
