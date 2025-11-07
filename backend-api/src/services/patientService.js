// Patient data service with HIPAA-compliant database operations
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class PatientService {
    constructor(pool, auditLogger) {
        this.pool = pool;
        this.auditLogger = auditLogger;
    }
    
    // Create new patient record after Cognito registration
    async createPatient(cognitoUserSub, patientData, auditUserId = null) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const patientId = uuidv4();
            const now = new Date();
            
            // Hash sensitive data for additional security
            const hashedSSN = patientData.ssn ? this.hashSensitiveData(patientData.ssn) : null;
            
            // Insert patient record
            const patientQuery = `
                INSERT INTO patients (
                    id, cognito_user_sub, email, first_name, last_name, 
                    title, phone_number, date_of_birth, address, 
                    primary_care_physician, insurance_provider,
                    ssn_hash, profile_completed, onboarding_completed, 
                    roi_signed, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                    $11, $12, $13, $14, $15, $16, $17
                ) RETURNING *
            `;
            
            const patientValues = [
                patientId,
                cognitoUserSub,
                patientData.email,
                patientData.firstName,
                patientData.lastName,
                patientData.title || null,
                patientData.phoneNumber || null,
                patientData.dateOfBirth || null,
                patientData.address || null,
                patientData.primaryCarePhysician || null,
                patientData.insuranceProvider || null,
                hashedSSN,
                false, // profile_completed
                false, // onboarding_completed
                false, // roi_signed
                now,
                now
            ];
            
            const patientResult = await client.query(patientQuery, patientValues);
            const patient = patientResult.rows[0];
            
            // Log patient creation for audit trail
            await this.auditLogger.logPatientEvent(
                patientId,
                auditUserId || patientId,
                'patient_created',
                'Patient account created successfully',
                {
                    cognito_user_sub: cognitoUserSub,
                    email: patientData.email,
                    registration_source: 'mobile_app'
                }
            );
            
            await client.query('COMMIT');
            
            console.log(`✅ Patient created: ${patientId} (Cognito: ${cognitoUserSub})`);
            
            // Return patient data without sensitive information
            return this.sanitizePatientData(patient);
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error creating patient:', error);
            
            // Log failed creation attempt
            if (this.auditLogger) {
                await this.auditLogger.logPatientEvent(
                    null,
                    auditUserId,
                    'patient_creation_failed',
                    `Patient creation failed: ${error.message}`,
                    {
                        email: patientData.email,
                        error: error.message
                    }
                );
            }
            
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Get patient by Cognito user sub
    async getPatientByCognitoSub(cognitoUserSub) {
        try {
            const query = `
                SELECT p.*, dc.name as dialysis_clinic_name,
                       sw.first_name as social_worker_first_name,
                       sw.last_name as social_worker_last_name,
                       sw.email as social_worker_email
                FROM patients p
                LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
                LEFT JOIN social_workers sw ON p.assigned_social_worker_id = sw.id
                WHERE p.cognito_user_sub = $1 AND p.is_active = true
            `;
            
            const result = await this.pool.query(query, [cognitoUserSub]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const patient = result.rows[0];
            
            // Log data access for audit trail
            await this.auditLogger.logPatientEvent(
                patient.id,
                patient.id,
                'patient_data_accessed',
                'Patient data retrieved for authentication',
                {
                    access_method: 'cognito_sub_lookup',
                    cognito_user_sub: cognitoUserSub
                }
            );
            
            return this.sanitizePatientData(patient);
            
        } catch (error) {
            console.error('❌ Error getting patient by Cognito sub:', error);
            throw error;
        }
    }
    
    // Get patient by ID
    async getPatientById(patientId, accessingUserId = null) {
        try {
            const query = `
                SELECT p.*, dc.name as dialysis_clinic_name,
                       sw.first_name as social_worker_first_name,
                       sw.last_name as social_worker_last_name,
                       sw.email as social_worker_email
                FROM patients p
                LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
                LEFT JOIN social_workers sw ON p.assigned_social_worker_id = sw.id
                WHERE p.id = $1 AND p.is_active = true
            `;
            
            const result = await this.pool.query(query, [patientId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const patient = result.rows[0];
            
            // Log data access for audit trail
            await this.auditLogger.logPatientEvent(
                patientId,
                accessingUserId || patientId,
                'patient_data_accessed',
                'Patient data retrieved',
                {
                    access_method: 'patient_id_lookup',
                    accessing_user_id: accessingUserId
                }
            );
            
            return this.sanitizePatientData(patient);
            
        } catch (error) {
            console.error('❌ Error getting patient by ID:', error);
            throw error;
        }
    }
    
    // Update patient ROI consent status
    async updateROIConsent(patientId, digitalSignature, ipAddress, userAgent) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const now = new Date();
            const signatureHash = this.hashSensitiveData(digitalSignature);
            
            // Update patient ROI status
            const updatePatientQuery = `
                UPDATE patients 
                SET roi_signed = true, roi_signed_at = $1, updated_at = $2
                WHERE id = $3
                RETURNING id, email, first_name, last_name
            `;
            
            const patientResult = await client.query(updatePatientQuery, [now, now, patientId]);
            
            if (patientResult.rows.length === 0) {
                throw new Error('Patient not found');
            }
            
            const patient = patientResult.rows[0];
            
            // Store ROI consent record
            const roiQuery = `
                INSERT INTO patient_roi_consents (
                    id, patient_id, digital_signature_hash, consent_text_version,
                    signed_at, ip_address, user_agent, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            
            const roiValues = [
                uuidv4(),
                patientId,
                signatureHash,
                '1.0', // ROI consent version
                now,
                ipAddress,
                userAgent,
                now
            ];
            
            await client.query(roiQuery, roiValues);
            
            // Log ROI signature for audit trail
            await this.auditLogger.logPatientEvent(
                patientId,
                patientId,
                'roi_consent_signed',
                'Patient signed ROI consent form',
                {
                    signature_method: 'digital',
                    consent_version: '1.0',
                    ip_address: ipAddress,
                    user_agent: userAgent?.substring(0, 200) // Truncate long user agents
                }
            );
            
            await client.query('COMMIT');
            
            console.log(`✅ ROI consent signed by patient: ${patientId}`);
            
            return {
                success: true,
                patient: this.sanitizePatientData(patient),
                signedAt: now
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error updating ROI consent:', error);
            
            // Log failed ROI attempt
            await this.auditLogger.logPatientEvent(
                patientId,
                patientId,
                'roi_consent_failed',
                `ROI consent signing failed: ${error.message}`,
                {
                    error: error.message,
                    ip_address: ipAddress
                }
            );
            
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Update patient profile information
    async updatePatientProfile(patientId, updateData, updatingUserId = null) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const now = new Date();
            const updates = [];
            const values = [];
            let paramCount = 1;
            
            // Build dynamic update query
            const allowedFields = [
                'title', 'first_name', 'last_name', 'phone_number', 
                'date_of_birth', 'address', 'primary_care_physician', 
                'insurance_provider', 'dialysis_clinic_id', 
                'assigned_social_worker_id', 'profile_completed'
            ];
            
            for (const field of allowedFields) {
                if (updateData.hasOwnProperty(field)) {
                    updates.push(`${field} = $${paramCount}`);
                    values.push(updateData[field]);
                    paramCount++;
                }
            }
            
            if (updates.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            // Add updated_at
            updates.push(`updated_at = $${paramCount}`);
            values.push(now);
            paramCount++;
            
            // Add patient ID for WHERE clause
            values.push(patientId);
            
            const query = `
                UPDATE patients 
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;
            
            const result = await client.query(query, values);
            
            if (result.rows.length === 0) {
                throw new Error('Patient not found');
            }
            
            const updatedPatient = result.rows[0];
            
            // Log profile update
            await this.auditLogger.logPatientEvent(
                patientId,
                updatingUserId || patientId,
                'patient_profile_updated',
                'Patient profile information updated',
                {
                    updated_fields: Object.keys(updateData),
                    updating_user_id: updatingUserId
                }
            );
            
            await client.query('COMMIT');
            
            console.log(`✅ Patient profile updated: ${patientId}`);
            
            return this.sanitizePatientData(updatedPatient);
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error updating patient profile:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    // Hash sensitive data using crypto
    hashSensitiveData(data) {
        const salt = process.env.DATA_ENCRYPTION_SALT || 'default_salt_change_in_production';
        return crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512').toString('hex');
    }
    
    // Remove sensitive data from patient object
    sanitizePatientData(patient) {
        if (!patient) return null;
        
        const sanitized = { ...patient };
        
        // Remove sensitive fields
        delete sanitized.ssn_hash;
        delete sanitized.cognito_user_sub;
        
        // Convert dates to ISO strings
        if (sanitized.date_of_birth) {
            sanitized.date_of_birth = sanitized.date_of_birth.toISOString();
        }
        if (sanitized.created_at) {
            sanitized.created_at = sanitized.created_at.toISOString();
        }
        if (sanitized.updated_at) {
            sanitized.updated_at = sanitized.updated_at.toISOString();
        }
        if (sanitized.roi_signed_at) {
            sanitized.roi_signed_at = sanitized.roi_signed_at.toISOString();
        }
        
        return sanitized;
    }
}

module.exports = PatientService;