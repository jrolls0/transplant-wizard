// Production server with Basic Authentication and AWS RDS database
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Import services
const BasicAuthService = require('./services/basicAuthService');
const PatientService = require('./services/patientService');
const AuditLogger = require('./middleware/auditLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting for authentication endpoints
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Database connection with connection pooling
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20, // maximum number of connections in the pool
    idleTimeoutMillis: 30000, // close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // timeout for new connections
});

// Initialize services
const basicAuthService = new BasicAuthService(pool);
const auditLogger = new AuditLogger(pool);
const patientService = new PatientService(pool, auditLogger);

// Initialize database tables
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        console.log('🗄️  Initializing database tables...');
        
        // Create patients table
        await client.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone_number VARCHAR(20),
                date_of_birth DATE,
                address TEXT,
                primary_care_physician VARCHAR(255),
                insurance_provider VARCHAR(255),
                dialysis_clinic VARCHAR(255),
                social_worker_name VARCHAR(255),
                profile_completed BOOLEAN DEFAULT FALSE,
                onboarding_completed BOOLEAN DEFAULT FALSE,
                roi_signed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Create user_credentials table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_credentials (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Create audit_logs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID,
                event_type VARCHAR(100) NOT NULL,
                event_description TEXT,
                event_data JSONB,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
            CREATE INDEX IF NOT EXISTS idx_user_credentials_email ON user_credentials(email);
            CREATE INDEX IF NOT EXISTS idx_user_credentials_patient_id ON user_credentials(patient_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
        `);
        
        console.log('✅ Database tables initialized successfully');
        
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check database connection with timeout
        const dbPromise = pool.query('SELECT NOW() as current_time');
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        );
        
        const dbResult = await Promise.race([dbPromise, timeoutPromise]);
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            database: 'connected',
            dbTime: dbResult.rows[0].current_time,
            auth: 'basic_auth_enabled'
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            database: 'disconnected',
            error: error.message
        });
    }
});

// Apply rate limiting to auth endpoints
app.use('/api/v1/auth', authLimiter);

// Patient registration endpoint with Basic Authentication
app.post('/api/v1/auth/register/patient', async (req, res) => {
    try {
        console.log('🔐 Patient registration request received');
        
        const { 
            title, firstName, lastName, email, phoneNumber, 
            dateOfBirth, address, primaryCarePhysician, 
            insuranceProvider, dialysisClinic, socialWorkerName, password 
        } = req.body;
        
        // Validate required fields
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'firstName, lastName, email, and password are required'
            });
        }
        
        if (!dialysisClinic || !socialWorkerName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'dialysisClinic and socialWorkerName are required'
            });
        }
        
        console.log(`📝 Registering patient: ${email}`);
        
        // Parse date of birth if provided
        let dobDate = null;
        if (dateOfBirth) {
            dobDate = new Date(dateOfBirth);
        }
        
        const patientData = {
            title,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phoneNumber,
            dateOfBirth: dobDate,
            address,
            primaryCarePhysician,
            insuranceProvider,
            dialysisClinic: dialysisClinic.trim(),
            socialWorkerName: socialWorkerName.trim()
        };
        
        // Register with Basic Auth
        const result = await basicAuthService.registerPatient(
            email.trim().toLowerCase(), 
            password, 
            patientData
        );
        
        // Log successful registration
        await auditLogger.logAuthEvent(
            result.patientId,
            'patient_registration',
            'Patient registration completed successfully',
            {
                email: email.toLowerCase(),
                registration_method: 'basic_auth'
            },
            req.ip,
            req.get('User-Agent')
        );
        
        console.log(`✅ Patient registration successful: ${result.patientId}`);
        
        res.status(201).json({
            success: true,
            message: result.message,
            patientId: result.patientId
        });
        
    } catch (error) {
        console.error('❌ Patient registration error:', error);
        
        // Log failed registration attempt
        await auditLogger.logAuthEvent(
            null,
            'patient_registration_failed',
            `Patient registration failed: ${error.message}`,
            {
                email: req.body.email,
                error: error.message
            },
            req.ip,
            req.get('User-Agent')
        );
        
        res.status(400).json({
            success: false,
            error: 'Registration failed',
            details: error.message
        });
    }
});

// Patient login endpoint with Basic Authentication
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password, userType } = req.body;
        
        console.log(`🔐 Login attempt for ${email} as ${userType}`);
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'Email and password are required'
            });
        }
        
        // Authenticate with Basic Auth
        const authResult = await basicAuthService.authenticatePatient(
            email.trim().toLowerCase(), 
            password
        );
        
        // Log successful authentication
        await auditLogger.logAuthEvent(
            authResult.user.id,
            'patient_login',
            'Patient login successful',
            {
                email: email.toLowerCase(),
                auth_method: 'basic_auth'
            },
            req.ip,
            req.get('User-Agent')
        );
        
        console.log(`✅ Login successful for ${email} (User ID: ${authResult.user.id})`);
        
        // Return authentication data (matching iOS expected format)
        res.json({
            success: true,
            data: {
                accessToken: authResult.accessToken,
                refreshToken: authResult.refreshToken,
                idToken: authResult.accessToken, // Using access token as id token
                expiresIn: authResult.expiresIn,
                user: authResult.user
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        
        // Log failed authentication attempt
        await auditLogger.logAuthEvent(
            null,
            'patient_login_failed',
            `Patient login failed: ${error.message}`,
            {
                email: req.body.email,
                error: error.message
            },
            req.ip,
            req.get('User-Agent')
        );
        
        res.status(401).json({
            success: false,
            error: 'Authentication failed',
            details: error.message
        });
    }
});

// Get current user endpoint
app.get('/api/v1/auth/me', basicAuthService.verifyTokenMiddleware(), async (req, res) => {
    try {
        const userInfo = await basicAuthService.getUserInfo(req.headers.authorization.substring(7));
        
        res.json({
            success: true,
            user: userInfo
        });
        
    } catch (error) {
        console.error('❌ Get user info error:', error);
        res.status(401).json({
            success: false,
            error: 'Failed to get user information',
            details: error.message
        });
    }
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database tables
        await initializeDatabase();
        
        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🏥 Transplant Platform Server (Basic Auth) running on http://localhost:${PORT}`);
            console.log(`📱 Mobile Access: http://192.168.1.69:${PORT}`);
            console.log(`🔐 Authentication: Basic Auth with JWT`);
            console.log(`🗄️  Database: AWS RDS PostgreSQL`);
            console.log(`🛡️  Security: Enhanced protection enabled`);
            console.log(`📊 Health Check: http://localhost:${PORT}/health`);
        });
        
    } catch (error) {
        console.error('❌ Server startup error:', error);
        process.exit(1);
    }
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    await pool.end();
    process.exit(0);
});

// Start the server
startServer();

module.exports = app;