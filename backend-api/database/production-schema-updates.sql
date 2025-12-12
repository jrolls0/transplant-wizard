-- Additional schema updates for production AWS Cognito integration and audit logging

-- Add Cognito user sub to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS cognito_user_sub VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS ssn_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS roi_signed_at TIMESTAMP WITH TIME ZONE;

-- Create index on cognito_user_sub for fast lookups
CREATE INDEX IF NOT EXISTS idx_patients_cognito_user_sub ON patients(cognito_user_sub);

-- Create patient ROI consents table for tracking consent signatures
CREATE TABLE IF NOT EXISTS patient_roi_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    digital_signature_hash VARCHAR(255) NOT NULL,
    consent_text_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    signed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on patient_id for ROI consents
CREATE INDEX IF NOT EXISTS idx_patient_roi_consents_patient_id ON patient_roi_consents(patient_id);

-- Create comprehensive audit logs table for HIPAA compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- Can be patient_id, social_worker_id, or admin_id
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL, -- authentication, patient_data, phi_data, system
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit logs for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_category ON audit_logs(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_patient_id ON audit_logs USING GIN ((metadata->>'patient_id'));

-- Create patient authentication tokens table for session management
CREATE TABLE IF NOT EXISTS patient_auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    cognito_access_token_hash VARCHAR(255) NOT NULL,
    cognito_refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Create index on patient_id for auth sessions
CREATE INDEX IF NOT EXISTS idx_patient_auth_sessions_patient_id ON patient_auth_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_auth_sessions_expires_at ON patient_auth_sessions(expires_at);

-- Create patient transplant center selections table
CREATE TABLE IF NOT EXISTS patient_transplant_selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    transplant_center_id UUID NOT NULL REFERENCES transplant_centers(id) ON DELETE CASCADE,
    selection_order INTEGER NOT NULL, -- 1, 2, or 3 for first, second, third choice
    selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(patient_id, transplant_center_id),
    UNIQUE(patient_id, selection_order)
);

-- Create indexes for transplant selections
CREATE INDEX IF NOT EXISTS idx_patient_transplant_selections_patient_id ON patient_transplant_selections(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_transplant_selections_center_id ON patient_transplant_selections(transplant_center_id);

-- Update patients table to add additional fields for comprehensive patient management
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100),
ADD COLUMN IF NOT EXISTS medical_record_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50) DEFAULT 'English',
ADD COLUMN IF NOT EXISTS communication_preferences JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS nephrologist VARCHAR(255);

-- Create patient referral invitations table for DUSW referral system
CREATE TABLE IF NOT EXISTS patient_referral_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

    -- Patient Information
    patient_email VARCHAR(255) NOT NULL,
    patient_title VARCHAR(50),
    patient_first_name VARCHAR(100) NOT NULL,
    patient_last_name VARCHAR(100) NOT NULL,
    patient_nephrologist VARCHAR(255),

    -- Referral Details
    dialysis_clinic_name VARCHAR(255) NOT NULL,
    dialysis_clinic_id UUID REFERENCES dialysis_clinics(id),
    dusw_id UUID, -- Social worker ID who created the referral
    dusw_email VARCHAR(255) NOT NULL,
    dusw_name VARCHAR(200),

    -- Status
    redeemed BOOLEAN DEFAULT false,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    redeemed_patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),

    CONSTRAINT referral_not_expired CHECK (expires_at > NOW()),
    CONSTRAINT valid_email CHECK (patient_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for patient referral invitations
CREATE INDEX IF NOT EXISTS idx_referral_invitations_token ON patient_referral_invitations(referral_token);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_email ON patient_referral_invitations(patient_email);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_redeemed ON patient_referral_invitations(redeemed);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_dusw ON patient_referral_invitations(dusw_id);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_expires_at ON patient_referral_invitations(expires_at);
CREATE INDEX IF NOT EXISTS idx_referral_invitations_created_at ON patient_referral_invitations(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to relevant tables
DROP TRIGGER IF EXISTS update_patients_updated_at ON patients;
CREATE TRIGGER update_patients_updated_at 
    BEFORE UPDATE ON patients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_roi_consents_updated_at ON patient_roi_consents;
CREATE TRIGGER update_patient_roi_consents_updated_at 
    BEFORE UPDATE ON patient_roi_consents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_transplant_selections_updated_at ON patient_transplant_selections;
CREATE TRIGGER update_patient_transplant_selections_updated_at 
    BEFORE UPDATE ON patient_transplant_selections 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add some sample audit log entries for testing
INSERT INTO audit_logs (user_id, event_type, event_category, description, metadata, timestamp) 
VALUES 
    (NULL, 'system_startup', 'system', 'Production server started with AWS Cognito integration', '{"version": "1.0", "environment": "production"}', NOW()),
    (NULL, 'schema_update', 'system', 'Database schema updated for production deployment', '{"tables_added": ["patient_roi_consents", "audit_logs", "patient_auth_sessions", "patient_transplant_selections"]}', NOW())
ON CONFLICT DO NOTHING;

-- Create view for patient summary with audit information
CREATE OR REPLACE VIEW patient_summary AS
SELECT 
    p.id,
    p.email,
    p.first_name,
    p.last_name,
    p.phone_number,
    p.date_of_birth,
    p.profile_completed,
    p.onboarding_completed,
    p.roi_signed,
    p.roi_signed_at,
    p.created_at,
    p.updated_at,
    dc.name as dialysis_clinic_name,
    sw.first_name || ' ' || sw.last_name as social_worker_name,
    sw.email as social_worker_email,
    (SELECT COUNT(*) FROM patient_transplant_selections pts WHERE pts.patient_id = p.id) as transplant_centers_selected,
    (SELECT MAX(timestamp) FROM audit_logs al WHERE al.user_id = p.id) as last_activity
FROM patients p
LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
LEFT JOIN social_workers sw ON p.assigned_social_worker_id = sw.id
WHERE p.is_active = true;

-- Create view for recent audit events (for monitoring dashboard)
CREATE OR REPLACE VIEW recent_audit_events AS
SELECT 
    al.id,
    al.user_id,
    al.event_type,
    al.event_category,
    al.description,
    al.timestamp,
    p.first_name || ' ' || p.last_name as patient_name,
    p.email as patient_email
FROM audit_logs al
LEFT JOIN patients p ON al.user_id = p.id
WHERE al.timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY al.timestamp DESC
LIMIT 100;

COMMIT;