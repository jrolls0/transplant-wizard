// Basic authentication service replacing AWS Cognito
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class BasicAuthService {
    constructor(pool) {
        this.pool = pool;
        this.jwtSecret = process.env.JWT_SECRET;
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
        this.saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        
        console.log('✅ Basic Authentication Service initialized');
    }
    
    // Hash password using bcrypt
    async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(this.saltRounds);
            const hash = await bcrypt.hash(password, salt);
            return hash;
        } catch (error) {
            console.error('❌ Password hashing error:', error);
            throw new Error('Password hashing failed');
        }
    }
    
    // Verify password against hash
    async verifyPassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            console.error('❌ Password verification error:', error);
            throw new Error('Password verification failed');
        }
    }
    
    // Generate JWT token
    generateToken(payload) {
        try {
            return jwt.sign(payload, this.jwtSecret, { 
                expiresIn: this.jwtExpiresIn,
                issuer: 'transplant-platform',
                audience: 'patient-app'
            });
        } catch (error) {
            console.error('❌ Token generation error:', error);
            throw new Error('Token generation failed');
        }
    }
    
    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret, {
                issuer: 'transplant-platform',
                audience: 'patient-app'
            });
        } catch (error) {
            console.error('❌ Token verification error:', error);
            throw new Error('Invalid or expired token');
        }
    }
    
    // Register new patient with basic auth
    async registerPatient(email, password, patientData) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            console.log(`🔐 Starting registration for ${email}`);
            
            // Check if user already exists
            const existingUser = await client.query(
                'SELECT id FROM user_credentials WHERE email = $1',
                [email.toLowerCase()]
            );
            
            if (existingUser.rows.length > 0) {
                throw new Error('An account with this email already exists');
            }
            
            // Hash password
            const passwordHash = await this.hashPassword(password);
            
            // Create patient record
            const patientResult = await client.query(`
                INSERT INTO patients (
                    first_name, last_name, email, phone_number, 
                    date_of_birth, address, primary_care_physician, 
                    insurance_provider, dialysis_clinic, social_worker_name,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) 
                RETURNING id, created_at
            `, [
                patientData.firstName,
                patientData.lastName,
                email.toLowerCase(),
                patientData.phoneNumber,
                patientData.dateOfBirth,
                patientData.address,
                patientData.primaryCarePhysician,
                patientData.insuranceProvider,
                patientData.dialysisClinic,
                patientData.socialWorkerName
            ]);
            
            const patientId = patientResult.rows[0].id;
            
            // Create user credentials
            await client.query(`
                INSERT INTO user_credentials (email, password_hash, patient_id, created_at, updated_at)
                VALUES ($1, $2, $3, NOW(), NOW())
            `, [email.toLowerCase(), passwordHash, patientId]);
            
            await client.query('COMMIT');
            
            console.log(`✅ Patient registration successful: ${patientId}`);
            
            return {
                success: true,
                patientId: patientId,
                message: 'Registration successful'
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Registration error:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Authenticate patient login
    async authenticatePatient(email, password) {
        try {
            console.log(`🔐 Authenticating patient: ${email}`);
            
            // Get user credentials and patient data
            const result = await this.pool.query(`
                SELECT 
                    uc.id as credential_id,
                    uc.password_hash,
                    p.id,
                    p.first_name,
                    p.last_name,
                    p.email,
                    p.phone_number,
                    p.date_of_birth,
                    p.dialysis_clinic,
                    p.social_worker_name,
                    p.profile_completed,
                    p.onboarding_completed,
                    p.roi_signed,
                    p.created_at
                FROM user_credentials uc
                JOIN patients p ON uc.patient_id = p.id
                WHERE uc.email = $1
            `, [email.toLowerCase()]);
            
            if (result.rows.length === 0) {
                throw new Error('Invalid email or password');
            }
            
            const user = result.rows[0];
            
            // Verify password
            const passwordValid = await this.verifyPassword(password, user.password_hash);
            if (!passwordValid) {
                throw new Error('Invalid email or password');
            }
            
            // Generate JWT token
            const tokenPayload = {
                userId: user.id,
                email: user.email,
                type: 'patient'
            };
            
            const accessToken = this.generateToken(tokenPayload);
            
            // Return user data and token
            const userData = {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                phoneNumber: user.phone_number,
                dateOfBirth: user.date_of_birth,
                dialysisClinic: user.dialysis_clinic,
                socialWorkerName: user.social_worker_name,
                profileCompleted: user.profile_completed || false,
                onboardingCompleted: user.onboarding_completed || false,
                roiSigned: user.roi_signed || false,
                createdAt: user.created_at
            };
            
            console.log(`✅ Authentication successful for ${email}`);
            
            return {
                success: true,
                accessToken: accessToken,
                refreshToken: accessToken, // Using same token for simplicity
                user: userData,
                expiresIn: 86400 // 24 hours in seconds
            };
            
        } catch (error) {
            console.error('❌ Authentication error:', error);
            throw error;
        }
    }
    
    // Get user info from token
    async getUserInfo(token) {
        try {
            const decoded = this.verifyToken(token);
            
            const result = await this.pool.query(`
                SELECT 
                    p.id,
                    p.first_name,
                    p.last_name,
                    p.email,
                    p.phone_number,
                    p.dialysis_clinic,
                    p.social_worker_name,
                    p.profile_completed,
                    p.onboarding_completed,
                    p.roi_signed,
                    p.created_at
                FROM patients p
                WHERE p.id = $1
            `, [decoded.userId]);
            
            if (result.rows.length === 0) {
                throw new Error('User not found');
            }
            
            const user = result.rows[0];
            
            return {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                phoneNumber: user.phone_number,
                dialysisClinic: user.dialysis_clinic,
                socialWorkerName: user.social_worker_name,
                profileCompleted: user.profile_completed || false,
                onboardingCompleted: user.onboarding_completed || false,
                roiSigned: user.roi_signed || false,
                createdAt: user.created_at
            };
            
        } catch (error) {
            console.error('❌ Get user info error:', error);
            throw error;
        }
    }
    
    // Middleware to verify JWT token
    verifyTokenMiddleware() {
        return (req, res, next) => {
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    error: 'Access token required'
                });
            }
            
            const token = authHeader.substring(7);
            
            try {
                const decoded = this.verifyToken(token);
                req.user = decoded;
                next();
            } catch (error) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid or expired token'
                });
            }
        };
    }
}

module.exports = BasicAuthService;