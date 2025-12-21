# Architecture Overview

## System Architecture

Transplant Wizard is a HIPAA-compliant healthcare platform for managing kidney transplant patient referrals. The system consists of three main components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  iOS Patient App          DUSW Portal           TC Portal       Main Website │
│  (SwiftUI)               (Node.js/EJS)        (Node.js/EJS)    (Node.js/EJS) │
│  Port: N/A               Port: 3001           Port: 3002       Port: 3000    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE (DNS/Proxy)                             │
│  transplantwizard.com  |  api.*  |  dusw.*  |  tc.*                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NGINX REVERSE PROXY                             │
│  EC2: 3.215.185.174                                                          │
│  Routes: /, /api, /dusw, /tc                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌───────────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│   Backend API         │ │  Web Portals    │ │  AWS Services    │
│   (Node.js/Express)   │ │  (Node.js/EJS)  │ │                  │
│   Port: 3004          │ │  3000/3001/3002 │ │  - SES (Email)   │
│                       │ │                 │ │  - RDS (Postgres)│
│   simple-auth-server  │ │  main-website   │ │  - IAM           │
│                       │ │  dusw-website   │ │                  │
│                       │ │  tc-website     │ │                  │
└───────────────────────┘ └─────────────────┘ └──────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AWS RDS PostgreSQL                                  │
│  Host: transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com      │
│  Database: transplant_platform                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Overview

### 1. iOS Patient App (`Shakir-ClaudeCode/`)

**Purpose**: Mobile application for patients to register, sign ROI consents, and select transplant centers.

**Entry Point**: `Shakir-ClaudeCode/Shakir_ClaudeCodeApp.swift`

**Key Files**:
- `Core/APIService.swift` - Backend API communication
- `Core/AppState.swift` - Global application state
- `Core/AuthenticationManager.swift` - JWT token management
- `Views/Authentication/` - Login, registration, ROI consent flows
- `Views/TransplantCenters/TransplantCentersView.swift` - Center selection
- `Utilities/KeychainManager.swift` - Secure credential storage
- `Utilities/AuditLogger.swift` - HIPAA audit logging

**API Base URL**: `https://api.transplantwizard.com/api/v1`

**Authentication Flow**:
1. Patient registers with email/password
2. Optionally uses referral token from DUSW
3. Signs ROI consent
4. Selects up to 3 transplant centers
5. JWT tokens stored in Keychain

### 2. Backend API (`backend-api/`)

**Purpose**: REST API server handling authentication, patient data, and referrals.

**Entry Point**: `backend-api/src/simple-auth-server.js`

**Port**: 3004 (behind nginx as `api.transplantwizard.com`)

**Key Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/auth/register/patient` | POST | Patient registration |
| `/api/v1/auth/login` | POST | Patient login |
| `/api/v1/patients/roi-consent` | GET/POST | ROI consent status/signing |
| `/api/v1/transplant-centers` | GET | List transplant centers |
| `/api/v1/transplant-centers/select` | POST | Save center selections |
| `/api/v1/transplant-centers/my-selections` | GET | Get patient's selections |
| `/api/v1/dusw/referrals/create` | POST | Create patient referral (DUSW) |
| `/api/v1/patient/referral/:token` | GET | Get referral pre-fill data |
| `/api/v1/patient/referral/lookup` | POST | Lookup referral by email |
| `/api/social-workers` | GET | List social workers by clinic |

**Dependencies**:
- `express` - Web framework
- `pg` - PostgreSQL client
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT authentication
- `@aws-sdk/client-sesv2` - Email sending
- `helmet` - Security headers
- `cors` - CORS handling
- `express-rate-limit` - Rate limiting

### 3. Web Portals

#### Main Website (`main-website/`)
**Port**: 3000
**URL**: `https://transplantwizard.com`
**Purpose**: Public landing page and information

#### DUSW Portal (`dusw-website/`)
**Port**: 3001
**URL**: `https://dusw.transplantwizard.com`
**Purpose**: Dialysis Unit Social Worker portal for creating patient referrals

#### TC Portal (`tc-website/`)
**Port**: 3002
**URL**: `https://tc.transplantwizard.com`
**Purpose**: Transplant Center portal for receiving referrals

### 4. Database (PostgreSQL on RDS)

**Host**: `transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com`
**Port**: 5432
**Database**: `transplant_platform`
**User**: `transplant_admin`

See `DATABASE_SCHEMA.md` for complete schema documentation.

## Data Flow

### Patient Registration Flow
```
1. Patient opens iOS app
2. (Optional) Enters email to check for DUSW referral
3. If referral found, form pre-fills with patient data
4. Patient completes registration form
5. POST /api/v1/auth/register/patient
6. User and Patient records created in DB
7. JWT tokens returned for auto-login
8. Patient signs ROI consent
9. POST /api/v1/patients/roi-consent
10. Patient selects transplant centers
11. POST /api/v1/transplant-centers/select
12. Referrals created, notifications sent
```

### DUSW Referral Flow
```
1. Social worker logs into DUSW portal
2. Enters patient information
3. POST /api/v1/dusw/referrals/create
4. Referral record created with unique token
5. Email sent to patient via AWS SES
6. Patient clicks link in email
7. App opens with pre-filled registration
```

## Security Architecture

### Authentication
- **Patients**: JWT tokens with 24-hour expiration
- **Portals**: Session-based authentication (to be implemented)
- **Password Storage**: bcrypt with 12 rounds

### HIPAA Compliance
- Row Level Security (RLS) on sensitive tables
- Comprehensive audit logging
- PHI field tracking in audit logs
- SSL/TLS for all connections
- Data encryption at rest (RDS)

### Rate Limiting
- Auth endpoints: 10 requests per 15 minutes per IP

## Environment Configuration

See `SECURITY_SECRETS.md` for environment variables required by each service.

## Terraform Infrastructure

Infrastructure is managed via Terraform. See `terraform/README.md` for:
- VPC and networking configuration
- EC2 instance setup
- RDS PostgreSQL configuration
- Security groups
- IAM roles
- Cloudflare DNS records
- SES email configuration
