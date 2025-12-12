// Simple Basic Authentication server using existing database schema
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

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

        // Build links for app and web
        // App deep link: Opens the app directly on iOS (no browser prompt)
        const appDeepLink = `app://register?referralToken=${referralToken}`;
        // Web link: Falls back if app isn't installed
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
                <a href="${appDeepLink}" class="cta-button" style="display: inline-block; text-decoration: none;">📱 Open Transplant Wizard App</a>
                <p style="font-size: 12px; color: #999; margin-top: 20px; line-height: 1.6;">
                    <strong>iPhone Users:</strong> Tap the button above to open the app directly. If you don't have the app yet, please install it first from TestFlight.<br>
                    <strong>Web Users:</strong> <a href="${referralLink}" style="color: #667eea; text-decoration: underline;">Click here to register on web</a>
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
        
        // Get ROI status and transplant centers count with retry logic
        const statusResult = await queryWithRetry(`
            SELECT 
                (SELECT MAX(signed_at) FROM roi_consents WHERE patient_id = p.id) as roi_signed_at,
                COUNT(pr.id) as referral_count
            FROM patients p
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            WHERE p.id = $1
            GROUP BY p.id
        `, [user.patient_id]);

        const status = statusResult.rows[0] || {};
        const roiSigned = !!status.roi_signed_at;
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
                    createdAt: user.user_created_at
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

        // Clear existing referrals for this patient
        await pool.query('DELETE FROM patient_referrals WHERE patient_id = $1', [patientId]);

        // Insert new referrals
        const referralPromises = transplantCenterIds.map(centerId => 
            pool.query(`
                INSERT INTO patient_referrals (
                    patient_id, transplant_center_id, status, submitted_at, created_at
                ) VALUES ($1, $2, 'submitted', NOW(), NOW())
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