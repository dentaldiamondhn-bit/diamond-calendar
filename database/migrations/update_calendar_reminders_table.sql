-- Update calendar_reminders table to support both events and tasks
-- This migration is designed to be safe to run multiple times

-- Add new columns if they don't exist
DO $$
BEGIN
    -- Add item_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calendar_reminders' 
        AND column_name = 'item_type'
    ) THEN
        ALTER TABLE calendar_reminders 
        ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'event';
        
        -- Add check constraint
        ALTER TABLE calendar_reminders 
        ADD CONSTRAINT calendar_reminders_item_type_check 
        CHECK (item_type IN ('event', 'task'));
    END IF;

    -- Add item_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calendar_reminders' 
        AND column_name = 'item_id'
    ) THEN
        ALTER TABLE calendar_reminders 
        ADD COLUMN item_id UUID NOT NULL;
        
        -- Update existing records to use the new structure
        UPDATE calendar_reminders 
        SET item_type = 'event', item_id = event_id 
        WHERE item_id IS NULL;
        
        -- Add unique constraint
        ALTER TABLE calendar_reminders 
        ADD CONSTRAINT calendar_reminders_unique_item 
        UNIQUE(item_type, item_id, reminder_time);
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_item_type ON calendar_reminders(item_type);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_item_id ON calendar_reminders(item_id);

-- Add comment to document the changes
COMMENT ON COLUMN calendar_reminders.item_type IS 'Type of item: event or task';
COMMENT ON COLUMN calendar_reminders.item_id IS 'ID of the event or task';
COMMENT ON COLUMN calendar_reminders.event_id IS 'Legacy column - use item_id and item_type instead';
