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
                COALESCE(
                    (SELECT roi.status FROM roi_consents roi WHERE roi.patient_id = p.id ORDER BY roi.created_at DESC LIMIT 1),
                    'not_signed'
                ) as roi_status,
                COALESCE(
                    (SELECT MAX(pr2.status) FROM patient_referrals pr2 WHERE pr2.patient_id = p.id),
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

        // Calculate patient stages
        const patientsWithStages = patients.rows.map(patient => {
            let stage = 'registered';
            let stageLabel = 'Registered';
            let stageColor = '#3b82f6'; // blue
            
            if (patient.roi_status === 'signed') {
                stage = 'roi_signed';
                stageLabel = 'ROI Signed';
                stageColor = '#8b5cf6'; // purple
            }
            if (parseInt(patient.referral_count) > 0) {
                stage = 'tc_selected';
                stageLabel = 'TC Selected';
                stageColor = '#f59e0b'; // amber
            }
            if (parseInt(patient.document_count) > 0) {
                stage = 'documents';
                stageLabel = 'Docs Uploaded';
                stageColor = '#10b981'; // green
            }
            if (patient.onboarding_completed) {
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

        // Get patient documents for activity timeline
        const documentsResult = await pool.query(`
            SELECT 
                id,
                document_type,
                file_name,
                created_at
            FROM patient_documents
            WHERE patient_id = $1
            ORDER BY created_at DESC
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

        // Get ROI consent status
        const roiResult = await pool.query(`
            SELECT status, signed_at FROM roi_consents 
            WHERE patient_id = $1 
            ORDER BY created_at DESC LIMIT 1
        `, [patientId]);
        const roiConsent = roiResult.rows[0] || null;

        // Calculate patient journey stages for progress bar
        const stages = {
            registered: { complete: true, label: 'Registered', icon: 'fa-user-plus', date: patient.created_at },
            roi_signed: { complete: roiConsent?.status === 'signed', label: 'ROI Signed', icon: 'fa-file-signature', date: roiConsent?.signed_at },
            tc_selected: { complete: referralsResult.rows.length > 0, label: 'TC Selected', icon: 'fa-hospital', date: referralsResult.rows[0]?.submitted_at },
            documents: { complete: documentsResult.rows.length > 0, label: 'Documents', icon: 'fa-file-alt', date: documentsResult.rows[0]?.created_at },
            complete: { complete: patient.onboarding_completed, label: 'Complete', icon: 'fa-check-circle', date: null }
        };

        // Determine current stage
        let currentStage = 'registered';
        if (roiConsent?.status === 'signed') currentStage = 'roi_signed';
        if (referralsResult.rows.length > 0) currentStage = 'tc_selected';
        if (documentsResult.rows.length > 0) currentStage = 'documents';
        if (patient.onboarding_completed) currentStage = 'complete';

        res.render('patient-details', {
            title: 'Patient Details - DUSW Portal',
            user: req.session.user,
            patient: patient,
            referrals: referralsResult.rows,
            documents: documentsResult.rows,
            intakeForm: intakeForm,
            roiConsent: roiConsent,
            stages: stages,
            currentStage: currentStage
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