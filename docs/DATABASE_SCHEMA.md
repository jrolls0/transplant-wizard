# Database Schema Documentation

## Overview

The Transplant Platform uses PostgreSQL hosted on AWS RDS. The schema is designed for HIPAA compliance with comprehensive audit logging and row-level security.

**Connection Details**:
- Host: `transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com`
- Port: `5432`
- Database: `postgres`
- User: `transplant_admin`
- Password: See `SECURITY_SECRETS.md`

**RDS Configuration**:
- Backup Retention: 7 days
- Backup Window: 07:01-07:31 UTC
- Deletion Protection: Disabled
- Storage Encryption: Disabled
- Latest Restorable: Check AWS Console

## Schema Files

| File | Purpose |
|------|---------|
| `database/schema.sql` | Original HIPAA-compliant schema |
| `database/schema-fixed.sql` | Fixed version with relaxed constraints |
| `backend-api/database/production-schema-updates.sql` | Production additions for referral system |
| `database/seed-data.sql` | Sample data for development |

## Entity Relationship Diagram

```
┌─────────────────┐
│     users       │
│─────────────────│
│ id (PK)         │
│ cognito_sub     │
│ email           │
│ role            │
│ first_name      │
│ last_name       │
│ phone_number    │
│ status          │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐  ┌──────────────┐
│patients │  │social_workers│
│─────────│  │──────────────│
│id (PK)  │  │id (PK)       │
│user_id  │◄─│user_id       │
│dob      │  │clinic_id     │
│address  │  │license_number│
└────┬────┘  └──────────────┘
     │
     ▼
┌─────────────────┐      ┌────────────────────┐
│  roi_consents   │      │ patient_referrals  │
│─────────────────│      │────────────────────│
│ id (PK)         │      │ id (PK)            │
│ patient_id (FK) │      │ patient_id (FK)    │
│ digital_sig     │      │ transplant_center  │
│ signed_at       │      │ status             │
└─────────────────┘      │ selection_order    │
                         └────────────────────┘

┌──────────────────────────┐
│ patient_referral_invites │
│──────────────────────────│
│ id (PK)                  │
│ referral_token           │
│ patient_email            │
│ patient_first_name       │
│ dusw_id                  │
│ dusw_email               │
│ dialysis_clinic_name     │
│ redeemed                 │
│ expires_at               │
└──────────────────────────┘

┌───────────────────┐      ┌──────────────────┐
│ transplant_centers│      │ dialysis_clinics │
│───────────────────│      │──────────────────│
│ id (PK)           │      │ id (PK)          │
│ name              │      │ name             │
│ address           │      │ address          │
│ city, state       │      │ phone            │
│ specialties       │      │ is_active        │
│ avg_wait_time     │      └──────────────────┘
│ is_active         │
└───────────────────┘

┌─────────────────┐
│  audit_logs     │
│─────────────────│
│ id (PK)         │
│ user_id         │
│ action          │
│ resource_type   │
│ resource_id     │
│ phi_accessed    │
│ occurred_at     │
└─────────────────┘
```

## Core Tables

### users
Central user table for all user types (patients, social workers, admins).

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cognito_sub VARCHAR(255) UNIQUE NOT NULL,  -- AWS Cognito ID or basic_auth_* for local auth
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT false,
    role user_role NOT NULL,                   -- 'patient', 'social_worker', 'admin'
    status user_status DEFAULT 'pending_verification',
    title VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE        -- Soft delete
);
```

**Important Notes**:
- `cognito_sub` for basic auth users is formatted as `basic_auth_<timestamp>`
- Email validation regex enforced at DB level
- Soft delete support via `deleted_at`

### patients
Patient-specific data extending users table.

```sql
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dialysis_clinic_id UUID REFERENCES dialysis_clinics(id),
    assigned_social_worker_id UUID REFERENCES social_workers(id),

    -- PHI Fields
    date_of_birth DATE,
    address TEXT,

    -- Medical Info
    primary_care_physician VARCHAR(200),
    insurance_provider VARCHAR(200),
    nephrologist VARCHAR(255),

    -- Status
    profile_completed BOOLEAN DEFAULT false,
    onboarding_completed BOOLEAN DEFAULT false,

    -- Additional (from production updates)
    cognito_user_sub VARCHAR(255) UNIQUE,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(100),
    medical_record_number VARCHAR(100),
    preferred_language VARCHAR(50) DEFAULT 'English',
    communication_preferences JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### user_credentials
Stores password hashes for basic authentication (non-Cognito).

```sql
CREATE TABLE user_credentials (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### roi_consents
Release of Information consent records.

```sql
CREATE TABLE roi_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    consent_text TEXT NOT NULL,
    digital_signature VARCHAR(500) NOT NULL,  -- Patient's typed full name
    ip_address INET,
    user_agent TEXT,
    status consent_status DEFAULT 'signed',
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### transplant_centers
Transplant centers available for patient selection.

```sql
CREATE TABLE transplant_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(10),
    distance_miles DECIMAL(5,1),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    specialties JSONB,                         -- ["Kidney", "Liver", etc.]
    average_wait_time_months INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### patient_referrals
Patient selections of transplant centers.

```sql
CREATE TABLE patient_referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    transplant_center_id UUID NOT NULL REFERENCES transplant_centers(id),
    status referral_status DEFAULT 'pending',  -- 'pending', 'submitted', 'acknowledged', 'completed'
    selection_order INTEGER,                   -- 1, 2, or 3
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_patient_center UNIQUE (patient_id, transplant_center_id)
);
```

### patient_referral_invitations
DUSW-created referrals for patients.

```sql
CREATE TABLE patient_referral_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

    -- Patient Info
    patient_email VARCHAR(255) NOT NULL,
    patient_title VARCHAR(50),
    patient_first_name VARCHAR(100) NOT NULL,
    patient_last_name VARCHAR(100) NOT NULL,
    patient_nephrologist VARCHAR(255),

    -- Referral Source
    dialysis_clinic_name VARCHAR(255) NOT NULL,
    dialysis_clinic_id UUID REFERENCES dialysis_clinics(id),
    dusw_id UUID,
    dusw_email VARCHAR(255) NOT NULL,
    dusw_name VARCHAR(200),

    -- Status
    redeemed BOOLEAN DEFAULT false,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    redeemed_patient_id UUID REFERENCES patients(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);
```

**Referral Flow**:
1. DUSW creates referral via portal
2. `referral_token` UUID generated
3. Email sent to patient with link containing token
4. Patient uses app, enters email
5. App calls `/api/v1/patient/referral/lookup` with email
6. If found, registration form pre-fills
7. On registration, `redeemed = true` and `redeemed_patient_id` set

### dusw_social_workers
Social workers who create referrals (separate from portal-authenticated social_workers).

```sql
CREATE TABLE dusw_social_workers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    dialysis_clinic VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### patient_dusw_assignments
Links patients to their assigned DUSW social worker.

```sql
CREATE TABLE patient_dusw_assignments (
    id SERIAL PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    dusw_social_worker_id INTEGER NOT NULL REFERENCES dusw_social_workers(id),
    dialysis_clinic VARCHAR(255) NOT NULL,
    social_worker_name VARCHAR(255) NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(patient_id)
);
```

### audit_logs
HIPAA-compliant audit trail.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    user_role user_role,
    session_id VARCHAR(255),
    action audit_action NOT NULL,              -- 'CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT'
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    ip_address INET,
    user_agent TEXT,
    old_values JSONB,
    new_values JSONB,
    phi_accessed BOOLEAN DEFAULT false,
    phi_fields TEXT[],
    description TEXT,
    metadata JSONB,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## ENUM Types

```sql
CREATE TYPE user_role AS ENUM ('patient', 'social_worker', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'pending_verification');
CREATE TYPE consent_status AS ENUM ('pending', 'signed', 'revoked');
CREATE TYPE referral_status AS ENUM ('pending', 'submitted', 'acknowledged', 'completed');
CREATE TYPE notification_type AS ENUM ('patient_registered', 'referral_submitted', 'roi_signed', 'system_alert');
CREATE TYPE notification_status AS ENUM ('unread', 'read', 'archived');
CREATE TYPE audit_action AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT');
```

## Indexes

Critical indexes for performance:

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);

-- Patient queries
CREATE INDEX idx_patients_user_id ON patients(user_id);

-- Referral queries
CREATE INDEX idx_patient_referrals_patient ON patient_referrals(patient_id);
CREATE INDEX idx_referral_invitations_token ON patient_referral_invitations(referral_token);
CREATE INDEX idx_referral_invitations_email ON patient_referral_invitations(patient_email);

-- Audit log queries (HIPAA compliance)
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs(occurred_at);
CREATE INDEX idx_audit_logs_phi_accessed ON audit_logs(phi_accessed) WHERE phi_accessed = true;
```

## Row Level Security (RLS)

**CURRENT STATUS: RLS is NOT enabled on any tables in production.**

The schema files define RLS, but it has not been applied:
```sql
-- These commands exist in schema.sql but are NOT active in production:
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
```

**To enable RLS** (recommended for HIPAA compliance):
```sql
-- Run these on production database
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Then create appropriate policies for each role
```

**Note**: The backend service user would need appropriate RLS policies or BYPASSRLS privilege.

## Common Queries

### Get patient with status
```sql
SELECT
    u.id as user_id,
    u.email,
    u.first_name,
    u.last_name,
    p.id as patient_id,
    p.profile_completed,
    p.onboarding_completed,
    (SELECT MAX(signed_at) FROM roi_consents WHERE patient_id = p.id) as roi_signed_at,
    COUNT(pr.id) as referral_count
FROM users u
JOIN patients p ON u.id = p.user_id
LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
WHERE u.email = $1
GROUP BY u.id, p.id;
```

### Get referral pre-fill data
```sql
SELECT * FROM patient_referral_invitations
WHERE patient_email = $1
  AND expires_at > NOW()
  AND redeemed = false
ORDER BY created_at DESC
LIMIT 1;
```

### Get social workers by clinic
```sql
SELECT
    title,
    first_name,
    last_name,
    dialysis_clinic,
    CONCAT(title, ' ', first_name, ' ', last_name) as full_name
FROM dusw_social_workers
WHERE status = 'active'
ORDER BY dialysis_clinic, first_name, last_name;
```

## Migration Notes

1. **Original Schema** (`database/schema.sql`): Contains full HIPAA-compliant schema with ENUMs, triggers, RLS
2. **Fixed Schema** (`database/schema-fixed.sql`): Relaxed some constraints for development
3. **Production Updates** (`backend-api/database/production-schema-updates.sql`): Adds:
   - `patient_referral_invitations` table
   - `patient_roi_consents` table
   - `patient_auth_sessions` table
   - `patient_transplant_selections` table
   - Additional patient fields (emergency contact, etc.)
   - Views for patient summary and audit events

To apply production updates:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f backend-api/database/production-schema-updates.sql
```

## Production Database Status (Verified 2025-12-21)

| Item | Status |
|------|--------|
| Tables | 19 tables exist - all migrations applied |
| `dusw_social_workers` | 3 records (1 Test Clinic, 2 Metro Health) |
| RLS | **NOT ENABLED** on any table |
| Triggers | Active (update_updated_at_column) |
| Backup | 7-day retention, daily at 07:01 UTC |
| Encryption | Storage NOT encrypted |

### Remaining TODOs
- [ ] Enable RLS on sensitive tables
- [ ] Enable storage encryption
- [ ] Enable deletion protection
- [ ] Add more social workers for production clinics
