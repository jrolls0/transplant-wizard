-- Migration: Create document_staging table
-- Purpose: Staging table for documents pending TC Admin review before finalization
-- Part of the Smart Extraction Pipeline feature

-- Create ENUM for staging status if not exists
DO $$ BEGIN
    CREATE TYPE document_staging_status AS ENUM (
        'PENDING_REVIEW',
        'APPROVED',
        'REJECTED',
        'NEEDS_CORRECTION'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create document_staging table
CREATE TABLE IF NOT EXISTS document_staging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Document references
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL,
    
    -- Document metadata
    document_type VARCHAR(100) NOT NULL,  -- Type selected by uploader (patient/DUSW)
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    
    -- Processing status
    status VARCHAR(50) DEFAULT 'PENDING_REVIEW',
    
    -- Extracted data (for Labs: {"potassium": {"value": "4.5", "confidence": 82.5}, ...})
    -- For non-Labs documents, this will be NULL
    extracted_data JSONB,
    
    -- Lab date (extracted from document for Labs type)
    lab_date DATE,
    
    -- Error tracking
    extraction_error TEXT,
    textract_job_id VARCHAR(255),
    
    -- Review information
    reviewed_by UUID REFERENCES transplant_center_employees(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    final_document_type VARCHAR(100),  -- Admin-corrected type (if different from original)
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_document_staging_patient_id ON document_staging(patient_id);
CREATE INDEX IF NOT EXISTS idx_document_staging_status ON document_staging(status);
CREATE INDEX IF NOT EXISTS idx_document_staging_document_type ON document_staging(document_type);
CREATE INDEX IF NOT EXISTS idx_document_staging_created_at ON document_staging(created_at);
CREATE INDEX IF NOT EXISTS idx_document_staging_patient_document_id ON document_staging(patient_document_id);

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_document_staging_updated_at ON document_staging;
CREATE TRIGGER update_document_staging_updated_at 
    BEFORE UPDATE ON document_staging 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE document_staging IS 'Staging table for documents pending TC Admin review. Part of Smart Extraction Pipeline.';
COMMENT ON COLUMN document_staging.extracted_data IS 'JSON containing extracted lab values with confidence scores. Format: {"metric": {"value": "X", "confidence": Y}}';
COMMENT ON COLUMN document_staging.final_document_type IS 'Admin-corrected document type if original selection was wrong';
