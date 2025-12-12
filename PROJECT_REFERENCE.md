# Transplant Wizard Project Reference Guide

## Project Overview
Full-stack transplant platform with patient mobile app, DUSW (Dialysis Unit Social Worker) web portal, and backend API.

## AWS Infrastructure

### EC2 Instance
- **Instance ID**: `i-01ccb106fd09c4e58`
- **Instance Type**: `t3.micro`
- **Region**: `us-east-1`
- **Public IP**: `3.215.185.174`
- **Private IP**: `10.0.1.37`
- **Name Tag**: `transplant-platform-server`
- **State**: Running
- **Launch Time**: 2025-11-07 16:53:54 UTC

### SSH Access
- **Key Pair Name**: `transplant-platform-key`
- **Key File Location**: `/Users/jeremy/.ssh/transplant-wizard-key.pem`
- **OS Username**: `ec2-user`
- **OS**: Amazon Linux

### AWS Credentials
- **AWS Account ID**: `126279420316` (new account)
- **AWS Profile**: `transplant-platform-admin`
- **AWS Region**: `us-east-1`
- **MCP Server Config**: AWS MCP server configured in `.claude/settings.local.json`

### RDS Database
- **Endpoint**: `transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com`
- **Port**: `5432`
- **Database Name**: `transplant_platform`
- **Admin User**: `transplant_admin`
- **Admin Password**: `$ball9Base`
- **Type**: PostgreSQL

### S3 Buckets
- `transplant-platform-patient-docs-147997160304` - Patient documents storage
- `elasticbeanstalk-us-east-1-147997160304` - Elastic Beanstalk deployments

## Backend Application

### Local Location
- **Path**: `/Users/jeremy/Downloads/Shakir-ClaudeCode/backend-api`
- **Language**: Node.js (JavaScript/TypeScript)
- **Entry Point**: `src/simple-auth-server.js` (main authentication server)
- **Configuration**: `.env` file in backend-api root

### Remote Location (EC2)
- **EC2 Path**: `/home/ec2-user/transplant-wizard/backend-api`
- **SSH Access**: `ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174`

### Backend Structure
```
backend-api/
├── src/
│   ├── simple-auth-server.js (MAIN - patient auth, registration, login)
│   ├── production-server.js
│   ├── basic-auth-server.js
│   ├── app.ts
│   ├── server.ts
│   ├── routes/ (route definitions)
│   ├── middleware/ (auth, validation, etc)
│   ├── services/ (business logic)
│   ├── config/ (config files)
│   └── types/ (TypeScript types)
├── database/
│   └── production-schema-updates.sql
├── .env (environment variables)
├── package.json
└── tsconfig.json
```

### API Base URL
- **Production**: `https://api.transplantwizard.com/api/v1`
- **Endpoints**:
  - `POST /auth/register/patient` - Patient registration
  - `POST /auth/login` - Patient login
  - `POST /auth/verify` - Email verification
  - `POST /auth/refresh` - Token refresh
  - `GET /api/social-workers` - Fetch social workers by dialysis clinic
  - `POST /dusw/referrals/create` - DUSW create patient referral (NEW)
  - `GET /patient/referral/{token}` - Get pre-fill data from referral token (NEW)

### Current Database Schema (Key Tables)

### patients table
- **id** (UUID) - Primary key
- **user_id** (UUID) - Foreign key to users table
- **dialysis_clinic_id** (UUID) - Foreign key to dialysis_clinics
- **assigned_social_worker_id** (UUID) - Foreign key to social_workers
- **date_of_birth** (DATE)
- **address** (TEXT)
- **primary_care_physician** (VARCHAR 200)
- **insurance_provider** (VARCHAR 200)
- **profile_completed** (BOOLEAN)
- **onboarding_completed** (BOOLEAN)
- **created_at**, **updated_at** (TIMESTAMP)

### users table
- **id** (UUID) - Primary key
- **cognito_sub** (VARCHAR) - Cognito user ID
- **email** (VARCHAR) - Unique
- **role** (user_role enum: patient, social_worker, admin)
- **status** (user_status enum: active, inactive, pending_verification)
- **title**, **first_name**, **last_name**, **phone_number**
- **email_verified** (BOOLEAN)
- **created_at**, **updated_at**, **last_login_at**, **email_verified_at**

### dusw_social_workers table (referenced in simple-auth-server.js)
- Contains social worker information with dialysis clinic associations

## Database Schema Changes Needed
- Add `nephrologist` column to `patients` table (VARCHAR 255, nullable)
- Add `patient_referral_invitations` table with fields:
  - `id` (UUID, primary key)
  - `referral_token` (UUID, unique)
  - `patient_email` (VARCHAR)
  - `patient_title` (VARCHAR, nullable)
  - `patient_first_name` (VARCHAR)
  - `patient_last_name` (VARCHAR)
  - `patient_nephrologist` (VARCHAR, nullable)
  - `dialysis_clinic_id` (VARCHAR)
  - `dusw_id` (VARCHAR)
  - `created_by` (VARCHAR) - DUSW email
  - `created_at` (TIMESTAMP)
  - `expires_at` (TIMESTAMP)
  - `redeemed` (BOOLEAN, default false)
  - `redeemed_at` (TIMESTAMP, nullable)

## Mobile App

### Project Location
- **Path**: `/Users/jeremy/Downloads/Shakir-ClaudeCode`
- **Type**: iOS/macOS SwiftUI app
- **Bundle ID**: `com.transplantwizard.transplantplatform`
- **Minimum iOS**: `17.0`

### Key Files
- **RegistrationView**: `/Shakir-ClaudeCode/Views/Authentication/RegistrationView.swift`
- **LoginView**: `/Shakir-ClaudeCode/Views/Authentication/LoginView.swift`
- **AuthenticationManager**: `/Shakir-ClaudeCode/Core/AuthenticationManager.swift`
- **APIService**: `/Shakir-ClaudeCode/Core/APIService.swift`
- **PatientModels**: `/Shakir-ClaudeCode/Models/PatientModels.swift`

### Deep Linking
- **URL Scheme**: `app://register` (needs to be configured)
- **Query Parameters**:
  - `referralToken` - Referral token for pre-fill
  - `firstName` - Pre-filled first name
  - `lastName` - Pre-filled last name
  - `email` - Pre-filled email
  - `title` - Pre-filled title
  - `nephrologist` - Pre-filled nephrologist
  - `dialysisClinic` - Pre-filled dialysis clinic name
  - `dusw` - DUSW name

### Important Models
- **PatientRegistrationData**: Struct in AuthenticationManager.swift
  - Currently has: title, firstName, lastName, phoneNumber, dateOfBirth, address, primaryCarePhysician, insuranceProvider, dialysisClinic, socialWorkerName
  - Needs: nephrologist field added

## DUSW Dashboard

### Location
- **Path**: `/home/ec2-user/transplant-wizard/dusw-dashboard` (assumed - needs verification)
- **Type**: Web portal (React/Vue/etc - needs verification)
- **URL**: `https://dusw.transplantwizard.com` (assumed)

### Features to Add
- **Refer Patient Button**: Prominent UI element
- **Referral Form**:
  - Patient Title (select dropdown)
  - Patient First Name (text input)
  - Patient Last Name (text input)
  - Patient Email (email input)
  - Nephrologist (text input)
  - Dialysis Clinic (auto-populated from DUSW's clinic)
  - Submit button
- **API Call**: POST to `/dusw/referrals/create`

## Domain & Networking

### DNS Configuration
- **Root Domain**: `transplantwizard.com`
- **Subdomains**:
  - `api.transplantwizard.com` → Backend API (EC2)
  - `dusw.transplantwizard.com` → DUSW Portal
  - `tc.transplantwizard.com` → Transplant Center Portal
- **DNS Provider**: Cloudflare
- **SSL**: Cloudflare origin certificates

### Cloudflare Configuration
- **HTTPS Required**: Yes (redirect HTTP to HTTPS)
- **Origin Certificates**: Configured for `*.transplantwizard.com`

## Development Commands

### Mobile App
```bash
# Build
xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 16' build

# Run tests
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15'
```

### Backend
```bash
# Connect to EC2
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174

# Run backend server
cd /home/ec2-user/transplant-wizard
AWS_PROFILE=Jeremy node src/simple-auth-server.js

# Database access
PGPASSWORD='$ball9Base' psql -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com -p 5432 -U transplant_admin -d transplant_platform
```

### AWS Commands
```bash
# List EC2 instances
aws ec2 describe-instances --region us-east-1 --profile transplant-platform-admin

# Describe specific instance
aws ec2 describe-instances --instance-ids i-01ccb106fd09c4e58 --region us-east-1 --profile transplant-platform-admin

# RDS describe
aws rds describe-db-instances --region us-east-1 --profile transplant-platform-admin
```

## Email Configuration
- **Service**: Needs to be configured (SES, SendGrid, etc.)
- **From Email**: TBD
- **Referral Email Template**: Include personalized message with patient name and app download link

## Testing Accounts

### DUSW Portal Users
- **Email**: `jeremy@transplantwizard.com` or similar
- **Role**: Social Worker at a specific dialysis clinic

### Patient Test Accounts
- Created via registration form or by DUSW referral

## DUSW Referral System Implementation Status (As of Dec 12, 2025)

### ✅ COMPLETED
- Database schema: Added nephrologist column, created patient_referral_invitations table
- Backend API: Registration endpoint updated, two new referral endpoints created
- Mobile App: Nephrologist field added, referral token support implemented
- All changes committed to GitHub and ready for deployment

### ⏳ PENDING (REQUIRES USER ACTION)
1. **Email Service Setup** (CRITICAL - BLOCKS REFERRAL FEATURE)
   - Choose provider: AWS SES, SendGrid, Mailgun, etc.
   - Add credentials to backend .env
   - Implement email sending in simple-auth-server.js line 549
   - Email template with referral link and personalized greeting

2. **Deep Linking** (MOBILE APP)
   - Add URL scheme to Info.plist (CFBundleURLSchemes: "app")
   - Implement URL parameter parsing in SceneDelegate
   - Pre-fill registration form from URL parameters
   - Fetch referral data from /api/v1/patient/referral/:token endpoint

3. **DUSW Dashboard Referral Form** (WEB PORTAL)
   - Location: dusw-website/ (structure TBD)
   - Add "Refer New Patient" button and form
   - POST to /api/v1/dusw/referrals/create endpoint
   - Display referral link with copy/QR code options

4. **Database Migration to Production**
   - Apply production-schema-updates.sql
   - Verify tables exist and columns created

5. **Testing**
   - Email delivery verification
   - Deep link opening and form pre-fill
   - End-to-end referral workflow

### Key Implementation Details
- **Referral Token**: UUID, expires in 30 days, checked before use
- **Patient Email**: Must match exactly between referral and registration
- **Pre-Fill URL Format**: `app://register?referralToken=uuid&firstName=John&lastName=Doe&email=...&nephrologist=...&dialysisClinic=...`
- **API Endpoints**:
  - `POST /api/v1/auth/register/patient` (updated - accepts nephrologist + referralToken)
  - `POST /api/v1/dusw/referrals/create` (new)
  - `GET /api/v1/patient/referral/:token` (new)

### Files Modified in Latest Commit (948c289)
- `backend-api/src/simple-auth-server.js` (lines 162-166 registration params, 171-185 referral handling, 453-629 new endpoints)
- `backend-api/database/production-schema-updates.sql` (nephrologist column, referral table)
- `Shakir-ClaudeCode/Views/Authentication/RegistrationView.swift` (nephrologist field, referral state)
- `Shakir-ClaudeCode/Core/AuthenticationManager.swift` (PatientRegistrationData struct)
- `Shakir-ClaudeCode/Core/APIService.swift` (PatientRegistrationRequest struct)

### Documentation Files Created
- `IMPLEMENTATION_PLAN.md` - Detailed step-by-step implementation guide
- `DUSW_REFERRAL_COMPLETION_SUMMARY.md` - Completion status and deployment checklist
- `PROJECT_REFERENCE.md` - This file (project overview and structure)

## Important Notes
- All sensitive data (passwords, tokens) should be environment variables
- HIPAA compliance required for patient data
- Deep linking needs URL scheme configuration in Xcode (Info.plist)
- Referral tokens are UUIDs with 30-day expiration
- Patient email validation required before allowing registration from referral link
- Email sending is critical path item - must be configured before DUSW referral feature is live
- All referral actions logged to audit_logs table for HIPAA compliance
