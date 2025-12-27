// DUSW Website Server - Dialysis Unit Social Worker Portal
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const DOMAIN = process.env.DOMAIN || 'localhost';

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

// AWS S3 Client for document storage
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1'
});

const S3_CONFIG = {
    bucket: process.env.S3_DOCUMENTS_BUCKET || 'transplant-wizard-patient-documents',
    region: process.env.AWS_REGION || 'us-east-1'
};

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

// Document type mapping for DUSW uploads
const DUSW_DOCUMENT_TYPES = {
    'current_labs': 'One week of current labs',
    'medicare_2728': 'Medicare 2728 form',
    'medication_list': 'Medication list',
    'immunization_record': 'Immunization record',
    'social_work_summary': 'Social work summary',
    'dietitian_summary': 'Dietitian summary',
    'care_plan_notes': 'Recent care plan or progress notes',
    'dialysis_shift': 'Hemodialysis/Peritoneal Shift'
};

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
                console.log(`⚠️  Database connection attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // If not a connection error or max retries reached, throw the error
            throw error;
        }
    }
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.transplantwizard.com"],
        },
    }
}));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Utility functions
async function hashPassword(password) {
    return await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
}

async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

function generateToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { 
        expiresIn: '24h',
        issuer: 'dusw-portal'
    });
}

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Middleware to load notifications for header on all authenticated pages
async function loadNotifications(req, res, next) {
    if (req.session.user) {
        try {
            const duswNotifications = await queryWithRetry(`
                SELECT 
                    dn.id,
                    dn.notification_type,
                    dn.title,
                    dn.message,
                    dn.is_read,
                    dn.created_at,
                    u.first_name as patient_first_name,
                    u.last_name as patient_last_name
                FROM dusw_notifications dn
                LEFT JOIN patients p ON dn.patient_id = p.id
                LEFT JOIN users u ON p.user_id = u.id
                WHERE dn.dusw_id = $1
                ORDER BY dn.created_at DESC
                LIMIT 20
            `, [req.session.user.id]);
            
            res.locals.duswNotifications = duswNotifications.rows;
            res.locals.unreadNotificationCount = duswNotifications.rows.filter(n => !n.is_read).length;
        } catch (error) {
            console.error('Error loading notifications:', error);
            res.locals.duswNotifications = [];
            res.locals.unreadNotificationCount = 0;
        }
    }
    next();
}

// Apply notification loading to all routes
app.use(loadNotifications);

// Routes

// Home page (public)
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('index', { title: 'DUSW Portal - Transplant Platform' });
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { title: 'Login - DUSW Portal', error: null });
});

// Registration page
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { title: 'Register - DUSW Portal', error: null });
});

// Dashboard (protected)
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const duswId = req.session.user.id;
        
        // Get all patients for this DUSW with their referral info
        const patients = await queryWithRetry(`
            SELECT 
                u.first_name,
                u.last_name, 
                u.email,
                u.phone_number,
                u.created_at,
                p.id as patient_id,
                p.date_of_birth,
                pda.dialysis_clinic,
                pda.social_worker_name,
                COUNT(pr.id) as referral_count
            FROM patient_dusw_assignments pda
            JOIN patients p ON pda.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            WHERE pda.dusw_social_worker_id = $1
            GROUP BY u.first_name, u.last_name, u.email, u.phone_number, u.created_at, p.id, p.date_of_birth, pda.dialysis_clinic, pda.social_worker_name
            ORDER BY u.created_at DESC
        `, [duswId]);

        // Calculate stats
        const totalPatients = patients.rows.length;
        const patientsWithTC = patients.rows.filter(p => parseInt(p.referral_count) > 0).length;
        const tcSelectionPercent = totalPatients > 0 ? Math.round((patientsWithTC / totalPatients) * 100) : 0;
        
        // Get status breakdown for pie chart
        const statusBreakdown = await queryWithRetry(`
            SELECT 
                pr.status,
                COUNT(DISTINCT pr.patient_id) as count
            FROM patient_referrals pr
            JOIN patient_dusw_assignments pda ON pr.patient_id = pda.patient_id
            WHERE pda.dusw_social_worker_id = $1
            GROUP BY pr.status
        `, [duswId]);
        
        const statusCounts = {
            applied: 0,
            under_review: 0,
            accepted: 0,
            waitlisted: 0,
            declined: 0,
            no_selection: totalPatients - patientsWithTC
        };
        statusBreakdown.rows.forEach(row => {
            if (statusCounts.hasOwnProperty(row.status)) {
                statusCounts[row.status] = parseInt(row.count);
            }
        });

        // Get actual notifications from dusw_notifications table
        const duswNotifications = await queryWithRetry(`
            SELECT 
                dn.id,
                dn.notification_type,
                dn.title,
                dn.message,
                dn.is_read,
                dn.created_at,
                dn.patient_id,
                u.first_name as patient_first_name,
                u.last_name as patient_last_name
            FROM dusw_notifications dn
            LEFT JOIN patients p ON dn.patient_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE dn.dusw_id = $1
            ORDER BY dn.created_at DESC
            LIMIT 20
        `, [duswId]);

        const unreadCount = duswNotifications.rows.filter(n => !n.is_read).length;

        res.render('dashboard', {
            title: 'Dashboard - DUSW Portal',
            user: req.session.user,
            patients: patients.rows,
            duswNotifications: duswNotifications.rows,
            unreadNotificationCount: unreadCount,
            stats: {
                totalPatients,
                patientsWithTC,
                tcSelectionPercent,
                statusCounts
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', {
            title: 'Dashboard - DUSW Portal',
            user: req.session.user,
            patients: [],
            duswNotifications: [],
            unreadNotificationCount: 0,
            stats: { totalPatients: 0, patientsWithTC: 0, tcSelectionPercent: 0, statusCounts: { applied: 0, under_review: 0, accepted: 0, waitlisted: 0, declined: 0, no_selection: 0 } }
        });
    }
});

// Registration POST
app.post('/register', async (req, res) => {
    try {
        const { title, firstName, lastName, phoneNumber, email, password, dialysisClinic } = req.body;

        // Validation
        if (!title || !firstName || !lastName || !phoneNumber || !email || !password || !dialysisClinic) {
            return res.render('register', {
                title: 'Register - DUSW Portal',
                error: 'All fields are required'
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM dusw_social_workers WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.render('register', {
                title: 'Register - DUSW Portal',
                error: 'An account with this email already exists'
            });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create social worker account
        const result = await pool.query(`
            INSERT INTO dusw_social_workers (
                title, first_name, last_name, phone_number, email, password_hash, 
                dialysis_clinic, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())
            RETURNING id, email, first_name, last_name
        `, [title, firstName.trim(), lastName.trim(), phoneNumber, email.toLowerCase(), passwordHash, dialysisClinic]);

        console.log(`✅ DUSW registration successful: ${result.rows[0].email}`);

        // Redirect to login
        res.redirect('/login?registered=true');

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.render('register', {
            title: 'Register - DUSW Portal',
            error: 'Registration failed. Please try again.'
        });
    }
});

// Login POST
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('login', {
                title: 'Login - DUSW Portal',
                error: 'Email and password are required'
            });
        }

        // Get social worker account with retry logic
        const result = await queryWithRetry(`
            SELECT id, title, first_name, last_name, email, password_hash, 
                   dialysis_clinic, phone_number, status
            FROM dusw_social_workers
            WHERE email = $1 AND status = 'active'
        `, [email.toLowerCase()]);

        if (result.rows.length === 0) {
            return res.render('login', {
                title: 'Login - DUSW Portal',
                error: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Verify password
        const passwordValid = await verifyPassword(password, user.password_hash);
        if (!passwordValid) {
            return res.render('login', {
                title: 'Login - DUSW Portal',
                error: 'Invalid email or password'
            });
        }

        // Get the first available dialysis clinic ID
        const clinicResult = await queryWithRetry(`
            SELECT id FROM dialysis_clinics LIMIT 1
        `, []);

        const clinicId = clinicResult.rows.length > 0 ? clinicResult.rows[0].id : null;

        // Set session
        req.session.user = {
            id: user.id,
            title: user.title,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phoneNumber: user.phone_number,
            dialysisClinic: user.dialysis_clinic,
            dialysisClinicId: clinicId // Use actual clinic UUID from database
        };

        console.log(`✅ DUSW login successful: ${user.email}`);

        res.redirect('/dashboard');

    } catch (error) {
        console.error('❌ Login error:', error);
        res.render('login', {
            title: 'Login - DUSW Portal',
            error: 'Login failed. Please try again.'
        });
    }
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Patients page
app.get('/patients', requireAuth, async (req, res) => {
    try {
        const duswId = req.session.user.id;
        
        // Get registered patients with their stage info
        const patients = await pool.query(`
            SELECT 
                p.id as patient_id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone_number,
                p.date_of_birth,
                u.created_at,
                pda.dialysis_clinic,
                pda.social_worker_name,
                p.profile_completed,
                p.onboarding_completed,
                COUNT(DISTINCT pr.id) as referral_count,
                COUNT(DISTINCT pd.id) as document_count,
                (SELECT COUNT(*) FROM patient_consents pc WHERE pc.patient_id = p.id) as consent_count,
                COALESCE(
                    (SELECT MAX(pr2.status::text) FROM patient_referrals pr2 WHERE pr2.patient_id = p.id),
                    'none'
                ) as tc_status
            FROM patient_dusw_assignments pda
            JOIN patients p ON pda.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            LEFT JOIN patient_documents pd ON p.id = pd.patient_id
            WHERE pda.dusw_social_worker_id = $1
            GROUP BY p.id, u.first_name, u.last_name, u.email, u.phone_number, p.date_of_birth, u.created_at, pda.dialysis_clinic, pda.social_worker_name, p.profile_completed, p.onboarding_completed
            ORDER BY u.created_at DESC
        `, [duswId]);

        // Calculate patient stages - Complete = documents uploaded (not onboarding_completed)
        const patientsWithStages = patients.rows.map(patient => {
            let stage = 'registered';
            let stageLabel = 'Registered';
            let stageColor = '#3b82f6'; // blue
            
            const hasConsents = parseInt(patient.consent_count) >= 2; // Both consents signed
            const hasTCSelected = parseInt(patient.referral_count) > 0;
            const hasDocuments = parseInt(patient.document_count) > 0;
            
            if (hasConsents) {
                stage = 'roi_signed';
                stageLabel = 'ROI Signed';
                stageColor = '#8b5cf6'; // purple
            }
            if (hasTCSelected) {
                stage = 'tc_selected';
                stageLabel = 'TC Selected';
                stageColor = '#f59e0b'; // amber
            }
            if (hasDocuments) {
                stage = 'complete';
                stageLabel = 'Complete';
                stageColor = '#059669'; // dark green
            }
            
            return {
                ...patient,
                stage,
                stageLabel,
                stageColor
            };
        });

        // Get pending referrals (not yet registered)
        const pendingReferrals = await pool.query(`
            SELECT 
                id,
                referral_token,
                patient_email,
                patient_title,
                patient_first_name,
                patient_last_name,
                patient_nephrologist,
                dialysis_clinic_name,
                created_at,
                expires_at
            FROM patient_referral_invitations
            WHERE dusw_id = $1 AND redeemed = false
            ORDER BY created_at DESC
        `, [duswId]);

        // Add days pending to each referral
        const pendingWithDays = pendingReferrals.rows.map(ref => ({
            ...ref,
            daysPending: Math.floor((Date.now() - new Date(ref.created_at).getTime()) / (1000 * 60 * 60 * 24))
        }));

        // Get filter from query params
        const stageFilter = req.query.stage || 'all';

        // Filter patients if needed
        let filteredPatients = patientsWithStages;
        if (stageFilter !== 'all') {
            filteredPatients = patientsWithStages.filter(p => p.stage === stageFilter);
        }

        res.render('patients', {
            title: 'Patients - DUSW Portal',
            user: req.session.user,
            patients: filteredPatients,
            allPatients: patientsWithStages,
            pendingReferrals: pendingWithDays,
            currentFilter: stageFilter,
            stageCounts: {
                all: patientsWithStages.length,
                registered: patientsWithStages.filter(p => p.stage === 'registered').length,
                roi_signed: patientsWithStages.filter(p => p.stage === 'roi_signed').length,
                tc_selected: patientsWithStages.filter(p => p.stage === 'tc_selected').length,
                documents: patientsWithStages.filter(p => p.stage === 'documents').length,
                complete: patientsWithStages.filter(p => p.stage === 'complete').length,
                pending: pendingWithDays.length
            }
        });
    } catch (error) {
        console.error('Patients page error:', error);
        res.render('patients', {
            title: 'Patients - DUSW Portal',
            user: req.session.user,
            patients: [],
            allPatients: [],
            pendingReferrals: [],
            currentFilter: 'all',
            stageCounts: { all: 0, registered: 0, roi_signed: 0, tc_selected: 0, documents: 0, complete: 0, pending: 0 }
        });
    }
});

// Patient details
app.get('/patients/:id', requireAuth, async (req, res) => {
    try {
        const patientId = req.params.id;
        
        // Get patient details
        const patientResult = await pool.query(`
            SELECT 
                p.*,
                u.email as user_email,
                u.phone_number as user_phone,
                u.first_name,
                u.last_name,
                u.email
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [patientId]);

        if (patientResult.rows.length === 0) {
            return res.status(404).send('Patient not found');
        }

        const patient = patientResult.rows[0];
        console.log('Updated patient data:', {
            id: patient.id,
            first_name: patient.first_name,
            last_name: patient.last_name,
            email: patient.email,
            user_email: patient.user_email
        });

        // Get transplant center selections
        const referralsResult = await pool.query(`
            SELECT 
                pr.id,
                pr.status,
                pr.submitted_at,
                tc.name as center_name,
                tc.city,
                tc.state
            FROM patient_referrals pr
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            WHERE pr.patient_id = $1
            ORDER BY pr.submitted_at DESC
        `, [patientId]);

        // Get documents with uploader info
        const documentsResult = await pool.query(`
            SELECT 
                pd.id,
                pd.document_type,
                pd.file_name,
                pd.file_size,
                pd.mime_type,
                pd.created_at,
                pd.uploaded_by_type,
                CASE 
                    WHEN pd.uploaded_by_type = 'dusw' THEN 
                        (SELECT CONCAT(dsw.first_name, ' ', dsw.last_name) FROM dusw_social_workers dsw WHERE dsw.id = pd.uploaded_by_id)
                    ELSE 'Patient'
                END as uploaded_by_name
            FROM patient_documents pd
            WHERE pd.patient_id = $1
            ORDER BY pd.created_at DESC
        `, [patientId]);

        // Get intake form status
        const intakeFormResult = await pool.query(`
            SELECT 
                status,
                submitted_at,
                signed_at,
                created_at
            FROM patient_intake_forms
            WHERE patient_id = $1
        `, [patientId]);

        const intakeForm = intakeFormResult.rows[0] || null;

        // Get consent status from patient_consents table (check for both required consents)
        const consentsResult = await pool.query(`
            SELECT consent_type, signed_at FROM patient_consents 
            WHERE patient_id = $1
        `, [patientId]);
        
        // Check if both required consents are signed
        const consents = consentsResult.rows;
        const hasServicesConsent = consents.some(c => c.consent_type === 'services_consent');
        const hasMedicalRecordsConsent = consents.some(c => c.consent_type === 'medical_records_consent');
        const allConsentsSigned = hasServicesConsent && hasMedicalRecordsConsent;
        const latestConsentDate = consents.length > 0 ? consents.reduce((latest, c) => 
            new Date(c.signed_at) > new Date(latest) ? c.signed_at : latest, consents[0].signed_at) : null;

        // Patient is truly complete only when they have uploaded documents
        const hasDocuments = documentsResult.rows.length > 0;
        const hasTCSelected = referralsResult.rows.length > 0;
        const isComplete = hasDocuments; // Complete = documents uploaded

        // Calculate patient journey stages for progress bar
        const stages = {
            registered: { complete: true, label: 'Registered', icon: 'fa-user-plus', date: patient.created_at },
            roi_signed: { complete: allConsentsSigned, label: 'ROI Signed', icon: 'fa-file-signature', date: latestConsentDate },
            tc_selected: { complete: hasTCSelected, label: 'TC Selected', icon: 'fa-hospital', date: referralsResult.rows[0]?.submitted_at },
            documents: { complete: hasDocuments, label: 'Documents', icon: 'fa-file-alt', date: documentsResult.rows[0]?.created_at },
            complete: { complete: isComplete, label: 'Complete', icon: 'fa-check-circle', date: hasDocuments ? documentsResult.rows[0]?.created_at : null }
        };

        // Determine current stage (highest completed stage)
        let currentStage = 'registered';
        if (allConsentsSigned) currentStage = 'roi_signed';
        if (hasTCSelected) currentStage = 'tc_selected';
        if (hasDocuments) currentStage = 'complete'; // Skip to complete when docs uploaded

        res.render('patient-details', {
            title: 'Patient Details - DUSW Portal',
            user: req.session.user,
            patient: patient,
            referrals: referralsResult.rows,
            documents: documentsResult.rows,
            intakeForm: intakeForm,
            consents: consents,
            allConsentsSigned: allConsentsSigned,
            stages: stages,
            currentStage: currentStage,
            documentTypes: DUSW_DOCUMENT_TYPES
        });

    } catch (error) {
        console.error('Patient details error:', error);
        res.status(500).send('Server error');
    }
});

// Notifications Page
app.get('/notifications', requireAuth, async (req, res) => {
    try {
        const notifications = await queryWithRetry(`
            SELECT 
                dn.id,
                dn.notification_type,
                dn.title,
                dn.message,
                dn.is_read,
                dn.created_at,
                dn.patient_id,
                u.first_name as patient_first_name,
                u.last_name as patient_last_name
            FROM dusw_notifications dn
            LEFT JOIN patients p ON dn.patient_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE dn.dusw_id = $1
            ORDER BY dn.created_at DESC
            LIMIT 100
        `, [req.session.user.id]);
        
        res.render('notifications', {
            title: 'Notifications - DUSW Portal',
            user: req.session.user,
            notifications: notifications.rows
        });
    } catch (error) {
        console.error('Notifications page error:', error);
        res.render('notifications', {
            title: 'Notifications - DUSW Portal',
            user: req.session.user,
            notifications: []
        });
    }
});

// Profile Page
app.get('/profile', requireAuth, async (req, res) => {
    try {
        const result = await queryWithRetry(`
            SELECT * FROM dusw_social_workers WHERE id = $1
        `, [req.session.user.id]);
        
        const employee = result.rows[0];
        
        res.render('profile', {
            title: 'My Profile - DUSW Portal',
            user: req.session.user,
            employee: employee,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Profile page error:', error);
        res.redirect('/dashboard');
    }
});

// Update Profile
app.post('/profile', requireAuth, async (req, res) => {
    try {
        const { title, firstName, lastName, phoneNumber, email } = req.body;
        
        await queryWithRetry(`
            UPDATE dusw_social_workers 
            SET title = $1, first_name = $2, last_name = $3, phone_number = $4, email = $5, updated_at = NOW()
            WHERE id = $6
        `, [title, firstName, lastName, phoneNumber, email.toLowerCase(), req.session.user.id]);
        
        // Update session
        req.session.user.title = title;
        req.session.user.firstName = firstName;
        req.session.user.lastName = lastName;
        req.session.user.phoneNumber = phoneNumber;
        req.session.user.email = email.toLowerCase();
        
        res.redirect('/profile?success=Profile updated successfully');
    } catch (error) {
        console.error('Profile update error:', error);
        res.redirect('/profile?error=Failed to update profile');
    }
});

// Change Password
app.post('/profile/password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        if (newPassword !== confirmPassword) {
            return res.redirect('/profile?error=Passwords do not match');
        }
        
        const userResult = await queryWithRetry(`
            SELECT password_hash FROM dusw_social_workers WHERE id = $1
        `, [req.session.user.id]);
        
        const validPassword = await verifyPassword(currentPassword, userResult.rows[0].password_hash);
        if (!validPassword) {
            return res.redirect('/profile?error=Current password is incorrect');
        }
        
        const newHash = await hashPassword(newPassword);
        await queryWithRetry(`
            UPDATE dusw_social_workers SET password_hash = $1, updated_at = NOW() WHERE id = $2
        `, [newHash, req.session.user.id]);
        
        res.redirect('/profile?success=Password changed successfully');
    } catch (error) {
        console.error('Password change error:', error);
        res.redirect('/profile?error=Failed to change password');
    }
});

// Mark notification as read
app.post('/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        const notificationId = req.params.id;
        await pool.query(`
            UPDATE dusw_notifications 
            SET is_read = true, read_at = NOW()
            WHERE id = $1 AND dusw_id = $2
        `, [notificationId, req.session.user.id]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
app.post('/notifications/mark-all-read', requireAuth, async (req, res) => {
    try {
        await pool.query(`
            UPDATE dusw_notifications 
            SET is_read = true, read_at = NOW()
            WHERE dusw_id = $1 AND is_read = false
        `, [req.session.user.id]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
    }
});

// Upload document for patient (DUSW)
app.post('/patients/:patientId/documents/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const patientId = req.params.patientId;
        const { documentType } = req.body;
        const file = req.file;
        const duswId = req.session.user.id;

        console.log(`📄 DUSW document upload: patientId=${patientId}, type=${documentType}`);

        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        if (!documentType || !DUSW_DOCUMENT_TYPES[documentType]) {
            return res.status(400).json({ success: false, error: 'Invalid document type' });
        }

        // Verify patient exists and is assigned to this DUSW
        const patientCheck = await pool.query(`
            SELECT p.id, u.first_name, u.last_name
            FROM patients p
            JOIN users u ON p.user_id = u.id
            JOIN patient_dusw_assignments pda ON p.id = pda.patient_id
            WHERE p.id = $1 AND pda.dusw_social_worker_id = $2
        `, [patientId, duswId]);

        if (patientCheck.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Patient not found or not assigned to you' });
        }

        const patient = patientCheck.rows[0];
        const documentGroupId = uuidv4();
        const fileExtension = file.originalname.split('.').pop() || 'pdf';
        const s3Key = `patients/${patientId}/documents/${documentType}/${documentGroupId}/file.${fileExtension}`;

        // Upload to S3
        console.log(`📄 Uploading to S3: ${s3Key}`);
        const putCommand = new PutObjectCommand({
            Bucket: S3_CONFIG.bucket,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
            ServerSideEncryption: 'AES256',
            Metadata: {
                'patient-id': String(patientId),
                'document-type': String(documentType),
                'uploaded-by': 'dusw',
                'dusw-id': String(duswId),
                'original-filename': String(file.originalname)
            }
        });

        await s3Client.send(putCommand);
        console.log(`✅ File uploaded to S3 successfully`);

        // Save to database with uploaded_by info
        const docResult = await pool.query(`
            INSERT INTO patient_documents (
                patient_id, document_type, file_name, file_size, mime_type,
                s3_key, s3_bucket, upload_status, is_front, document_group_id,
                uploaded_by_type, uploaded_by_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', true, $8, 'dusw', $9)
            RETURNING id, document_type, file_name, created_at
        `, [
            patientId, documentType, file.originalname, file.size, file.mimetype,
            s3Key, S3_CONFIG.bucket, documentGroupId, duswId
        ]);

        console.log(`✅ Document saved to database: ${docResult.rows[0].id}`);

        res.json({
            success: true,
            message: 'Document uploaded successfully',
            document: {
                id: docResult.rows[0].id,
                documentType: documentType,
                documentTypeName: DUSW_DOCUMENT_TYPES[documentType],
                fileName: file.originalname,
                createdAt: docResult.rows[0].created_at
            }
        });

    } catch (error) {
        console.error('❌ DUSW document upload error:', error);
        res.status(500).json({ success: false, error: 'Failed to upload document' });
    }
});

// Get signed URL to view/download document
app.get('/patients/:patientId/documents/:documentId/view', requireAuth, async (req, res) => {
    try {
        const { patientId, documentId } = req.params;
        const duswId = req.session.user.id;

        // Verify document exists and patient is assigned to this DUSW
        const docResult = await pool.query(`
            SELECT pd.s3_key, pd.s3_bucket, pd.file_name, pd.mime_type
            FROM patient_documents pd
            JOIN patient_dusw_assignments pda ON pd.patient_id = pda.patient_id
            WHERE pd.id = $1 AND pd.patient_id = $2 AND pda.dusw_social_worker_id = $3
        `, [documentId, patientId, duswId]);

        if (docResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const doc = docResult.rows[0];

        // Generate signed URL (valid for 15 minutes)
        const getCommand = new GetObjectCommand({
            Bucket: doc.s3_bucket,
            Key: doc.s3_key
        });

        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });

        res.json({
            success: true,
            url: signedUrl,
            fileName: doc.file_name,
            mimeType: doc.mime_type
        });

    } catch (error) {
        console.error('❌ Error getting document URL:', error);
        res.status(500).json({ success: false, error: 'Failed to get document URL' });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 DUSW Portal running on http://localhost:${PORT}`);
    console.log(`📱 Network Access: http://192.168.1.69:${PORT}`);
    console.log(`🔐 Authentication: Session-based login`);
    console.log(`🗄️  Database: AWS RDS PostgreSQL`);
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