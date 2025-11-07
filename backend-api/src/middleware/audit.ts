import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuditAction } from './types';
import { auditLogger } from './config/logger';
import DatabaseConfig from './config/database';

// List of PHI fields that need special tracking
const PHI_FIELDS = [
  'date_of_birth',
  'address',
  'phone_number',
  'email',
  'first_name',
  'last_name',
  'primary_care_physician',
  'insurance_provider',
  'digital_signature'
];

// Resource types that contain PHI
const PHI_RESOURCES = [
  'patient',
  'patients',
  'roi_consent',
  'roi_consents',
  'user',
  'users'
];

// Audit logging middleware
export const auditLog = (action: AuditAction, resourceType: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    let responseBody: any;
    let statusCode: number;

    // Capture response data
    const originalSend = res.send;
    res.send = function(data: any) {
      responseBody = data;
      statusCode = res.statusCode;
      return originalSend.call(this, data);
    };

    // Continue with the request
    res.on('finish', async () => {
      try {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Determine if PHI was accessed
        const phiAccessed = PHI_RESOURCES.includes(resourceType.toLowerCase());
        
        // Extract PHI fields that were accessed
        let phiFields: string[] = [];
        if (phiAccessed) {
          phiFields = extractPhiFields(req.body, req.query, responseBody);
        }

        // Get resource ID from params or body
        const resourceId = extractResourceId(req, resourceType);

        // Create audit log entry
        await createAuditLogEntry({
          userId: req.userId,
          userRole: req.userRole,
          sessionId: req.sessionId,
          action,
          resourceType,
          resourceId,
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          oldValues: action === AuditAction.UPDATE ? extractOldValues(req) : undefined,
          newValues: [AuditAction.CREATE, AuditAction.UPDATE].includes(action) ? req.body : undefined,
          phiAccessed,
          phiFields,
          statusCode,
          duration,
          description: generateDescription(action, resourceType, statusCode),
          metadata: {
            endpoint: req.originalUrl,
            method: req.method,
            statusCode,
            duration,
            query: req.query,
            params: req.params
          }
        });

        // Log to audit logger
        auditLogger.info('API Request Audited', {
          userId: req.userId,
          action,
          resourceType,
          resourceId,
          endpoint: req.originalUrl,
          method: req.method,
          statusCode,
          duration,
          phiAccessed,
          phiFields: phiFields.length > 0 ? phiFields : undefined,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        auditLogger.error('Failed to create audit log', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.userId,
          endpoint: req.originalUrl,
          method: req.method
        });
      }
    });

    next();
  };
};

// Create audit log entry in database
async function createAuditLogEntry(data: {
  userId?: string;
  userRole?: string;
  sessionId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  endpoint: string;
  method: string;
  ipAddress?: string;
  userAgent?: string;
  oldValues?: any;
  newValues?: any;
  phiAccessed: boolean;
  phiFields: string[];
  statusCode: number;
  duration: number;
  description: string;
  metadata: any;
}) {
  try {
    const db = DatabaseConfig.getInstance();
    
    await db.query(`
      INSERT INTO audit_logs (
        user_id, user_role, session_id, action, resource_type, resource_id,
        endpoint, method, ip_address, user_agent, old_values, new_values,
        phi_accessed, phi_fields, description, metadata, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      data.userId || null,
      data.userRole || null,
      data.sessionId || null,
      data.action,
      data.resourceType,
      data.resourceId || null,
      data.endpoint,
      data.method,
      data.ipAddress || null,
      data.userAgent || null,
      data.oldValues ? JSON.stringify(data.oldValues) : null,
      data.newValues ? JSON.stringify(data.newValues) : null,
      data.phiAccessed,
      data.phiFields.length > 0 ? data.phiFields : null,
      data.description,
      JSON.stringify(data.metadata),
      new Date()
    ]);
  } catch (error) {
    auditLogger.error('Database audit log creation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      data
    });
  }
}

// Extract PHI fields from request/response
function extractPhiFields(body: any, query: any, response: any): string[] {
  const fields = new Set<string>();

  // Check request body
  if (body && typeof body === 'object') {
    for (const field of PHI_FIELDS) {
      if (body[field] !== undefined) {
        fields.add(field);
      }
    }
  }

  // Check query parameters
  if (query && typeof query === 'object') {
    for (const field of PHI_FIELDS) {
      if (query[field] !== undefined) {
        fields.add(field);
      }
    }
  }

  // Check response data (if it's JSON)
  try {
    const responseData = typeof response === 'string' ? JSON.parse(response) : response;
    if (responseData && responseData.data) {
      const data = Array.isArray(responseData.data) ? responseData.data : [responseData.data];
      
      for (const item of data) {
        if (item && typeof item === 'object') {
          for (const field of PHI_FIELDS) {
            if (item[field] !== undefined) {
              fields.add(field);
            }
          }
        }
      }
    }
  } catch {
    // Response is not JSON, ignore
  }

  return Array.from(fields);
}

// Extract resource ID from request
function extractResourceId(req: AuthenticatedRequest, resourceType: string): string | undefined {
  // Try common ID parameter names
  const idParams = [
    'id',
    'patientId',
    'socialWorkerId',
    'userId',
    'referralId',
    'consentId',
    'notificationId'
  ];

  for (const param of idParams) {
    if (req.params[param]) {
      return req.params[param];
    }
  }

  // Try body
  if (req.body && req.body.id) {
    return req.body.id;
  }

  return undefined;
}

// Extract old values (for UPDATE operations)
function extractOldValues(req: AuthenticatedRequest): any {
  // This would typically be populated by the service layer
  // For now, return undefined - services should populate this
  return req.body._oldValues || undefined;
}

// Generate description based on action and outcome
function generateDescription(action: AuditAction, resourceType: string, statusCode: number): string {
  const actionPast = {
    [AuditAction.CREATE]: 'created',
    [AuditAction.READ]: 'accessed',
    [AuditAction.UPDATE]: 'updated',
    [AuditAction.DELETE]: 'deleted',
    [AuditAction.LOGIN]: 'logged in',
    [AuditAction.LOGOUT]: 'logged out',
    [AuditAction.EXPORT]: 'exported'
  };

  const success = statusCode >= 200 && statusCode < 300;
  const outcome = success ? 'successfully' : 'unsuccessfully';
  
  return `User ${outcome} ${actionPast[action]} ${resourceType}`;
}

// Specific audit middleware for different actions
export const auditRead = (resourceType: string) => auditLog(AuditAction.READ, resourceType);
export const auditCreate = (resourceType: string) => auditLog(AuditAction.CREATE, resourceType);
export const auditUpdate = (resourceType: string) => auditLog(AuditAction.UPDATE, resourceType);
export const auditDelete = (resourceType: string) => auditLog(AuditAction.DELETE, resourceType);

// PHI access logging (for extra sensitive operations)
export const logPhiAccess = (operation: string, resourceType: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    auditLogger.info('PHI Access', {
      userId: req.userId,
      userRole: req.userRole,
      operation,
      resourceType,
      endpoint: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    next();
  };
};

// Failed operation logging
export const logFailedOperation = (req: AuthenticatedRequest, error: any, operation: string) => {
  auditLogger.error('Operation Failed', {
    userId: req.userId,
    userRole: req.userRole,
    operation,
    error: error instanceof Error ? error.message : 'Unknown error',
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
};