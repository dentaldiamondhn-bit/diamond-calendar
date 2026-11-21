-- Birthday outreach tracking for patient DOB events
-- References patients via paciente_id (type confirmed at deploy time).
-- DOB events themselves are dynamically projected and never written to `events`.
-- NOTE: FOREIGN KEY intentionally omitted until pacientes.paciente_id type is
-- confirmed against the live Supabase schema (repo migrations conflict on text
-- vs uuid). The table is fully functional as a standalone audit/log table.

CREATE TABLE IF NOT EXISTS patient_birthday_wishes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id TEXT NOT NULL,
    wish_year SMALLINT NOT NULL,
    wish_sent_at TIMESTAMPTZ DEFAULT NOW(),
    channel VARCHAR(20) DEFAULT 'whatsapp',
    message_template VARCHAR(50) DEFAULT 'birthday_greeting',
    promotion_code VARCHAR(50),
    promotion_type VARCHAR(30),
    promotion_value TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(patient_id, wish_year)
);

CREATE INDEX IF NOT EXISTS idx_birthday_wishes_patient_year ON patient_birthday_wishes(patient_id, wish_year);
CREATE INDEX IF NOT EXISTS idx_birthday_wishes_created_by ON patient_birthday_wishes(created_by);

-- Row Level Security
ALTER TABLE patient_birthday_wishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own birthday wishes" ON patient_birthday_wishes;
DROP POLICY IF EXISTS "Users can insert their own birthday wishes" ON patient_birthday_wishes;
DROP POLICY IF EXISTS "Users can update their own birthday wishes" ON patient_birthday_wishes;
DROP POLICY IF EXISTS "Service role can manage all birthday wishes" ON patient_birthday_wishes;

CREATE POLICY "Users can view their own birthday wishes" ON patient_birthday_wishes
    FOR SELECT USING (created_by = auth.uid()::text);

CREATE POLICY "Users can insert their own birthday wishes" ON patient_birthday_wishes
    FOR INSERT WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "Users can update their own birthday wishes" ON patient_birthday_wishes
    FOR UPDATE USING (created_by = auth.uid()::text);

CREATE POLICY "Service role can manage all birthday wishes" ON patient_birthday_wishes
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON patient_birthday_wishes TO authenticated;
GRANT SELECT ON patient_birthday_wishes TO anon;
