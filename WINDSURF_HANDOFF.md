# Windsurf Agent Handoff Document

## Quick Start

Welcome to the Transplant Wizard codebase. This document provides everything you need to understand, run, and modify this healthcare platform.

**Read the `docs/` folder for complete documentation:**

| Document | Purpose |
|----------|---------|
| `docs/ARCHITECTURE.md` | System architecture, component overview, data flow |
| `docs/DATABASE_SCHEMA.md` | Complete database schema with all tables and relationships |
| `docs/SETUP.md` | Local development setup instructions |
| `docs/DEPLOYMENT.md` | Deployment procedures and server configuration |
| `docs/INFRA.md` | AWS and Cloudflare infrastructure details |
| `docs/OPERATIONS.md` | Day-to-day operations, monitoring, troubleshooting |
| `docs/SECURITY_SECRETS.md` | Environment variables and secrets management |
| `terraform/README.md` | Infrastructure as Code documentation |

## Project Overview

**Transplant Wizard** is a HIPAA-compliant healthcare platform connecting kidney dialysis patients with transplant centers. It consists of:

1. **iOS Patient App** (SwiftUI) - Mobile app for patients
2. **Backend API** (Node.js/Express) - REST API server
3. **Web Portals** (Node.js/EJS) - DUSW and TC portals
4. **PostgreSQL Database** (AWS RDS) - HIPAA-compliant data storage
5. **AWS Infrastructure** (Terraform) - EC2, RDS, SES, VPC

## Critical Information

### Entry Points

| Component | Entry File |
|-----------|-----------|
| iOS App | `Shakir-ClaudeCode/Shakir_ClaudeCodeApp.swift` |
| Backend API | `backend-api/src/simple-auth-server.js` |
| Main Website | `main-website/server.js` |
| DUSW Portal | `dusw-website/server.js` |
| TC Portal | `tc-website/server.js` |

### Key Configuration

| Item | Value |
|------|-------|
| API Base URL | `https://api.transplantwizard.com/api/v1` |
| EC2 IP | `3.215.185.174` |
| RDS Endpoint | `transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com` |
| Database | `postgres` |
| SSH Key | `~/.ssh/transplant-wizard-key.pem` |

### Service Ports

| Service | Port | Domain |
|---------|------|--------|
| Main Website | 3000 | transplantwizard.com |
| DUSW Portal | 3001 | dusw.transplantwizard.com |
| TC Portal | 3002 | tc.transplantwizard.com |
| Backend API | 3004 | api.transplantwizard.com |

## Database Schema (Critical)

**Read `docs/DATABASE_SCHEMA.md` before making any database changes.**

### Core Tables
- `users` - All user accounts (patients, social workers, admins)
- `patients` - Patient-specific data (PHI)
- `user_credentials` - Password hashes for basic auth
- `roi_consents` - Release of Information consent records
- `transplant_centers` - Available transplant centers
- `patient_referrals` - Patient selections of centers
- `patient_referral_invitations` - DUSW-created referrals
- `dusw_social_workers` - Social worker records
- `audit_logs` - HIPAA audit trail

### Schema Files
- `database/schema.sql` - Original HIPAA-compliant schema
- `database/schema-fixed.sql` - Fixed version
- `backend-api/database/production-schema-updates.sql` - Production additions

## Common Tasks

### Start Backend Locally
```bash
cd backend-api
npm install
# Create .env (see docs/SECURITY_SECRETS.md)
node src/simple-auth-server.js
```

### SSH to Server
```bash
ssh -i ~/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174
```

### Restart Services on Server
```bash
sudo systemctl restart transplant-backend
sudo systemctl restart transplant-main-website
sudo systemctl restart transplant-dusw-website
sudo systemctl restart transplant-tc-website
```

### View Logs
```bash
sudo journalctl -u transplant-backend -f
```

### Database Connection
```bash
PGPASSWORD='<password>' psql -h transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com -U transplant_admin -d postgres
```

## API Endpoints Reference

### Authentication
- `POST /api/v1/auth/register/patient` - Register new patient
- `POST /api/v1/auth/login` - Patient login
- `GET /api/v1/patients/roi-consent` - Get ROI status
- `POST /api/v1/patients/roi-consent` - Sign ROI consent

### Transplant Centers
- `GET /api/v1/transplant-centers` - List all centers
- `POST /api/v1/transplant-centers/select` - Save selections
- `GET /api/v1/transplant-centers/my-selections` - Get patient's selections

### DUSW Referrals
- `POST /api/v1/dusw/referrals/create` - Create patient referral
- `GET /api/v1/patient/referral/:token` - Get referral data
- `POST /api/v1/patient/referral/lookup` - Lookup by email
- `GET /api/social-workers` - List social workers by clinic

## Known Issues & TODOs

### Verified Status (2025-12-21)
- **Database**: 19 tables, all migrations applied
- **RLS**: NOT enabled (should be enabled for HIPAA)
- **Backups**: 7-day retention, daily at 07:01 UTC
- **CI/CD**: None configured
- **Terraform**: Local state, empty (not managing resources)

### Security Recommendations
- [ ] Enable RLS on sensitive tables
- [ ] Enable RDS storage encryption
- [ ] Enable RDS deletion protection
- [ ] Set up CI/CD pipeline
- RDS is currently publicly accessible (development mode)
- SSH is open to 0.0.0.0/0
- Consider migrating secrets to AWS Secrets Manager

## File Structure Quick Reference

```
Shakir-ClaudeCode/
├── Shakir-ClaudeCode/           # iOS App (SwiftUI)
│   ├── Core/
│   │   ├── APIService.swift     # API client
│   │   ├── AppState.swift       # Global state
│   │   └── AuthenticationManager.swift
│   ├── Views/
│   │   ├── Authentication/      # Login, Register, ROI flows
│   │   └── TransplantCenters/   # Center selection
│   └── Utilities/               # Keychain, Biometric, etc.
├── backend-api/
│   ├── src/
│   │   └── simple-auth-server.js  # Main server (1500 lines)
│   └── database/
│       └── production-schema-updates.sql
├── main-website/                # Port 3000
├── dusw-website/                # Port 3001
├── tc-website/                  # Port 3002
├── database/
│   ├── schema.sql              # Original schema
│   └── schema-fixed.sql        # Fixed schema
├── terraform/                   # Infrastructure as Code
│   ├── main.tf
│   └── modules/                # vpc, ec2, rds, ses, cloudflare, etc.
├── docs/                        # Documentation (READ THIS)
└── WINDSURF_HANDOFF.md         # This file
```

## Environment Variables Summary

**Full list in `docs/SECURITY_SECRETS.md`**

| Variable | Service | Purpose |
|----------|---------|---------|
| `DB_HOST` | All | RDS endpoint |
| `DB_PASSWORD` | All | Database password |
| `JWT_SECRET` | Backend | Token signing |
| `SESSION_SECRET` | Portals | Session encryption |
| `SES_FROM_EMAIL` | Backend | Email sender |
| `SES_SANDBOX_MODE` | Backend | Email mode |

## Contacts & Resources

- **AWS Account**: `126279420316`
- **Domain**: `transplantwizard.com` (Cloudflare)
- **Terraform State**: Local (consider S3 backend for production)

## Final Notes

1. **HIPAA Compliance**: This handles PHI. Audit logging is critical.
2. **Database Changes**: Always backup before schema changes.
3. **Secrets**: Never commit actual values. Use `.env` files.
4. **Testing**: Test on development before deploying to production.

Good luck! Read the docs folder for complete information.
