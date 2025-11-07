import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { UserRole, AuthenticatedRequest } from './types';
import { auditLogger, securityLogger } from './config/logger';
import DatabaseConfig from './config/database';

// Initialize Cognito JWT verifiers
const webTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_WEB_CLIENT_ID!,
});

const mobileTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_MOBILE_CLIENT_ID!,
});

interface CognitoTokenPayload {
  sub: string;
  aud: string;
  event_id: string;
  token_use: string;
  auth_time: number;
  iss: string;
  exp: number;
  iat: number;
  client_id: string;
  username: string;
  'custom:user_role'?: string;
}

// Main authentication middleware
export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    const token = authHeader.substring(7);
    
    // Try to verify with web client first, then mobile client
    let payload: CognitoTokenPayload;
    let clientType: 'web' | 'mobile';
    
    try {
      payload = await webTokenVerifier.verify(token) as CognitoTokenPayload;
      clientType = 'web';
    } catch {
      try {
        payload = await mobileTokenVerifier.verify(token) as CognitoTokenPayload;
        clientType = 'mobile';
      } catch (error) {
        securityLogger.warn('Invalid token verification attempt', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      }
    }

    // Get user information from database
    const db = DatabaseConfig.getInstance();
    const userResult = await db.query(
      'SELECT * FROM users WHERE cognito_sub = $1 AND deleted_at IS NULL',
      [payload.sub]
    );

    if (userResult.rows.length === 0) {
      securityLogger.warn('Token valid but user not found in database', {
        cognitoSub: payload.sub,
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      securityLogger.warn('Inactive user attempted access', {
        userId: user.id,
        status: user.status,
        ip: req.ip
      });
      
      return res.status(403).json({
        success: false,
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      });
    }

    // Update last login time
    await db.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Create session record if it doesn't exist
    const sessionId = `session_${user.id}_${Date.now()}`;
    await db.query(`
      INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${process.env.SESSION_TIMEOUT_MINUTES || 30} minutes')
      ON CONFLICT (session_token) DO UPDATE SET last_accessed_at = NOW()
    `, [user.id, sessionId, req.ip, req.get('User-Agent')]);

    // Attach user information to request
    req.user = user;
    req.userId = user.id;
    req.userRole = user.role as UserRole;
    req.sessionId = sessionId;
    req.cognitoSub = payload.sub;

    // Log successful authentication
    auditLogger.info('User authenticated', {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientType,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId
    });

    next();
  } catch (error) {
    securityLogger.error('Authentication middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

// Role-based authorization middleware
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.userRole) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      securityLogger.warn('Unauthorized access attempt', {
        userId: req.userId,
        userRole: req.userRole,
        requiredRoles: allowedRoles,
        endpoint: req.path,
        method: req.method,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Patient-specific authorization (patients can only access their own data)
export const authorizePatientSelf = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.userRole !== UserRole.PATIENT) {
      return res.status(403).json({
        success: false,
        error: 'Patient access only',
        code: 'PATIENT_ACCESS_ONLY'
      });
    }

    // Get patient ID from URL params or body
    const requestedPatientId = req.params.patientId || req.body.patientId;
    
    if (!requestedPatientId) {
      return res.status(400).json({
        success: false,
        error: 'Patient ID required',
        code: 'PATIENT_ID_REQUIRED'
      });
    }

    // Verify the patient belongs to the authenticated user
    const db = DatabaseConfig.getInstance();
    const patientResult = await db.query(
      'SELECT id FROM patients WHERE id = $1 AND user_id = $2',
      [requestedPatientId, req.userId]
    );

    if (patientResult.rows.length === 0) {
      securityLogger.warn('Patient attempted to access another patient\'s data', {
        userId: req.userId,
        requestedPatientId,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    next();
  } catch (error) {
    securityLogger.error('Patient authorization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.userId,
      ip: req.ip
    });

    return res.status(500).json({
      success: false,
      error: 'Authorization error',
      code: 'AUTHORIZATION_ERROR'
    });
  }
};

// Social worker authorization for their assigned patients
export const authorizeSocialWorkerPatients = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.userRole !== UserRole.SOCIAL_WORKER) {
      return res.status(403).json({
        success: false,
        error: 'Social worker access only',
        code: 'SOCIAL_WORKER_ACCESS_ONLY'
      });
    }

    const requestedPatientId = req.params.patientId || req.body.patientId;
    
    if (!requestedPatientId) {
      return res.status(400).json({
        success: false,
        error: 'Patient ID required',
        code: 'PATIENT_ID_REQUIRED'
      });
    }

    // Get the social worker's ID
    const db = DatabaseConfig.getInstance();
    const socialWorkerResult = await db.query(
      'SELECT id FROM social_workers WHERE user_id = $1',
      [req.userId]
    );

    if (socialWorkerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Social worker profile not found',
        code: 'SOCIAL_WORKER_NOT_FOUND'
      });
    }

    const socialWorkerId = socialWorkerResult.rows[0].id;

    // Verify the patient is assigned to this social worker
    const patientResult = await db.query(
      'SELECT id FROM patients WHERE id = $1 AND assigned_social_worker_id = $2',
      [requestedPatientId, socialWorkerId]
    );

    if (patientResult.rows.length === 0) {
      securityLogger.warn('Social worker attempted to access unassigned patient data', {
        userId: req.userId,
        socialWorkerId,
        requestedPatientId,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        error: 'Access denied - patient not assigned',
        code: 'PATIENT_NOT_ASSIGNED'
      });
    }

    next();
  } catch (error) {
    securityLogger.error('Social worker authorization error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.userId,
      ip: req.ip
    });

    return res.status(500).json({
      success: false,
      error: 'Authorization error',
      code: 'AUTHORIZATION_ERROR'
    });
  }
};

// Optional authentication (doesn't fail if no token provided)
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without authentication
  }

  // If token is provided, authenticate normally
  return authenticate(req, res, next);
};

// Session validation middleware
export const validateSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.sessionId || !req.userId) {
      return next(); // Skip if no session info
    }

    const db = DatabaseConfig.getInstance();
    const sessionResult = await db.query(
      'SELECT * FROM user_sessions WHERE session_token = $1 AND user_id = $2 AND is_active = true AND expires_at > NOW()',
      [req.sessionId, req.userId]
    );

    if (sessionResult.rows.length === 0) {
      securityLogger.warn('Invalid or expired session', {
        sessionId: req.sessionId,
        userId: req.userId,
        ip: req.ip
      });

      return res.status(401).json({
        success: false,
        error: 'Session expired',
        code: 'SESSION_EXPIRED'
      });
    }

    // Update session last accessed time
    await db.query(
      'UPDATE user_sessions SET last_accessed_at = NOW() WHERE session_token = $1',
      [req.sessionId]
    );

    next();
  } catch (error) {
    securityLogger.error('Session validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: req.sessionId,
      userId: req.userId,
      ip: req.ip
    });

    return res.status(500).json({
      success: false,
      error: 'Session validation error',
      code: 'SESSION_ERROR'
    });
  }
};