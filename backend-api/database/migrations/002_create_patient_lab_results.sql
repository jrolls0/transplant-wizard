-- Migration: Create patient_lab_results table
-- Purpose: Finalized, TC Admin-verified lab results with typed columns for each metric
-- Part of the Smart Extraction Pipeline feature

-- Create patient_lab_results table
CREATE TABLE IF NOT EXISTS patient_lab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    document_staging_id UUID REFERENCES document_staging(id) ON DELETE SET NULL,
    patient_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL,
    
    -- Lab date (when the labs were performed)
    lab_date DATE NOT NULL,
    
    -- Lab metrics - "Golden List" for transplant evaluation
    -- All values stored as DECIMAL/VARCHAR to handle various formats
    
    -- Basic metabolic panel
    potassium DECIMAL(5,2),           -- mEq/L (normal: 3.5-5.0)
    bun DECIMAL(6,2),                 -- mg/dL - Blood Urea Nitrogen (normal: 7-20)
    phosphorus DECIMAL(5,2),          -- mg/dL (normal: 2.5-4.5)
    
    -- Complete blood count
    hemoglobin DECIMAL(5,2),          -- g/dL (normal: 12-17)
    platelets INTEGER,                -- K/uL (normal: 150-400)
    
    -- Coagulation panel
    pt DECIMAL(5,2),                  -- seconds - Prothrombin Time (normal: 11-13.5)
    inr DECIMAL(5,2),                 -- ratio - International Normalized Ratio (normal: 0.8-1.1)
    ptt DECIMAL(5,2),                 -- seconds - Partial Thromboplastin Time (normal: 25-35)
    
    -- Endocrine/Metabolic
    pth DECIMAL(7,2),                 -- pg/mL - Parathyroid Hormone (normal: 15-65)
    a1c DECIMAL(4,2),                 -- % - Hemoglobin A1c (normal: <5.7)
    
    -- Liver function
    albumin DECIMAL(5,2),             -- g/dL (normal: 3.5-5.0)
    total_bilirubin DECIMAL(5,2),     -- mg/dL (normal: 0.1-1.2)
    
    -- Lipid panel
    total_cholesterol INTEGER,        -- mg/dL (normal: <200)
    
    -- Urinalysis
    urine_protein VARCHAR(50),        -- Can be numeric or qualitative (e.g., "negative", "trace", "1+")
    urine_rbc VARCHAR(50),            -- Red Blood Cells - can be range or count
    urine_wbc VARCHAR(50),            -- White Blood Cells - can be range or count
    urine_hemoglobin VARCHAR(50),     -- Can be qualitative
    
    -- Verification metadata
    verified_by UUID REFERENCES transplant_center_employees(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- Source tracking
    data_entry_method VARCHAR(50) DEFAULT 'extracted',  -- 'extracted', 'manual', 'corrected'
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_patient_id ON patient_lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_lab_date ON patient_lab_results(lab_date);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_created_at ON patient_lab_results(created_at);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_document_staging_id ON patient_lab_results(document_staging_id);

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_patient_lab_results_updated_at ON patient_lab_results;
CREATE TRIGGER update_patient_lab_results_updated_at 
    BEFORE UPDATE ON patient_lab_results 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE patient_lab_results IS 'Finalized, TC Admin-verified lab results. Part of Smart Extraction Pipeline.';
COMMENT ON COLUMN patient_lab_results.data_entry_method IS 'How data was entered: extracted (AI), manual (typed by admin), corrected (AI + admin fixes)';
COMMENT ON COLUMN patient_lab_results.lab_date IS 'Date when the lab work was performed (extracted from document)';
