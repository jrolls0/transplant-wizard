// HIPAA-compliant audit logging middleware for backend operations
const { v4: uuidv4 } = require('uuid');

class AuditLogger {
    constructor(pool) {
        this.pool = pool;
    }
    
    // Log authentication events
    async logAuthEvent(userId, eventType, description, metadata = {}, ipAddress = null, userAgent = null) {
        try {
            const eventId = uuidv4();
            const timestamp = new Date();
            
            const query = `
                INSERT INTO audit_logs (
                    id, user_id, event_type, event_category, description, 
                    metadata, ip_address, user_agent, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;
            
            const values = [
                eventId,
                userId,
                eventType,
                'authentication',
                description,
                JSON.stringify(metadata),
                ipAddress,
                userAgent,
                timestamp,
                timestamp
            ];
            
            await this.pool.query(query, values);
            
            console.log(`📋 AUDIT: [${eventType}] ${description} - User: ${userId || 'anonymous'}`);
            
        } catch (error) {
            console.error('❌ Audit logging error:', error);
            // Don't throw - audit logging failures shouldn't break the application
        }
    }
    
    // Log patient-specific events
    async logPatientEvent(patientId, performingUserId, eventType, description, metadata = {}, ipAddress = null, userAgent = null) {
        try {
            const eventId = uuidv4();
            const timestamp = new Date();
            
            const auditMetadata = {
                ...metadata,
                patient_id: patientId,
                performing_user_id: performingUserId,
                event_context: 'patient_management'
            };
            
            const query = `
                INSERT INTO audit_logs (
                    id, user_id, event_type, event_category, description, 
                    metadata, ip_address, user_agent, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;
            
            const values = [
                eventId,
                performingUserId,
                eventType,
                'patient_data',
                description,
                JSON.stringify(auditMetadata),
                ipAddress,
                userAgent,
                timestamp,
                timestamp
            ];
            
            await this.pool.query(query, values);
            
            console.log(`📋 AUDIT: [${eventType}] ${description} - Patient: ${patientId}, User: ${performingUserId}`);
            
        } catch (error) {
            console.error('❌ Patient audit logging error:', error);
            // Don't throw - audit logging failures shouldn't break the application
        }
    }
    
    // Log PHI access events
    async logPHIAccess(patientId, accessingUserId, dataType, accessMethod, purpose, metadata = {}, ipAddress = null, userAgent = null) {
        try {
            const eventId = uuidv4();
            const timestamp = new Date();
            
            const phiMetadata = {
                ...metadata,
                patient_id: patientId,
                data_type: dataType,
                access_method: accessMethod,
                access_purpose: purpose,
                phi_access: true,
                compliance_category: 'hipaa_phi_access'
            };
            
            const query = `
                INSERT INTO audit_logs (
                    id, user_id, event_type, event_category, description, 
                    metadata, ip_address, user_agent, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;
            
            const values = [
                eventId,
                accessingUserId,
                'phi_access',
                'phi_data',
                `PHI accessed: ${dataType} for patient ${patientId}`,
                JSON.stringify(phiMetadata),
                ipAddress,
                userAgent,
                timestamp,
                timestamp
            ];
            
            await this.pool.query(query, values);
            
            console.log(`📋 PHI AUDIT: ${dataType} accessed for patient ${patientId} by user ${accessingUserId}`);
            
        } catch (error) {
            console.error('❌ PHI audit logging error:', error);
            // Don't throw - audit logging failures shouldn't break the application
        }
    }
    
    // Log system events
    async logSystemEvent(eventType, description, metadata = {}, userId = null) {
        try {
            const eventId = uuidv4();
            const timestamp = new Date();
            
            const query = `
                INSERT INTO audit_logs (
                    id, user_id, event_type, event_category, description, 
                    metadata, timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            
            const values = [
                eventId,
                userId,
                eventType,
                'system',
                description,
                JSON.stringify(metadata),
                timestamp,
                timestamp
            ];
            
            await this.pool.query(query, values);
            
            console.log(`📋 SYSTEM AUDIT: [${eventType}] ${description}`);
            
        } catch (error) {
            console.error('❌ System audit logging error:', error);
            // Don't throw - audit logging failures shouldn't break the application
        }
    }
    
    // Get audit logs for a specific patient (for compliance requests)
    async getPatientAuditLogs(patientId, startDate = null, endDate = null, limit = 100) {
        try {
            let query = `
                SELECT id, user_id, event_type, event_category, description, 
                       metadata, ip_address, timestamp, created_at
                FROM audit_logs 
                WHERE (metadata->>'patient_id' = $1 OR user_id = $1)
            `;
            
            const values = [patientId];
            let paramCount = 2;
            
            if (startDate) {
                query += ` AND timestamp >= $${paramCount}`;
                values.push(startDate);
                paramCount++;
            }
            
            if (endDate) {
                query += ` AND timestamp <= $${paramCount}`;
                values.push(endDate);
                paramCount++;
            }
            
            query += ` ORDER BY timestamp DESC LIMIT $${paramCount}`;
            values.push(limit);
            
            const result = await this.pool.query(query, values);
            
            return result.rows;
            
        } catch (error) {
            console.error('❌ Error retrieving audit logs:', error);
            throw error;
        }
    }
    
    // Get audit logs by event type (for security monitoring)
    async getAuditLogsByEventType(eventType, startDate = null, endDate = null, limit = 100) {
        try {
            let query = `
                SELECT id, user_id, event_type, event_category, description, 
                       metadata, ip_address, timestamp, created_at
                FROM audit_logs 
                WHERE event_type = $1
            `;
            
            const values = [eventType];
            let paramCount = 2;
            
            if (startDate) {
                query += ` AND timestamp >= $${paramCount}`;
                values.push(startDate);
                paramCount++;
            }
            
            if (endDate) {
                query += ` AND timestamp <= $${paramCount}`;
                values.push(endDate);
                paramCount++;
            }
            
            query += ` ORDER BY timestamp DESC LIMIT $${paramCount}`;
            values.push(limit);
            
            const result = await this.pool.query(query, values);
            
            return result.rows;
            
        } catch (error) {
            console.error('❌ Error retrieving audit logs by event type:', error);
            throw error;
        }
    }
    
    // Generate compliance report
    async generateComplianceReport(startDate, endDate) {
        try {
            const query = `
                SELECT 
                    event_category,
                    event_type,
                    COUNT(*) as event_count,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT metadata->>'patient_id') as unique_patients
                FROM audit_logs 
                WHERE timestamp BETWEEN $1 AND $2
                GROUP BY event_category, event_type
                ORDER BY event_category, event_count DESC
            `;
            
            const result = await this.pool.query(query, [startDate, endDate]);
            
            return {
                reportPeriod: {
                    startDate: startDate,
                    endDate: endDate
                },
                summary: result.rows,
                generatedAt: new Date(),
                totalEvents: result.rows.reduce((sum, row) => sum + parseInt(row.event_count), 0)
            };
            
        } catch (error) {
            console.error('❌ Error generating compliance report:', error);
            throw error;
        }
    }
}

module.exports = AuditLogger;