// Transplant Center Portal Server
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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;
const DOMAIN = process.env.DOMAIN || 'localhost';

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
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
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`⚠️  Database connection attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
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
        issuer: 'tc-portal'
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
            const tcNotifications = await queryWithRetry(`
                SELECT 
                    tn.id,
                    tn.notification_type,
                    tn.title,
                    tn.message,
                    tn.is_read,
                    tn.created_at,
                    u.first_name as patient_first_name,
                    u.last_name as patient_last_name
                FROM tc_notifications tn
                LEFT JOIN patients p ON tn.patient_id = p.id
                LEFT JOIN users u ON p.user_id = u.id
                WHERE tn.tc_employee_id = $1
                ORDER BY tn.created_at DESC
                LIMIT 20
            `, [req.session.user.id]);
            
            res.locals.tcNotifications = tcNotifications.rows;
            res.locals.unreadNotificationCount = tcNotifications.rows.filter(n => !n.is_read).length;
        } catch (error) {
            console.error('Error loading notifications:', error);
            res.locals.tcNotifications = [];
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
    res.render('index', { title: 'Transplant Center Portal - Patient Referral Platform' });
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { title: 'Login - Transplant Center Portal', error: null });
});

// Registration page
app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { title: 'Register - Transplant Center Portal', error: null });
});

// Dashboard (protected)
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const tcId = req.session.user.transplant_center_id;
        
        // Get dashboard stats
        const statsResult = await queryWithRetry(`
            SELECT 
                COUNT(*) FILTER (WHERE status != 'declined') as total_active,
                COUNT(*) FILTER (WHERE status = 'applied') as new_referrals,
                COUNT(*) FILTER (WHERE status = 'under_review') as under_review,
                COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
                COUNT(*) FILTER (WHERE status = 'waitlisted') as waitlisted,
                COUNT(*) FILTER (WHERE status = 'declined') as declined,
                AVG(EXTRACT(EPOCH FROM (updated_at - submitted_at))/86400) FILTER (WHERE status != 'applied') as avg_review_days
            FROM patient_referrals
            WHERE transplant_center_id = $1
        `, [tcId]);
        
        const stats = statsResult.rows[0] || {};
        
        // Get new referrals this week
        const weeklyResult = await queryWithRetry(`
            SELECT COUNT(*) as count
            FROM patient_referrals
            WHERE transplant_center_id = $1 
            AND submitted_at >= NOW() - INTERVAL '7 days'
        `, [tcId]);
        
        // Get documents uploaded this week (for the 4th stat)
        const docsThisWeek = await queryWithRetry(`
            SELECT COUNT(DISTINCT pd.id) as count
            FROM patient_documents pd
            JOIN patient_referrals pr ON pd.patient_id = pr.patient_id
            WHERE pr.transplant_center_id = $1
            AND pd.created_at >= NOW() - INTERVAL '7 days'
        `, [tcId]);
        
        // Get recent NEW referrals (status = applied) for dashboard
        const newReferrals = await queryWithRetry(`
            SELECT 
                pr.id,
                pr.status,
                pr.submitted_at,
                pr.updated_at,
                pr.patient_id,
                u.first_name,
                u.last_name,
                u.email,
                p.date_of_birth,
                dsw.first_name as sw_first_name,
                dsw.last_name as sw_last_name,
                dsw.dialysis_clinic
            FROM patient_referrals pr
            JOIN patients p ON pr.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_dusw_assignments pda ON p.id = pda.patient_id
            LEFT JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE pr.transplant_center_id = $1 AND pr.status = 'applied'
            ORDER BY pr.submitted_at DESC
            LIMIT 5
        `, [tcId]);

        // Get document counts for new referrals
        const patientIds = newReferrals.rows.map(r => r.patient_id).filter(id => id);
        let documentCounts = {};
        
        if (patientIds.length > 0) {
            const docCountResult = await pool.query(`
                SELECT patient_id, COUNT(*) as doc_count
                FROM patient_documents
                WHERE patient_id = ANY($1)
                GROUP BY patient_id
            `, [patientIds]);
            
            docCountResult.rows.forEach(row => {
                documentCounts[row.patient_id] = parseInt(row.doc_count);
            });
        }

        const referralsWithDocs = newReferrals.rows.map(r => ({
            ...r,
            document_count: documentCounts[r.patient_id] || 0
        }));

        res.render('dashboard', {
            title: 'Dashboard - Transplant Center Portal',
            user: req.session.user,
            referrals: referralsWithDocs,
            stats: {
                totalActive: parseInt(stats.total_active) || 0,
                newReferrals: parseInt(stats.new_referrals) || 0,
                underReview: parseInt(stats.under_review) || 0,
                accepted: parseInt(stats.accepted) || 0,
                waitlisted: parseInt(stats.waitlisted) || 0,
                declined: parseInt(stats.declined) || 0,
                avgReviewDays: stats.avg_review_days ? parseFloat(stats.avg_review_days).toFixed(1) : 'N/A',
                weeklyReferrals: parseInt(weeklyResult.rows[0]?.count) || 0,
                docsThisWeek: parseInt(docsThisWeek.rows[0]?.count) || 0
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', {
            title: 'Dashboard - Transplant Center Portal',
            user: req.session.user,
            referrals: [],
            stats: { totalActive: 0, newReferrals: 0, underReview: 0, accepted: 0, waitlisted: 0, declined: 0, avgReviewDays: 'N/A', weeklyReferrals: 0, docsThisWeek: 0 }
        });
    }
});

// Patient Documents Page (protected)
app.get('/patient/:patientId/documents', requireAuth, async (req, res) => {
    try {
        const { patientId } = req.params;
        
        // Verify this patient has a referral to this TC
        const referralCheck = await pool.query(`
            SELECT pr.id FROM patient_referrals pr
            WHERE pr.patient_id = $1 AND pr.transplant_center_id = $2
        `, [patientId, req.session.user.transplant_center_id]);
        
        if (referralCheck.rows.length === 0) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                message: 'You do not have access to view this patient\'s documents.'
            });
        }
        
        // Get patient info
        const patientResult = await pool.query(`
            SELECT u.first_name, u.last_name, u.email, u.phone_number
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [patientId]);
        
        if (patientResult.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Patient not found.'
            });
        }
        
        // Get patient documents
        const documents = await pool.query(`
            SELECT id, document_type, file_name, file_size, mime_type, 
                   is_front, document_group_id, created_at
            FROM patient_documents
            WHERE patient_id = $1
            ORDER BY created_at DESC
        `, [patientId]);
        
        // Group documents by type
        const groupedDocs = {};
        documents.rows.forEach(doc => {
            if (!groupedDocs[doc.document_type]) {
                groupedDocs[doc.document_type] = [];
            }
            groupedDocs[doc.document_type].push(doc);
        });
        
        res.render('patient-documents', {
            title: 'Patient Documents - Transplant Center Portal',
            user: req.session.user,
            patient: patientResult.rows[0],
            patientId: patientId,
            documents: documents.rows,
            groupedDocs: groupedDocs
        });
        
    } catch (error) {
        console.error('Error fetching patient documents:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load patient documents.'
        });
    }
});

// Get document download URL (API endpoint for TC portal)
app.get('/api/documents/:documentId/url', requireAuth, async (req, res) => {
    try {
        const { documentId } = req.params;
        
        // Get document and verify access
        const docResult = await pool.query(`
            SELECT pd.*, pr.transplant_center_id
            FROM patient_documents pd
            JOIN patient_referrals pr ON pd.patient_id = pr.patient_id
            WHERE pd.id = $1 AND pr.transplant_center_id = $2
        `, [documentId, req.session.user.transplant_center_id]);
        
        if (docResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        
        const doc = docResult.rows[0];
        
        // Generate pre-signed URL using AWS SDK
        const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        
        const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
        
        // First check if the object exists in S3
        try {
            const headCommand = new HeadObjectCommand({
                Bucket: doc.s3_bucket,
                Key: doc.s3_key
            });
            await s3Client.send(headCommand);
        } catch (headError) {
            if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
                // S3 object doesn't exist - delete from database
                console.log(`S3 object not found for document ${documentId}, removing from database`);
                await pool.query('DELETE FROM patient_documents WHERE id = $1', [documentId]);
                return res.status(404).json({ success: false, error: 'Document no longer exists', deleted: true });
            }
            throw headError;
        }
        
        const getCommand = new GetObjectCommand({
            Bucket: doc.s3_bucket,
            Key: doc.s3_key
        });
        
        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });
        
        res.json({
            success: true,
            url: signedUrl,
            expiresIn: 900
        });
        
    } catch (error) {
        console.error('Error generating document URL:', error);
        res.status(500).json({ success: false, error: 'Failed to generate document URL' });
    }
});

// Registration POST
app.post('/register', async (req, res) => {
    try {
        const { 
            title, firstName, lastName, phoneNumber, email, password, 
            employeeId, transplantCenter 
        } = req.body;

        // Validation
        if (!title || !firstName || !lastName || !phoneNumber || !email || !password || !transplantCenter) {
            return res.render('register', {
                title: 'Register - Transplant Center Portal',
                error: 'All required fields must be filled'
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM transplant_center_employees WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            return res.render('register', {
                title: 'Register - Transplant Center Portal',
                error: 'An account with this email already exists'
            });
        }

        // Find transplant center
        const centerResult = await pool.query(
            'SELECT id FROM transplant_centers WHERE name = $1',
            [transplantCenter]
        );

        if (centerResult.rows.length === 0) {
            return res.render('register', {
                title: 'Register - Transplant Center Portal',
                error: 'Selected transplant center not found'
            });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create employee account (all registrants are admins)
        const result = await pool.query(`
            INSERT INTO transplant_center_employees (
                transplant_center_id, employee_id, title, first_name, last_name, 
                phone_number, email, password_hash, role, status, 
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'admin', 'active', NOW(), NOW())
            RETURNING id, email, first_name, last_name
        `, [
            centerResult.rows[0].id, employeeId, title, firstName.trim(), lastName.trim(), 
            phoneNumber, email.toLowerCase(), passwordHash
        ]);

        console.log(`✅ TC registration successful: ${result.rows[0].email}`);

        // Redirect to login
        res.redirect('/login?registered=true');

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.render('register', {
            title: 'Register - Transplant Center Portal',
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
                title: 'Login - Transplant Center Portal',
                error: 'Email and password are required'
            });
        }

        // Get employee account with transplant center info
        const result = await queryWithRetry(`
            SELECT 
                tce.id, tce.title, tce.first_name, tce.last_name, tce.email, 
                tce.password_hash, tce.phone_number, tce.role, tce.department, tce.status,
                tce.transplant_center_id, tc.name as center_name, tc.city, tc.state
            FROM transplant_center_employees tce
            JOIN transplant_centers tc ON tce.transplant_center_id = tc.id
            WHERE tce.email = $1 AND tce.status = 'active'
        `, [email.toLowerCase()]);

        if (result.rows.length === 0) {
            return res.render('login', {
                title: 'Login - Transplant Center Portal',
                error: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Verify password
        const passwordValid = await verifyPassword(password, user.password_hash);
        if (!passwordValid) {
            return res.render('login', {
                title: 'Login - Transplant Center Portal',
                error: 'Invalid email or password'
            });
        }

        // Set session
        req.session.user = {
            id: user.id,
            title: user.title,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phoneNumber: user.phone_number,
            role: user.role,
            department: user.department,
            transplant_center_id: user.transplant_center_id,
            center_name: user.center_name,
            center_location: `${user.city}, ${user.state}`
        };

        // Update last login
        await pool.query(
            'UPDATE transplant_center_employees SET last_login = NOW() WHERE id = $1',
            [user.id]
        );

        console.log(`✅ TC login successful: ${user.email}`);

        res.redirect('/dashboard');

    } catch (error) {
        console.error('❌ Login error:', error);
        res.render('login', {
            title: 'Login - Transplant Center Portal',
            error: 'Login failed. Please try again.'
        });
    }
});

// Patient Details Page (protected)
app.get('/patient/:patientId', requireAuth, async (req, res) => {
    try {
        const { patientId } = req.params;
        
        // Verify this patient has a referral to this TC
        const referralCheck = await pool.query(`
            SELECT pr.id, pr.status, pr.submitted_at FROM patient_referrals pr
            WHERE pr.patient_id = $1 AND pr.transplant_center_id = $2
        `, [patientId, req.session.user.transplant_center_id]);
        
        if (referralCheck.rows.length === 0) {
            return res.status(403).render('error', {
                title: 'Access Denied',
                user: req.session.user,
                message: 'You do not have access to view this patient.'
            });
        }
        
        // Get patient info
        const patientResult = await pool.query(`
            SELECT p.*, u.first_name, u.last_name, u.email, u.phone_number, u.created_at as registration_date
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `, [patientId]);
        
        if (patientResult.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'Not Found',
                user: req.session.user,
                message: 'Patient not found.'
            });
        }
        
        const patient = patientResult.rows[0];
        const referral = referralCheck.rows[0];
        
        // Get intake form status
        const intakeFormResult = await pool.query(`
            SELECT status, submitted_at, signed_at
            FROM patient_intake_forms
            WHERE patient_id = $1
        `, [patientId]);
        
        const intakeForm = intakeFormResult.rows[0] || { status: 'not_started' };
        
        // Get patient documents
        const documents = await pool.query(`
            SELECT id, document_type, file_name, file_size, mime_type, 
                   is_front, document_group_id, created_at
            FROM patient_documents
            WHERE patient_id = $1
            ORDER BY created_at DESC
        `, [patientId]);
        
        // Group documents by type
        const groupedDocs = {};
        documents.rows.forEach(doc => {
            if (!groupedDocs[doc.document_type]) {
                groupedDocs[doc.document_type] = [];
            }
            groupedDocs[doc.document_type].push(doc);
        });
        
        // Get DUSW info
        const duswResult = await pool.query(`
            SELECT dsw.first_name, dsw.last_name, dsw.email, dsw.phone_number, dsw.dialysis_clinic
            FROM patient_dusw_assignments pda
            JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE pda.patient_id = $1
        `, [patientId]);
        
        const dusw = duswResult.rows[0] || null;
        
        res.render('patient-details', {
            title: `${patient.first_name} ${patient.last_name} - Patient Details`,
            user: req.session.user,
            patient: patient,
            referral: referral,
            intakeForm: intakeForm,
            documents: documents.rows,
            groupedDocs: groupedDocs,
            dusw: dusw
        });
        
    } catch (error) {
        console.error('Error fetching patient details:', error);
        res.status(500).render('error', {
            title: 'Error',
            user: req.session.user,
            message: 'Failed to load patient details.'
        });
    }
});

// Notifications Page
app.get('/notifications', requireAuth, async (req, res) => {
    try {
        const notifications = await queryWithRetry(`
            SELECT 
                tn.id,
                tn.notification_type,
                tn.title,
                tn.message,
                tn.is_read,
                tn.created_at,
                tn.patient_id,
                u.first_name as patient_first_name,
                u.last_name as patient_last_name
            FROM tc_notifications tn
            LEFT JOIN patients p ON tn.patient_id = p.id
            LEFT JOIN users u ON p.user_id = u.id
            WHERE tn.tc_employee_id = $1
            ORDER BY tn.created_at DESC
            LIMIT 100
        `, [req.session.user.id]);
        
        res.render('notifications', {
            title: 'Notifications - Transplant Center Portal',
            user: req.session.user,
            notifications: notifications.rows
        });
    } catch (error) {
        console.error('Notifications page error:', error);
        res.render('notifications', {
            title: 'Notifications - Transplant Center Portal',
            user: req.session.user,
            notifications: []
        });
    }
});

// Mark notification as read
app.post('/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        const notificationId = req.params.id;
        await pool.query(`
            UPDATE tc_notifications 
            SET is_read = true, read_at = NOW()
            WHERE id = $1 AND tc_employee_id = $2
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
            UPDATE tc_notifications 
            SET is_read = true, read_at = NOW()
            WHERE tc_employee_id = $1 AND is_read = false
        `, [req.session.user.id]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
    }
});

// Update patient referral status
app.post('/api/patient/:patientId/status', requireAuth, async (req, res) => {
    try {
        const { patientId } = req.params;
        const { status } = req.body;
        const validStatuses = ['applied', 'under_review', 'accepted', 'waitlisted', 'declined'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        
        // Verify this patient has a referral to this TC
        const referralResult = await queryWithRetry(`
            SELECT pr.id, pr.status as old_status, p.user_id, u.email, u.first_name,
                   tc.name as center_name
            FROM patient_referrals pr
            JOIN patients p ON pr.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
            WHERE pr.patient_id = $1 AND pr.transplant_center_id = $2
        `, [patientId, req.session.user.transplant_center_id]);
        
        if (referralResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Referral not found' });
        }
        
        const referral = referralResult.rows[0];
        const oldStatus = referral.old_status;
        
        // Update the status
        await queryWithRetry(`
            UPDATE patient_referrals 
            SET status = $1, updated_at = NOW()
            WHERE patient_id = $2 AND transplant_center_id = $3
        `, [status, patientId, req.session.user.transplant_center_id]);
        
        console.log(`✅ Status updated for patient ${patientId}: ${oldStatus} -> ${status}`);
        
        // Send email notification to patient
        const statusDisplayNames = {
            'applied': 'Application Received',
            'under_review': 'Under Review',
            'accepted': 'Accepted',
            'waitlisted': 'Waitlisted',
            'declined': 'Declined'
        };
        
        try {
            const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
            const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
            
            const emailParams = {
                Source: 'noreply@transplantwizard.com',
                Destination: {
                    ToAddresses: [referral.email]
                },
                Message: {
                    Subject: {
                        Data: `Application Status Update - ${referral.center_name}`
                    },
                    Body: {
                        Html: {
                            Data: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #2563eb;">Application Status Update</h2>
                                    <p>Dear ${referral.first_name},</p>
                                    <p>Your application status at <strong>${referral.center_name}</strong> has been updated.</p>
                                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                        <p style="margin: 0;"><strong>New Status:</strong> ${statusDisplayNames[status]}</p>
                                    </div>
                                    <p>Please log in to the Transplant Wizard app to view more details.</p>
                                    <p>Best regards,<br>The Transplant Wizard Team</p>
                                </div>
                            `
                        }
                    }
                }
            };
            
            await sesClient.send(new SendEmailCommand(emailParams));
            console.log(`📧 Status update email sent to ${referral.email}`);
        } catch (emailError) {
            console.error('⚠️ Failed to send status update email:', emailError.message);
        }
        
        // TODO: Send push notification (requires APNs setup)
        // For now, log the intent
        console.log(`📱 Push notification should be sent to user ${referral.user_id} about status change`);
        
        res.json({ 
            success: true, 
            message: 'Status updated successfully',
            newStatus: status
        });
        
    } catch (error) {
        console.error('Error updating patient status:', error);
        res.status(500).json({ success: false, error: 'Failed to update status' });
    }
});

// Get patient intake form data (for TC viewing)
app.get('/api/patient/:patientId/intake-form', requireAuth, async (req, res) => {
    try {
        const { patientId } = req.params;
        
        // Verify this patient has a referral to this TC
        const referralCheck = await queryWithRetry(`
            SELECT 1 FROM patient_referrals 
            WHERE patient_id = $1 AND transplant_center_id = $2
        `, [patientId, req.session.user.transplant_center_id]);
        
        if (referralCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }
        
        // Get intake form data
        const intakeResult = await queryWithRetry(`
            SELECT 
                pif.*,
                u.first_name, u.last_name, u.email,
                p.date_of_birth, p.address
            FROM patient_intake_forms pif
            JOIN patients p ON pif.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            WHERE pif.patient_id = $1
        `, [patientId]);
        
        if (intakeResult.rows.length === 0) {
            return res.json({ success: true, intakeForm: null });
        }
        
        res.json({ success: true, intakeForm: intakeResult.rows[0] });
        
    } catch (error) {
        console.error('Error fetching intake form:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch intake form' });
    }
});

// Get patient consent documents
app.get('/api/patient/:patientId/consents', requireAuth, async (req, res) => {
    try {
        const { patientId } = req.params;
        
        // Verify this patient has a referral to this TC
        const referralCheck = await queryWithRetry(`
            SELECT 1 FROM patient_referrals 
            WHERE patient_id = $1 AND transplant_center_id = $2
        `, [patientId, req.session.user.transplant_center_id]);
        
        if (referralCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }
        
        // Get consent documents (all records in patient_consents are signed)
        const consentsResult = await queryWithRetry(`
            SELECT 
                id, consent_type, signed_at, 
                ip_address, created_at,
                s3_bucket, s3_key,
                'signed' as status
            FROM patient_consents
            WHERE patient_id = $1
            ORDER BY signed_at DESC
        `, [patientId]);
        
        res.json({ success: true, consents: consentsResult.rows });
        
    } catch (error) {
        console.error('Error fetching consents:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch consents' });
    }
});

// Get consent PDF download URL
app.get('/api/consent/:consentId/url', requireAuth, async (req, res) => {
    try {
        const { consentId } = req.params;
        
        // Get consent and verify access
        const consentResult = await queryWithRetry(`
            SELECT pc.*, pr.transplant_center_id
            FROM patient_consents pc
            JOIN patient_referrals pr ON pc.patient_id = pr.patient_id
            WHERE pc.id = $1 AND pr.transplant_center_id = $2
        `, [consentId, req.session.user.transplant_center_id]);
        
        if (consentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Consent not found' });
        }
        
        const consent = consentResult.rows[0];
        
        if (!consent.s3_bucket || !consent.s3_key) {
            return res.status(404).json({ success: false, error: 'PDF not available for this consent' });
        }
        
        // Generate pre-signed URL
        const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        
        const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
        
        const command = new GetObjectCommand({
            Bucket: consent.s3_bucket,
            Key: consent.s3_key
        });
        
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
        
        res.json({
            success: true,
            url: signedUrl,
            expiresIn: 900
        });
        
    } catch (error) {
        console.error('Error generating consent URL:', error);
        res.status(500).json({ success: false, error: 'Failed to generate consent URL' });
    }
});

// New Referrals Page (status = applied only)
app.get('/referrals', requireAuth, async (req, res) => {
    try {
        const tcId = req.session.user.transplant_center_id;
        
        const referrals = await queryWithRetry(`
            SELECT 
                pr.id,
                pr.status,
                pr.submitted_at,
                pr.updated_at,
                pr.patient_id,
                u.first_name,
                u.last_name,
                u.email,
                p.date_of_birth,
                dsw.first_name as sw_first_name,
                dsw.last_name as sw_last_name,
                dsw.dialysis_clinic,
                (SELECT COUNT(*) FROM patient_documents WHERE patient_id = pr.patient_id) as document_count,
                (SELECT status FROM patient_intake_forms WHERE patient_id = pr.patient_id LIMIT 1) as intake_status
            FROM patient_referrals pr
            JOIN patients p ON pr.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_dusw_assignments pda ON p.id = pda.patient_id
            LEFT JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE pr.transplant_center_id = $1 AND pr.status = 'applied'
            ORDER BY pr.submitted_at DESC
        `, [tcId]);

        res.render('referrals', {
            title: 'New Referrals - Transplant Center Portal',
            user: req.session.user,
            referrals: referrals.rows
        });
    } catch (error) {
        console.error('Referrals page error:', error);
        res.render('referrals', {
            title: 'New Referrals - Transplant Center Portal',
            user: req.session.user,
            referrals: []
        });
    }
});

// All Patients Page (with status filters)
app.get('/patients', requireAuth, async (req, res) => {
    try {
        const tcId = req.session.user.transplant_center_id;
        const statusFilter = req.query.status || 'all';
        
        let whereClause = 'pr.transplant_center_id = $1';
        if (statusFilter !== 'all') {
            whereClause += ` AND pr.status = '${statusFilter}'`;
        }
        
        const patients = await queryWithRetry(`
            SELECT 
                pr.id,
                pr.status,
                pr.submitted_at,
                pr.updated_at,
                pr.patient_id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone_number,
                p.date_of_birth,
                dsw.first_name as sw_first_name,
                dsw.last_name as sw_last_name,
                dsw.dialysis_clinic,
                (SELECT COUNT(*) FROM patient_documents WHERE patient_id = pr.patient_id) as document_count,
                (SELECT status FROM patient_intake_forms WHERE patient_id = pr.patient_id LIMIT 1) as intake_status
            FROM patient_referrals pr
            JOIN patients p ON pr.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_dusw_assignments pda ON p.id = pda.patient_id
            LEFT JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE ${whereClause}
            ORDER BY pr.submitted_at DESC
        `, [tcId]);

        // Get counts by status for filter badges
        const statusCounts = await queryWithRetry(`
            SELECT 
                status,
                COUNT(*) as count
            FROM patient_referrals
            WHERE transplant_center_id = $1
            GROUP BY status
        `, [tcId]);
        
        const counts = { all: 0, applied: 0, under_review: 0, accepted: 0, waitlisted: 0, declined: 0 };
        statusCounts.rows.forEach(row => {
            counts[row.status] = parseInt(row.count);
            counts.all += parseInt(row.count);
        });

        res.render('patients', {
            title: 'All Patients - Transplant Center Portal',
            user: req.session.user,
            patients: patients.rows,
            currentFilter: statusFilter,
            statusCounts: counts
        });
    } catch (error) {
        console.error('Patients page error:', error);
        res.render('patients', {
            title: 'All Patients - Transplant Center Portal',
            user: req.session.user,
            patients: [],
            currentFilter: 'all',
            statusCounts: { all: 0, applied: 0, under_review: 0, accepted: 0, waitlisted: 0, declined: 0 }
        });
    }
});

// Profile Page
app.get('/profile', requireAuth, async (req, res) => {
    try {
        // Get full employee info
        const employeeResult = await queryWithRetry(`
            SELECT 
                tce.*,
                tc.name as center_name,
                tc.address as center_address,
                tc.city as center_city,
                tc.state as center_state,
                tc.phone as center_phone,
                tc.email as center_email
            FROM transplant_center_employees tce
            JOIN transplant_centers tc ON tce.transplant_center_id = tc.id
            WHERE tce.id = $1
        `, [req.session.user.id]);
        
        const employee = employeeResult.rows[0];
        
        res.render('profile', {
            title: 'My Profile - Transplant Center Portal',
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
        
        // Update employee info
        await queryWithRetry(`
            UPDATE transplant_center_employees 
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
        
        // Verify current password
        const userResult = await queryWithRetry(`
            SELECT password_hash FROM transplant_center_employees WHERE id = $1
        `, [req.session.user.id]);
        
        const validPassword = await verifyPassword(currentPassword, userResult.rows[0].password_hash);
        if (!validPassword) {
            return res.redirect('/profile?error=Current password is incorrect');
        }
        
        // Update password
        const newHash = await hashPassword(newPassword);
        await queryWithRetry(`
            UPDATE transplant_center_employees SET password_hash = $1, updated_at = NOW() WHERE id = $2
        `, [newHash, req.session.user.id]);
        
        res.redirect('/profile?success=Password changed successfully');
    } catch (error) {
        console.error('Password change error:', error);
        res.redirect('/profile?error=Failed to change password');
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 Transplant Center Portal running on http://localhost:${PORT}`);
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