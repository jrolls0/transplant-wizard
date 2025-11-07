# Transplant Platform Backend API

A HIPAA-compliant Node.js/Express API for the transplant referral platform, supporting both iOS mobile app (patients) and web dashboard (social workers).

## 🏥 Overview

This backend API provides secure, HIPAA-compliant endpoints for:
- **Patient Registration & Onboarding** (Mobile App)
- **Social Worker Dashboard** (Web App)
- **Transplant Center Selection** (Mobile App)
- **Real-time Notifications** (Web App)
- **ROI Consent Management** (Both platforms)
- **Comprehensive Audit Logging** (HIPAA compliance)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (AWS RDS)
- AWS Cognito User Pools
- AWS S3 bucket

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Build the project
npm run build

# Run database migrations (if needed)
npm run db:setup

# Start development server
npm run dev
```

### Environment Configuration

Copy the `.env` file and configure these key variables:

```env
# Database
DB_HOST=your-rds-endpoint
DB_PASSWORD=your-db-password

# AWS Cognito
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_WEB_CLIENT_ID=your-web-client-id
COGNITO_MOBILE_CLIENT_ID=your-mobile-client-id

# S3
S3_BUCKET=your-patient-documents-bucket
```

## 📱 API Architecture

### Client Applications
- **iOS Mobile App**: Patients use native Swift app for registration, ROI consent, and transplant center selection
- **Web Dashboard**: Social workers use React web app for patient management and notifications

### Core Endpoints

#### Authentication
- `POST /api/v1/auth/register/patient` - Patient registration (Mobile)
- `POST /api/v1/auth/register/social-worker` - Social worker registration (Web)
- `POST /api/v1/auth/verify` - Email verification
- `GET /api/v1/auth/me` - Get user profile

#### Patients (Mobile App)
- `GET /api/v1/patients/dashboard` - Patient dashboard data
- `PUT /api/v1/patients/profile` - Update patient profile
- `POST /api/v1/patients/roi-consent` - Sign ROI consent
- `GET /api/v1/patients/roi-consent` - Get ROI status

#### Transplant Centers (Mobile App)
- `GET /api/v1/transplant-centers` - List all centers
- `GET /api/v1/transplant-centers/chatbot-data` - Amelia chatbot format
- `POST /api/v1/transplant-centers/select` - Submit selections (up to 3)
- `GET /api/v1/transplant-centers/my-selections` - Get patient's selections

#### Social Workers (Web Dashboard)
- `GET /api/v1/social-workers/dashboard` - Dashboard overview
- `GET /api/v1/social-workers/patients` - Patient list with filters
- `GET /api/v1/social-workers/patients/:id` - Detailed patient info
- `GET /api/v1/social-workers/statistics` - Analytics and reports

#### Notifications (Web Dashboard)
- `GET /api/v1/notifications` - Get notifications with filters
- `PUT /api/v1/notifications/:id/read` - Mark as read
- `PUT /api/v1/notifications/mark-all-read` - Mark all as read
- `GET /api/v1/notifications/unread-count` - Real-time unread count

## 🔐 Security & HIPAA Compliance

### Data Protection
- **Encryption at Rest**: Database and S3 storage encrypted with AWS KMS
- **Encryption in Transit**: TLS 1.3 for all API communications
- **Field-Level Encryption**: PHI fields encrypted in database
- **Access Controls**: Role-based permissions (Patient/Social Worker/Admin)

### Authentication & Authorization
- **AWS Cognito Integration**: Secure user management
- **JWT Token Verification**: Stateless authentication
- **Session Management**: Automatic timeout and tracking
- **Rate Limiting**: Protection against abuse

### Audit Logging
- **Complete Audit Trail**: All API requests logged with PHI access tracking
- **User Activity Tracking**: Login/logout, data access, modifications
- **Compliance Reporting**: 7-year retention for audit logs
- **Real-time Monitoring**: Security event detection

### Security Headers
- **OWASP Compliance**: Helmet.js security headers
- **CORS Protection**: Restricted cross-origin access
- **Input Sanitization**: XSS and injection prevention
- **File Upload Security**: Type validation and size limits

## 🔄 Real-time Features

### WebSocket Notifications
The API includes real-time WebSocket support for social worker notifications:

```javascript
// Connect to WebSocket
const socket = io('http://localhost:3001');

// Join social worker notification room
socket.emit('join-social-worker-room', socialWorkerId);

// Listen for new notifications
socket.on('new-notification', (notification) => {
  // Update UI with new notification
});

// Listen for unread count updates
socket.on('unread-count-update', (data) => {
  // Update notification badge
});
```

## 📊 Database Schema

### Core Tables
- **users**: Unified authentication for patients and social workers
- **patients**: Patient-specific information with PHI protection
- **social_workers**: Social worker profiles and clinic assignments
- **dialysis_clinics**: 3 dialysis facilities
- **transplant_centers**: 10 transplant centers with exact requirement data
- **roi_consents**: Digital signature tracking for HIPAA compliance
- **patient_referrals**: Transplant center selections (up to 3 per patient)
- **notifications**: Real-time alerts for social workers
- **audit_logs**: Comprehensive HIPAA audit trail

### Sample Data
The API includes seed data with:
- 3 dialysis clinics (Metro Health, Lakeside Renal, Grand River)
- 6 social workers (2 per clinic)
- 10 transplant centers with exact addresses and wait times from requirements
- System configuration (ROI text, chatbot settings)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testNamePattern="auth"
```

## 📝 API Documentation

### Patient Workflow (Mobile App)
1. **Registration**: Patient registers with clinic and social worker selection
2. **Profile Completion**: Add medical information and demographics
3. **ROI Consent**: Digital signature for medical record release
4. **Transplant Selection**: Amelia chatbot guides selection of up to 3 centers
5. **Completion**: Social worker receives real-time notification

### Social Worker Workflow (Web Dashboard)
1. **Dashboard**: Overview of assigned patients and pending tasks
2. **Patient Management**: Detailed patient list with filtering
3. **Notifications**: Real-time alerts for patient activity
4. **Patient Details**: Complete patient information and referral status
5. **Analytics**: Statistics and reporting for caseload management

## 🚛 Deployment

### Development
```bash
npm run dev
```
Server runs on `http://localhost:3001`

### Production
```bash
# Build production bundle
npm run build

# Start production server
npm start
```

### Docker (Optional)
```bash
# Build Docker image
docker build -t transplant-platform-api .

# Run container
docker run -p 3001:3001 --env-file .env transplant-platform-api
```

### Environment Variables
See `.env` file for all configuration options including:
- Database connection
- AWS Cognito settings
- S3 bucket configuration
- Security settings
- Logging configuration

## 📈 Monitoring & Logging

### Logging Levels
- **Error**: Application errors and exceptions
- **Warn**: Security events and suspicious activity
- **Info**: User actions and system events
- **Debug**: Detailed debugging information

### Log Destinations
- **Console**: Development logging
- **Files**: Local file system (`logs/` directory)
- **CloudWatch**: Production logging (AWS)
- **Audit Logs**: Separate HIPAA compliance logging

## 🤝 Contributing

### Code Standards
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Jest for testing

### Security Guidelines
- Never log sensitive data (passwords, PHI)
- Always validate input data
- Use parameterized queries
- Follow OWASP security practices

## 📄 License

Proprietary - OrganOptima LLC

---

**🏥 HIPAA Notice**: This application handles Protected Health Information (PHI). Ensure all deployments meet HIPAA compliance requirements including encryption, access controls, audit logging, and data retention policies.