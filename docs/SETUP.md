# Local Development Setup

## Prerequisites

### Required Software
- **Node.js**: v20.19.5 (or compatible v20.x)
- **npm**: v10.8.2 (or compatible)
- **Xcode**: Latest version for iOS development
- **PostgreSQL Client**: For database access (`psql`)
- **AWS CLI**: Configured with appropriate profile
- **Git**: For version control

### Accounts & Access
- AWS account access (for RDS, SES, IAM)
- Cloudflare account (for DNS)
- Apple Developer account (for iOS deployment)

## Repository Structure

```
Shakir-ClaudeCode/
├── Shakir-ClaudeCode/           # iOS Patient App (SwiftUI)
│   ├── Core/                    # Core services (API, Auth, State)
│   ├── Views/                   # SwiftUI views
│   ├── Models/                  # Data models
│   └── Utilities/               # Helpers (Keychain, Biometric, etc.)
├── backend-api/                 # Node.js Backend API
│   ├── src/
│   │   └── simple-auth-server.js  # Main server
│   └── database/
│       └── production-schema-updates.sql
├── main-website/                # Main website (Node.js/EJS)
├── dusw-website/                # DUSW Portal (Node.js/EJS)
├── tc-website/                  # TC Portal (Node.js/EJS)
├── database/                    # SQL schema files
├── terraform/                   # Infrastructure as Code
├── docs/                        # Documentation (this folder)
└── .env files                   # Environment configs (not committed)
```

## Backend API Setup

### 1. Install Dependencies

```bash
cd backend-api
npm install
```

### 2. Create Environment File

Create `backend-api/.env`:

```bash
# Database
DB_HOST=transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=transplant_admin
DB_PASSWORD=<SEE_SECURITY_SECRETS.md>
DB_SSL=true

# Authentication
JWT_SECRET=<SEE_SECURITY_SECRETS.md>
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
SESSION_SECRET=<SEE_SECURITY_SECRETS.md>

# AWS
AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@transplantwizard.com
SES_SANDBOX_MODE=true
SES_SANDBOX_RECIPIENTS=jrolls@umich.edu

# Server
PORT=3004
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002

# App Links
APP_DOWNLOAD_URL=https://apps.apple.com/app/transplant-wizard
```

### 3. Start the Server

**Development (with auto-reload)**:
```bash
cd backend-api
node src/simple-auth-server.js
```

**Or using the AWS profile**:
```bash
AWS_PROFILE=Jeremy node src/simple-auth-server.js
```

**Verify running**:
```bash
curl http://localhost:3004/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-21T...",
  "environment": "development",
  "database": "connected",
  "auth": "basic_auth_enabled"
}
```

## Website Portals Setup

Each portal follows the same pattern:

### Main Website (Port 3000)
```bash
cd main-website
npm install
# Create .env (see SECURITY_SECRETS.md for variables)
node server.js
```

### DUSW Portal (Port 3001)
```bash
cd dusw-website
npm install
# Create .env
node server.js
```

### TC Portal (Port 3002)
```bash
cd tc-website
npm install
# Create .env
node server.js
```

## iOS App Setup

### 1. Open in Xcode

```bash
open Shakir-ClaudeCode.xcodeproj
```

### 2. Configuration

The iOS app is configured to use `https://api.transplantwizard.com` as the API base URL.

For local development, modify `Shakir-ClaudeCode/Core/APIService.swift`:

```swift
// Change from:
private let baseURL = "https://api.transplantwizard.com/api/v1"

// To (for local testing):
private let baseURL = "http://localhost:3004/api/v1"
```

**Note**: For device testing, use your machine's local IP:
```swift
private let baseURL = "http://192.168.1.X:3004/api/v1"
```

### 3. Build and Run

1. Select target device/simulator
2. Build: `Cmd + B`
3. Run: `Cmd + R`

### Build Commands (CLI)

```bash
# Build for debug
xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -configuration Debug build

# Build for release
xcodebuild -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -configuration Release build

# Run tests
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Database Setup

### Connect to Production Database

```bash
PGPASSWORD='<password>' psql -h transplant-platform-db.cibqsuyys3wn.us-east-1.rds.amazonaws.com -p 5432 -U transplant_admin -d postgres
```

### Apply Schema Updates

If setting up a fresh database or applying migrations:

```bash
# Original schema
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/schema.sql

# Production updates
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f backend-api/database/production-schema-updates.sql

# Seed data (optional, for development)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f database/seed-data.sql
```

## Running All Services Locally

Use the helper script on the server, or run each in separate terminals:

**Terminal 1 - Backend API**:
```bash
cd backend-api && node src/simple-auth-server.js
```

**Terminal 2 - Main Website**:
```bash
cd main-website && node server.js
```

**Terminal 3 - DUSW Portal**:
```bash
cd dusw-website && node server.js
```

**Terminal 4 - TC Portal**:
```bash
cd tc-website && node server.js
```

## Testing

### API Testing

```bash
# Health check
curl http://localhost:3004/health

# Register a patient
curl -X POST http://localhost:3004/api/v1/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "Patient",
    "email": "test@example.com",
    "password": "TestPass123!",
    "dialysisClinic": "Test Clinic",
    "socialWorkerName": "Dr. Test Worker"
  }'

# Login
curl -X POST http://localhost:3004/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123!"}'
```

### iOS Testing

```bash
# Unit tests only
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:Shakir-ClaudeCodeTests

# UI tests only
xcodebuild test -project Shakir-ClaudeCode.xcodeproj -scheme Shakir-ClaudeCode \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:Shakir-ClaudeCodeUITests
```

## Common Issues

### 1. Database Connection Failed
- Verify RDS security group allows your IP
- Check `DB_SSL=true` is set
- Verify credentials in `.env`

### 2. SES Email Not Sending
- SES is in sandbox mode by default
- Only verified recipients can receive emails
- Add recipient to `SES_SANDBOX_RECIPIENTS`

### 3. iOS App Can't Connect to Local Server
- Use machine IP, not localhost
- Ensure backend is running on `0.0.0.0` not just `127.0.0.1`
- Check firewall allows port 3004

### 4. JWT Authentication Errors
- Verify `JWT_SECRET` matches between services
- Check token expiration (`JWT_EXPIRES_IN`)

## Environment Variables Reference

See `SECURITY_SECRETS.md` for complete list of environment variables required by each service.
