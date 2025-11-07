// Simple test server to isolate the issue
const express = require('express');
const { config } = require('dotenv');

config();

console.log('Environment loaded, starting simple server...');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());

// Test route
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Simple test server is running',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/v1/dialysis-clinics', async (req, res) => {
    console.log('Mobile API: GET /api/v1/dialysis-clinics called');
    
    try {
        const { Pool } = require('pg');
        const pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
        });
        
        const result = await pool.query(`
            SELECT DISTINCT dialysis_clinic as name 
            FROM dusw_social_workers 
            WHERE dialysis_clinic IS NOT NULL
            ORDER BY dialysis_clinic
        `);
        
        const clinics = result.rows.map(row => ({ name: row.name }));
        console.log(`Returning ${clinics.length} clinics`);
        
        await pool.end();
        res.json({ success: true, clinics });
    } catch (error) {
        console.error('Error fetching dialysis clinics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch clinics' });
    }
});

app.get('/api/v1/social-workers', async (req, res) => {
    console.log('Mobile API: GET /api/v1/social-workers called');
    
    try {
        const { clinic } = req.query;
        
        if (!clinic) {
            return res.status(400).json({ success: false, error: 'Clinic parameter is required' });
        }
        
        const { Pool } = require('pg');
        const pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
        });
        
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
        
        console.log(`Found ${socialWorkers.length} social workers for clinic: ${clinic}`);
        
        await pool.end();
        res.json({ success: true, socialWorkers });
    } catch (error) {
        console.error('Error fetching social workers:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch social workers' });
    }
});

// Patient login endpoint
app.post('/api/v1/auth/login', async (req, res) => {
    console.log('Mobile API: POST /api/v1/auth/login called');
    
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }
        
        const { Pool } = require('pg');
        const pool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
        });
        
        // Find patient by email
        const patientResult = await pool.query(`
            SELECT 
                p.id as patient_id,
                p.date_of_birth,
                p.dialysis_clinic_id,
                p.assigned_social_worker_id,
                u.id as user_id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone_number,
                u.status
            FROM patients p
            JOIN users u ON p.user_id = u.id
            WHERE LOWER(u.email) = LOWER($1) AND u.status = 'active'
        `, [email]);
        
        if (patientResult.rows.length === 0) {
            await pool.end();
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        
        const patient = patientResult.rows[0];
        console.log(`Found patient: ${patient.first_name} ${patient.last_name}`);
        
        // For now, skip password verification - just return patient data
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
        
        await pool.end();
        res.json({ success: true, patient: patientData });
        
    } catch (error) {
        console.error('Error in patient login:', error);
        res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Simple test server running on port ${PORT}`);
    console.log(`📱 Mobile app should connect to: http://192.168.1.69:${PORT}`);
    console.log(`📋 Test endpoints:`);
    console.log(`  http://localhost:${PORT}/health`);
    console.log(`  http://192.168.1.69:${PORT}/api/v1/dialysis-clinics`);
    console.log(`  http://192.168.1.69:${PORT}/api/v1/social-workers?clinic=CLINIC_NAME`);
    console.log(`  POST http://192.168.1.69:${PORT}/api/v1/auth/login`);
});