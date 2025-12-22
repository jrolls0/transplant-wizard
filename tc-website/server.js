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
        // Get recent patient referrals for this transplant center
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
                dsw.dialysis_clinic
            FROM patient_referrals pr
            JOIN patients p ON pr.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_dusw_assignments pda ON p.id = pda.patient_id
            LEFT JOIN dusw_social_workers dsw ON pda.dusw_social_worker_id = dsw.id
            WHERE pr.transplant_center_id = $1
            ORDER BY pr.submitted_at DESC
            LIMIT 10
        `, [req.session.user.transplant_center_id]);

        // Get document counts for each patient
        const patientIds = referrals.rows.map(r => r.patient_id).filter(id => id);
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

        // Add document count to referrals
        const referralsWithDocs = referrals.rows.map(r => ({
            ...r,
            document_count: documentCounts[r.patient_id] || 0
        }));

        res.render('dashboard', {
            title: 'Dashboard - Transplant Center Portal',
            user: req.session.user,
            referrals: referralsWithDocs
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', {
            title: 'Dashboard - Transplant Center Portal',
            user: req.session.user,
            referrals: []
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