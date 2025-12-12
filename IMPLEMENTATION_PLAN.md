# DUSW Referral System Implementation Plan

## Overview
Implement a complete DUSW referral system that allows DUSW staff to refer new patients to the app with pre-filled registration data.

## Phase 1: Database Schema Updates

### Changes Required

#### 1. Add `nephrologist` column to `patients` table
```sql
ALTER TABLE patients ADD COLUMN nephrologist VARCHAR(255);
```

#### 2. Create `patient_referral_invitations` table
```sql
CREATE TABLE patient_referral_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referral_token UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),

    -- Patient Information
    patient_email VARCHAR(255) NOT NULL,
    patient_title VARCHAR(50),
    patient_first_name VARCHAR(100) NOT NULL,
    patient_last_name VARCHAR(100) NOT NULL,
    patient_nephrologist VARCHAR(255),

    -- Referral Details
    dialysis_clinic_name VARCHAR(255) NOT NULL,
    dialysis_clinic_id UUID REFERENCES dialysis_clinics(id),
    dusw_id UUID REFERENCES social_workers(id),
    dusw_email VARCHAR(255) NOT NULL,
    dusw_name VARCHAR(200),

    -- Status
    redeemed BOOLEAN DEFAULT false,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    redeemed_patient_id UUID REFERENCES patients(id),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),

    CONSTRAINT referral_not_expired CHECK (expires_at > NOW())
);

CREATE INDEX idx_referral_invitations_token ON patient_referral_invitations(referral_token);
CREATE INDEX idx_referral_invitations_email ON patient_referral_invitations(patient_email);
CREATE INDEX idx_referral_invitations_redeemed ON patient_referral_invitations(redeemed);
```

**File to Update**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/database/production-schema-updates.sql`

**Status**: ⏳ PENDING

---

## Phase 2: Backend API Implementation

### 2.1 Update Registration Endpoint
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/src/simple-auth-server.js`

**Changes**:
- Add `nephrologist` parameter to request body destructuring (line 162-165)
- Add nephrologist to patient INSERT query (line 292-305)
- Add `referralToken` handling to check if registration is from a referral
- If referral token provided: auto-fill all pre-fill fields and mark referral as redeemed
- Return success response with referral redemption confirmation

**Code Location**: Lines 156-422 (registration endpoint)

**Status**: ⏳ PENDING

### 2.2 Create DUSW Referral Endpoint
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/src/simple-auth-server.js`

**New Endpoint**: `POST /api/v1/dusw/referrals/create`

**Request Body**:
```json
{
  "patientTitle": "Mr",
  "patientFirstName": "John",
  "patientLastName": "Doe",
  "patientEmail": "john@example.com",
  "patientNephrologist": "Dr. Smith",
  "dialysisClinicId": "uuid",
  "dialysisClinicName": "Metro Health Dialysis",
  "duserId": "uuid of logged-in DUSW"
}
```

**Response**:
```json
{
  "success": true,
  "referralToken": "uuid",
  "referralLink": "app://register?token=uuid&firstName=John&lastName=Doe&email=john@example.com&title=Mr&nephrologist=Dr.%20Smith&dialysisClinic=Metro%20Health%20Dialysis",
  "message": "Referral created. Email sent to patient."
}
```

**Implementation Details**:
1. Validate DUSW is authenticated
2. Create record in `patient_referral_invitations` table
3. Send email to patient with personalized referral link
4. Return token and pre-fill URL

**Status**: ⏳ PENDING

### 2.3 Create Referral Pre-Fill Endpoint
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/src/simple-auth-server.js`

**New Endpoint**: `GET /api/v1/patient/referral/:token`

**Response**:
```json
{
  "success": true,
  "data": {
    "patientTitle": "Mr",
    "patientFirstName": "John",
    "patientLastName": "Doe",
    "patientEmail": "john@example.com",
    "patientNephrologist": "Dr. Smith",
    "dialysisClinic": "Metro Health Dialysis",
    "dusw": "Jane Nurse, MSW"
  }
}
```

**Implementation Details**:
1. Query `patient_referral_invitations` by token
2. Check if token is valid and not expired
3. Check if not already redeemed
4. Return pre-fill data

**Status**: ⏳ PENDING

### 2.4 Email Service Configuration
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/src/simple-auth-server.js`

**Action**: Add email sending function for referral notifications

**Requirements**:
- Email service (SES, SendGrid, etc.) - NEEDS TO BE CONFIGURED
- Email template with:
  - Personalized greeting with patient name
  - Referral link
  - DUSW name and clinic
  - Instructions to complete registration

**Status**: ⏳ PENDING (Requires email service setup)

---

## Phase 3: Mobile App Implementation

### 3.1 Add Nephrologist Field to RegistrationView
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Views/Authentication/RegistrationView.swift`

**Changes**:
- Add `@State private var nephrologist = ""` state variable
- Add nephrologist text field input in medical information section
- Update form validation to include nephrologist (optional field)
- Pass nephrologist to `PatientRegistrationData` when submitting

**Status**: ⏳ PENDING

### 3.2 Update PatientRegistrationData Model
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Core/AuthenticationManager.swift`

**Changes**:
- Add `nephrologist: String?` property to struct
- Update all usages to pass nephrologist field

**Status**: ⏳ PENDING

### 3.3 Update API Registration Request
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Core/APIService.swift`

**Changes**:
- Add `nephrologist` to `PatientRegistrationRequest` struct
- Include nephrologist in registration API call

**Status**: ⏳ PENDING

### 3.4 Implement Deep Linking with URL Parameters
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Views/Authentication/RegistrationView.swift` and `SceneDelegate.swift` or `Shakir_ClaudeCodeApp.swift`

**Changes**:
- Add URL scheme handling in app configuration
- Parse query parameters from deep link:
  - `referralToken`
  - `firstName`
  - `lastName`
  - `email`
  - `title`
  - `nephrologist`
  - `dialysisClinic`
- Fetch pre-fill data using referral token
- Pre-fill RegistrationView with data
- Auto-populate dialysis clinic and social worker selections

**Status**: ⏳ PENDING

**Info.plist Requirements**:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.transplantwizard.transplantplatform</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>app</string>
    </array>
  </dict>
</array>
```

---

## Phase 4: DUSW Dashboard Implementation

### 4.1 Add Referral Form to DUSW Dashboard
**File**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/dusw-website/views/...` (TBD - need to check current structure)

**Changes**:
- Add prominent "Refer New Patient" button
- Create referral form with:
  - Patient Title (dropdown: Mr, Mrs, Ms, Dr, Prof)
  - Patient First Name (text)
  - Patient Last Name (text)
  - Patient Email (email)
  - Patient Nephrologist (text)
  - Dialysis Clinic (auto-populated from DUSW's clinic)
- Form validation
- Submit button with loading state
- Success/error feedback messages

**Status**: ⏳ PENDING (Need to explore DUSW website structure)

**Form Submission**:
- POST to `/api/v1/dusw/referrals/create`
- Display referral link QR code or copy-to-clipboard
- Show email confirmation status

---

## Files Modified Summary

### Backend
1. `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/database/production-schema-updates.sql`
   - Add nephrologist column
   - Create patient_referral_invitations table

2. `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api/src/simple-auth-server.js`
   - Update registration endpoint
   - Add referral creation endpoint
   - Add referral pre-fill endpoint
   - Add email sending logic

### Mobile App
1. `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Views/Authentication/RegistrationView.swift`
   - Add nephrologist field
   - Add deep link parameter parsing
   - Implement pre-fill logic

2. `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Core/AuthenticationManager.swift`
   - Add nephrologist to PatientRegistrationData

3. `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Core/APIService.swift`
   - Update registration request with nephrologist

4. `/Users/jeremy/Downloads/Shakir-ClaudeCode/Shakir-ClaudeCode/Info.plist`
   - Add URL scheme configuration

### DUSW Website
1. DUSW Dashboard Component (TBD)
   - Add referral form UI
   - Integrate with API endpoint

---

## Dependencies & Requirements

### Email Service (REQUIRED - User Action Needed)
- **Status**: ⚠️ NOT YET CONFIGURED
- **Options**: AWS SES, SendGrid, Mailgun, etc.
- **User Must**: Choose email service and provide credentials/configuration

### Environment Variables (backend/.env)
```
EMAIL_SERVICE=ses|sendgrid|mailgun
EMAIL_FROM=noreply@transplantwizard.com
EMAIL_API_KEY=...
APP_DOWNLOAD_URL=https://apps.apple.com/...
REFERRAL_EXPIRATION_DAYS=30
```

---

## Testing Checklist

- [ ] Database migrations applied successfully
- [ ] DUSW can create a referral
- [ ] Patient receives email with referral link
- [ ] Deep link opens app and pre-fills form
- [ ] Patient registration completes with nephrologist field
- [ ] Referral marked as redeemed after registration
- [ ] Referral expires after 30 days
- [ ] Duplicate email referrals handled properly
- [ ] HIPAA audit logs capture referral creation and redemption
- [ ] Email contains personalized patient name
- [ ] All fields properly validated

---

## Deployment Steps

1. **Local Testing**:
   - Apply database schema changes to local test DB
   - Test backend endpoints locally
   - Test mobile app with deep linking
   - Test DUSW referral form

2. **Push to GitHub**:
   - Commit all changes
   - Push to main branch
   - Tag with version number

3. **EC2 Deployment**:
   - SSH to EC2 instance
   - Pull latest code
   - Apply database migrations
   - Restart backend service
   - Verify health check passes

4. **Mobile App Update**:
   - Build and archive app
   - Upload to TestFlight
   - Distribute to test users

5. **DUSW Website Update**:
   - Rebuild and deploy DUSW website
   - Test referral form end-to-end

---

## Notes

- All timestamps use UTC (TIMESTAMP WITH TIME ZONE)
- Referral tokens are UUIDs for security
- Referrals expire after 30 days (configurable)
- HIPAA audit logs required for referral actions
- Patient email must match exactly for referral redemption
- Phone numbers and other sensitive data encrypted at rest (TBD)

