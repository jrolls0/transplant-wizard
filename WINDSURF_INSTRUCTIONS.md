# Windsurf Agent Instructions

## What Is This Repo?

**Transplant Wizard** is a HIPAA-compliant healthcare platform that connects kidney dialysis patients with transplant centers. It streamlines the referral process from dialysis unit social workers (DUSWs) to transplant centers.

### Core User Flows
1. **Patient Registration**: Patients download iOS app → Register → Sign ROI consent → Select transplant centers
2. **DUSW Referral**: Social workers create referrals → Patient receives email → Pre-filled registration in app
3. **Transplant Center**: Centers receive referrals and patient information

---

## High-Level Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   iOS App        │     │   Web Portals    │     │   Backend API    │
│   (SwiftUI)      │     │   (Node/EJS)     │     │   (Node/Express) │
│                  │     │                  │     │                  │
│   Patient-facing │     │   DUSW: :3001    │     │   :3004          │
│                  │     │   TC:   :3002    │     │                  │
│                  │     │   Main: :3000    │     │                  │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   Cloudflare (DNS/CDN)  │
                    │   transplantwizard.com  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   EC2 + Nginx           │
                    │   3.215.185.174         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   RDS PostgreSQL        │
                    │   transplant-platform-db│
                    └─────────────────────────┘
```

---

## Key Product Flows

### Implemented Flows ✅

#### 1. Patient Registration (Without Referral)
```
iOS App: WereYouReferredView → "No" → RegistrationView → Backend API
```
- Patient opens app, selects "No" to referral question
- Fills out registration form (name, email, password, dialysis clinic, social worker)
- Backend creates `users` + `patients` + `user_credentials` records
- Returns JWT token, auto-logs in patient
- **Files**: `RegistrationView.swift`, `simple-auth-server.js` (`/api/v1/auth/register/patient`)

#### 2. Patient Registration (With DUSW Referral)
```
iOS App: WereYouReferredView → "Yes" → ReferralEmailLookupView → RegistrationView (pre-filled)
```
- Patient selects "Yes, I was referred"
- Enters email address
- Backend looks up `patient_referral_invitations` table
- If found: returns pre-filled data (name, clinic, social worker)
- Registration form auto-populates, patient just adds password
- Referral marked as `redeemed = true`
- **Files**: `ReferralEmailLookupView.swift`, `simple-auth-server.js` (`/api/v1/patient/referral/lookup`)

#### 3. DUSW Creates Patient Referral
```
DUSW Portal → Create Referral Form → Backend API → Email to Patient
```
- Social worker logs into dusw.transplantwizard.com
- Fills out patient info (name, email, nephrologist, clinic)
- Backend creates `patient_referral_invitations` record with unique token
- AWS SES sends email to patient with registration link
- Link contains `referralToken` for pre-fill
- **Files**: `dusw-website/server.js`, `simple-auth-server.js` (`/api/v1/dusw/referrals/create`)

#### 4. ROI Consent Signing
```
iOS App: ROIConsentView → Sign → Backend API → roi_consents table
```
- After registration, patient sees ROI consent screen
- Reviews consent text, types full name as digital signature
- Backend creates `roi_consents` record with signature, IP, user agent
- Patient status updated: `roiSigned = true`
- **Files**: `ROIConsentView.swift`, `simple-auth-server.js` (`/api/v1/patients/roi-consent`)

#### 5. Transplant Center Selection
```
iOS App: TransplantCentersView → Select 1-3 Centers → Backend API
```
- Patient views list of transplant centers (from `transplant_centers` table)
- Selects up to 3 centers
- Backend creates `patient_referrals` records for each selection
- Patient status updated: `transplantCentersSelected = true`, `onboardingCompleted = true`
- **Files**: `TransplantCentersView.swift`, `simple-auth-server.js` (`/api/v1/transplant-centers/select`)

#### 6. Patient Login
```
iOS App: LoginView → Backend API → JWT Token → Dashboard
```
- Patient enters email/password
- Backend verifies against `user_credentials` table (bcrypt)
- Returns JWT token + user status (roiSigned, centersSelected, etc.)
- App navigates to appropriate screen based on onboarding status
- **Files**: `LoginView.swift`, `simple-auth-server.js` (`/api/v1/auth/login`)

#### 7. Social Worker Lookup (for Registration)
```
iOS App: RegistrationView → Select Clinic → Fetch Social Workers
```
- Patient selects dialysis clinic from dropdown
- App fetches social workers for that clinic from `dusw_social_workers` table
- Patient selects their assigned social worker
- Creates linkage in `patient_dusw_assignments` table
- **Files**: `RegistrationView.swift`, `simple-auth-server.js` (`/api/social-workers`)

---

### Flows In Progress / Planned 🚧

#### 8. Transplant Center Portal
- TC staff login to tc.transplantwizard.com
- View incoming patient referrals
- Update referral status (acknowledged, completed)
- **Status**: Portal exists, authentication not fully implemented

#### 9. DUSW Dashboard
- View all referrals created
- Track which patients have registered
- See referral redemption status
- **Status**: Basic portal exists, dashboard views needed

#### 10. Patient Dashboard
- View selected transplant centers
- Track referral status at each center
- Update profile information
- **Status**: `PatientDashboardView.swift` exists, needs backend integration

#### 11. Push Notifications
- Notify patient when referral status changes
- Notify DUSW when patient completes registration
- **Status**: Not implemented, `notifications` table exists in schema

#### 12. Password Reset
- Forgot password flow via email
- **Status**: `ForgotPasswordView.swift` exists, backend endpoint not implemented

---

### Flow Status Summary

| Flow | iOS App | Backend | Web Portal | Status |
|------|---------|---------|------------|--------|
| Patient Registration | ✅ | ✅ | - | Complete |
| Referral Registration | ✅ | ✅ | - | Complete |
| DUSW Create Referral | - | ✅ | ✅ | Complete |
| ROI Consent | ✅ | ✅ | - | Complete |
| Center Selection | ✅ | ✅ | - | Complete |
| Patient Login | ✅ | ✅ | - | Complete |
| Social Worker Lookup | ✅ | ✅ | - | Complete |
| TC Portal | - | 🚧 | 🚧 | In Progress |
| DUSW Dashboard | - | 🚧 | 🚧 | In Progress |
| Patient Dashboard | 🚧 | 🚧 | - | In Progress |
| Notifications | ❌ | ❌ | - | Not Started |
| Password Reset | 🚧 | ❌ | - | Partial |

---

## Start Here - Documentation Index

| Document | What It Covers |
|----------|----------------|
| `docs/ARCHITECTURE.md` | Full system architecture, data flows, component details |
| `docs/DATABASE_SCHEMA.md` | **CRITICAL** - All tables, relationships, SQL schemas |
| `docs/SETUP.md` | Local development environment setup |
| `docs/DEPLOYMENT.md` | How to deploy to EC2, systemd services, nginx config |
| `docs/INFRA.md` | AWS resources, Terraform, network diagram |
| `docs/OPERATIONS.md` | Server management, logs, troubleshooting |
| `docs/SECURITY_SECRETS.md` | Environment variables, credentials (gitignored) |
| `docs/AGENT_SETUP.md` | How to decrypt and use secrets on a new machine |
| `terraform/EXISTING_RESOURCES.md` | All AWS resource IDs |
| `terraform/README.md` | Infrastructure as Code documentation |

**Read `docs/DATABASE_SCHEMA.md` before making ANY database changes.**

---

## Important Code Files

### iOS App (SwiftUI)
```
Shakir-ClaudeCode/
├── Shakir_ClaudeCodeApp.swift              # App entry point
├── Core/
│   ├── APIService.swift                    # ⭐ All API calls to backend
│   ├── AppState.swift                      # Global app state
│   └── AuthenticationManager.swift         # JWT token management
├── Views/
│   ├── Authentication/
│   │   ├── AuthenticationFlow.swift        # Main auth flow coordinator
│   │   ├── LoginView.swift                 # Login screen
│   │   ├── RegistrationView.swift          # Registration form
│   │   ├── ROIConsentView.swift            # ROI consent signing
│   │   ├── WereYouReferredView.swift       # Referral check screen
│   │   └── ReferralEmailLookupView.swift   # Email lookup for referral
│   ├── TransplantCenters/
│   │   └── TransplantCentersView.swift     # Center selection
│   └── Dashboard/
│       └── PatientDashboardView.swift      # Main dashboard
├── Models/
│   └── PatientModels.swift                 # Data models
└── Utilities/
    ├── KeychainManager.swift               # Secure storage
    ├── AuditLogger.swift                   # HIPAA audit logging
    └── BiometricManager.swift              # Face ID / Touch ID
```

### Backend API (Node.js/Express)
```
backend-api/
├── src/
│   └── simple-auth-server.js               # ⭐ MAIN SERVER - All endpoints
├── database/
│   └── production-schema-updates.sql       # Latest DB migrations
├── .env                                    # Environment config (on server)
└── package.json                            # Dependencies
```

### Web Portals
```
main-website/
├── server.js                               # Main site server (:3000)
└── views/                                  # EJS templates

dusw-website/
├── server.js                               # DUSW portal server (:3001)
└── views/                                  # EJS templates

tc-website/
├── server.js                               # TC portal server (:3002)
└── views/                                  # EJS templates
```

### Database Schemas
```
database/
├── schema.sql                              # ⭐ Original HIPAA-compliant schema
├── schema-fixed.sql                        # Fixed version with relaxed constraints
└── seed-data.sql                           # Sample data

backend-api/database/
└── production-schema-updates.sql           # ⭐ Production additions (referrals, etc.)
```

### Infrastructure
```
terraform/
├── main.tf                                 # Root module
├── variables.tf                            # Input variables
├── terraform.tfvars                        # Variable values (gitignored)
├── EXISTING_RESOURCES.md                   # ⭐ All AWS resource IDs
└── modules/
    ├── vpc/                                # VPC, subnets
    ├── ec2/                                # EC2 instance
    ├── rds/                                # PostgreSQL RDS
    ├── ses/                                # Email service
    ├── security-groups/                    # Firewall rules
    ├── iam/                                # Roles and policies
    └── cloudflare/                         # DNS records
```

---

## How to Run Locally

### Backend API
```bash
cd backend-api
npm install

# Create .env with database credentials (see docs/SECURITY_SECRETS.md)
# Or decrypt from .secrets/secrets.enc

node src/simple-auth-server.js
# Runs on http://localhost:3004
```

### Web Portals
```bash
# Main website
cd main-website && npm install && node server.js  # :3000

# DUSW Portal
cd dusw-website && npm install && node server.js  # :3001

# TC Portal
cd tc-website && npm install && node server.js    # :3002
```

### iOS App
```bash
open Shakir-ClaudeCode.xcodeproj
# Select simulator, press Cmd+R to run

# For local API testing, change in Core/APIService.swift:
# baseURL = "http://localhost:3004/api/v1"
```

### Test API Health
```bash
curl http://localhost:3004/health
```

---

## How to Deploy Backend to EC2

### Quick Deploy (Code Changes Only)
```bash
# 1. SSH to server
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174

# 2. Pull latest code
cd /home/ec2-user/transplant-wizard
git pull origin main

# 3. Install dependencies (if package.json changed)
cd backend-api && npm install

# 4. Restart service
sudo systemctl restart transplant-backend

# 5. Verify
curl http://localhost:3004/health
```

### Full Service Restart
```bash
sudo systemctl restart transplant-backend transplant-main-website transplant-dusw-website transplant-tc-website
```

### View Logs
```bash
sudo journalctl -u transplant-backend -f
```

### Service Files Location
```
/etc/systemd/system/transplant-backend.service
/etc/systemd/system/transplant-main-website.service
/etc/systemd/system/transplant-dusw-website.service
/etc/systemd/system/transplant-tc-website.service
```

### Nginx Config
```
/etc/nginx/conf.d/transplant-platform.conf
```

---
##TestFlight / App Review notes

External testers/public link only works after Apple approves the build.
Ensure these are set in App Store Connect:
Beta App Description (demo/simulation wording)
Review Notes (demo-consistent steps + test credentials)
Privacy Policy URL points to public page and is linked in-app

---
## Secrets / Credentials Policy

### Where Secrets Live

| Location | Contents | Committed to Git? |
|----------|----------|-------------------|
| `.secrets/secrets.enc` | Encrypted master secrets | NO (gitignored) |
| `docs/SECURITY_SECRETS.md` | Secrets reference doc | NO (gitignored) |
| `terraform/terraform.tfvars` | Terraform variables | NO (gitignored) |
| `~/.aws/credentials` | AWS CLI credentials | NO (system file) |
| Server `.env` files | Production secrets | NO (on server only) |

### How to Access Secrets

1. **Decrypt the secrets file**:
   ```bash
   openssl enc -aes-256-cbc -d -pbkdf2 -in .secrets/secrets.enc -out .secrets/secrets.txt -pass pass:TransplantWizard2024
   ```

2. **Read and use**:
   ```bash
   cat .secrets/secrets.txt
   ```

3. **Clean up**:
   ```bash
   rm .secrets/secrets.txt
   ```

### Key Credentials Quick Reference

| Credential | Value |
|------------|-------|
| **DB Host** | `transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com` |
| **DB Name** | `postgres` |
| **DB User** | `transplant_admin` |
| **DB Password** | `ball9BaseSecure2024` |
| **EC2 IP** | `3.215.185.174` |
| **SSH Key** | `~/.ssh/transplant-wizard-key.pem` |
| **AWS Account** | `126279420316` |
| **AWS Profile** | `transplant-admin` |

### Rules

1. **NEVER commit secrets to git** - All secret files are gitignored
2. **Use placeholders in code** - Reference env vars, not hardcoded values
3. **Encrypt before transfer** - Use the encrypted `.secrets/secrets.enc` file
4. **Delete plaintext after use** - Always `rm .secrets/secrets.txt`

---

## API Endpoints Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/v1/auth/register/patient` | POST | Register patient |
| `/api/v1/auth/login` | POST | Patient login |
| `/api/v1/patients/roi-consent` | GET/POST | ROI consent |
| `/api/v1/transplant-centers` | GET | List centers |
| `/api/v1/transplant-centers/select` | POST | Save selections |
| `/api/v1/dusw/referrals/create` | POST | Create referral |
| `/api/v1/patient/referral/lookup` | POST | Lookup by email |
| `/api/social-workers` | GET | List social workers |

---

## Common Tasks

### Connect to Database
```bash
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
PGPASSWORD='ball9BaseSecure2024' psql -h transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com -U transplant_admin -d postgres
```

### Check Service Status
```bash
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
sudo systemctl status transplant-backend
```

### View Server Logs
```bash
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
sudo journalctl -u transplant-backend -f
```

### Run iOS Tests
```bash
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15'
```

---

## Before Making Changes

1. **Database changes**: Read `docs/DATABASE_SCHEMA.md` first
2. **API changes**: Update both `simple-auth-server.js` AND `APIService.swift`
3. **Infrastructure**: Update `terraform/EXISTING_RESOURCES.md` with new resource IDs
4. **Secrets**: Never commit, always use encrypted file or env vars

---

## Questions?

If unclear about anything, read the `docs/` folder. The documentation is comprehensive and up-to-date as of 2025-12-21.
