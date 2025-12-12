// TransplantWizard Main Website Server
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// Security and performance middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(compression());
app.use(express.json()); // Parse JSON bodies for API endpoints
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? [
        'https://transplantwizard.com',
        'https://dusw.transplantwizard.com', 
        'https://tc.transplantwizard.com'
    ] : true
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Log all API calls to debug what the mobile app is actually calling
app.use('/api/*', (req, res, next) => {
    console.log(`📱 API Call: ${req.method} ${req.originalUrl}`);
    console.log('📱 Headers:', req.headers);
    console.log('📱 Query:', req.query);
    console.log('📱 Body:', req.body);
    next();
});

// Mobile API Routes
// Get all dialysis clinics for mobile app registration
app.get('/api/dialysis-clinics', async (req, res) => {
    console.log('📱 Mobile API: GET /api/dialysis-clinics called');
    try {
        const result = await pool.query(`
            SELECT DISTINCT dialysis_clinic as name 
            FROM dusw_social_workers 
            WHERE dialysis_clinic IS NOT NULL
            ORDER BY dialysis_clinic
        `);
        
        const clinics = result.rows.map(row => ({ name: row.name }));
        console.log(`📱 Returning ${clinics.length} clinics:`, clinics.map(c => c.name));
        res.json({ success: true, clinics });
    } catch (error) {
        console.error('Error fetching dialysis clinics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch clinics' });
    }
});

// Get social workers by clinic for mobile app registration
app.get('/api/social-workers/by-clinic', async (req, res) => {
    console.log('📱 Mobile API: GET /api/social-workers/by-clinic called');
    console.log('📱 Query params:', req.query);
    try {
        const { clinic } = req.query;
        
        if (!clinic) {
            console.log('📱 ERROR: No clinic parameter provided');
            return res.status(400).json({ success: false, error: 'Clinic parameter is required' });
        }
        
        console.log(`📱 Looking for social workers at clinic: "${clinic}"`);
        const result = await pool.query(`
            SELECT id, title, first_name, last_name, email
            FROM dusw_social_workers 
            WHERE dialysis_clinic = $1 AND status = 'active'
            ORDER BY last_name, first_name
        `, [clinic]);
        
        const socialWorkers = result.rows.map(row => ({
            id: row.id,
            name: `${row.title || ''} ${row.first_name} ${row.last_name}`.trim(),
            email: row.email
        }));
        
        console.log(`📱 Found ${socialWorkers.length} social workers:`, socialWorkers.map(sw => sw.name));
        res.json({ success: true, socialWorkers });
    } catch (error) {
        console.error('📱 ERROR fetching social workers:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch social workers' });
    }
});

// Additional API endpoint variations (in case mobile app calls different paths)
app.get('/api/clinics', async (req, res) => {
    console.log('📱 Mobile API: GET /api/clinics called (alternative endpoint)');
    res.redirect('/api/dialysis-clinics');
});

app.get('/api/social-workers', async (req, res) => {
    console.log('📱 Mobile API: GET /api/social-workers called (alternative endpoint)');
    console.log('📱 Query params:', req.query);
    res.redirect(`/api/social-workers/by-clinic?${new URLSearchParams(req.query)}`);
});

app.get('/api/socialworkers', async (req, res) => {
    console.log('📱 Mobile API: GET /api/socialworkers called (alternative endpoint)');
    console.log('📱 Query params:', req.query);
    res.redirect(`/api/social-workers/by-clinic?${new URLSearchParams(req.query)}`);
});

// Mobile Patient Authentication API
app.post('/api/auth/login', async (req, res) => {
    console.log('📱 Mobile API: POST /api/auth/login called');
    console.log('📱 Request body:', req.body);
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            console.log('📱 ERROR: Missing email or password');
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }
        
        console.log(`📱 Attempting login for email: ${email}`);
        
        // Check if user exists in patients table
        const patientResult = await pool.query(`
            SELECT 
                p.id as patient_id,
                p.date_of_birth,
                p.dialysis_clinic_id,
                p.assigned_social_worker_id,
                p.address,
                u.id as user_id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone_number,
                u.password_hash,
                u.status
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE LOWER(u.email) = LOWER($1) AND u.status = 'active'
        `, [email]);
        
        if (patientResult.rows.length === 0) {
            console.log('📱 ERROR: Patient not found or inactive');
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        
        const patient = patientResult.rows[0];
        console.log(`📱 Found patient: ${patient.first_name} ${patient.last_name}`);
        
        // For now, skip password verification (since we need to understand the password structure)
        // TODO: Implement proper password verification
        
        const patientData = {
            id: patient.patient_id,
            user_id: patient.user_id,
            email: patient.email,
            firstName: patient.first_name,
            lastName: patient.last_name,
            phoneNumber: patient.phone_number,
            dateOfBirth: patient.date_of_birth,
            dialysisClinicId: patient.dialysis_clinic_id,
            assignedSocialWorkerId: patient.assigned_social_worker_id
        };
        
        console.log('📱 Login successful for patient:', patientData.email);
        res.json({ success: true, patient: patientData });
        
    } catch (error) {
        console.error('📱 ERROR in patient login:', error);
        res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    console.log('📱 Mobile API: POST /api/auth/register called');
    console.log('📱 Request body:', req.body);
    try {
        const { 
            firstName, 
            lastName, 
            email, 
            password, 
            phoneNumber, 
            dateOfBirth, 
            dialysisClinic, 
            socialWorkerId 
        } = req.body;
        
        // Validation
        const required = { firstName, lastName, email, password, phoneNumber, dateOfBirth, dialysisClinic };
        const missing = Object.entries(required).filter(([key, value]) => !value).map(([key]) => key);
        
        if (missing.length > 0) {
            console.log('📱 ERROR: Missing required fields:', missing);
            return res.status(400).json({ 
                success: false, 
                error: `Missing required fields: ${missing.join(', ')}` 
            });
        }
        
        console.log(`📱 Attempting registration for: ${firstName} ${lastName} <${email}>`);
        
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            console.log('📱 ERROR: User already exists');
            return res.status(409).json({ 
                success: false, 
                error: 'An account with this email already exists' 
            });
        }
        
        // Create user and patient records (simplified - skipping password hashing for now)
        // TODO: Implement proper password hashing
        
        // Create user first
        const userResult = await pool.query(`
            INSERT INTO users (first_name, last_name, email, phone_number, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
            RETURNING id, email, first_name, last_name
        `, [firstName, lastName, email.toLowerCase(), phoneNumber]);
        
        const user = userResult.rows[0];
        console.log('📱 Created user:', user.email);
        
        // Create patient record
        const patientResult = await pool.query(`
            INSERT INTO patients (user_id, date_of_birth, phone_number, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            RETURNING id
        `, [user.id, dateOfBirth, phoneNumber]);
        
        const patient = patientResult.rows[0];
        console.log('📱 Created patient with ID:', patient.id);
        
        const patientData = {
            id: patient.id,
            user_id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phoneNumber,
            dateOfBirth
        };
        
        console.log('📱 Registration successful for patient:', patientData.email);
        res.json({ success: true, patient: patientData });
        
    } catch (error) {
        console.error('📱 ERROR in patient registration:', error);
        res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
    }
});

// Web Routes
app.get('/', (req, res) => {
    res.render('index', {
        title: 'TransplantWizard - Comprehensive Transplant Care Platform'
    });
});

app.get('/about', (req, res) => {
    res.render('about', {
        title: 'About TransplantWizard - Transforming Transplant Care'
    });
});

app.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Contact TransplantWizard - Get In Touch'
    });
});

// Patient Referral Registration - Universal Link (handles /register for app universal links)
app.get('/register', (req, res) => {
    res.render('patient-referral-register', {
        title: 'Complete Your Registration - Transplant Wizard'
    });
});

// Patient Referral Registration - Legacy path for backward compatibility
app.get('/register/patient', (req, res) => {
    res.render('patient-referral-register', {
        title: 'Complete Your Registration - Transplant Wizard'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', {
        title: 'Page Not Found - TransplantWizard'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('500', {
        title: 'Server Error - TransplantWizard'
    });
});

app.listen(PORT, () => {
    console.log(`🏥 TransplantWizard Main Website running on http://localhost:${PORT}`);
    console.log(`📱 Network Access: http://192.168.1.69:${PORT}`);
    console.log(`🌐 Production URL: https://transplantwizard.com`);
});

module.exports = app;