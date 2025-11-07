// Simple test server for quick API testing
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        database: 'connected'
    });
});

// Database test endpoint
app.get('/db-test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as current_time, COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = $1', ['public']);
        res.json({
            success: true,
            currentTime: result.rows[0].current_time,
            tableCount: result.rows[0].table_count,
            database: 'PostgreSQL connected'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get transplant centers
app.get('/api/v1/transplant-centers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, address, city, state, zip_code, 
                   distance_miles, phone, specialties, average_wait_time_months, is_active
            FROM transplant_centers 
            WHERE is_active = true
            ORDER BY name
        `);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get dialysis clinics
app.get('/api/v1/dialysis-clinics', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, address, phone, email, is_active
            FROM dialysis_clinics 
            WHERE is_active = true
            ORDER BY name
        `);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get transplant centers in chatbot format
app.get('/api/v1/transplant-centers/chatbot-data', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, address, city, state, 
                   average_wait_time_months, specialties, distance_miles
            FROM transplant_centers 
            WHERE is_active = true
            ORDER BY distance_miles ASC
        `);
        
        const chatbotCenters = result.rows.map(center => ({
            id: center.id,
            name: center.name,
            location: `${center.city}, ${center.state}`,
            waitTime: center.average_wait_time_months ? 
                `${center.average_wait_time_months} months` : 'Not available',
            specialties: center.specialties || ['Kidney'],
            distance: center.distance_miles ? 
                `${center.distance_miles} miles` : 'Distance not available',
            highlights: [
                `Located in ${center.city}, ${center.state}`,
                `Specializes in ${(center.specialties || ['Kidney']).join(', ')} transplants`
            ],
            chatbotDescription: `${center.name} is located in ${center.city}, ${center.state} and specializes in ${(center.specialties || ['Kidney']).join(', ')} transplants. The average wait time is ${center.average_wait_time_months || 'not available'} months.`
        }));
        
        res.json({
            success: true,
            data: {
                centers: chatbotCenters,
                totalCount: chatbotCenters.length,
                conversationContext: "Available transplant centers for patient selection"
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Patient registration endpoint with simulated Cognito response (NO DATABASE for mobile testing)
app.post('/api/v1/auth/register/patient', async (req, res) => {
    try {
        console.log('📱 Mobile Registration request received:', req.body);
        
        const { 
            title, firstName, lastName, email, phoneNumber, 
            dateOfBirth, address, primaryCarePhysician, 
            insuranceProvider, dialysisClinic, socialWorkerName, password 
        } = req.body;
        
        // Validate required fields (dialysis clinic and social worker removed - to be collected during onboarding)
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'firstName, lastName, email, and password are required'
            });
        }
        
        console.log(`✅ Registration validation passed for ${email}`);
        
        // SKIP DATABASE OPERATIONS FOR MOBILE TESTING
        // Simulate successful response immediately
        const userId = `test_user_${Date.now()}`;
        
        // Simple registration response that matches iOS VerificationResponse
        res.status(200).json({
            success: true,
            message: 'Registration successful. Please check your email for verification.'
        });
        
        // Log simulated verification code (in real env this would be sent via SES)
        const verificationCode = Math.floor(100000 + Math.random() * 900000);
        console.log(`📧 EMAIL VERIFICATION CODE for ${email}: ${verificationCode}`);
        console.log(`🔍 Use this code in the app's verification screen`);
        console.log(`🎉 Mobile registration test successful!`);
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed',
            details: error.message
        });
    }
});

// Email verification endpoint
app.post('/api/v1/auth/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        console.log(`Verification attempt for ${email} with code ${code}`);
        
        // In a real environment, we'd verify the code against Cognito
        // For testing, we'll accept any 6-digit code
        if (!code || code.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Invalid verification code format'
            });
        }
        
        // SKIP DATABASE OPERATIONS FOR MOBILE TESTING
        // In real environment, would update user status in database
        
        res.json({
            success: true,
            message: 'Email verified successfully'
        });
        
        console.log(`✅ Email verified successfully for ${email} (TEST MODE)`);
        
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Verification failed',
            details: error.message
        });
    }
});

// Login endpoint (NO DATABASE for mobile testing)
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password, userType } = req.body;
        
        console.log(`📱 Login attempt for ${email} as ${userType}`);
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                details: 'Email and password are required'
            });
        }
        
        // SKIP DATABASE OPERATIONS FOR MOBILE TESTING
        // In real environment, would validate credentials against database
        // For testing, accept any email/password combination
        
        console.log(`✅ Login validation passed for ${email}`);
        
        // Simulate successful login with tokens
        const accessToken = `mock_access_token_${Date.now()}`;
        const refreshToken = `mock_refresh_token_${Date.now()}`;
        
        // Create mock user data
        const mockUser = {
            id: `login_user_${Date.now()}`,
            email: email,
            firstName: "Test",
            lastName: "User",
            profileCompleted: false,
            onboardingCompleted: false,
            roiSigned: false, // Will be updated after ROI signing
            dialysisClinicId: null,
            assignedSocialWorkerName: null,
            createdAt: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                user: mockUser
            }
        });
        
        console.log(`✅ Login successful for ${email} (TEST MODE)`);
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: error.message
        });
    }
});

// Serve the test interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/test.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 Transplant Platform Test Server running on http://localhost:${PORT}`);
    console.log(`📱 Mobile Access: http://192.168.1.69:${PORT}`);
    console.log(`📊 Test Interface: http://localhost:${PORT}/`);
    console.log(`🔍 API Health: http://localhost:${PORT}/health`);
    console.log(`🗄️  Database Test: http://localhost:${PORT}/db-test`);
});

module.exports = app;