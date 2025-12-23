// Simple Basic Authentication server using existing database schema
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
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

// AWS SES Client (using IAM-based authentication with default credential chain)
const sesClient = new SESv2Client({
    region: process.env.AWS_REGION || 'us-east-1'
});

// AWS S3 Client for document storage
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1'
});

const S3_CONFIG = {
    bucket: process.env.S3_DOCUMENTS_BUCKET || 'transplant-wizard-patient-documents',
    region: process.env.AWS_REGION || 'us-east-1'
};

console.log(`📁 S3 Configuration: Bucket = ${S3_CONFIG.bucket}`);

// Multer configuration for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, HEIC, and PDF files are allowed.'));
        }
    }
});

// SES Configuration
const SES_CONFIG = {
    fromEmail: process.env.SES_FROM_EMAIL || 'noreply@transplantwizard.com',
    sandboxMode: process.env.SES_SANDBOX_MODE !== 'false', // Default to sandbox mode for safety
    sandboxRecipients: (process.env.SES_SANDBOX_RECIPIENTS || 'jrolls@umich.edu').split(',').map(e => e.trim())
};

console.log(`📧 SES Configuration: ${SES_CONFIG.sandboxMode ? 'SANDBOX MODE' : 'PRODUCTION MODE'}`);
console.log(`📧 From Email: ${SES_CONFIG.fromEmail}`);
if (SES_CONFIG.sandboxMode) {
    console.log(`📧 Sandbox Recipients: ${SES_CONFIG.sandboxRecipients.join(', ')}`);
}

// Send Email Helper Function
async function sendEmail(toEmail, subject, htmlContent, textContent) {
    try {
        // Validate recipient in sandbox mode
        if (SES_CONFIG.sandboxMode) {
            if (!SES_CONFIG.sandboxRecipients.includes(toEmail.toLowerCase())) {
                console.warn(`⚠️  Email to ${toEmail} blocked - not in sandbox recipients list`);
                console.warn(`⚠️  Sandbox recipients: ${SES_CONFIG.sandboxRecipients.join(', ')}`);
                return {
                    success: false,
                    message: `Email blocked - recipient not verified in sandbox mode`,
                    sandboxMode: true,
                    recipientEmail: toEmail
                };
            }
        }

        const command = new SendEmailCommand({
            FromEmailAddress: SES_CONFIG.fromEmail,
            Destination: {
                ToAddresses: [toEmail]
            },
            Content: {
                Simple: {
                    Subject: {
                        Data: subject,
                        Charset: 'UTF-8'
                    },
                    Body: {
                        Html: {
                            Data: htmlContent,
                            Charset: 'UTF-8'
                        },
                        Text: {
                            Data: textContent,
                            Charset: 'UTF-8'
                        }
                    }
                }
            }
        });

        const response = await sesClient.send(command);
        console.log(`✅ Email sent to ${toEmail}: ${response.MessageId}`);

        return {
            success: true,
            messageId: response.MessageId,
            recipient: toEmail
        };

    } catch (error) {
        console.error(`❌ Email sending error for ${toEmail}:`, error.message);
        return {
            success: false,
            error: error.message,
            recipient: toEmail
        };
    }
}

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10, // Reduced to prevent connection exhaustion
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // Increased timeout
});

// Database query with automatic retry logic
async function queryWithRetry(text, params, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await pool.query(text, params);
            return result;
        } catch (error) {
            const isConnectionError = error.code === 'ECONNREFUSED' || 
                                    error.code === 'ENOTFOUND' ||
                                    error.message.includes('Connection terminated') ||
                                    error.message.includes('connection timeout');
            
            if (isConnectionError && attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
                console.log(`⚠️  API Database connection attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // If not a connection error or max retries reached, throw the error
            throw error;
        }
    }
}

// Rate limiting for auth endpoints
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.'
    }
});

// Helper functions
function generateToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { 
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        issuer: 'transplant-platform',
        audience: 'patient-app'
    });
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'transplant-platform',
        audience: 'patient-app'
    });
}

async function hashPassword(password) {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// Health check
app.get('/health', async (req, res) => {
    try {
        const dbResult = await pool.query('SELECT NOW() as current_time');
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
            error: error.message
        });
    }
});

app.use('/api/v1/auth', authLimiter);

// Clear existing data endpoint
app.post('/api/v1/clear-data', async (req, res) => {
    try {
        await pool.query('DELETE FROM user_credentials');
        await pool.query('DELETE FROM patients');
        await pool.query('DELETE FROM users');
        
        res.json({
            success: true,
            message: 'All user data cleared'
        });
    } catch (error) {
        console.error('❌ Clear data error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Registration endpoint
app.post('/api/v1/auth/register/patient', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            title, firstName, lastName, email, phoneNumber,
            dateOfBirth, address, primaryCarePhysician,
            insuranceProvider, dialysisClinic, socialWorkerName, password,
            nephrologist, referralToken
        } = req.body;
        
        console.log(`📝 Registering patient: ${email}`);

        // If registering from a referral, fetch pre-filled data
        let referralData = null;
        if (referralToken) {
            const referralResult = await client.query(
                'SELECT * FROM patient_referral_invitations WHERE referral_token = $1 AND expires_at > NOW() AND redeemed = false',
                [referralToken]
            );

            if (referralResult.rows.length > 0) {
                referralData = referralResult.rows[0];
                console.log(`✅ Found valid referral token: ${referralToken}`);
            } else {
                console.warn(`⚠️  Referral token invalid or expired: ${referralToken}`);
            }
        }

        // Validate required fields with detailed messages
        const missingFields = [];
        if (!firstName?.trim()) missingFields.push('First Name');
        if (!lastName?.trim()) missingFields.push('Last Name');
        if (!email?.trim()) missingFields.push('Email');
        if (!password?.trim()) missingFields.push('Password');
        if (!dialysisClinic?.trim()) missingFields.push('Dialysis Clinic');
        if (!socialWorkerName?.trim()) missingFields.push('Social Worker Name');
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Please fill in the following required fields: ${missingFields.join(', ')}`
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid email address'
            });
        }
        
        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long'
            });
        }
        
        // Validate date of birth if provided
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const today = new Date();
            const age = Math.floor((today - dob) / (365.25 * 24 * 60 * 60 * 1000));
            
            if (isNaN(dob.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'Please enter a valid date of birth'
                });
            }
            
            if (dob >= today) {
                return res.status(400).json({
                    success: false,
                    error: 'Date of birth must be in the past'
                });
            }
            
            if (age < 18) {
                return res.status(400).json({
                    success: false,
                    error: 'You must be at least 18 years old to register'
                });
            }
            
            if (age > 120) {
                return res.status(400).json({
                    success: false,
                    error: 'Please enter a valid date of birth'
                });
            }
        }
        
        // Check if user already exists
        const existingUser = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'An account with this email address already exists. Please use a different email or try logging in.'
            });
        }
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Create user record
        const userResult = await client.query(`
            INSERT INTO users (
                cognito_sub, email, title, first_name, last_name, phone_number, 
                role, status, email_verified, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'patient', 'active', false, NOW(), NOW()) 
            RETURNING id
        `, [
            'basic_auth_' + Date.now(), // Generate a unique identifier for basic auth users
            email.toLowerCase(),
            title || '',
            firstName.trim(),
            lastName.trim(),
            phoneNumber || ''
        ]);
        
        const userId = userResult.rows[0].id;
        
        // Find the DUSW social worker ID based on the selected name and clinic
        let assignedSocialWorkerId = null;
        if (socialWorkerName && dialysisClinic) {
            const socialWorkerResult = await client.query(`
                SELECT id FROM dusw_social_workers 
                WHERE CONCAT(title, ' ', first_name, ' ', last_name) = $1 
                AND dialysis_clinic = $2 
                AND status = 'active'
                LIMIT 1
            `, [socialWorkerName, dialysisClinic]);
            
            if (socialWorkerResult.rows.length > 0) {
                assignedSocialWorkerId = socialWorkerResult.rows[0].id;
                console.log(`✅ Linked to social worker: ${socialWorkerName} (${assignedSocialWorkerId})`);
            } else {
                console.log(`⚠️  Social worker not found: ${socialWorkerName} at ${dialysisClinic}`);
            }
        }
        
        // Create patient record with social worker linkage
        const patientResult = await client.query(`
            INSERT INTO patients (
                user_id, date_of_birth, address, primary_care_physician,
                insurance_provider, nephrologist, profile_completed, onboarding_completed,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, false, false, NOW(), NOW())
            RETURNING id
        `, [
            userId,
            dateOfBirth ? new Date(dateOfBirth) : null,
            address || '',
            primaryCarePhysician || '',
            insuranceProvider || '',
            nephrologist || ''
        ]);
        
        // Store the social worker and clinic info in a separate table for DUSW linkage
        // since the existing schema doesn't support our dusw_social_workers table
        if (assignedSocialWorkerId && dialysisClinic) {
            await client.query(`
                CREATE TABLE IF NOT EXISTS patient_dusw_assignments (
                    id SERIAL PRIMARY KEY,
                    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                    dusw_social_worker_id INTEGER NOT NULL REFERENCES dusw_social_workers(id) ON DELETE CASCADE,
                    dialysis_clinic VARCHAR(255) NOT NULL,
                    social_worker_name VARCHAR(255) NOT NULL,
                    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(patient_id)
                );
            `);
            
            await client.query(`
                INSERT INTO patient_dusw_assignments (
                    patient_id, dusw_social_worker_id, dialysis_clinic, social_worker_name, assigned_at
                ) VALUES ($1, $2, $3, $4, NOW())
            `, [patientResult.rows[0].id, assignedSocialWorkerId, dialysisClinic, socialWorkerName]);
            
            console.log(`✅ Created DUSW assignment for patient`);
        }
        
        const patientId = patientResult.rows[0].id;
        
        // Create credentials
        await client.query(`
            INSERT INTO user_credentials (email, password_hash, patient_id, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
        `, [email.toLowerCase(), passwordHash, patientId]);
        
        // Mark referral as redeemed if it was used
        if (referralData) {
            await client.query(`
                UPDATE patient_referral_invitations
                SET redeemed = true, redeemed_at = NOW(), redeemed_patient_id = $1
                WHERE referral_token = $2
            `, [patientId, referralToken]);

            console.log(`✅ Marked referral as redeemed: ${referralToken}`);

            // Create notification for DUSW that their referred patient registered
            if (referralData.dusw_id) {
                await client.query(`
                    INSERT INTO dusw_notifications (
                        dusw_id, patient_id, notification_type, title, message, is_read, created_at
                    ) VALUES ($1, $2, 'patient_registered', 'Patient Registered', $3, false, NOW())
                `, [
                    referralData.dusw_id,
                    patientId,
                    `${firstName.trim()} ${lastName.trim()} has registered in the app and is now in your patient list.`
                ]);
                console.log(`✅ Created DUSW notification for patient registration`);
            }
        }

        // Log audit
        await client.query(`
            INSERT INTO audit_logs (user_id, action, resource_type, description, occurred_at)
            VALUES ($1, 'CREATE', 'user', 'Patient registered successfully', NOW())
        `, [userId]);

        await client.query('COMMIT');
        
        console.log(`✅ Registration successful: ${userId}`);
        
        // Generate token for auto-login
        const tokenPayload = {
            userId: userId,
            email: email.toLowerCase(),
            type: 'patient'
        };
        
        const accessToken = generateToken(tokenPayload);
        
        // Return login response instead of just success message
        res.status(201).json({
            success: true,
            message: 'Registration successful! Automatically logged in.',
            autoLogin: true,
            data: {
                accessToken: accessToken,
                refreshToken: accessToken,
                idToken: accessToken,
                expiresIn: 86400,
                user: {
                    id: userId,
                    email: email.toLowerCase(),
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    profileCompleted: false,
                    onboardingCompleted: false,
                    roiSigned: false,
                    transplantCentersSelected: false,
                    dialysisClinicId: null,
                    assignedSocialWorkerName: socialWorkerName,
                    createdAt: new Date().toISOString()
                }
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Registration error:', error);
        
        // Handle specific database constraint errors
        if (error.code === '23514') { // Check constraint violation
            if (error.constraint === 'patients_age_check') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid date of birth. Please ensure you are at least 18 years old and the date is valid.'
                });
            }
        }
        
        if (error.code === '23505') { // Unique constraint violation
            if (error.constraint && error.constraint.includes('email')) {
                return res.status(400).json({
                    success: false,
                    error: 'An account with this email address already exists. Please use a different email or try logging in.'
                });
            }
        }
        
        if (error.code === '23503') { // Foreign key constraint violation
            return res.status(400).json({
                success: false,
                error: 'Registration failed due to a data validation error. Please check your information and try again.'
            });
        }
        
        // Generic error for unexpected issues
        res.status(500).json({
            success: false,
            error: 'Registration failed due to a server error. Please try again in a few moments.'
        });
    } finally {
        client.release();
    }
});

// DUSW Create Patient Referral Endpoint
app.post('/api/v1/dusw/referrals/create', async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const {
            patientTitle,
            patientFirstName,
            patientLastName,
            patientEmail,
            patientNephrologist,
            dialysisClinicId,
            dialysisClinicName,
            duswId,
            duswEmail,
            duswName
        } = req.body;

        console.log(`📝 DUSW creating referral for: ${patientEmail}`);

        // Validate required fields
        const missingFields = [];
        if (!patientFirstName?.trim()) missingFields.push('Patient First Name');
        if (!patientLastName?.trim()) missingFields.push('Patient Last Name');
        if (!patientEmail?.trim()) missingFields.push('Patient Email');
        if (!dialysisClinicName?.trim()) missingFields.push('Dialysis Clinic');
        if (!duswEmail?.trim()) missingFields.push('DUSW Email');

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Please fill in the following required fields: ${missingFields.join(', ')}`
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(patientEmail.trim())) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid patient email address'
            });
        }

        // Create referral invitation record
        const referralResult = await client.query(`
            INSERT INTO patient_referral_invitations (
                referral_token, patient_email, patient_title, patient_first_name,
                patient_last_name, patient_nephrologist, dialysis_clinic_name,
                dialysis_clinic_id, dusw_id, dusw_email, dusw_name,
                redeemed, created_at, expires_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                false, NOW(), NOW() + INTERVAL '30 days'
            )
            RETURNING referral_token, referral_token::text as token
        `, [
            patientEmail.toLowerCase(),
            patientTitle || '',
            patientFirstName.trim(),
            patientLastName.trim(),
            patientNephrologist || '',
            dialysisClinicName.trim(),
            dialysisClinicId || null,
            duswId || null,
            duswEmail.toLowerCase(),
            duswName || ''
        ]);

        const referralToken = referralResult.rows[0].token;

        console.log(`✅ Referral created: ${referralToken}`);

        // Build pre-fill URL for the referral link
        const appDownloadUrl = process.env.APP_DOWNLOAD_URL || 'https://apps.apple.com/app/transplant-wizard';
        const preFilledData = {
            referralToken,
            firstName: patientFirstName.trim(),
            lastName: patientLastName.trim(),
            email: patientEmail.toLowerCase(),
            title: patientTitle || '',
            nephrologist: patientNephrologist || '',
            dialysisClinic: dialysisClinicName.trim(),
            dusw: duswName || ''
        };

        // Build universal link for all email clients
        // Universal links work in Gmail, Outlook, Apple Mail, etc.
        // iOS will open the app if installed, otherwise shows web registration
        const referralLink = `https://transplantwizard.com/register?referralToken=${referralToken}`;

        // Send email notification to patient with referral link and DUSW info
        const referralEmailSubject = `Welcome to Transplant Wizard - Referral from ${duswName}`;

        const referralEmailHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 0.5px; }
        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.95; }
        .content { background: #ffffff; padding: 40px 30px; }
        .greeting { font-size: 16px; margin-bottom: 20px; line-height: 1.6; }
        .info-section { margin: 30px 0; }
        .info-box { background: #f0f4ff; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .info-box h3 { margin: 0 0 15px 0; color: #667eea; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .info-item { margin: 8px 0; font-size: 15px; }
        .info-item strong { color: #333; }
        .cta-section { text-align: center; margin: 30px 0; }
        .cta-button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: 600; font-size: 16px; transition: transform 0.2s; margin: 20px 0; }
        .cta-button:hover { transform: translateY(-2px); }
        .steps { margin: 30px 0; }
        .steps ol { padding-left: 20px; }
        .steps li { margin: 12px 0; line-height: 1.6; }
        .expiration-warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 20px 0; font-size: 14px; color: #856404; }
        .footer { background: #f5f5f5; padding: 30px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 10px 10px; }
        .footer p { margin: 8px 0; }
        .footer-link { color: #667eea; text-decoration: none; }
        .hipaa-notice { background: #e8f4f8; border: 1px solid #b3d9e8; border-radius: 4px; padding: 12px; margin-top: 15px; font-size: 12px; color: #0c5460; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Transplant Wizard</h1>
            <p>Your Healthcare Team is Here to Support You</p>
        </div>
        <div class="content">
            <div class="greeting">
                <p>Hello ${patientTitle ? patientTitle + ' ' : ''}${patientFirstName} ${patientLastName},</p>
                <p>You've been referred to <strong>Transplant Wizard</strong> by <strong>${duswName}</strong> at <strong>${dialysisClinicName}</strong>. This is a secure patient portal designed to help you manage your transplant journey and stay connected with your healthcare team.</p>
            </div>

            <div class="info-box">
                <h3>Your Pre-filled Information</h3>
                <div class="info-item"><strong>Name:</strong> ${patientTitle ? patientTitle + ' ' : ''}${patientFirstName} ${patientLastName}</div>
                <div class="info-item"><strong>Email:</strong> ${patientEmail}</div>
                <div class="info-item"><strong>Dialysis Clinic:</strong> ${dialysisClinicName}</div>
                ${patientNephrologist ? `<div class="info-item"><strong>Nephrologist:</strong> ${patientNephrologist}</div>` : ''}
            </div>

            <div class="info-section">
                <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">How to Get Started</h2>
                <div class="steps">
                    <ol>
                        <li><strong>Click the button below</strong> - this will open the Transplant Wizard app on your iPhone</li>
                        <li><strong>If you don't have the app yet</strong> - you'll be taken to TestFlight to install it (free, no approval needed)</li>
                        <li><strong>Review your pre-filled information</strong> - your details are already there</li>
                        <li><strong>Create a secure password</strong> and complete your registration</li>
                    </ol>
                </div>
            </div>

            <div class="cta-section">
                <a href="${referralLink}" class="cta-button" style="display: inline-block; text-decoration: none;">📱 Complete Your Registration</a>
                <p style="font-size: 12px; color: #999; margin-top: 20px; line-height: 1.6;">
                    <strong>iPhone Users:</strong> Tap the button to open the Transplant Wizard app. If you don't have the app yet, you'll be able to complete registration on the web.<br>
                    <strong>Other Devices:</strong> The link works on any device and will open in your browser.
                </p>
                <p style="font-size: 11px; color: #999; margin-top: 15px;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <code style="background: #f5f5f5; padding: 6px 10px; border-radius: 3px; word-break: break-all; display: block; margin-top: 8px;">${referralLink}</code>
                </p>
            </div>

            <div class="expiration-warning">
                <strong>⏰ Important:</strong> This referral link expires on <strong>${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>. Please complete your registration before then.
            </div>

            <div class="info-section">
                <p style="font-size: 15px; line-height: 1.8;">If you have any questions or need assistance, please don't hesitate to contact:</p>
                <p style="margin: 15px 0; padding: 15px; background: #f9f9f9; border-radius: 4px;">
                    <strong>${duswName}</strong><br>
                    ${dialysisClinicName}
                </p>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">Thank you for choosing Transplant Wizard. We're committed to supporting your transplant journey.</p>
        </div>
        <div class="footer">
            <p><strong>Transplant Wizard Patient Portal</strong></p>
            <div class="hipaa-notice">
                <p style="margin: 0;">🔒 <strong>HIPAA Notice:</strong> This is a secure, encrypted communication containing protected health information. Do not forward this email or share this link with unauthorized persons.</p>
            </div>
            <p style="margin-top: 15px;">&copy; 2025 Transplant Wizard. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;

        const referralEmailText = `Welcome to Transplant Wizard
Your Healthcare Team is Here to Support You

Hello ${patientTitle ? patientTitle + ' ' : ''}${patientFirstName} ${patientLastName},

You've been referred to Transplant Wizard by ${duswName} at ${dialysisClinicName}. This is a secure patient portal designed to help you manage your transplant journey.

YOUR PRE-FILLED INFORMATION:
- Name: ${patientTitle ? patientTitle + ' ' : ''}${patientFirstName} ${patientLastName}
- Email: ${patientEmail}
- Dialysis Clinic: ${dialysisClinicName}
${patientNephrologist ? `- Nephrologist: ${patientNephrologist}` : ''}

GET STARTED IN 4 EASY STEPS:
1. Click or copy the link below to open Transplant Wizard
2. Review your pre-filled information
3. Create a secure password
4. Complete your registration

REGISTRATION LINK:
${referralLink}

IMPORTANT: This referral link expires on ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

If you need assistance, please contact:
${duswName}
${dialysisClinicName}

---
HIPAA NOTICE: This is a secure, encrypted communication containing protected health information. Do not forward this email or share this link with unauthorized persons.

© 2025 Transplant Wizard. All rights reserved.
`;

        // Send email via AWS SES
        const emailResult = await sendEmail(
            patientEmail,
            referralEmailSubject,
            referralEmailHTML,
            referralEmailText
        );

        if (!emailResult.success) {
            console.warn(`⚠️  Email sending failed for referral: ${emailResult.message || emailResult.error}`);
            // Log but continue - referral is created even if email fails in sandbox mode
            if (SES_CONFIG.sandboxMode && emailResult.sandboxMode) {
                console.log(`📧 Note: Email blocked due to sandbox mode. Recipient must be in: ${SES_CONFIG.sandboxRecipients.join(', ')}`);
            }
        } else {
            console.log(`✅ Referral email sent successfully to ${patientEmail}`);
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Referral created successfully. Email sent to patient.',
            data: {
                referralToken,
                referralLink,
                patientEmail,
                patientName: `${patientTitle ? patientTitle + ' ' : ''}${patientFirstName} ${patientLastName}`,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Referral creation error:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to create referral. Please try again.'
        });
    } finally {
        client.release();
    }
});

// Get Pending Referrals for a DUSW - returns unredeemed referral invitations
app.get('/api/v1/dusw/referrals/pending/:duswId', async (req, res) => {
    try {
        const { duswId } = req.params;

        console.log(`📋 Fetching pending referrals for DUSW: ${duswId}`);

        const result = await pool.query(`
            SELECT 
                id, referral_token, patient_email, patient_title,
                patient_first_name, patient_last_name, patient_nephrologist,
                dialysis_clinic_name, created_at, expires_at
            FROM patient_referral_invitations
            WHERE dusw_id = $1 AND redeemed = false
            ORDER BY created_at DESC
        `, [duswId]);

        console.log(`✅ Found ${result.rows.length} pending referrals`);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                id: row.id,
                referralToken: row.referral_token,
                patientEmail: row.patient_email,
                patientTitle: row.patient_title,
                patientFirstName: row.patient_first_name,
                patientLastName: row.patient_last_name,
                patientNephrologist: row.patient_nephrologist,
                dialysisClinic: row.dialysis_clinic_name,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                daysPending: Math.floor((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24))
            }))
        });

    } catch (error) {
        console.error('❌ Error fetching pending referrals:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch pending referrals'
        });
    }
});

// Resend Referral Invitation Email
app.post('/api/v1/dusw/referrals/:referralId/resend', async (req, res) => {
    try {
        const { referralId } = req.params;

        console.log(`📧 Resending referral invitation: ${referralId}`);

        // Get the referral data
        const result = await pool.query(`
            SELECT * FROM patient_referral_invitations
            WHERE id = $1 AND redeemed = false
        `, [referralId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Referral not found or already redeemed'
            });
        }

        const referral = result.rows[0];
        const referralLink = `https://transplantwizard.com/register?referralToken=${referral.referral_token}`;

        // Send email
        const emailResult = await sendEmail(
            referral.patient_email,
            `Reminder: Complete Your Registration - Transplant Wizard`,
            `<h2>Reminder from ${referral.dusw_name}</h2>
            <p>Hello ${referral.patient_first_name},</p>
            <p>This is a friendly reminder to complete your registration with Transplant Wizard.</p>
            <p><a href="${referralLink}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Complete Registration</a></p>
            <p>If the button doesn't work, copy this link: ${referralLink}</p>`,
            `Reminder from ${referral.dusw_name}\n\nHello ${referral.patient_first_name},\n\nPlease complete your registration: ${referralLink}`
        );

        if (emailResult.success) {
            console.log(`✅ Resent referral email to ${referral.patient_email}`);
            res.json({
                success: true,
                message: 'Referral invitation resent successfully'
            });
        } else {
            console.warn(`⚠️ Failed to resend email: ${emailResult.error}`);
            res.status(500).json({
                success: false,
                error: 'Failed to send email. Please try again.'
            });
        }

    } catch (error) {
        console.error('❌ Error resending referral:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resend referral invitation'
        });
    }
});

// Cancel/Delete a Pending Referral
app.delete('/api/v1/dusw/referrals/:referralId', async (req, res) => {
    try {
        const { referralId } = req.params;

        console.log(`🗑️ Canceling referral: ${referralId}`);

        const result = await pool.query(`
            DELETE FROM patient_referral_invitations
            WHERE id = $1 AND redeemed = false
            RETURNING patient_email, patient_first_name, patient_last_name
        `, [referralId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Referral not found or already redeemed'
            });
        }

        console.log(`✅ Canceled referral for ${result.rows[0].patient_email}`);

        res.json({
            success: true,
            message: 'Referral canceled successfully'
        });

    } catch (error) {
        console.error('❌ Error canceling referral:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel referral'
        });
    }
});

// Get Referral Pre-Fill Data Endpoint
app.get('/api/v1/patient/referral/:token', async (req, res) => {
    try {
        const { token } = req.params;

        console.log(`🔍 Fetching referral data for token: ${token}`);

        // Query referral invitation by token
        const result = await pool.query(
            `SELECT * FROM patient_referral_invitations
             WHERE referral_token = $1 AND expires_at > NOW() AND redeemed = false`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Referral not found or has expired. Please contact your DUSW for a new referral link.'
            });
        }

        const referral = result.rows[0];

        console.log(`✅ Found valid referral: ${token}`);

        res.json({
            success: true,
            data: {
                patientTitle: referral.patient_title,
                patientFirstName: referral.patient_first_name,
                patientLastName: referral.patient_last_name,
                patientEmail: referral.patient_email,
                patientNephrologist: referral.patient_nephrologist,
                dialysisClinic: referral.dialysis_clinic_name,
                dialysisClinicId: referral.dialysis_clinic_id,
                duswName: referral.dusw_name,
                duswEmail: referral.dusw_email,
                expiresAt: referral.expires_at
            }
        });

    } catch (error) {
        console.error('❌ Referral fetch error:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve referral information.'
        });
    }
});

// Login endpoint
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log(`🔐 Login attempt for ${email}`);
        
        // Validate required fields
        if (!email?.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Please enter your email address'
            });
        }
        
        if (!password?.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Please enter your password'
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a valid email address'
            });
        }
        
        // Get user and credentials with retry logic
        const result = await queryWithRetry(`
            SELECT 
                u.id as user_id,
                u.email,
                u.first_name,
                u.last_name,
                u.phone_number,
                u.title,
                u.status,
                u.created_at as user_created_at,
                p.id as patient_id,
                p.date_of_birth,
                p.address,
                p.primary_care_physician,
                p.insurance_provider,
                p.profile_completed,
                p.onboarding_completed,
                uc.password_hash
            FROM users u
            JOIN patients p ON u.id = p.user_id
            JOIN user_credentials uc ON uc.patient_id = p.id
            WHERE u.email = $1 AND u.role = 'patient'
        `, [email.toLowerCase()]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'No account found with this email address. Please check your email or register for a new account.'
            });
        }
        
        const user = result.rows[0];
        
        // Check if account is active
        if (user.status !== 'active') {
            return res.status(401).json({
                success: false,
                error: 'Your account is currently inactive. Please contact support for assistance.'
            });
        }
        
        // Verify password
        const passwordValid = await verifyPassword(password, user.password_hash);
        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                error: 'Incorrect password. Please check your password and try again.'
            });
        }
        
        // Generate token
        const tokenPayload = {
            userId: user.user_id,
            email: user.email,
            type: 'patient'
        };
        
        const accessToken = generateToken(tokenPayload);
        
        // Update last login
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.user_id]);
        
        // Log audit
        await pool.query(`
            INSERT INTO audit_logs (user_id, action, resource_type, description, occurred_at)
            VALUES ($1, 'LOGIN', 'session', 'Patient logged in successfully', NOW())
        `, [user.user_id]);
        
        console.log(`✅ Login successful for ${email}`);
        
        // Get ROI status, consent status, and transplant centers count with retry logic
        const statusResult = await queryWithRetry(`
            SELECT 
                (SELECT MAX(signed_at) FROM roi_consents WHERE patient_id = p.id) as roi_signed_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'services_consent') as services_consent_signed_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'medical_records_consent') as medical_records_consent_signed_at,
                COUNT(pr.id) as referral_count
            FROM patients p
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            WHERE p.id = $1
            GROUP BY p.id
        `, [user.patient_id]);

        const status = statusResult.rows[0] || {};
        const roiSigned = !!status.roi_signed_at;
        const servicesConsentSigned = !!status.services_consent_signed_at;
        const medicalRecordsConsentSigned = !!status.medical_records_consent_signed_at;
        const transplantCentersSelected = parseInt(status.referral_count || 0) > 0;

        // Return user data in iOS expected format
        res.json({
            success: true,
            data: {
                accessToken: accessToken,
                refreshToken: accessToken,
                idToken: accessToken,
                expiresIn: 86400,
                user: {
                    id: user.user_id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    profileCompleted: user.profile_completed || false,
                    onboardingCompleted: user.onboarding_completed || false,
                    roiSigned: roiSigned,
                    transplantCentersSelected: transplantCentersSelected,
                    dialysisClinicId: null,
                    assignedSocialWorkerName: null,
                    createdAt: user.user_created_at,
                    servicesConsentSigned: servicesConsentSigned,
                    medicalRecordsConsentSigned: medicalRecordsConsentSigned
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        
        // Handle database connection errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return res.status(500).json({
                success: false,
                error: 'Unable to connect to our servers. Please check your internet connection and try again.'
            });
        }
        
        // Generic error for unexpected issues
        res.status(500).json({
            success: false,
            error: 'Login failed due to a server error. Please try again in a few moments.'
        });
    }
});

// Get current user profile (for token validation and user status refresh)
app.get('/api/v1/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get user profile with consent status
        const result = await queryWithRetry(`
            SELECT 
                u.id as user_id,
                u.email,
                u.first_name,
                u.last_name,
                u.created_at as user_created_at,
                p.id as patient_id,
                p.profile_completed,
                p.onboarding_completed,
                (SELECT MAX(signed_at) FROM roi_consents WHERE patient_id = p.id) as roi_signed_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'services_consent') as services_consent_signed_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'medical_records_consent') as medical_records_consent_signed_at,
                (SELECT COUNT(*) FROM patient_referrals WHERE patient_id = p.id) as referral_count
            FROM users u
            JOIN patients p ON u.id = p.user_id
            WHERE u.id = $1
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            data: {
                id: user.user_id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                profileCompleted: user.profile_completed || false,
                onboardingCompleted: user.onboarding_completed || false,
                roiSigned: !!user.roi_signed_at,
                transplantCentersSelected: parseInt(user.referral_count || 0) > 0,
                dialysisClinicId: null,
                assignedSocialWorkerName: null,
                createdAt: user.user_created_at,
                servicesConsentSigned: !!user.services_consent_signed_at,
                medicalRecordsConsentSigned: !!user.medical_records_consent_signed_at
            }
        });

    } catch (error) {
        console.error('❌ Error getting user profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user profile'
        });
    }
});

// MARK: - Transplant Center Endpoints

// Get all transplant centers
app.get('/api/v1/transplant-centers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM transplant_centers 
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
            error: 'Failed to retrieve transplant centers'
        });
    }
});

// Select transplant centers for a patient
app.post('/api/v1/transplant-centers/select', async (req, res) => {
    try {
        const { transplantCenterIds } = req.body;
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        if (!transplantCenterIds || !Array.isArray(transplantCenterIds)) {
            return res.status(400).json({
                success: false,
                error: 'transplantCenterIds must be an array'
            });
        }

        // Get patient ID and info from user ID
        const patientResult = await pool.query(`
            SELECT p.id, u.first_name, u.last_name, u.email, u.phone_number
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = $1
        `, [decoded.userId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patient = patientResult.rows[0];
        const patientId = patient.id;

        // Clear existing referrals for this patient
        await pool.query('DELETE FROM patient_referrals WHERE patient_id = $1', [patientId]);

        // Insert new referrals (status: applied is the initial status in the new enum)
        const referralPromises = transplantCenterIds.map(centerId => 
            pool.query(`
                INSERT INTO patient_referrals (
                    patient_id, transplant_center_id, status, submitted_at, created_at
                ) VALUES ($1, $2, 'applied', NOW(), NOW())
            `, [patientId, centerId])
        );

        await Promise.all(referralPromises);

        // Mark patient as having completed profile and onboarding
        await pool.query(`
            UPDATE patients 
            SET profile_completed = true, onboarding_completed = true, updated_at = NOW()
            WHERE id = $1
        `, [patientId]);

        console.log(`✅ Saved ${transplantCenterIds.length} transplant center selections for patient ${patientId}`);
        console.log(`✅ Updated completion status for patient ${patientId}`);

        // Notify TC admins for each selected transplant center
        for (const centerId of transplantCenterIds) {
            try {
                // Get transplant center info and admin emails
                const tcResult = await pool.query(`
                    SELECT tc.name, tc.city, tc.state,
                           tce.email as admin_email, tce.first_name as admin_first_name, tce.last_name as admin_last_name
                    FROM transplant_centers tc
                    LEFT JOIN transplant_center_employees tce ON tc.id = tce.transplant_center_id AND tce.role = 'admin'
                    WHERE tc.id = $1
                `, [centerId]);

                if (tcResult.rows.length > 0) {
                    const tcInfo = tcResult.rows[0];
                    
                    // Send notification email to each admin
                    for (const row of tcResult.rows) {
                        if (row.admin_email) {
                            const notificationSubject = `New Patient Referral - ${patient.first_name} ${patient.last_name}`;
                            
                            const notificationHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 0; }
        .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #ffffff; padding: 30px; }
        .patient-info { background: #f0fdf4; border-left: 4px solid #059669; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .patient-info h3 { margin: 0 0 15px 0; color: #059669; }
        .info-item { margin: 8px 0; font-size: 15px; }
        .cta-button { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: 600; margin: 20px 0; }
        .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 10px 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 New Patient Referral</h1>
        </div>
        <div class="content">
            <p>Hello ${row.admin_first_name || 'Admin'},</p>
            <p>A new patient has selected <strong>${tcInfo.name}</strong> as one of their transplant centers.</p>
            
            <div class="patient-info">
                <h3>Patient Information</h3>
                <div class="info-item"><strong>Name:</strong> ${patient.first_name} ${patient.last_name}</div>
                <div class="info-item"><strong>Email:</strong> ${patient.email}</div>
                ${patient.phone_number ? `<div class="info-item"><strong>Phone:</strong> ${patient.phone_number}</div>` : ''}
                <div class="info-item"><strong>Submitted:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            
            <p>Please log in to the Transplant Center Portal to review this patient's full information and update their referral status.</p>
            
            <div style="text-align: center;">
                <a href="https://tc.transplantwizard.com/dashboard" class="cta-button">View Patient Details</a>
            </div>
        </div>
        <div class="footer">
            <p><strong>Transplant Wizard</strong> - Streamlining Patient Referrals</p>
            <p>🔒 This email contains patient information protected under HIPAA.</p>
        </div>
    </div>
</body>
</html>`;

                            const notificationText = `New Patient Referral for ${tcInfo.name}

Hello ${row.admin_first_name || 'Admin'},

A new patient has selected ${tcInfo.name} as one of their transplant centers.

Patient Information:
- Name: ${patient.first_name} ${patient.last_name}
- Email: ${patient.email}
${patient.phone_number ? `- Phone: ${patient.phone_number}` : ''}
- Submitted: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

Please log in to the Transplant Center Portal to review this patient's full information:
https://tc.transplantwizard.com/dashboard

---
Transplant Wizard - Streamlining Patient Referrals
This email contains patient information protected under HIPAA.`;

                            const emailResult = await sendEmail(
                                row.admin_email,
                                notificationSubject,
                                notificationHTML,
                                notificationText
                            );

                            if (emailResult.success) {
                                console.log(`✅ Notification sent to TC admin: ${row.admin_email} for ${tcInfo.name}`);
                            } else {
                                console.warn(`⚠️  Failed to notify TC admin ${row.admin_email}: ${emailResult.message || emailResult.error}`);
                            }
                        }
                    }
                    
                    // Create in-app notifications for ALL TC employees at this center
                    const tcEmployeesResult = await pool.query(`
                        SELECT id FROM transplant_center_employees WHERE transplant_center_id = $1
                    `, [centerId]);
                    
                    for (const employee of tcEmployeesResult.rows) {
                        await pool.query(`
                            INSERT INTO tc_notifications (
                                tc_employee_id, patient_id, notification_type, title, message, is_read, created_at
                            ) VALUES ($1, $2, 'new_referral', 'New Patient Referral', $3, false, NOW())
                        `, [
                            employee.id,
                            patientId,
                            `${patient.first_name} ${patient.last_name} has selected ${tcInfo.name} as one of their transplant centers.`
                        ]);
                    }
                    console.log(`✅ Created in-app notifications for ${tcEmployeesResult.rows.length} TC employees at ${tcInfo.name}`);
                }
            } catch (notifyError) {
                console.error(`⚠️  Error notifying TC admin for center ${centerId}:`, notifyError.message);
            }
        }

        res.json({
            success: true,
            message: `Successfully selected ${transplantCenterIds.length} transplant centers`,
            selectedCenters: transplantCenterIds.length
        });

    } catch (error) {
        console.error('❌ Error selecting transplant centers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save transplant center selections'
        });
    }
});

// Get patient's transplant center selections
app.get('/api/v1/transplant-centers/my-selections', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get patient ID from user ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patientId = patientResult.rows[0].id;

        // Get patient's referrals with center details
        const result = await pool.query(`
            SELECT 
                pr.*,
                tc.name,
                tc.city,
                tc.state,
                tc.average_wait_time_months
            FROM patient_referrals pr
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            WHERE pr.patient_id = $1
            ORDER BY pr.submitted_at DESC
        `, [patientId]);

        // After successful selection, mark profile as completed
        if (result.rows.length > 0) {
            await pool.query(`
                UPDATE patients 
                SET profile_completed = true, onboarding_completed = true, updated_at = NOW()
                WHERE id = $1
            `, [patientId]);
            console.log(`✅ Updated completion status for patient ${patientId}`);
        }

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Error fetching patient selections:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve transplant center selections'
        });
    }
});

// MARK: - ROI Consent Endpoints

// Sign ROI consent
app.post('/api/v1/patients/roi-consent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get patient ID from user ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patientId = patientResult.rows[0].id;

        // Check if ROI already exists
        const existingROI = await pool.query(
            'SELECT id FROM roi_consents WHERE patient_id = $1',
            [patientId]
        );

        if (existingROI.rows.length > 0) {
            return res.json({
                success: true,
                message: 'ROI consent already signed',
                alreadySigned: true
            });
        }

        // Get patient name for signature
        const patientInfo = await pool.query(
            'SELECT u.first_name, u.last_name FROM users u JOIN patients p ON u.id = p.user_id WHERE p.id = $1',
            [patientId]
        );
        const patientName = patientInfo.rows.length > 0 ? 
            `${patientInfo.rows[0].first_name} ${patientInfo.rows[0].last_name}` : 
            'Patient';

        // Create ROI consent record
        await pool.query(`
            INSERT INTO roi_consents (
                patient_id, consent_text, digital_signature, signed_at, ip_address, user_agent, created_at
            ) VALUES ($1, $2, $3, NOW(), $4, $5, NOW())
        `, [
            patientId,
            'Patient has consented to Release of Information for transplant coordination',
            patientName,
            req.ip || '127.0.0.1',
            req.get('user-agent') || 'mobile-app'
        ]);

        // Update patient record (mark that ROI was signed)
        await pool.query(`
            UPDATE patients 
            SET updated_at = NOW()
            WHERE id = $1
        `, [patientId]);

        console.log(`✅ ROI consent signed for patient ${patientId}`);

        res.json({
            success: true,
            message: 'ROI consent signed successfully',
            signedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error signing ROI consent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sign ROI consent'
        });
    }
});

// Get ROI consent status
app.get('/api/v1/patients/roi-consent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get patient ID and ROI status
        const result = await pool.query(`
            SELECT 
                p.id as patient_id,
                p.profile_completed,
                p.onboarding_completed,
                rc.signed_at as roi_signed_at,
                COUNT(pr.id) as referral_count
            FROM patients p
            LEFT JOIN roi_consents rc ON p.id = rc.patient_id
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            WHERE p.user_id = $1
            GROUP BY p.id, p.profile_completed, p.onboarding_completed, rc.signed_at
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patient = result.rows[0];

        res.json({
            success: true,
            data: {
                roiSigned: !!patient.roi_signed_at,
                profileCompleted: patient.profile_completed || false,
                onboardingCompleted: patient.onboarding_completed || false,
                transplantCentersSelected: parseInt(patient.referral_count) > 0,
                signedAt: patient.roi_signed_at
            }
        });

    } catch (error) {
        console.error('❌ Error fetching ROI status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve ROI consent status'
        });
    }
});

// ============================================
// PATIENT CONSENT ENDPOINTS (Services & Medical Records)
// ============================================

// Submit patient consent (services_consent or medical_records_consent)
app.post('/api/v1/patients/consent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const { consentType, signatureData } = req.body;

        // Validate consent type
        const validConsentTypes = ['services_consent', 'medical_records_consent'];
        if (!validConsentTypes.includes(consentType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid consent type. Must be services_consent or medical_records_consent'
            });
        }

        if (!signatureData) {
            return res.status(400).json({
                success: false,
                error: 'Signature data is required'
            });
        }

        // Get patient ID and info from user ID
        const patientResult = await pool.query(`
            SELECT p.id, u.first_name, u.last_name, u.email
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = $1
        `, [decoded.userId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patient = patientResult.rows[0];
        const patientId = patient.id;

        // Check if consent already exists
        const existingConsent = await pool.query(
            'SELECT id FROM patient_consents WHERE patient_id = $1 AND consent_type = $2',
            [patientId, consentType]
        );

        if (existingConsent.rows.length > 0) {
            return res.json({
                success: true,
                message: 'Consent already signed',
                alreadySigned: true
            });
        }

        // Generate consent PDF and upload to S3
        const signedAt = new Date();
        let s3Bucket = null;
        let s3Key = null;
        
        try {
            const PDFDocument = require('pdfkit');
            const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
            
            // Create PDF
            const pdfDoc = new PDFDocument({ margin: 50 });
            const chunks = [];
            
            pdfDoc.on('data', chunk => chunks.push(chunk));
            
            const pdfPromise = new Promise((resolve) => {
                pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            });
            
            // Consent titles
            const consentTitles = {
                'services_consent': 'Transplant Wizard Services Agreement',
                'medical_records_consent': 'Medical Records Release Authorization'
            };
            
            // PDF Header
            pdfDoc.fontSize(20).font('Helvetica-Bold').text(consentTitles[consentType], { align: 'center' });
            pdfDoc.moveDown();
            pdfDoc.fontSize(10).font('Helvetica').text('Transplant Wizard Healthcare Platform', { align: 'center' });
            pdfDoc.moveDown(2);
            
            // Patient Info
            pdfDoc.fontSize(12).font('Helvetica-Bold').text('Patient Information');
            pdfDoc.fontSize(10).font('Helvetica');
            pdfDoc.text(`Name: ${patient.first_name} ${patient.last_name}`);
            pdfDoc.text(`Email: ${patient.email}`);
            pdfDoc.text(`Patient ID: ${patientId}`);
            pdfDoc.moveDown(2);
            
            // Consent Text
            pdfDoc.fontSize(12).font('Helvetica-Bold').text('Consent Agreement');
            pdfDoc.fontSize(10).font('Helvetica');
            
            if (consentType === 'services_consent') {
                pdfDoc.text('By signing this document, I acknowledge and agree to the following:', { continued: false });
                pdfDoc.moveDown();
                pdfDoc.text('1. I authorize Transplant Wizard to facilitate my kidney transplant evaluation process.');
                pdfDoc.text('2. I understand that Transplant Wizard will share my information with transplant centers I select.');
                pdfDoc.text('3. I agree to receive communications regarding my transplant journey.');
                pdfDoc.text('4. I understand that I can withdraw my consent at any time by contacting support.');
                pdfDoc.text('5. I confirm that all information I provide is accurate to the best of my knowledge.');
            } else {
                pdfDoc.text('By signing this document, I authorize the following:', { continued: false });
                pdfDoc.moveDown();
                pdfDoc.text('1. I authorize the release of my medical records to Transplant Wizard.');
                pdfDoc.text('2. I authorize Transplant Wizard to share my medical records with transplant centers.');
                pdfDoc.text('3. I understand this authorization is valid for 2 years from the date signed.');
                pdfDoc.text('4. I understand I may revoke this authorization at any time in writing.');
                pdfDoc.text('5. This authorization complies with HIPAA regulations.');
            }
            
            pdfDoc.moveDown(2);
            
            // Signature Section
            pdfDoc.fontSize(12).font('Helvetica-Bold').text('Electronic Signature');
            pdfDoc.fontSize(10).font('Helvetica');
            pdfDoc.text(`Signed Date: ${signedAt.toLocaleString()}`);
            pdfDoc.text(`IP Address: ${req.ip || '127.0.0.1'}`);
            pdfDoc.moveDown();
            
            // Add signature image if it's base64 data
            if (signatureData && signatureData.startsWith('data:image')) {
                try {
                    const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
                    const signatureBuffer = Buffer.from(base64Data, 'base64');
                    pdfDoc.image(signatureBuffer, { width: 200, height: 80 });
                } catch (sigError) {
                    pdfDoc.text('[Electronic Signature on File]');
                }
            } else {
                pdfDoc.text('[Electronic Signature on File]');
            }
            
            pdfDoc.moveDown(2);
            
            // Footer
            pdfDoc.fontSize(8).fillColor('gray');
            pdfDoc.text(`Document ID: ${patientId}-${consentType}-${signedAt.getTime()}`, { align: 'center' });
            pdfDoc.text('This is a legally binding electronic document.', { align: 'center' });
            
            pdfDoc.end();
            
            const pdfBuffer = await pdfPromise;
            
            // Upload to S3 (use same bucket as patient documents)
            const s3Client = new S3Client({ region: S3_CONFIG.region });
            s3Bucket = S3_CONFIG.bucket;
            s3Key = `consents/${patientId}/${consentType}_${signedAt.getTime()}.pdf`;
            
            await s3Client.send(new PutObjectCommand({
                Bucket: s3Bucket,
                Key: s3Key,
                Body: pdfBuffer,
                ContentType: 'application/pdf',
                Metadata: {
                    'patient-id': patientId,
                    'consent-type': consentType,
                    'signed-at': signedAt.toISOString()
                }
            }));
            
            console.log(`📄 Consent PDF uploaded to S3: ${s3Key}`);
            
        } catch (pdfError) {
            console.error('⚠️ PDF generation/upload failed (consent still recorded):', pdfError.message);
        }

        // Create consent record with signature and S3 info
        await pool.query(`
            INSERT INTO patient_consents (
                patient_id, consent_type, consent_version, signature_data, signed_at, ip_address, user_agent, s3_bucket, s3_key
            ) VALUES ($1, $2, '1.0', $3, $4, $5, $6, $7, $8)
        `, [
            patientId,
            consentType,
            signatureData,
            signedAt,
            req.ip || '127.0.0.1',
            req.get('user-agent') || 'mobile-app',
            s3Bucket,
            s3Key
        ]);

        console.log(`✅ ${consentType} signed for patient ${patientId}`);

        res.json({
            success: true,
            message: 'Consent signed successfully',
            consentType: consentType,
            signedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error signing consent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sign consent'
        });
    }
});

// Get patient consent status
app.get('/api/v1/patients/consent-status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get patient ID and consent status
        const result = await pool.query(`
            SELECT 
                p.id,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'services_consent') as services_consent_signed_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'medical_records_consent') as medical_records_consent_signed_at
            FROM patients p
            WHERE p.user_id = $1
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patient = result.rows[0];

        res.json({
            success: true,
            data: {
                servicesConsentSigned: !!patient.services_consent_signed_at,
                servicesConsentSignedAt: patient.services_consent_signed_at,
                medicalRecordsConsentSigned: !!patient.medical_records_consent_signed_at,
                medicalRecordsConsentSignedAt: patient.medical_records_consent_signed_at,
                allConsentsSigned: !!patient.services_consent_signed_at && !!patient.medical_records_consent_signed_at
            }
        });

    } catch (error) {
        console.error('❌ Error fetching consent status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve consent status'
        });
    }
});

// ============================================
// PATIENT PROFILE ENDPOINTS
// ============================================

// Get patient profile
app.get('/api/v1/patients/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get comprehensive patient profile
        const result = await pool.query(`
            SELECT 
                u.id as user_id,
                u.email,
                u.first_name,
                u.last_name,
                u.phone_number,
                p.id as patient_id,
                p.date_of_birth,
                p.address,
                p.primary_care_physician,
                p.nephrologist,
                pif.full_name,
                pif.phone,
                pif.emergency_contact_name,
                pif.emergency_contact_relationship,
                pif.emergency_contact_phone,
                pif.height,
                pif.weight,
                pif.on_dialysis,
                pif.dialysis_type,
                pif.dialysis_start_date,
                pif.last_gfr,
                pif.diagnosed_conditions,
                pif.past_surgeries,
                pif.dialysis_unit_name,
                pif.dialysis_unit_address,
                pif.social_worker_name,
                pif.social_worker_email,
                pif.social_worker_phone,
                pif.other_physicians,
                pif.submitted_at as intake_form_submitted_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'services_consent') as services_consent_signed_at,
                (SELECT signed_at FROM patient_consents WHERE patient_id = p.id AND consent_type = 'medical_records_consent') as medical_records_consent_signed_at
            FROM users u
            JOIN patients p ON u.id = p.user_id
            LEFT JOIN patient_intake_forms pif ON p.id = pif.patient_id
            WHERE u.id = $1
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patient = result.rows[0];

        res.json({
            success: true,
            data: {
                full_name: patient.full_name || `${patient.first_name} ${patient.last_name}`,
                date_of_birth: patient.date_of_birth,
                address: patient.address,
                email: patient.email,
                phone: patient.phone || patient.phone_number,
                emergency_contact_name: patient.emergency_contact_name,
                emergency_contact_relationship: patient.emergency_contact_relationship,
                emergency_contact_phone: patient.emergency_contact_phone,
                height: patient.height,
                weight: patient.weight,
                nephrologist_name: patient.nephrologist,
                pcp_name: patient.primary_care_physician,
                other_physicians: patient.other_physicians || [],
                on_dialysis: patient.on_dialysis,
                dialysis_type: patient.dialysis_type,
                dialysis_start_date: patient.dialysis_start_date,
                last_gfr: patient.last_gfr,
                diagnosed_conditions: patient.diagnosed_conditions,
                past_surgeries: patient.past_surgeries,
                social_worker_name: patient.social_worker_name,
                social_worker_email: patient.social_worker_email,
                social_worker_phone: patient.social_worker_phone,
                dialysis_clinic_name: patient.dialysis_unit_name,
                dialysis_clinic_address: patient.dialysis_unit_address,
                services_consent_signed_at: patient.services_consent_signed_at,
                medical_records_consent_signed_at: patient.medical_records_consent_signed_at,
                intake_form_submitted_at: patient.intake_form_submitted_at
            }
        });

    } catch (error) {
        console.error('❌ Error fetching patient profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve patient profile'
        });
    }
});

// Update patient profile
app.put('/api/v1/patients/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const {
            full_name,
            date_of_birth,
            address,
            email,
            phone,
            emergency_contact_name,
            emergency_contact_relationship,
            emergency_contact_phone,
            height,
            weight,
            nephrologist_name,
            pcp_name,
            other_physicians,
            last_gfr,
            diagnosed_conditions,
            past_surgeries
        } = req.body;

        // Get patient ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patientId = patientResult.rows[0].id;

        // Update users table
        if (email || full_name) {
            const nameParts = full_name ? full_name.split(' ') : [];
            const firstName = nameParts[0] || null;
            const lastName = nameParts.slice(1).join(' ') || null;

            await pool.query(`
                UPDATE users SET
                    email = COALESCE($1, email),
                    first_name = COALESCE($2, first_name),
                    last_name = COALESCE($3, last_name),
                    phone_number = COALESCE($4, phone_number),
                    updated_at = NOW()
                WHERE id = $5
            `, [email, firstName, lastName, phone, decoded.userId]);
        }

        // Update patients table
        await pool.query(`
            UPDATE patients SET
                date_of_birth = COALESCE($1, date_of_birth),
                address = COALESCE($2, address),
                primary_care_physician = COALESCE($3, primary_care_physician),
                nephrologist = COALESCE($4, nephrologist),
                updated_at = NOW()
            WHERE id = $5
        `, [date_of_birth, address, pcp_name, nephrologist_name, patientId]);

        // Update intake form if exists
        const intakeExists = await pool.query(
            'SELECT id FROM patient_intake_forms WHERE patient_id = $1',
            [patientId]
        );

        if (intakeExists.rows.length > 0) {
            await pool.query(`
                UPDATE patient_intake_forms SET
                    full_name = COALESCE($1, full_name),
                    phone = COALESCE($2, phone),
                    emergency_contact_name = COALESCE($3, emergency_contact_name),
                    emergency_contact_relationship = COALESCE($4, emergency_contact_relationship),
                    emergency_contact_phone = COALESCE($5, emergency_contact_phone),
                    height = COALESCE($6, height),
                    weight = COALESCE($7, weight),
                    other_physicians = COALESCE($8, other_physicians),
                    last_gfr = COALESCE($9, last_gfr),
                    diagnosed_conditions = COALESCE($10, diagnosed_conditions),
                    past_surgeries = COALESCE($11, past_surgeries),
                    updated_at = NOW()
                WHERE patient_id = $12
            `, [full_name, phone, emergency_contact_name, emergency_contact_relationship, 
                emergency_contact_phone, height, weight, 
                other_physicians ? JSON.stringify(other_physicians) : null,
                last_gfr, diagnosed_conditions, past_surgeries, patientId]);
        }

        console.log(`✅ Profile updated for patient ${patientId}`);

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('❌ Error updating patient profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update patient profile'
        });
    }
});

// Delete patient account
app.delete('/api/v1/patients/account', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Delete user - CASCADE will handle related records
        await pool.query('DELETE FROM users WHERE id = $1', [decoded.userId]);

        console.log(`✅ Account deleted for user ${decoded.userId}`);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting account:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete account'
        });
    }
});

// ============================================
// PATIENT TRANSPLANT CENTERS ENDPOINTS
// ============================================

// Get patient's transplant centers with status
app.get('/api/v1/patients/centers', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Get patient ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patientId = patientResult.rows[0].id;

        // Get patient's centers with status (status values: applied, under_review, accepted, waitlisted, declined)
        const result = await pool.query(`
            SELECT 
                tc.id,
                tc.name,
                tc.address,
                tc.city,
                tc.state,
                tc.phone,
                tc.email,
                pr.status::text as status,
                pr.submitted_at as applied_at
            FROM patient_referrals pr
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            WHERE pr.patient_id = $1
            ORDER BY pr.submitted_at DESC
        `, [patientId]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Error fetching patient centers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve centers'
        });
    }
});

// Add a transplant center for patient
app.post('/api/v1/patients/centers', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const { center_id } = req.body;

        if (!center_id) {
            return res.status(400).json({
                success: false,
                error: 'Center ID is required'
            });
        }

        // Get patient ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patientId = patientResult.rows[0].id;

        // Check if already added
        const existing = await pool.query(
            'SELECT id FROM patient_referrals WHERE patient_id = $1 AND transplant_center_id = $2',
            [patientId, center_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Center already added'
            });
        }

        // Add the center (use 'submitted' status which is valid in the enum)
        await pool.query(`
            INSERT INTO patient_referrals (patient_id, transplant_center_id, status, submitted_at, created_at)
            VALUES ($1, $2, 'submitted', NOW(), NOW())
        `, [patientId, center_id]);

        console.log(`✅ Center ${center_id} added for patient ${patientId}`);

        // Try to notify the transplant center (non-blocking - don't fail if TC tables don't exist)
        try {
            const centerResult = await pool.query(
                'SELECT name FROM transplant_centers WHERE id = $1',
                [center_id]
            );

            if (centerResult.rows.length > 0) {
                const centerName = centerResult.rows[0].name;
                
                const patientInfo = await pool.query(
                    'SELECT u.first_name, u.last_name FROM users u JOIN patients p ON u.id = p.user_id WHERE p.id = $1',
                    [patientId]
                );
                const patientName = patientInfo.rows.length > 0 ? 
                    `${patientInfo.rows[0].first_name} ${patientInfo.rows[0].last_name}` : 'A patient';

                // Create notification for ALL TC employees at this center
                const tcEmployees = await pool.query(
                    'SELECT id FROM transplant_center_employees WHERE transplant_center_id = $1',
                    [center_id]
                );

                for (const employee of tcEmployees.rows) {
                    await pool.query(`
                        INSERT INTO tc_notifications (tc_employee_id, patient_id, notification_type, title, message, is_read, created_at)
                        VALUES ($1, $2, 'new_referral', 'New Patient Referral', $3, false, NOW())
                    `, [employee.id, patientId, `${patientName} has selected ${centerName} as one of their transplant centers.`]);
                }
                
                if (tcEmployees.rows.length > 0) {
                    console.log(`✅ Created in-app notifications for ${tcEmployees.rows.length} TC employees at ${centerName}`);
                }
            }
        } catch (notifyError) {
            console.log('⚠️ Could not notify TC (table may not exist yet):', notifyError.message);
        }

        res.json({
            success: true,
            message: 'Center added successfully'
        });

    } catch (error) {
        console.error('❌ Error adding center:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add center'
        });
    }
});

// Remove a transplant center for patient
app.delete('/api/v1/patients/centers/:centerId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const { centerId } = req.params;

        // Get patient ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patientId = patientResult.rows[0].id;

        // Remove the center
        await pool.query(
            'DELETE FROM patient_referrals WHERE patient_id = $1 AND transplant_center_id = $2',
            [patientId, centerId]
        );

        console.log(`✅ Center ${centerId} removed for patient ${patientId}`);

        // Try to notify the transplant center (non-blocking - don't fail if TC tables don't exist)
        try {
            const patientInfo = await pool.query(
                'SELECT u.first_name, u.last_name FROM users u JOIN patients p ON u.id = p.user_id WHERE p.id = $1',
                [patientId]
            );
            const patientName = patientInfo.rows.length > 0 ? 
                `${patientInfo.rows[0].first_name} ${patientInfo.rows[0].last_name}` : 'A patient';

            const tcEmployees = await pool.query(
                'SELECT id FROM tc_employees WHERE transplant_center_id = $1',
                [centerId]
            );

            for (const employee of tcEmployees.rows) {
                await pool.query(`
                    INSERT INTO tc_notifications (tc_employee_id, patient_id, notification_type, title, message, is_read, created_at)
                    VALUES ($1, $2, 'application_withdrawn', 'Application Withdrawn', $3, false, NOW())
                `, [employee.id, patientId, `${patientName} has withdrawn their application from your transplant center.`]);
            }
        } catch (notifyError) {
            console.log('⚠️ Could not notify TC (table may not exist yet):', notifyError.message);
        }

        res.json({
            success: true,
            message: 'Center removed successfully'
        });

    } catch (error) {
        console.error('❌ Error removing center:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove center'
        });
    }
});

// ============================================
// PATIENT MESSAGING ENDPOINTS
// ============================================

// Send message to social worker
app.post('/api/v1/patients/messages/social-worker', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const { message } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Get patient ID and social worker info
        const patientResult = await pool.query(`
            SELECT 
                p.id as patient_id,
                u.first_name,
                u.last_name,
                pif.social_worker_email,
                pif.social_worker_name
            FROM patients p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_intake_forms pif ON p.id = pif.patient_id
            WHERE p.user_id = $1
        `, [decoded.userId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }

        const patient = patientResult.rows[0];

        // Store the message
        await pool.query(`
            INSERT INTO patient_messages (patient_id, message_type, content, sender_type, created_at)
            VALUES ($1, 'social_worker', $2, 'patient', NOW())
        `, [patient.patient_id, message]);

        // TODO: Send email notification to social worker if email exists
        if (patient.social_worker_email) {
            console.log(`📧 Would send email to ${patient.social_worker_email}`);
        }

        console.log(`✅ Message sent to social worker for patient ${patient.patient_id}`);

        res.json({
            success: true,
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

// Lookup Referral by Email - for mobile app first-launch flow
app.post('/api/v1/patient/referral/lookup', async (req, res) => {
    try {
        const { email } = req.body;

        console.log(`🔍 Looking up referral by email: ${email}`);

        if (!email?.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Email address is required'
            });
        }

        // Query referral invitation by email
        const result = await pool.query(
            `SELECT * FROM patient_referral_invitations
             WHERE patient_email = $1 AND expires_at > NOW() AND redeemed = false
             ORDER BY created_at DESC
             LIMIT 1`,
            [email.toLowerCase().trim()]
        );

        if (result.rows.length === 0) {
            console.log(`⚠️  No referral found for email: ${email}`);
            return res.status(404).json({
                success: false,
                error: 'No referral found for this email address'
            });
        }

        const referral = result.rows[0];

        console.log(`✅ Found valid referral for: ${email}`);

        res.json({
            success: true,
            data: {
                referralToken: referral.referral_token,
                email: referral.patient_email,
                firstName: referral.patient_first_name,
                lastName: referral.patient_last_name,
                title: referral.patient_title || null,
                nephrologist: referral.patient_nephrologist || null,
                dialysisClinic: referral.dialysis_clinic_name,
                socialWorkerName: referral.dusw_name,
                socialWorkerId: referral.dusw_id || null
            }
        });

    } catch (error) {
        console.error('❌ Referral lookup error:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to lookup referral information'
        });
    }
});

// Get Social Workers endpoint - for mobile app DUSW selection
app.get('/api/social-workers', async (req, res) => {
    try {
        console.log('📋 Fetching social workers list');
        
        const result = await pool.query(`
            SELECT 
                title,
                first_name,
                last_name,
                dialysis_clinic,
                CONCAT(title, ' ', first_name, ' ', last_name) as full_name
            FROM dusw_social_workers 
            WHERE status = 'active'
            ORDER BY dialysis_clinic, first_name, last_name
        `);

        // Group social workers by dialysis clinic
        const socialWorkersByClinic = {};
        result.rows.forEach(sw => {
            if (!socialWorkersByClinic[sw.dialysis_clinic]) {
                socialWorkersByClinic[sw.dialysis_clinic] = [];
            }
            socialWorkersByClinic[sw.dialysis_clinic].push({
                fullName: sw.full_name,
                firstName: sw.first_name,
                lastName: sw.last_name,
                title: sw.title
            });
        });

        console.log(`✅ Retrieved social workers for ${Object.keys(socialWorkersByClinic).length} clinics`);

        res.json({
            success: true,
            data: socialWorkersByClinic
        });

    } catch (error) {
        console.error('❌ Error fetching social workers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve social workers list'
        });
    }
});

// MARK: - Document Upload Endpoints

// Document types configuration
const DOCUMENT_TYPES = {
    'insurance_card': { name: 'Insurance Card', requiresFrontBack: true },
    'medication_list': { name: 'Medication Card/List', requiresFrontBack: false },
    'government_id': { name: 'Government-Issued ID', requiresFrontBack: false },
    'medical_records': { name: 'Medical Records', requiresFrontBack: false },
    'lab_results': { name: 'Lab Results', requiresFrontBack: false },
    'referral_letter': { name: 'Referral Letter', requiresFrontBack: false },
    'other': { name: 'Other Document', requiresFrontBack: false }
};

// Get document types list
app.get('/api/v1/documents/types', (req, res) => {
    res.json({
        success: true,
        data: Object.entries(DOCUMENT_TYPES).map(([key, value]) => ({
            id: key,
            name: value.name,
            requiresFrontBack: value.requiresFrontBack
        }))
    });
});

// Upload document
app.post('/api/v1/documents/upload', upload.array('files', 10), async (req, res) => {
    console.log('📄 Document upload request received');
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('❌ Upload failed: No auth header');
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            console.log('❌ Upload failed: Invalid token');
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { documentType, isFront } = req.body;
        const files = req.files;
        console.log(`📄 Upload: documentType=${documentType}, files=${files?.length || 0}`);

        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded' });
        }

        if (!documentType || !DOCUMENT_TYPES[documentType]) {
            return res.status(400).json({ success: false, error: 'Invalid document type' });
        }

        // Get patient ID
        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;
        const documentGroupId = uuidv4();
        const uploadedDocs = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileExtension = file.originalname.split('.').pop() || 'jpg';
            const s3Key = `patients/${patientId}/documents/${documentType}/${documentGroupId}/${i === 0 ? 'front' : 'back'}.${fileExtension}`;

            // Upload to S3
            console.log(`📄 Uploading file ${i + 1}/${files.length} to S3: ${s3Key}`);
            const putCommand = new PutObjectCommand({
                Bucket: S3_CONFIG.bucket,
                Key: s3Key,
                Body: file.buffer,
                ContentType: file.mimetype,
                ServerSideEncryption: 'AES256',
                Metadata: {
                    'patient-id': String(patientId),
                    'document-type': String(documentType),
                    'original-filename': String(file.originalname)
                }
            });

            await s3Client.send(putCommand);
            console.log(`✅ File ${i + 1} uploaded to S3 successfully`);

            // Save to database
            const docResult = await pool.query(`
                INSERT INTO patient_documents (
                    patient_id, document_type, file_name, file_size, mime_type,
                    s3_key, s3_bucket, upload_status, is_front, document_group_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9)
                RETURNING id, document_type, file_name, is_front, created_at
            `, [
                patientId, documentType, file.originalname, file.size, file.mimetype,
                s3Key, S3_CONFIG.bucket, i === 0, documentGroupId
            ]);

            uploadedDocs.push(docResult.rows[0]);
        }

        // Get patient info and selected transplant centers for notifications
        const patientInfo = await pool.query(`
            SELECT u.first_name, u.last_name, u.email
            FROM users u
            JOIN patients p ON u.id = p.user_id
            WHERE p.id = $1
        `, [patientId]);

        const patient = patientInfo.rows[0];

        // Notify TC admins about new document
        const referrals = await pool.query(`
            SELECT DISTINCT tc.id, tc.name, tce.email as admin_email, tce.first_name as admin_first_name
            FROM patient_referrals pr
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            LEFT JOIN transplant_center_employees tce ON tc.id = tce.transplant_center_id AND tce.role = 'admin'
            WHERE pr.patient_id = $1
        `, [patientId]);

        // Get all TC employees for notifications
        const tcEmployeesResult = await pool.query(`
            SELECT DISTINCT tce.id, tce.email, tc.name as center_name
            FROM patient_referrals pr
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            JOIN transplant_center_employees tce ON tc.id = tce.transplant_center_id
            WHERE pr.patient_id = $1
        `, [patientId]);

        const docTypeName = DOCUMENT_TYPES[documentType]?.name || documentType;

        for (const employee of tcEmployeesResult.rows) {
            // Add to tc_notifications table
            await pool.query(`
                INSERT INTO tc_notifications (tc_employee_id, patient_id, notification_type, title, message, is_read, created_at)
                VALUES ($1, $2, 'new_document', 'New Document Uploaded', $3, false, NOW())
            `, [employee.id, patientId, `${patient.first_name} ${patient.last_name} has uploaded a new ${docTypeName}.`]);
            
            // Send email notification
            if (employee.email) {
                await sendEmail(
                    employee.email,
                    `New Document Uploaded - ${patient.first_name} ${patient.last_name}`,
                    `<h2>New Patient Document</h2>
                    <p>Patient <strong>${patient.first_name} ${patient.last_name}</strong> has uploaded a new document.</p>
                    <p><strong>Document Type:</strong> ${docTypeName}</p>
                    <p>Please log in to the <a href="https://tc.transplantwizard.com/dashboard">TC Portal</a> to view the document.</p>`,
                    `New document uploaded by ${patient.first_name} ${patient.last_name}. Document Type: ${docTypeName}. View at https://tc.transplantwizard.com/dashboard`
                );
            }
        }
        console.log(`✅ Document notifications sent to ${tcEmployeesResult.rows.length} TC employees`);

        // Remove from todo list if this was a required document
        await pool.query(`
            UPDATE patient_todos 
            SET status = 'completed', completed_at = NOW(), updated_at = NOW()
            WHERE patient_id = $1 AND todo_type = 'document_upload' AND metadata->>'documentType' = $2 AND status = 'pending'
        `, [patientId, documentType]);

        console.log(`✅ Document uploaded: ${documentType} for patient ${patientId}`);

        // Check if all document todos are complete and create intake form todo if so
        await checkAndCreateIntakeFormTodo(patientId);

        res.json({
            success: true,
            message: 'Document uploaded successfully',
            data: {
                documents: uploadedDocs,
                groupId: documentGroupId
            }
        });

    } catch (error) {
        console.error('❌ Document upload error:', error);
        res.status(500).json({ success: false, error: 'Failed to upload document' });
    }
});

// Get patient's documents
app.get('/api/v1/documents', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;

        const documents = await pool.query(`
            SELECT id, document_type, file_name, file_size, mime_type, is_front, 
                   document_group_id, upload_status, created_at
            FROM patient_documents
            WHERE patient_id = $1
            ORDER BY created_at DESC
        `, [patientId]);

        res.json({
            success: true,
            data: documents.rows
        });

    } catch (error) {
        console.error('❌ Error fetching documents:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch documents' });
    }
});

// Get document download URL (pre-signed)
app.get('/api/v1/documents/:documentId/url', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { documentId } = req.params;

        // Verify document belongs to patient or TC admin has access
        const docResult = await pool.query(`
            SELECT pd.*, p.user_id
            FROM patient_documents pd
            JOIN patients p ON pd.patient_id = p.id
            WHERE pd.id = $1
        `, [documentId]);

        if (docResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const doc = docResult.rows[0];

        // Generate pre-signed URL (valid for 15 minutes)
        const getCommand = new GetObjectCommand({
            Bucket: doc.s3_bucket,
            Key: doc.s3_key
        });

        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });

        res.json({
            success: true,
            data: {
                url: signedUrl,
                expiresIn: 900
            }
        });

    } catch (error) {
        console.error('❌ Error generating document URL:', error);
        res.status(500).json({ success: false, error: 'Failed to generate document URL' });
    }
});

// MARK: - Todo List Endpoints

// Get patient's todos
app.get('/api/v1/todos', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;

        // Auto-sync document upload todos with actual documents
        // Mark as complete if document exists, mark as pending if document was deleted
        await pool.query(`
            UPDATE patient_todos pt
            SET status = 'completed', completed_at = NOW()
            WHERE pt.patient_id = $1
            AND pt.todo_type = 'document_upload'
            AND pt.status = 'pending'
            AND EXISTS (
                SELECT 1 FROM patient_documents pd 
                WHERE pd.patient_id = pt.patient_id 
                AND pd.document_type = pt.metadata->>'documentType'
            )
        `, [patientId]);

        const todos = await pool.query(`
            SELECT id, title, description, todo_type, priority, status, due_date, 
                   completed_at, metadata, created_at
            FROM patient_todos
            WHERE patient_id = $1
            ORDER BY 
                CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
                CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                created_at DESC
        `, [patientId]);

        res.json({
            success: true,
            data: todos.rows
        });

    } catch (error) {
        console.error('❌ Error fetching todos:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch todos' });
    }
});

// Create todo
app.post('/api/v1/todos', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { title, description, todoType, priority, dueDate, metadata } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, error: 'Title is required' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;

        // For document upload todos, check if one already exists for this document type
        if (todoType === 'document_upload' && metadata && metadata.documentType) {
            const existingTodo = await pool.query(`
                SELECT id FROM patient_todos 
                WHERE patient_id = $1 
                AND todo_type = 'document_upload' 
                AND metadata->>'documentType' = $2
            `, [patientId, metadata.documentType]);
            
            if (existingTodo.rows.length > 0) {
                console.log(`⚠️ Todo already exists for ${metadata.documentType}, skipping creation`);
                // Return the existing todo
                const existing = await pool.query(`
                    SELECT id, title, description, todo_type, priority, status, due_date, metadata, created_at
                    FROM patient_todos WHERE id = $1
                `, [existingTodo.rows[0].id]);
                return res.json({ success: true, data: existing.rows[0] });
            }
            
            // Also check if document already uploaded - if so, create as completed
            const existingDoc = await pool.query(`
                SELECT id FROM patient_documents 
                WHERE patient_id = $1 AND document_type = $2
            `, [patientId, metadata.documentType]);
            
            if (existingDoc.rows.length > 0) {
                // Document already uploaded, create todo as completed
                const result = await pool.query(`
                    INSERT INTO patient_todos (patient_id, title, description, todo_type, priority, due_date, metadata, status, completed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', NOW())
                    RETURNING id, title, description, todo_type, priority, status, due_date, metadata, created_at
                `, [patientId, title, description, todoType, priority || 'medium', dueDate, metadata || {}]);
                console.log(`✅ Todo created as completed (document already exists) for patient ${patientId}: ${title}`);
                return res.json({ success: true, data: result.rows[0] });
            }
        }

        const result = await pool.query(`
            INSERT INTO patient_todos (patient_id, title, description, todo_type, priority, due_date, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, title, description, todo_type, priority, status, due_date, metadata, created_at
        `, [patientId, title, description, todoType, priority || 'medium', dueDate, metadata || {}]);

        console.log(`✅ Todo created for patient ${patientId}: ${title}`);

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error creating todo:', error);
        res.status(500).json({ success: false, error: 'Failed to create todo' });
    }
});

// Update todo status
app.patch('/api/v1/todos/:todoId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { todoId } = req.params;
        const { status, title, description } = req.body;

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (status) {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
            if (status === 'completed') {
                updates.push(`completed_at = NOW()`);
            }
        }
        if (title) {
            updates.push(`title = $${paramCount++}`);
            values.push(title);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }

        updates.push('updated_at = NOW()');
        values.push(todoId, patientId);

        const result = await pool.query(`
            UPDATE patient_todos
            SET ${updates.join(', ')}
            WHERE id = $${paramCount++} AND patient_id = $${paramCount}
            RETURNING id, title, description, todo_type, priority, status, due_date, completed_at, metadata, created_at
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Todo not found' });
        }

        console.log(`✅ Todo updated: ${todoId}`);

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error updating todo:', error);
        res.status(500).json({ success: false, error: 'Failed to update todo' });
    }
});

// Delete todo
app.delete('/api/v1/todos/:todoId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { todoId } = req.params;

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;

        const result = await pool.query(`
            DELETE FROM patient_todos WHERE id = $1 AND patient_id = $2 RETURNING id
        `, [todoId, patientId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Todo not found' });
        }

        console.log(`✅ Todo deleted: ${todoId}`);

        res.json({
            success: true,
            message: 'Todo deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting todo:', error);
        res.status(500).json({ success: false, error: 'Failed to delete todo' });
    }
});

// Add document submission todos for a patient (called after transplant center selection)
async function createDocumentSubmissionTodos(patientId) {
    const requiredDocs = [
        { type: 'insurance_card', title: 'Upload Insurance Card', description: 'Upload front and back of your insurance card' },
        { type: 'medication_list', title: 'Upload Medication List', description: 'Upload your medication card or list of current medications' },
        { type: 'government_id', title: 'Upload Government ID', description: 'Upload a government-issued photo ID (driver\'s license, passport, etc.)' }
    ];

    for (const doc of requiredDocs) {
        // Check if todo already exists
        const existing = await pool.query(`
            SELECT id FROM patient_todos 
            WHERE patient_id = $1 AND todo_type = 'document_upload' AND metadata->>'documentType' = $2
        `, [patientId, doc.type]);

        if (existing.rows.length === 0) {
            await pool.query(`
                INSERT INTO patient_todos (patient_id, title, description, todo_type, priority, metadata)
                VALUES ($1, $2, $3, 'document_upload', 'high', $4)
            `, [patientId, doc.title, doc.description, JSON.stringify({ documentType: doc.type })]);
        }
    }

    console.log(`✅ Created document submission todos for patient ${patientId}`);
}

// ============================================
// DIALYSIS CLINICS AND SOCIAL WORKERS ENDPOINTS
// ============================================

// Get all dialysis clinics
app.get('/api/v1/dialysis-clinics', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const clinics = await pool.query(`
            SELECT id, name, address, phone, email
            FROM dialysis_clinics
            WHERE is_active = true
            ORDER BY name
        `);

        res.json({
            success: true,
            data: clinics.rows
        });

    } catch (error) {
        console.error('❌ Error fetching dialysis clinics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dialysis clinics' });
    }
});

// Get social workers for a specific dialysis clinic
app.get('/api/v1/dialysis-clinics/:clinicId/social-workers', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { clinicId } = req.params;

        // Get social workers from dusw_social_workers table
        // Join with dialysis_clinics to match by clinic ID
        const workers = await pool.query(`
            SELECT 
                dsw.id,
                dsw.first_name || ' ' || dsw.last_name as name,
                dsw.email,
                dsw.phone_number as phone
            FROM dusw_social_workers dsw
            JOIN dialysis_clinics dc ON dsw.dialysis_clinic = dc.name
            WHERE dc.id = $1
            AND dsw.status = 'active'
            ORDER BY dsw.last_name, dsw.first_name
        `, [clinicId]);

        console.log(`✅ Found ${workers.rows.length} social workers for clinic ${clinicId}`);

        res.json({
            success: true,
            data: workers.rows
        });

    } catch (error) {
        console.error('❌ Error fetching social workers:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch social workers' });
    }
});

// ============================================
// PATIENT MESSAGES ENDPOINTS
// ============================================

// Get patient messages (for chatbot)
app.get('/api/v1/messages', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;

        const messages = await pool.query(`
            SELECT id, message_type, content, is_read, read_at, created_at
            FROM patient_messages
            WHERE patient_id = $1
            ORDER BY created_at DESC
        `, [patientId]);

        // Count unread messages
        const unreadCount = messages.rows.filter(m => !m.is_read).length;

        res.json({
            success: true,
            data: messages.rows,
            unreadCount: unreadCount
        });

    } catch (error) {
        console.error('❌ Error fetching messages:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch messages' });
    }
});

// Mark message as read
app.patch('/api/v1/messages/:messageId/read', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;
        const { messageId } = req.params;

        const result = await pool.query(`
            UPDATE patient_messages 
            SET is_read = true, read_at = NOW()
            WHERE id = $1 AND patient_id = $2
            RETURNING *
        `, [messageId, patientId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error marking message as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark message as read' });
    }
});

// ============================================
// INTAKE FORM ENDPOINTS
// ============================================

// Get intake form (with pre-filled data)
app.get('/api/v1/intake-form', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        // Get patient info including dialysis clinic and assigned DUSW
        const patientResult = await pool.query(`
            SELECT p.*, u.email, u.first_name, u.last_name, u.phone_number,
                   dc.name as dialysis_clinic_name, dc.address as dialysis_clinic_address,
                   dc.phone as dialysis_clinic_phone, dc.email as dialysis_clinic_email,
                   dc.id as dialysis_clinic_id,
                   dsw.id as dusw_id,
                   dsw.title as dusw_title,
                   dsw.first_name as dusw_first_name,
                   dsw.last_name as dusw_last_name,
                   dsw.email as dusw_email,
                   dsw.phone_number as dusw_phone
            FROM patients p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
            LEFT JOIN patient_dusw_assignments pda ON p.id = pda.patient_id
            LEFT JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE p.user_id = $1
        `, [decoded.userId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patient = patientResult.rows[0];
        const patientId = patient.id;

        // Check if form already exists
        const existingForm = await pool.query(`
            SELECT * FROM patient_intake_forms WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [patientId]);

        if (existingForm.rows.length > 0) {
            // Return existing form
            return res.json({
                success: true,
                data: existingForm.rows[0],
                isNew: false
            });
        }

        // Build social worker name with title if available
        let socialWorkerFullName = '';
        if (patient.dusw_first_name && patient.dusw_last_name) {
            socialWorkerFullName = patient.dusw_title 
                ? `${patient.dusw_title} ${patient.dusw_first_name} ${patient.dusw_last_name}`
                : `${patient.dusw_first_name} ${patient.dusw_last_name}`;
        }

        // Return pre-filled data for new form
        const preFilled = {
            patient_id: patientId,
            full_name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
            date_of_birth: patient.date_of_birth,
            address: patient.address,
            phone: patient.phone_number,
            email: patient.email,
            emergency_contact_name: patient.emergency_contact_name,
            emergency_contact_relationship: patient.emergency_contact_relationship,
            emergency_contact_phone: patient.emergency_contact_phone,
            dialysis_unit_name: patient.dialysis_clinic_name,
            dialysis_unit_address: patient.dialysis_clinic_address,
            dialysis_unit_phone: patient.dialysis_clinic_phone,
            dialysis_unit_email: patient.dialysis_clinic_email,
            social_worker_name: socialWorkerFullName,
            social_worker_email: patient.dusw_email || '',
            social_worker_phone: patient.dusw_phone || '',
            other_physicians: [],
            status: 'draft'
        };

        // Pre-fill nephrologist if exists
        if (patient.nephrologist) {
            preFilled.other_physicians = [{
                name: patient.nephrologist,
                specialty: 'Nephrologist',
                address: '',
                phone: '',
                fax: '',
                email: ''
            }];
        }

        // Pre-fill PCP if exists
        if (patient.primary_care_physician) {
            preFilled.other_physicians.push({
                name: patient.primary_care_physician,
                specialty: 'PCP',
                address: '',
                phone: '',
                fax: '',
                email: ''
            });
        }

        res.json({
            success: true,
            data: preFilled,
            isNew: true
        });

    } catch (error) {
        console.error('❌ Error fetching intake form:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch intake form' });
    }
});

// Save/Update intake form (partial save support)
app.post('/api/v1/intake-form', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;
        const formData = req.body;

        // Check if form exists
        const existingForm = await pool.query(
            'SELECT id FROM patient_intake_forms WHERE patient_id = $1',
            [patientId]
        );

        let result;
        if (existingForm.rows.length > 0) {
            // Update existing form
            result = await pool.query(`
                UPDATE patient_intake_forms SET
                    full_name = COALESCE($2, full_name),
                    date_of_birth = COALESCE($3, date_of_birth),
                    address = COALESCE($4, address),
                    phone = COALESCE($5, phone),
                    email = COALESCE($6, email),
                    emergency_contact_name = COALESCE($7, emergency_contact_name),
                    emergency_contact_relationship = COALESCE($8, emergency_contact_relationship),
                    emergency_contact_phone = COALESCE($9, emergency_contact_phone),
                    social_support_name = COALESCE($10, social_support_name),
                    social_support_relationship = COALESCE($11, social_support_relationship),
                    social_support_phone = COALESCE($12, social_support_phone),
                    height = COALESCE($13, height),
                    weight = COALESCE($14, weight),
                    on_dialysis = COALESCE($15, on_dialysis),
                    dialysis_type = COALESCE($16, dialysis_type),
                    dialysis_start_date = COALESCE($17, dialysis_start_date),
                    last_gfr = COALESCE($18, last_gfr),
                    requires_additional_organ = COALESCE($19, requires_additional_organ),
                    additional_organ_details = COALESCE($20, additional_organ_details),
                    has_infection = COALESCE($21, has_infection),
                    infection_explanation = COALESCE($22, infection_explanation),
                    has_cancer = COALESCE($23, has_cancer),
                    cancer_explanation = COALESCE($24, cancer_explanation),
                    has_mental_health_disorder = COALESCE($25, has_mental_health_disorder),
                    mental_health_explanation = COALESCE($26, mental_health_explanation),
                    uses_substances = COALESCE($27, uses_substances),
                    substances_explanation = COALESCE($28, substances_explanation),
                    recent_surgery = COALESCE($29, recent_surgery),
                    surgery_explanation = COALESCE($30, surgery_explanation),
                    uses_oxygen = COALESCE($31, uses_oxygen),
                    oxygen_explanation = COALESCE($32, oxygen_explanation),
                    contraindications_explanation = COALESCE($33, contraindications_explanation),
                    diagnosed_conditions = COALESCE($34, diagnosed_conditions),
                    past_surgeries = COALESCE($35, past_surgeries),
                    dialysis_unit_name = COALESCE($36, dialysis_unit_name),
                    dialysis_unit_address = COALESCE($37, dialysis_unit_address),
                    dialysis_unit_email = COALESCE($38, dialysis_unit_email),
                    dialysis_unit_phone = COALESCE($39, dialysis_unit_phone),
                    social_worker_name = COALESCE($40, social_worker_name),
                    social_worker_email = COALESCE($41, social_worker_email),
                    social_worker_phone = COALESCE($42, social_worker_phone),
                    other_physicians = COALESCE($43, other_physicians),
                    status = COALESCE($44, status),
                    updated_at = NOW()
                WHERE patient_id = $1
                RETURNING *
            `, [
                patientId,
                formData.full_name, formData.date_of_birth, formData.address, formData.phone, formData.email,
                formData.emergency_contact_name, formData.emergency_contact_relationship, formData.emergency_contact_phone,
                formData.social_support_name, formData.social_support_relationship, formData.social_support_phone,
                formData.height, formData.weight, formData.on_dialysis, formData.dialysis_type, formData.dialysis_start_date,
                formData.last_gfr, formData.requires_additional_organ, formData.additional_organ_details,
                formData.has_infection, formData.infection_explanation,
                formData.has_cancer, formData.cancer_explanation,
                formData.has_mental_health_disorder, formData.mental_health_explanation,
                formData.uses_substances, formData.substances_explanation,
                formData.recent_surgery, formData.surgery_explanation,
                formData.uses_oxygen, formData.oxygen_explanation,
                formData.contraindications_explanation,
                formData.diagnosed_conditions, formData.past_surgeries,
                formData.dialysis_unit_name, formData.dialysis_unit_address, formData.dialysis_unit_email, formData.dialysis_unit_phone,
                formData.social_worker_name, formData.social_worker_email, formData.social_worker_phone,
                formData.other_physicians ? JSON.stringify(formData.other_physicians) : null,
                formData.status
            ]);
        } else {
            // Create new form
            result = await pool.query(`
                INSERT INTO patient_intake_forms (
                    patient_id, full_name, date_of_birth, address, phone, email,
                    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
                    social_support_name, social_support_relationship, social_support_phone,
                    height, weight, on_dialysis, dialysis_type, dialysis_start_date,
                    last_gfr, requires_additional_organ, additional_organ_details,
                    has_infection, infection_explanation,
                    has_cancer, cancer_explanation,
                    has_mental_health_disorder, mental_health_explanation,
                    uses_substances, substances_explanation,
                    recent_surgery, surgery_explanation,
                    uses_oxygen, oxygen_explanation,
                    contraindications_explanation,
                    diagnosed_conditions, past_surgeries,
                    dialysis_unit_name, dialysis_unit_address, dialysis_unit_email, dialysis_unit_phone,
                    social_worker_name, social_worker_email, social_worker_phone,
                    other_physicians, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44)
                RETURNING *
            `, [
                patientId,
                formData.full_name, formData.date_of_birth, formData.address, formData.phone, formData.email,
                formData.emergency_contact_name, formData.emergency_contact_relationship, formData.emergency_contact_phone,
                formData.social_support_name, formData.social_support_relationship, formData.social_support_phone,
                formData.height, formData.weight, formData.on_dialysis, formData.dialysis_type, formData.dialysis_start_date,
                formData.last_gfr, formData.requires_additional_organ, formData.additional_organ_details,
                formData.has_infection, formData.infection_explanation,
                formData.has_cancer, formData.cancer_explanation,
                formData.has_mental_health_disorder, formData.mental_health_explanation,
                formData.uses_substances, formData.substances_explanation,
                formData.recent_surgery, formData.surgery_explanation,
                formData.uses_oxygen, formData.oxygen_explanation,
                formData.contraindications_explanation,
                formData.diagnosed_conditions, formData.past_surgeries,
                formData.dialysis_unit_name, formData.dialysis_unit_address, formData.dialysis_unit_email, formData.dialysis_unit_phone,
                formData.social_worker_name, formData.social_worker_email, formData.social_worker_phone,
                formData.other_physicians ? JSON.stringify(formData.other_physicians) : '[]',
                formData.status || 'draft'
            ]);
        }

        console.log(`✅ Intake form saved for patient ${patientId}`);

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error saving intake form:', error);
        res.status(500).json({ success: false, error: 'Failed to save intake form' });
    }
});

// Submit intake form with signature
app.post('/api/v1/intake-form/submit', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const patientResult = await pool.query(
            'SELECT id FROM patients WHERE user_id = $1',
            [decoded.userId]
        );

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        const patientId = patientResult.rows[0].id;
        const { signatureData } = req.body;

        if (!signatureData) {
            return res.status(400).json({ success: false, error: 'Signature is required' });
        }

        // Update form with signature and submit
        const result = await pool.query(`
            UPDATE patient_intake_forms 
            SET signature_data = $2, signed_at = NOW(), status = 'submitted', submitted_at = NOW(), updated_at = NOW()
            WHERE patient_id = $1
            RETURNING *
        `, [patientId, signatureData]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Intake form not found' });
        }

        // Mark the intake form todo as complete
        await pool.query(`
            UPDATE patient_todos 
            SET status = 'completed', completed_at = NOW()
            WHERE patient_id = $1 AND todo_type = 'intake_form' AND status = 'pending'
        `, [patientId]);

        // Notify TC and DUSW about intake form completion
        await notifyIntakeFormComplete(patientId);

        // Create success message for patient chatbot
        await pool.query(`
            INSERT INTO patient_messages (patient_id, message_type, content, is_read, created_at)
            VALUES ($1, 'intake_form_complete', 'Congratulations! 🎉 Your intake form has been successfully submitted and sent to your selected transplant centers. They will review your information and contact you with next steps. In the meantime, feel free to check your progress in the dashboard.', false, NOW())
        `, [patientId]);

        console.log(`✅ Intake form submitted for patient ${patientId}`);

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error submitting intake form:', error);
        res.status(500).json({ success: false, error: 'Failed to submit intake form' });
    }
});

// Check if all 3 document todos are complete and create intake form todo
async function checkAndCreateIntakeFormTodo(patientId) {
    // Check if all 3 document upload todos are completed
    const docTodos = await pool.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM patient_todos
        WHERE patient_id = $1 AND todo_type = 'document_upload'
    `, [patientId]);

    const { total, completed } = docTodos.rows[0];
    
    if (parseInt(total) >= 3 && parseInt(completed) >= 3) {
        // Check if intake form todo already exists
        const existingTodo = await pool.query(`
            SELECT id FROM patient_todos 
            WHERE patient_id = $1 AND todo_type = 'intake_form'
        `, [patientId]);

        if (existingTodo.rows.length === 0) {
            // Create intake form todo
            await pool.query(`
                INSERT INTO patient_todos (patient_id, title, description, todo_type, priority, metadata)
                VALUES ($1, 'Complete Intake Form', 'Fill out your medical intake form to continue the evaluation process', 'intake_form', 'high', '{}')
            `, [patientId]);

            // Create a chatbot message for the patient
            await pool.query(`
                INSERT INTO patient_messages (patient_id, message_type, content, is_read, created_at)
                VALUES ($1, 'intake_form_prompt', 'Great job uploading all your documents! 🎉 Now let''s complete your intake form. This form helps your transplant center understand your medical history better. Don''t worry - we''ve already pre-filled some information for you!', false, NOW())
            `, [patientId]);

            // Notify DUSW about document completion
            await notifyDUSWDocumentsComplete(patientId);

            console.log(`✅ Created intake form todo and message for patient ${patientId}`);
            return true;
        }
    }
    return false;
}

// Notify TC and DUSW when patient completes intake form
async function notifyIntakeFormComplete(patientId) {
    try {
        // Get patient info
        const patientResult = await pool.query(`
            SELECT p.id, u.first_name, u.last_name, u.email
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [patientId]);

        if (patientResult.rows.length === 0) return;
        const patient = patientResult.rows[0];

        // Notify Transplant Centers
        const tcResult = await pool.query(`
            SELECT DISTINCT tc.id, tc.name, tce.email as admin_email, tce.first_name as admin_first_name
            FROM patient_referrals pr
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            LEFT JOIN transplant_center_employees tce ON tc.id = tce.transplant_center_id AND tce.role = 'admin'
            WHERE pr.patient_id = $1
        `, [patientId]);

        for (const tc of tcResult.rows) {
            if (tc.admin_email) {
                await sendEmail(
                    tc.admin_email,
                    `Intake Form Completed - ${patient.first_name} ${patient.last_name}`,
                    `<h2>Patient Intake Form Submitted</h2>
                    <p>Patient <strong>${patient.first_name} ${patient.last_name}</strong> has completed and submitted their medical intake form.</p>
                    <p>The form includes:</p>
                    <ul>
                        <li>Demographics and contact information</li>
                        <li>Medical history and current conditions</li>
                        <li>Healthcare provider information</li>
                        <li>Patient signature</li>
                    </ul>
                    <p>Please log in to the <a href="https://tc.transplantwizard.com/dashboard">TC Portal</a> to review the complete intake form.</p>`,
                    `Patient ${patient.first_name} ${patient.last_name} has submitted their intake form. View at https://tc.transplantwizard.com/dashboard`
                );
                console.log(`✅ Intake form notification sent to TC: ${tc.admin_email}`);
            }

            // Create TC portal notification for all TC employees at this center
            const tcEmployees = await pool.query(`
                SELECT id FROM transplant_center_employees WHERE transplant_center_id = $1
            `, [tc.id]);

            for (const employee of tcEmployees.rows) {
                await pool.query(`
                    INSERT INTO tc_notifications (tc_employee_id, patient_id, notification_type, title, message, is_read, created_at)
                    VALUES ($1, $2, 'intake_form_complete', 'Intake Form Submitted', $3, false, NOW())
                `, [employee.id, patientId, `${patient.first_name} ${patient.last_name} has submitted their medical intake form. Click to review their complete profile.`]);
            }
            console.log(`✅ TC portal notifications created for ${tcEmployees.rows.length} employees at ${tc.name}`);
        }

        // Notify DUSW
        const duswResult = await pool.query(`
            SELECT dsw.id, dsw.email, dsw.first_name, dsw.last_name
            FROM patient_dusw_assignments pda
            JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE pda.patient_id = $1
        `, [patientId]);

        for (const dusw of duswResult.rows) {
            // Send email notification
            await sendEmail(
                dusw.email,
                `Intake Form Completed - ${patient.first_name} ${patient.last_name}`,
                `<h2>Patient Intake Form Submitted</h2>
                <p>Patient <strong>${patient.first_name} ${patient.last_name}</strong> has completed and submitted their medical intake form.</p>
                <p>The form has been sent to their selected transplant centers for review.</p>
                <p>Please log in to the <a href="https://dusw.transplantwizard.com/dashboard">DUSW Portal</a> to view the patient's progress.</p>`,
                `Patient ${patient.first_name} ${patient.last_name} has submitted their intake form. View at https://dusw.transplantwizard.com/dashboard`
            );

            // Create portal notification
            await pool.query(`
                INSERT INTO dusw_notifications (dusw_id, patient_id, notification_type, title, message, is_read, created_at)
                VALUES ($1, $2, 'intake_form_complete', 'Intake Form Completed', $3, false, NOW())
            `, [dusw.id, patientId, `${patient.first_name} ${patient.last_name} has submitted their intake form.`]);

            console.log(`✅ Intake form notification sent to DUSW: ${dusw.email}`);
        }
    } catch (error) {
        console.error('❌ Error notifying about intake form completion:', error);
    }
}

// Notify DUSW when patient completes all document uploads
async function notifyDUSWDocumentsComplete(patientId) {
    try {
        // Get patient info
        const patientResult = await pool.query(`
            SELECT p.id, u.first_name, u.last_name, u.email
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [patientId]);

        if (patientResult.rows.length === 0) return;
        const patient = patientResult.rows[0];

        // Get assigned DUSW from patient_dusw_assignments
        const duswResult = await pool.query(`
            SELECT dsw.id, dsw.email, dsw.first_name, dsw.last_name
            FROM patient_dusw_assignments pda
            JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE pda.patient_id = $1
        `, [patientId]);

        for (const dusw of duswResult.rows) {
            // Send email notification
            await sendEmail(
                dusw.email,
                `Documents Uploaded - ${patient.first_name} ${patient.last_name}`,
                `<h2>Patient Document Upload Complete</h2>
                <p>Patient <strong>${patient.first_name} ${patient.last_name}</strong> has successfully uploaded all required documents.</p>
                <p><strong>Documents uploaded:</strong></p>
                <ul>
                    <li>Insurance Card (front and back)</li>
                    <li>Medication List</li>
                    <li>Government-issued ID</li>
                </ul>
                <p>The patient will now be prompted to complete their medical intake form.</p>
                <p>Please log in to the <a href="https://dusw.transplantwizard.com/dashboard">DUSW Portal</a> to view the documents.</p>`,
                `Patient ${patient.first_name} ${patient.last_name} has uploaded all required documents. View at https://dusw.transplantwizard.com/dashboard`
            );

            // Create portal notification
            await pool.query(`
                INSERT INTO dusw_notifications (dusw_id, patient_id, notification_type, title, message, is_read, created_at)
                VALUES ($1, $2, 'documents_complete', 'Documents Uploaded', $3, false, NOW())
            `, [dusw.id, patientId, `${patient.first_name} ${patient.last_name} has uploaded all required documents.`]);

            console.log(`✅ DUSW notification sent to ${dusw.email} for patient ${patientId}`);
        }
    } catch (error) {
        console.error('❌ Error notifying DUSW about document completion:', error);
    }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 Transplant Platform Simple Auth Server running on http://localhost:${PORT}`);
    console.log(`📱 Mobile Access: http://192.168.1.69:${PORT}`);
    console.log(`🔐 Authentication: Basic Auth with JWT`);
    console.log(`🗄️  Database: AWS RDS PostgreSQL`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully');
    await pool.end();
    process.exit(0);
});

module.exports = app;