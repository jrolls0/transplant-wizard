# DUSW Patient Referral System - Complete Testing Guide

## Overview
This guide provides step-by-step instructions to test all components of the DUSW patient referral system end-to-end.

**Estimated Testing Time**: 30-45 minutes

---

## Prerequisites

### 1. System Access
- ✅ EC2 instance running: `3.215.185.174`
- ✅ Backend API accessible: `https://api.transplantwizard.com`
- ✅ DUSW Dashboard accessible: `https://dusw.transplantwizard.com`
- ✅ Email access to: `jrolls@umich.edu` (sandbox recipient)
- ✅ iOS/macOS device or simulator with app installed

### 2. Test Data Setup
- DUSW account with admin access
- Test email address: `jrolls@umich.edu`
- Database access for verification

---

## Test Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: Backend API Health Check                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Database Connectivity & Schema                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: DUSW Dashboard Referral Form                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: Email Sending & SES Integration                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: Deep Link Handling                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: Form Pre-Fill from Deep Link                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: Patient Registration with Referral Token              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: Referral Redemption & Database Verification           │
└─────────────────────────────────────────────────────────────────┘
```

---

# STAGE 1: Backend API Health Check

## Test 1.1: API Health Endpoint

**Purpose**: Verify backend API is running and database is connected

**Steps**:
```bash
# Test from terminal
curl -s https://api.transplantwizard.com/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-12-12T20:16:18.685Z",
#   "environment": "production",
#   "database": "connected",
#   "dbTime": "2025-12-12T20:16:18.682Z",
#   "auth": "basic_auth_enabled"
# }
```

**Pass Criteria**:
- [ ] HTTP Status: 200
- [ ] `status` = "healthy"
- [ ] `database` = "connected"
- [ ] Response time < 1 second

**Failure Handling**:
If API is not responding:
```bash
# Check EC2 process
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "ps aux | grep 'node.*simple-auth-server' | grep -v grep"

# Check logs
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -50 /var/log/backend.log"

# Restart if needed
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "pkill -f 'node.*simple-auth-server' && sleep 2 && cd /home/ec2-user/transplant-wizard/backend-api && AWS_PROFILE=Jeremy node src/simple-auth-server.js > /var/log/backend.log 2>&1 &"
```

---

# STAGE 2: Database Connectivity & Schema

## Test 2.1: Verify Database Tables Exist

**Purpose**: Ensure database schema has been updated with referral tables

**Steps**:
```bash
# Connect to database
PGPASSWORD='$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform
```

**Commands to run**:
```sql
-- Check if nephrologist column exists in patients table
\d patients

-- Expected output should show:
-- Column: nephrologist | Type: character varying(255)

-- Check if referral invitations table exists
\d patient_referral_invitations

-- Expected output should show columns:
-- id | UUID | primary key
-- referral_token | UUID | unique
-- patient_email | VARCHAR | not null
-- patient_first_name | VARCHAR | not null
-- patient_last_name | VARCHAR | not null
-- patient_title | VARCHAR | nullable
-- patient_nephrologist | VARCHAR | nullable
-- dialysis_clinic_id | VARCHAR | not null
-- dusw_id | VARCHAR | not null
-- created_by | VARCHAR | not null
-- created_at | TIMESTAMP | not null
-- expires_at | TIMESTAMP | not null
-- redeemed | BOOLEAN | default false
-- redeemed_at | TIMESTAMP | nullable

-- Exit
\q
```

**Pass Criteria**:
- [ ] `nephrologist` column exists in `patients` table
- [ ] `patient_referral_invitations` table exists
- [ ] All required columns present with correct types
- [ ] Unique constraint on `referral_token`

**Failure Handling**:
If tables are missing, apply schema migration:
```bash
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "PGPASSWORD='\$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform \
  -f /home/ec2-user/transplant-wizard/backend-api/database/production-schema-updates.sql"
```

---

# STAGE 3: DUSW Dashboard Referral Form

## Test 3.1: Access DUSW Dashboard

**Purpose**: Verify referral form is visible in DUSW dashboard

**Steps**:
1. Open browser and navigate to: `https://dusw.transplantwizard.com`
2. Log in with DUSW credentials
3. Navigate to dashboard

**Pass Criteria**:
- [ ] Dashboard loads without errors
- [ ] "Refer New Patient" button is visible in hero section
- [ ] Button is green colored (btn-success)
- [ ] Button has icon and text

## Test 3.2: Open Referral Form Modal

**Purpose**: Test that modal opens and form renders correctly

**Steps**:
1. Click "Refer New Patient" button
2. Observe modal appearance

**Expected Modal**:
```
┌─────────────────────────────────────────────┐
│ 🤝 Refer a New Patient                     X│
│ Invite a patient to join Transplant Wizard  │
├─────────────────────────────────────────────┤
│                                             │
│ Patient Information                         │
│ ┌─────────────────────────────────────────┐│
│ │ Title (Optional)      ▼                 ││
│ │ Select title...                         ││
│ │ Mr, Mrs, Ms, Dr, Prof                   ││
│ ├─────────────────────────────────────────┤│
│ │ First Name *                            ││
│ │ [John              ]                    ││
│ │ Patient's first name                    ││
│ ├─────────────────────────────────────────┤│
│ │ Last Name *                             ││
│ │ [Doe               ]                    ││
│ │ Patient's last name                     ││
│ ├─────────────────────────────────────────┤│
│ │ Email Address *                         ││
│ │ [john@example.com  ]                    ││
│ │ Patient will receive referral link      ││
│ ├─────────────────────────────────────────┤│
│ │ Nephrologist (Optional)                 ││
│ │ [Dr. Jane Smith    ]                    ││
│ │ Patient's nephrologist name             ││
│ ├─────────────────────────────────────────┤│
│ Clinic Information                          │
│ ├─────────────────────────────────────────┤│
│ │ Dialysis Clinic                         ││
│ │ [Your Clinic Name] (Read-only)          ││
│ │ Auto-populated from your clinic         ││
│ └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│ [Cancel]  [✈️ Send Referral]               │
└─────────────────────────────────────────────┘
```

**Pass Criteria**:
- [ ] Modal opens smoothly
- [ ] Title dropdown has options (Mr, Mrs, Ms, Dr, Prof)
- [ ] All input fields are editable
- [ ] Email field type is "email"
- [ ] Dialysis clinic field is read-only
- [ ] Send Referral button is visible and enabled
- [ ] Cancel button is visible

## Test 3.3: Form Validation

**Purpose**: Test form validation works correctly

**Test 3.3a: Missing Required Fields**
```
1. Click "Send Referral" without filling any fields
2. Expected: Browser validation message appears
```

**Pass Criteria**:
- [ ] First Name: "Please fill out this field" appears
- [ ] Form submission is blocked

**Test 3.3b: Invalid Email**
```
1. Fill form:
   - First Name: John
   - Last Name: Doe
   - Email: invalid-email
   - Click "Send Referral"
```

**Pass Criteria**:
- [ ] Email validation error appears
- [ ] Form submission is blocked

**Test 3.3c: Valid Form Data**
```
1. Fill form with valid data:
   - Title: Mr
   - First Name: John
   - Last Name: Doe
   - Email: jrolls@umich.edu (must be sandbox recipient)
   - Nephrologist: Dr. Jane Smith
   - Dialysis Clinic: Auto-filled
2. Click "Send Referral"
```

**Pass Criteria**:
- [ ] No validation errors
- [ ] Form submission proceeds
- [ ] Button shows loading state ("Sending...")
- [ ] Spinner appears on button

---

# STAGE 4: Email Sending & SES Integration

## Test 4.1: Email Successfully Sent to Sandbox Recipient

**Purpose**: Verify AWS SES sends email to verified sandbox recipient

**Setup**: Use the form submission from Test 3.3c

**Steps**:
1. Complete and submit the referral form with `jrolls@umich.edu` as recipient
2. Wait 5-10 seconds for API response
3. Check success alert in modal
4. Check email inbox at `jrolls@umich.edu`

**Backend Logging**:
```bash
# Check backend logs for email confirmation
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -50 /var/log/backend.log | grep -E '(email|Email|✅|❌)'"

# Expected output:
# ✅ Email sent to jrolls@umich.edu: <MessageId>
```

**Modal Response**:
```
✅ Success! Referral sent successfully.
[Close]

# Modal auto-closes after 2 seconds
```

**Pass Criteria**:
- [ ] Modal shows success alert
- [ ] Success message displays for 2 seconds
- [ ] Modal closes automatically
- [ ] Email appears in inbox within 1 minute
- [ ] Email is from: `noreply@transplantwizard.com`
- [ ] Email subject: `Welcome to Transplant Wizard - Referral from [DUSW Name]`

## Test 4.2: Email Content Verification

**Purpose**: Verify email template is correctly formatted and contains all required information

**Email Checks**:
```
HTML Email:
✅ Header section with gradient background
✅ "Welcome to Transplant Wizard" title
✅ "Your Healthcare Team is Here to Support You" subtitle
✅ Personalized greeting: "Hello Mr. John Doe,"
✅ Referral information:
   - DUSW Name: [Name from dashboard]
   - Dialysis Clinic: [Clinic name]
✅ Pre-filled information box with:
   - Name: Mr. John Doe
   - Email: jrolls@umich.edu
   - Dialysis Clinic: [Clinic]
   - Nephrologist: Dr. Jane Smith
✅ "Get Started in 4 Easy Steps" section
✅ "Complete Your Registration" button (clickable link)
✅ Referral link with all parameters:
   app://register?referralToken=<UUID>&firstName=John&...
✅ 30-day expiration notice with date
✅ DUSW contact information
✅ HIPAA compliance notice
✅ Footer with copyright

Text Email:
✅ Plain text version of all content
✅ Referral link readable and clickable
✅ No HTML formatting issues
```

**Pass Criteria**:
- [ ] Email has both HTML and text versions
- [ ] All personalization fields are filled correctly
- [ ] Referral link is present and properly encoded
- [ ] All required compliance notices present
- [ ] Links are clickable

## Test 4.3: Sandbox Recipient Whitelist Enforcement

**Purpose**: Verify non-whitelisted recipients are blocked in sandbox mode

**Setup**: Submit referral form with non-whitelisted email

**Steps**:
1. Go back to DUSW dashboard
2. Click "Refer New Patient" again
3. Fill form with:
   - First Name: John
   - Last Name: Test
   - Email: test@example.com (NOT in whitelist)
   - Nephrologist: Dr. Test
4. Click "Send Referral"

**Expected Response**:
```json
{
  "success": false,
  "error": "Email blocked - recipient not verified in sandbox mode"
}
```

**Modal Display**:
```
❌ Error: Email blocked - recipient not verified in sandbox mode
[Close]
```

**Backend Logging**:
```bash
# Check logs
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -50 /var/log/backend.log | grep 'blocked\\|Sandbox Recipients'"

# Expected:
# ⚠️  Email to test@example.com blocked - not in sandbox recipients list
# ⚠️  Sandbox recipients: jrolls@umich.edu
```

**Pass Criteria**:
- [ ] Error alert appears in modal
- [ ] Email is NOT sent
- [ ] Error message clearly indicates sandbox mode restriction
- [ ] Referral record may or may not be created (implementation dependent)
- [ ] Backend logs show blocked attempt

---

# STAGE 5: Deep Link Handling

## Test 5.1: Extract Referral Link from Email

**Purpose**: Get the deep link from the email to test mobile app integration

**Steps**:
1. Open email from Test 4.1
2. Find the "Complete Your Registration" button
3. Right-click button → "Inspect" or "Copy Link"
4. Extract the URL starting with `app://register?...`

**Example Link**:
```
app://register?referralToken=<UUID>&firstName=John&lastName=Doe&email=jrolls@umich.edu&title=Mr&nephrologist=Dr.%20Jane%20Smith&dialysisClinic=Metro%20Health%20Dialysis&dusw=Jane%20Nurse,%20MSW
```

**Pass Criteria**:
- [ ] Link starts with `app://register`
- [ ] Contains `referralToken` parameter (UUID format)
- [ ] Contains `firstName` parameter
- [ ] Contains `lastName` parameter
- [ ] Contains `email` parameter
- [ ] Contains `title` parameter
- [ ] Contains `nephrologist` parameter
- [ ] Contains `dialysisClinic` parameter
- [ ] Contains `dusw` parameter
- [ ] URL is properly encoded (spaces as %20, etc.)

## Test 5.2: Test Deep Link on iOS Simulator

**Purpose**: Verify app opens and processes deep link correctly

**Prerequisites**:
- Xcode installed
- App installed on simulator

**Steps**:
1. Open Terminal
2. Get the deep link URL from Test 5.1
3. Open link from simulator:

```bash
# Method 1: Using xcrun
xcrun simctl openurl booted "app://register?referralToken=<UUID>&firstName=John&lastName=Doe&email=jrolls@umich.edu&title=Mr&nephrologist=Dr.%20Jane%20Smith&dialysisClinic=Metro%20Health&dusw=Jane%20Nurse"

# Method 2: Using Safari on simulator
# 1. Open Safari in simulator
# 2. Click address bar
# 3. Paste the full URL
# 4. Press Enter
```

**Expected Behavior**:
```
1. App comes to foreground
2. Console logs:
   🔗 Deep link received: app://register?referralToken=...
   📋 Parsed parameter: referralToken = <UUID>
   📋 Parsed parameter: firstName = John
   📋 Parsed parameter: lastName = Doe
   📋 Parsed parameter: email = jrolls@umich.edu
   📋 Parsed parameter: title = Mr
   📋 Parsed parameter: nephrologist = Dr. Jane Smith
   📋 Parsed parameter: dialysisClinic = Metro Health
   📋 Parsed parameter: dusw = Jane Nurse, MSW
3. App navigates to registration view
4. Form appears (partially or fully pre-filled)
5. Logs show:
   ✅ Deep link processed successfully
```

**Pass Criteria**:
- [ ] App comes to foreground
- [ ] No crashes or errors
- [ ] Console shows all parsed parameters
- [ ] App navigates to registration view
- [ ] Deep link processing completes without errors

## Test 5.3: Backend Referral Data API

**Purpose**: Verify the `/api/v1/patient/referral/:token` endpoint returns correct data

**Steps**:
1. Extract referral token from email link or database
2. Call API directly:

```bash
# Replace <TOKEN> with actual UUID from email
curl -s "https://api.transplantwizard.com/api/v1/patient/referral/<TOKEN>" | jq .

# Example response:
# {
#   "success": true,
#   "data": {
#     "patientTitle": "Mr",
#     "patientFirstName": "John",
#     "patientLastName": "Doe",
#     "patientEmail": "jrolls@umich.edu",
#     "patientNephrologist": "Dr. Jane Smith",
#     "dialysisClinic": "Metro Health Dialysis",
#     "dialysisClinicId": "<UUID>",
#     "duswName": "Jane Nurse, MSW",
#     "duswEmail": "jane.nurse@clinic.com",
#     "expiresAt": "2025-01-11T..."
#   }
# }
```

**Pass Criteria**:
- [ ] HTTP Status: 200
- [ ] `success` = true
- [ ] All patient fields populated correctly
- [ ] Expiration date is ~30 days in future
- [ ] No sensitive information exposed beyond needed for pre-fill

## Test 5.4: Invalid/Expired Referral Token

**Purpose**: Verify API correctly rejects invalid tokens

**Steps**:
1. Test with invalid token:

```bash
# Test with invalid UUID
curl -s "https://api.transplantwizard.com/api/v1/patient/referral/00000000-0000-0000-0000-000000000000" | jq .

# Expected response:
# {
#   "success": false,
#   "error": "Referral not found or has expired. Please contact your DUSW for a new referral link."
# }
```

2. Test with expired token (if you have one from >30 days ago):

```bash
# Same as above, API should return same error
```

**Pass Criteria**:
- [ ] HTTP Status: 400 or 404
- [ ] `success` = false
- [ ] Error message is helpful and user-friendly
- [ ] No server stack traces exposed
- [ ] Response time is < 1 second

---

# STAGE 6: Form Pre-Fill from Deep Link

## Test 6.1: Automatic Form Pre-Population

**Purpose**: Verify registration form is pre-filled from deep link parameters

**Setup**: Complete Test 5.2 (deep link opens app)

**Expected Behavior**:
After deep link opens app and navigates to registration:

```
Registration Form should show:

✅ Title field: "Mr" (pre-filled)
✅ First Name field: "John" (pre-filled)
✅ Last Name field: "Doe" (pre-filled)
✅ Email field: "jrolls@umich.edu" (pre-filled, possibly disabled)
✅ Phone Number field: Empty (not in referral data)
✅ Date of Birth field: Empty (not in referral data)
✅ Address field: Empty (not in referral data)
✅ Primary Care Physician field: Empty (not in referral data)
✅ Insurance Provider field: Empty (not in referral data)
✅ Nephrologist field: "Dr. Jane Smith" (pre-filled)
✅ Dialysis Clinic: "Metro Health Dialysis" (pre-filled)
✅ Password field: Empty (for user to enter)
✅ Confirm Password field: Empty (for user to enter)
```

**Console Logs Expected**:
```
🔗 Pre-populating form from referral data
✅ Referral token loaded: <UUID>
📍 Pre-filled dialysis clinic: Metro Health Dialysis
👤 Pre-filled DUSW name: Jane Nurse, MSW
✅ Form pre-population complete
```

**Pass Criteria**:
- [ ] All pre-fill fields have correct values
- [ ] Fields not in referral data are empty
- [ ] Form is fully visible and scrollable
- [ ] User can edit any field
- [ ] No errors in console

## Test 6.2: Fetch Complete Referral Data from Backend

**Purpose**: Verify app fetches additional data from backend API during deep link processing

**Setup**: Same as Test 6.1, but monitor console logs

**Expected Behavior**:
1. Deep link triggers app to parse URL
2. Referral token is extracted
3. App makes API call to `/api/v1/patient/referral/<TOKEN>`
4. Backend returns complete data
5. Form is merged with both URL parameters and API data

**Console Logs Expected**:
```
🔗 Deep link received: app://register?...
📋 Parsed parameter: referralToken = <UUID>
📋 Parsed parameter: firstName = John
... (all parameters listed)
✅ Deep link processed successfully
✅ Referral data fetched successfully
```

**Pass Criteria**:
- [ ] API call is made to referral endpoint
- [ ] Response is successful (200)
- [ ] No errors in console
- [ ] Form is fully pre-filled with merged data

---

# STAGE 7: Patient Registration with Referral Token

## Test 7.1: Complete Registration with Referral Data

**Purpose**: Test complete registration flow with referral token

**Setup**: Form should be pre-filled from Tests 6.1 and 6.2

**Steps**:
1. Pre-filled form should show:
   - Title: Mr
   - First Name: John
   - Last Name: Doe
   - Email: jrolls@umich.edu
   - Nephrologist: Dr. Jane Smith

2. Fill in remaining required fields:
   - Password: `SecurePassword123!` (must meet requirements)
   - Phone Number: +1-555-123-4567
   - Date of Birth: 01/15/1980
   - Address: 123 Main St, Apt 4B
   - Primary Care Physician: Dr. Michael Smith
   - Insurance Provider: Blue Cross Blue Shield

3. Click "Register" button

**Expected Behavior**:
```
1. Form validation passes
2. Loading spinner appears
3. API call: POST /api/v1/auth/register/patient with:
   {
     "title": "Mr",
     "firstName": "John",
     "lastName": "Doe",
     "email": "jrolls@umich.edu",
     "phoneNumber": "+1-555-123-4567",
     "dateOfBirth": "1980-01-15",
     "address": "123 Main St, Apt 4B",
     "primaryCarePhysician": "Dr. Michael Smith",
     "insuranceProvider": "Blue Cross Blue Shield",
     "nephrologist": "Dr. Jane Smith",
     "dialysisClinic": "Metro Health Dialysis",
     "socialWorkerName": "[from referral]",
     "referralToken": "<UUID>",
     "password": "SecurePassword123!"
   }

4. Server responds:
   {
     "success": true,
     "message": "Registration successful! Automatically logged in.",
     "autoLogin": true,
     "data": {
       "accessToken": "<JWT>",
       "user": {
         "id": "<patient-uuid>",
         "email": "jrolls@umich.edu",
         "firstName": "John",
         "lastName": "Doe",
         "profileCompleted": false,
         "onboardingCompleted": false,
         "roiSigned": false
       }
     }
   }

5. Patient is auto-logged in
6. App navigates to dashboard
```

**Pass Criteria**:
- [ ] No form validation errors
- [ ] API call succeeds (200 status)
- [ ] Patient record created in database
- [ ] User is auto-logged in
- [ ] App navigates to main dashboard
- [ ] No errors in console

## Test 7.2: Registration with Invalid Password

**Purpose**: Test password validation

**Setup**: From pre-filled form

**Steps**:
1. Fill remaining fields with valid data except password
2. Enter weak password: `weak` (too short)
3. Click "Register"

**Expected Behavior**:
```
Password validation error:
"Password must be at least 8 characters with uppercase, lowercase, number, and symbol"

Form submission blocked
```

**Pass Criteria**:
- [ ] Error message displays clearly
- [ ] Password requirements shown
- [ ] Form submission blocked
- [ ] User can correct and retry

## Test 7.3: Registration with Duplicate Email

**Purpose**: Test duplicate email handling

**Setup**: Use an email that already exists in system

**Steps**:
1. In the pre-filled form, change email to: existing@example.com
2. Fill other fields
3. Click "Register"

**Expected Behavior**:
```
API responds:
{
  "success": false,
  "error": "Email already registered. Please use a different email or log in."
}

Error displayed in form:
"Email already registered. Please use a different email or log in."
```

**Pass Criteria**:
- [ ] Error is clear and actionable
- [ ] Form is not cleared (user can easily fix)
- [ ] API returns appropriate error code

---

# STAGE 8: Referral Redemption & Database Verification

## Test 8.1: Verify Referral Token is Marked as Redeemed

**Purpose**: Confirm referral token cannot be reused after first registration

**Setup**: Completed registration from Test 7.1

**Steps**:
1. Connect to database:

```bash
PGPASSWORD='$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform
```

2. Query referral record:

```sql
-- Find the referral record by email
SELECT
  id,
  referral_token,
  patient_email,
  redeemed,
  redeemed_at,
  created_at,
  expires_at
FROM patient_referral_invitations
WHERE patient_email = 'jrolls@umich.edu'
ORDER BY created_at DESC
LIMIT 1;

-- Expected output:
--  id                   | <UUID>
--  referral_token       | <UUID>
--  patient_email        | jrolls@umich.edu
--  redeemed             | true (✅)
--  redeemed_at          | 2025-12-12 20:25:30.123456 (✅)
--  created_at           | 2025-12-12 20:15:30.123456
--  expires_at           | 2026-01-11 20:15:30.123456
```

**Pass Criteria**:
- [ ] `redeemed` = true
- [ ] `redeemed_at` is populated with recent timestamp
- [ ] `expires_at` is ~30 days from creation

## Test 8.2: Verify Patient Record is Created Correctly

**Purpose**: Confirm all patient data is saved correctly

**Steps**:
```sql
-- Query the patient record
SELECT
  p.id,
  p.user_id,
  u.email,
  u.first_name,
  u.last_name,
  p.primary_care_physician,
  p.insurance_provider,
  p.nephrologist,
  p.profile_completed,
  p.onboarding_completed,
  p.created_at
FROM patients p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'jrolls@umich.edu'
LIMIT 1;

-- Expected output:
--  id                          | <UUID>
--  user_id                     | <UUID>
--  email                       | jrolls@umich.edu
--  first_name                  | John
--  last_name                   | Doe
--  primary_care_physician      | Dr. Michael Smith
--  insurance_provider          | Blue Cross Blue Shield
--  nephrologist                | Dr. Jane Smith (✅)
--  profile_completed           | false
--  onboarding_completed        | false
--  created_at                  | 2025-12-12 20:25:30.123456
```

**Pass Criteria**:
- [ ] Patient record exists
- [ ] Email matches referral email
- [ ] All provided fields are saved
- [ ] `nephrologist` field is populated correctly
- [ ] Profile and onboarding flags are false (as expected)

## Test 8.3: Verify Referral Token Cannot Be Reused

**Purpose**: Security check - ensure expired/redeemed tokens can't be used again

**Steps**:
1. Extract the same referral token from the email
2. Try to use it again:

```bash
# Try to register with same token
curl -X POST https://api.transplantwizard.com/api/v1/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com",
    "referralToken": "<SAME-TOKEN-AS-BEFORE>",
    "password": "SecurePassword123!"
  }' | jq .
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Referral token has already been redeemed or is invalid"
}
```

**Pass Criteria**:
- [ ] Request fails (400 or 403 status)
- [ ] Error indicates token already used
- [ ] No duplicate patient records created
- [ ] Database integrity maintained

## Test 8.4: Verify Audit Logs

**Purpose**: Confirm all actions are logged for HIPAA compliance

**Steps**:
```sql
-- Check audit logs for referral creation
SELECT
  action,
  user_id,
  resource_type,
  resource_id,
  details,
  created_at
FROM audit_logs
WHERE resource_type = 'referral_invitation'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Expected logs:
-- 1. Action: REFERRAL_CREATED
--    Details: { referral_token: <UUID>, patient_email: jrolls@umich.edu }
--
-- 2. Action: REFERRAL_REDEEMED
--    Details: { referral_token: <UUID>, patient_email: jrolls@umich.edu }

-- Check authentication logs
SELECT
  action,
  email,
  success,
  created_at
FROM audit_logs
WHERE action IN ('USER_REGISTERED', 'USER_LOGIN')
  AND email = 'jrolls@umich.edu'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Expected:
-- 1. Action: USER_REGISTERED, Success: true
-- 2. Action: USER_LOGIN, Success: true (auto-login)
```

**Pass Criteria**:
- [ ] Referral creation logged
- [ ] Referral redemption logged
- [ ] Patient registration logged
- [ ] Auto-login logged
- [ ] All timestamps are recent and sequential
- [ ] All entries have proper user/resource tracking

---

# STAGE 9: Edge Cases & Error Handling

## Test 9.1: Expired Referral Link

**Purpose**: Test behavior with expired referral token

**Steps**:
1. Create a referral that's older than 30 days (or manually set expiration in DB)
2. Try to use the deep link:

```bash
xcrun simctl openurl booted "app://register?referralToken=<EXPIRED-UUID>..."
```

**Expected Behavior**:
```
1. App processes deep link
2. API call to /api/v1/patient/referral/<TOKEN> fails
3. Error logged:
   ❌ Error fetching referral data: Referral not found or has expired
4. Form shows warning or error
5. User can proceed with manual registration
```

**Pass Criteria**:
- [ ] Error is handled gracefully
- [ ] No app crash
- [ ] User can still register manually
- [ ] Clear error message shown

## Test 9.2: Network Timeout

**Purpose**: Test behavior with slow/no network

**Setup**: iOS Simulator with network disabled

**Steps**:
1. Disable network in simulator settings
2. Trigger deep link
3. Try to register

**Expected Behavior**:
```
1. Deep link processing attempts API call
2. Network timeout occurs
3. Error logged:
   ❌ Error fetching referral data: Network connection error
4. Form shows network error alert
5. Retry option available
```

**Pass Criteria**:
- [ ] Graceful error handling
- [ ] No app crash
- [ ] User can enable network and retry
- [ ] Helpful error message shown

## Test 9.3: Malformed Deep Link

**Purpose**: Test with invalid/incomplete URL

**Steps**:
1. Test malformed links:

```bash
# Missing parameters
xcrun simctl openurl booted "app://register"

# Invalid scheme
xcrun simctl openurl booted "http://register?referralToken=<UUID>"

# Missing UUID
xcrun simctl openurl booted "app://register?referralToken=invalid"
```

**Expected Behavior**:
```
1. App receives URL
2. Validation fails
3. Error logged:
   ❌ Invalid URL scheme/format
4. App handles gracefully (doesn't crash)
5. User can proceed with manual registration
```

**Pass Criteria**:
- [ ] No app crash for any malformed link
- [ ] Errors logged appropriately
- [ ] App remains functional

---

# Test Summary & Checklist

## Quick Check Summary

Use this checklist to track all tests:

### Stage 1: Backend Health ✅
- [ ] API health check passes
- [ ] Database connected
- [ ] Response time acceptable

### Stage 2: Database Schema ✅
- [ ] `nephrologist` column exists
- [ ] `patient_referral_invitations` table exists
- [ ] All columns correct type and constraints

### Stage 3: DUSW Dashboard ✅
- [ ] Referral button visible
- [ ] Modal opens correctly
- [ ] Form fields render properly
- [ ] Form validation works
- [ ] Required field validation works
- [ ] Email validation works

### Stage 4: Email Sending ✅
- [ ] Email sent to sandbox recipient
- [ ] Email blocked for non-whitelisted recipient
- [ ] Email content is correct
- [ ] Email formatting is professional
- [ ] All personalization fields correct
- [ ] Deep link included in email

### Stage 5: Deep Linking ✅
- [ ] Referral link extracted from email
- [ ] Deep link opens app
- [ ] URL parameters parsed correctly
- [ ] Referral API endpoint returns data
- [ ] Invalid token handled gracefully

### Stage 6: Form Pre-Fill ✅
- [ ] Form fields pre-filled from URL
- [ ] Form fields pre-filled from API data
- [ ] Email field is populated
- [ ] Nephrologist field is populated
- [ ] Other fields are empty (expected)

### Stage 7: Registration ✅
- [ ] Registration with referral token succeeds
- [ ] Patient auto-logged in
- [ ] User navigated to dashboard
- [ ] Weak password rejected
- [ ] Duplicate email rejected
- [ ] All data saved correctly

### Stage 8: Verification ✅
- [ ] Referral token marked as redeemed
- [ ] `redeemed_at` timestamp set
- [ ] Patient record created
- [ ] All fields saved correctly
- [ ] Audit logs recorded
- [ ] Token cannot be reused

### Stage 9: Error Handling ✅
- [ ] Expired token handled
- [ ] Network error handled
- [ ] Malformed link handled
- [ ] All errors logged appropriately
- [ ] No crashes occur

---

# Troubleshooting Guide

## Common Issues & Solutions

### Email Not Received
**Problem**: Email not arriving in inbox
**Solution**:
1. Check it's not in spam/junk folder
2. Verify recipient is in whitelist: `jrolls@umich.edu`
3. Check backend logs for email errors
4. Verify SES credentials in EC2 `.env` file
5. Verify IAM role has SES permissions

### Deep Link Not Opening App
**Problem**: Deep link doesn't trigger app launch
**Solution**:
1. Verify URL scheme in Info.plist: `app`
2. Ensure app is installed on device/simulator
3. Try opening link from Notes app vs Mail app
4. Check system logs for URL handler errors
5. Try simpler test URL first

### Form Pre-Fill Not Working
**Problem**: Form fields not pre-filled
**Solution**:
1. Check deep link has all query parameters
2. Verify referral token is valid and not expired
3. Check API returns data (curl test)
4. Check AppState is being updated
5. Check RegistrationView has prePopulateFromReferral call

### Registration Fails with Referral Token
**Problem**: Registration fails with token error
**Solution**:
1. Verify token format is valid UUID
2. Check token exists in database
3. Verify token hasn't expired (30 days)
4. Verify patient email matches referral email
5. Check backend logs for specific error

### Database Connection Issues
**Problem**: Can't connect to database
**Solution**:
1. Verify RDS endpoint: `transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com`
2. Verify password: `$ball9Base`
3. Verify EC2 instance has network access to RDS
4. Check security group rules allow connection
5. Try connecting from EC2 directly first

---

# Test Report Template

Use this template to document your test results:

```markdown
# Test Execution Report
Date: ___________
Tester: _________

## Results Summary
- Total Tests: 9 Stages (50+ individual tests)
- Passed: ___
- Failed: ___
- Blocked: ___

## Stage 1: Backend Health
[ ] Health check passes
[ ] Database connected
Comments: _____________

## Stage 2: Database Schema
[ ] Tables exist
[ ] Columns correct
Comments: _____________

## Stage 3: DUSW Dashboard
[ ] Form displays
[ ] Validation works
Comments: _____________

## Stage 4: Email Sending
[ ] Email sent
[ ] Content correct
Comments: _____________

## Stage 5: Deep Linking
[ ] Link extracted
[ ] App opens
Comments: _____________

## Stage 6: Form Pre-Fill
[ ] Fields pre-filled
[ ] Data correct
Comments: _____________

## Stage 7: Registration
[ ] Registration succeeds
[ ] Auto-login works
Comments: _____________

## Stage 8: Verification
[ ] Data saved
[ ] Token redeemed
Comments: _____________

## Stage 9: Error Handling
[ ] Errors handled
[ ] No crashes
Comments: _____________

## Overall Assessment
PASS / FAIL / BLOCKED

## Issues Found
1. [Description]
   - Status: Open/Fixed
   - Priority: Critical/High/Medium/Low

## Sign-Off
Tester: ________
Date: __________
```

---

**Total Testing Time**: 30-45 minutes
**Success Criteria**: All stages pass with no critical issues
**Date Prepared**: December 12, 2025
