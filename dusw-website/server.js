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
        // Get recent patient notifications for this social worker with retry logic
        const notifications = await queryWithRetry(`
            SELECT 
                u.first_name,
                u.last_name, 
                u.email,
                u.created_at,
                p.id as patient_id,
                pda.dialysis_clinic,
                pda.social_worker_name,
                COUNT(pr.id) as referral_count
            FROM patient_dusw_assignments pda
            JOIN patients p ON pda.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            WHERE pda.dusw_social_worker_id = $1
            GROUP BY u.first_name, u.last_name, u.email, u.created_at, p.id, pda.dialysis_clinic, pda.social_worker_name
            ORDER BY u.created_at DESC
            LIMIT 10
        `, [req.session.user.id]);

        res.render('dashboard', {
            title: 'Dashboard - DUSW Portal',
            user: req.session.user,
            notifications: notifications.rows
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', {
            title: 'Dashboard - DUSW Portal',
            user: req.session.user,
            notifications: []
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
        const patients = await pool.query(`
            SELECT 
                p.id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone_number,
                p.date_of_birth,
                u.created_at,
                pda.dialysis_clinic,
                pda.social_worker_name,
                COUNT(pr.id) as referral_count
            FROM patient_dusw_assignments pda
            JOIN patients p ON pda.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
            WHERE pda.dusw_social_worker_id = $1
            GROUP BY p.id, u.first_name, u.last_name, u.email, u.phone_number, p.date_of_birth, u.created_at, pda.dialysis_clinic, pda.social_worker_name
            ORDER BY u.created_at DESC
        `, [req.session.user.id]);

        res.render('patients', {
            title: 'Patients - DUSW Portal',
            user: req.session.user,
            patients: patients.rows
        });
    } catch (error) {
        console.error('Patients page error:', error);
        res.render('patients', {
            title: 'Patients - DUSW Portal',
            user: req.session.user,
            patients: []
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

        res.render('patient-details', {
            title: 'Patient Details - DUSW Portal',
            user: req.session.user,
            patient: patient,
            referrals: referralsResult.rows
        });

    } catch (error) {
        console.error('Patient details error:', error);
        res.status(500).send('Server error');
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