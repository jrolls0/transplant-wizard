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

        res.render('dashboard', {
            title: 'Dashboard - Transplant Center Portal',
            user: req.session.user,
            referrals: referrals.rows
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

// Registration POST
app.post('/register', async (req, res) => {
    try {
        const { 
            title, firstName, lastName, phoneNumber, email, password, 
            employeeId, role, department, transplantCenter 
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

        // Create employee account
        const result = await pool.query(`
            INSERT INTO transplant_center_employees (
                transplant_center_id, employee_id, title, first_name, last_name, 
                phone_number, email, password_hash, role, department, status, 
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW(), NOW())
            RETURNING id, email, first_name, last_name
        `, [
            centerResult.rows[0].id, employeeId, title, firstName.trim(), lastName.trim(), 
            phoneNumber, email.toLowerCase(), passwordHash, role || 'coordinator', department
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