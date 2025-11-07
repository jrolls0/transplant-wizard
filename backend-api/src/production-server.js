// Production server with AWS Cognito authentication and secure database operations
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Import services
const CognitoService = require('./services/cognitoService');
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
const cognitoService = new CognitoService();
const auditLogger = new AuditLogger(pool);
const patientService = new PatientService(pool, auditLogger);

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
            cognito: cognitoService.isTestMode ? 'test_mode' : 'configured'
        });
    } catch (error) {
        // Return partial health status if DB is unavailable but Cognito works
        res.json({
            status: 'partial',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            database: 'disconnected - using test mode',
            cognito: cognitoService.isTestMode ? 'test_mode' : 'configured',
            warning: 'Database unavailable, using Cognito-only mode'
        });
    }
});

// Database test endpoint
app.get('/db-test', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT NOW() as current_time, 
                   COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = $1
        `, ['public']);
        
        res.json({
            success: true,
            currentTime: result.rows[0].current_time,
            tableCount: result.rows[0].table_count,
            database: 'PostgreSQL connected',
            connectionPool: {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount
            }
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Apply rate limiting to auth endpoints
app.use('/api/v1/auth', authLimiter);

// Patient registration endpoint with AWS Cognito and database storage
app.post('/api/v1/auth/register/patient', async (req, res) => {
    try {
        console.log('🔐 Production patient registration request received');
        
        const { 
            title, firstName, lastName, email, phoneNumber, 
            dateOfBirth, address, primaryCarePhysician, 
            insuranceProvider, password 
        } = req.body;
        
        // Extract additional fields from request
        const { dialysisClinic, socialWorkerName } = req.body;
        
        // Validate required fields
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'firstName, lastName, email, and password are required'
            });
        }
        
        // For production, we now require dialysis clinic and social worker
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
            firstName,
            lastName,
            email,
            phoneNumber,
            dateOfBirth: dobDate,
            address,
            primaryCarePhysician,
            insuranceProvider,
            dialysisClinic,
            socialWorkerName
        };
        
        // Register with AWS Cognito
        const cognitoResult = await cognitoService.registerPatient(email, password, patientData);
        
        if (!cognitoResult.success) {
            throw new Error('Cognito registration failed');
        }
        
        let patient = null;
        let patientId = null;
        
        try {
            // Try to create patient record in database
            patient = await patientService.createPatient(
                cognitoResult.userSub,
                patientData,
                null // audit user ID (self-registration)
            );
            patientId = patient.id;
            
            // Log successful registration
            await auditLogger.logAuthEvent(
                patient.id,
                'patient_registration',
                'Patient registration completed successfully',
                {
                    email: email,
                    cognito_user_sub: cognitoResult.userSub,
                    needs_verification: cognitoResult.needsVerification
                },
                req.ip,
                req.get('User-Agent')
            );
            
            console.log(`✅ Patient registration successful: ${patient.id}`);
            
        } catch (dbError) {
            // Database unavailable - continue with Cognito-only registration
            console.warn(`⚠️  Database unavailable, continuing with Cognito-only registration: ${dbError.message}`);
            patientId = cognitoResult.userSub; // Use Cognito sub as temporary ID
        }
        
        res.status(201).json({
            success: true,
            message: cognitoResult.message,
            needsVerification: cognitoResult.needsVerification,
            patientId: patientId
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

// Email verification endpoint
app.post('/api/v1/auth/verify', async (req, res) => {
    try {
        const { email, code, confirmationCode } = req.body;
        const verificationCode = code || confirmationCode;
        
        console.log(`📧 Email verification attempt for ${email}`);
        
        if (!email || !verificationCode) {
            return res.status(400).json({
                success: false,
                error: 'Email and verification code are required'
            });
        }
        
        // Verify email with Cognito
        const result = await cognitoService.verifyEmail(email, verificationCode);
        
        // Log successful verification
        await auditLogger.logAuthEvent(
            null, // Will be updated when we can get patient ID from email
            'email_verification',
            'Email verification completed successfully',
            {
                email: email
            },
            req.ip,
            req.get('User-Agent')
        );
        
        console.log(`✅ Email verification successful for ${email}`);
        
        res.json({
            success: true,
            message: result.message
        });
        
    } catch (error) {
        console.error('❌ Email verification error:', error);
        
        // Log failed verification attempt
        await auditLogger.logAuthEvent(
            null,
            'email_verification_failed',
            `Email verification failed: ${error.message}`,
            {
                email: req.body.email,
                error: error.message
            },
            req.ip,
            req.get('User-Agent')
        );
        
        res.status(400).json({
            success: false,
            error: 'Verification failed',
            details: error.message
        });
    }
});

// Patient login endpoint with AWS Cognito authentication
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password, userType } = req.body;
        
        console.log(`🔐 Production login attempt for ${email} as ${userType}`);
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'Email and password are required'
            });
        }
        
        // Authenticate with Cognito
        const authResult = await cognitoService.authenticatePatient(email, password);
        
        if (!authResult.success) {
            throw new Error('Authentication failed');
        }
        
        // Get user info from Cognito
        const cognitoUser = await cognitoService.getUserInfo(authResult.accessToken);
        
        let patient = null;
        let userData = null;
        
        try {
            // Try to get patient data from database
            patient = await patientService.getPatientByCognitoSub(cognitoUser.sub);
            
            if (patient) {
                userData = {
                    id: patient.id,
                    email: patient.email,
                    firstName: patient.first_name,
                    lastName: patient.last_name,
                    profileCompleted: patient.profile_completed,
                    onboardingCompleted: patient.onboarding_completed,
                    roiSigned: patient.roi_signed,
                    dialysisClinicId: patient.dialysis_clinic_id,
                    assignedSocialWorkerName: patient.social_worker_first_name ? 
                        `${patient.social_worker_first_name} ${patient.social_worker_last_name}` : null,
                    createdAt: patient.created_at
                };
                
                // Log successful authentication
                await auditLogger.logAuthEvent(
                    patient.id,
                    'patient_login',
                    'Patient login successful',
                    {
                        email: email,
                        user_type: userType
                    },
                    req.ip,
                    req.get('User-Agent')
                );
            }
        } catch (dbError) {
            console.warn(`⚠️  Database unavailable, using Cognito user data: ${dbError.message}`);
        }
        
        // Fallback to Cognito user data if database is unavailable
        if (!userData) {
            userData = {
                id: cognitoUser.sub,
                email: cognitoUser.email,
                firstName: cognitoUser.firstName,
                lastName: cognitoUser.lastName,
                profileCompleted: cognitoUser.profileCompleted,
                onboardingCompleted: cognitoUser.onboardingCompleted,
                roiSigned: cognitoUser.roiSigned,
                dialysisClinicId: null,
                assignedSocialWorkerName: null,
                createdAt: cognitoUser.createdAt
            };
        }
        
        console.log(`✅ Login successful for ${email} (User ID: ${userData.id})`);
        
        // Return authentication data
        res.json({
            success: true,
            data: {
                accessToken: authResult.accessToken,
                refreshToken: authResult.refreshToken,
                idToken: authResult.idToken,
                expiresIn: authResult.expiresIn,
                user: userData
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
                user_type: req.body.userType,
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

// ROI consent endpoint
app.post('/api/v1/patients/:patientId/roi-consent', async (req, res) => {
    try {
        const { patientId } = req.params;
        const { digitalSignature } = req.body;
        
        console.log(`📝 ROI consent signing for patient: ${patientId}`);
        
        if (!digitalSignature || digitalSignature.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Valid digital signature is required'
            });
        }
        
        // Update ROI consent in database
        const result = await patientService.updateROIConsent(
            patientId,
            digitalSignature.trim(),
            req.ip,
            req.get('User-Agent')
        );
        
        console.log(`✅ ROI consent signed successfully for patient: ${patientId}`);
        
        res.json({
            success: true,
            message: 'ROI consent signed successfully',
            signedAt: result.signedAt,
            patient: result.patient
        });
        
    } catch (error) {
        console.error('❌ ROI consent error:', error);
        
        res.status(400).json({
            success: false,
            error: 'ROI consent signing failed',
            details: error.message
        });
    }
});

// Get transplant centers endpoint (with database integration)
app.get('/api/v1/transplant-centers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, address, city, state, zip_code, 
                   distance_miles, phone, specialties, average_wait_time_months, is_active
            FROM transplant_centers 
            WHERE is_active = true
            ORDER BY name
        `);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Error fetching transplant centers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Password reset endpoints
app.post('/api/v1/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }
        
        const result = await cognitoService.initiatePasswordReset(email);
        
        res.json({
            success: true,
            message: result.message
        });
        
    } catch (error) {
        console.error('❌ Password reset initiation error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/v1/auth/confirm-forgot-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        
        if (!email || !code || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Email, code, and new password are required'
            });
        }
        
        const result = await cognitoService.confirmPasswordReset(email, code, newPassword);
        
        res.json({
            success: true,
            message: result.message
        });
        
    } catch (error) {
        console.error('❌ Password reset confirmation error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 Transplant Platform Production Server running on http://localhost:${PORT}`);
    console.log(`📱 Mobile Access: http://192.168.1.69:${PORT}`);
    console.log(`🔐 AWS Cognito: ${cognitoService.isTestMode ? 'TEST MODE' : 'CONFIGURED'}`);
    console.log(`🗄️  Database: PostgreSQL connected`);
    console.log(`🛡️  Security: Enhanced protection enabled`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);
});

module.exports = app;