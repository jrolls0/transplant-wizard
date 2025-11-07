import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { CognitoIdentityProviderClient, InitiateAuthCommand, SignUpCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand } from '@aws-sdk/client-cognito-identity-provider';
import { auditCreate, auditRead } from './middleware/audit';
import { AuthenticatedRequest, UserRole, PatientRegistrationRequest, SocialWorkerRegistrationRequest } from './types';
import DatabaseConfig from './config/database';
import logger from './config/logger';
import { authenticate } from './middleware/auth';

const router = Router();
const db = DatabaseConfig.getInstance();

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || 'us-east-1'
});

// Validation middleware
const validatePatientRegistration = [
  body('firstName').isLength({ min: 1, max: 100 }).trim().escape(),
  body('lastName').isLength({ min: 1, max: 100 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 12 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('dialysisClinic').isIn(['Metro Health Dialysis Center', 'Lakeside Renal Unit', 'Grand River Kidney Care']),
  body('socialWorkerName').isLength({ min: 1, max: 200 }).trim().escape(),
  body('phoneNumber').optional().isMobilePhone(),
  body('dateOfBirth').optional().isISO8601(),
  body('address').optional().isLength({ max: 500 }).trim().escape(),
  body('primaryCarePhysician').optional().isLength({ max: 200 }).trim().escape(),
  body('insuranceProvider').optional().isLength({ max: 200 }).trim().escape()
];

const validateSocialWorkerRegistration = [
  body('firstName').isLength({ min: 1, max: 100 }).trim().escape(),
  body('lastName').isLength({ min: 1, max: 100 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 12 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('dialysisClinic').isIn(['Metro Health Dialysis Center', 'Lakeside Renal Unit', 'Grand River Kidney Care']),
  body('phoneNumber').optional().isMobilePhone(),
  body('licenseNumber').optional().isLength({ max: 100 }).trim().escape(),
  body('department').optional().isLength({ max: 100 }).trim().escape()
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 }),
  body('clientType').isIn(['web', 'mobile'])
];

// Helper function to handle validation errors
const handleValidationErrors = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: errors.array()
    });
    return true;
  }
  return false;
};

/**
 * @route POST /api/v1/auth/register/patient
 * @desc Register a new patient (Mobile app)
 * @access Public
 */
router.post('/register/patient', 
  validatePatientRegistration,
  auditCreate('patient'),
  async (req: Request, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const registrationData: PatientRegistrationRequest = req.body;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [registrationData.email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'User with this email already exists',
          code: 'USER_EXISTS'
        });
      }

      // Get dialysis clinic and social worker info
      const clinicResult = await db.query(
        'SELECT id FROM dialysis_clinics WHERE name = $1 AND is_active = true',
        [registrationData.dialysisClinic]
      );

      if (clinicResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid dialysis clinic',
          code: 'INVALID_CLINIC'
        });
      }

      const clinicId = clinicResult.rows[0].id;

      // Find social worker by name and clinic
      const socialWorkerResult = await db.query(`
        SELECT sw.id 
        FROM social_workers sw
        JOIN users u ON sw.user_id = u.id
        WHERE CONCAT(u.first_name, ' ', u.last_name) = $1 
        AND sw.dialysis_clinic_id = $2
        AND u.status = 'active'
        AND u.deleted_at IS NULL
      `, [registrationData.socialWorkerName, clinicId]);

      if (socialWorkerResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid social worker selection',
          code: 'INVALID_SOCIAL_WORKER'
        });
      }

      const socialWorkerId = socialWorkerResult.rows[0].id;

      // Create user in Cognito
      const signUpCommand = new SignUpCommand({
        ClientId: process.env.COGNITO_MOBILE_CLIENT_ID!,
        Username: registrationData.email,
        Password: registrationData.password,
        UserAttributes: [
          { Name: 'email', Value: registrationData.email },
          { Name: 'given_name', Value: registrationData.firstName },
          { Name: 'family_name', Value: registrationData.lastName },
          { Name: 'custom:user_role', Value: 'patient' },
          { Name: 'custom:dialysis_clinic', Value: registrationData.dialysisClinic },
          { Name: 'custom:assigned_social_worker', Value: registrationData.socialWorkerName }
        ]
      });

      const cognitoResult = await cognitoClient.send(signUpCommand);

      // Create user record in database
      await db.transaction(async (client) => {
        // Create user
        const userResult = await client.query(`
          INSERT INTO users (cognito_sub, email, role, status, title, first_name, last_name, phone_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          cognitoResult.UserSub,
          registrationData.email,
          'patient',
          'pending_verification',
          registrationData.title || null,
          registrationData.firstName,
          registrationData.lastName,
          registrationData.phoneNumber || null
        ]);

        const userId = userResult.rows[0].id;

        // Create patient profile
        await client.query(`
          INSERT INTO patients (
            user_id, dialysis_clinic_id, assigned_social_worker_id,
            date_of_birth, address, primary_care_physician, insurance_provider
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          userId,
          clinicId,
          socialWorkerId,
          registrationData.dateOfBirth ? new Date(registrationData.dateOfBirth) : null,
          registrationData.address || null,
          registrationData.primaryCarePhysician || null,
          registrationData.insuranceProvider || null
        ]);
      });

      logger.info('Patient registration successful', {
        email: registrationData.email,
        cognitoSub: cognitoResult.UserSub,
        clinic: registrationData.dialysisClinic
      });

      res.status(201).json({
        success: true,
        message: 'Patient registration successful. Please check your email for verification.',
        data: {
          email: registrationData.email,
          verificationRequired: true,
          cognitoUserSub: cognitoResult.UserSub
        }
      });

    } catch (error) {
      logger.error('Patient registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: req.body.email
      });

      res.status(500).json({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/register/social-worker
 * @desc Register a new social worker (Web app)
 * @access Public
 */
router.post('/register/social-worker',
  validateSocialWorkerRegistration,
  auditCreate('social_worker'),
  async (req: Request, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const registrationData: SocialWorkerRegistrationRequest = req.body;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [registrationData.email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'User with this email already exists',
          code: 'USER_EXISTS'
        });
      }

      // Get dialysis clinic info
      const clinicResult = await db.query(
        'SELECT id FROM dialysis_clinics WHERE name = $1 AND is_active = true',
        [registrationData.dialysisClinic]
      );

      if (clinicResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid dialysis clinic',
          code: 'INVALID_CLINIC'
        });
      }

      const clinicId = clinicResult.rows[0].id;

      // Create user in Cognito
      const signUpCommand = new SignUpCommand({
        ClientId: process.env.COGNITO_WEB_CLIENT_ID!,
        Username: registrationData.email,
        Password: registrationData.password,
        UserAttributes: [
          { Name: 'email', Value: registrationData.email },
          { Name: 'given_name', Value: registrationData.firstName },
          { Name: 'family_name', Value: registrationData.lastName },
          { Name: 'custom:user_role', Value: 'social_worker' },
          { Name: 'custom:dialysis_clinic', Value: registrationData.dialysisClinic }
        ]
      });

      const cognitoResult = await cognitoClient.send(signUpCommand);

      // Create user record in database
      await db.transaction(async (client) => {
        // Create user
        const userResult = await client.query(`
          INSERT INTO users (cognito_sub, email, role, status, title, first_name, last_name, phone_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          cognitoResult.UserSub,
          registrationData.email,
          'social_worker',
          'pending_verification',
          registrationData.title || null,
          registrationData.firstName,
          registrationData.lastName,
          registrationData.phoneNumber || null
        ]);

        const userId = userResult.rows[0].id;

        // Create social worker profile
        await client.query(`
          INSERT INTO social_workers (user_id, dialysis_clinic_id, license_number, department)
          VALUES ($1, $2, $3, $4)
        `, [
          userId,
          clinicId,
          registrationData.licenseNumber || null,
          registrationData.department || null
        ]);
      });

      logger.info('Social worker registration successful', {
        email: registrationData.email,
        cognitoSub: cognitoResult.UserSub,
        clinic: registrationData.dialysisClinic
      });

      res.status(201).json({
        success: true,
        message: 'Social worker registration successful. Please check your email for verification.',
        data: {
          email: registrationData.email,
          verificationRequired: true,
          cognitoUserSub: cognitoResult.UserSub
        }
      });

    } catch (error) {
      logger.error('Social worker registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: req.body.email
      });

      res.status(500).json({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/verify
 * @desc Verify email confirmation code
 * @access Public
 */
router.post('/verify',
  [
    body('email').isEmail().normalizeEmail(),
    body('confirmationCode').isLength({ min: 6, max: 6 }).isNumeric()
  ],
  async (req: Request, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const { email, confirmationCode } = req.body;

      // Confirm sign up in Cognito
      const confirmCommand = new ConfirmSignUpCommand({
        ClientId: process.env.COGNITO_WEB_CLIENT_ID!, // Try web client first
        Username: email,
        ConfirmationCode: confirmationCode
      });

      try {
        await cognitoClient.send(confirmCommand);
      } catch (error) {
        // Try mobile client if web client fails
        const mobileConfirmCommand = new ConfirmSignUpCommand({
          ClientId: process.env.COGNITO_MOBILE_CLIENT_ID!,
          Username: email,
          ConfirmationCode: confirmationCode
        });
        await cognitoClient.send(mobileConfirmCommand);
      }

      // Update user status in database
      await db.query(`
        UPDATE users 
        SET status = 'active', email_verified = true, email_verified_at = NOW()
        WHERE email = $1
      `, [email]);

      logger.info('Email verification successful', { email });

      res.json({
        success: true,
        message: 'Email verified successfully',
        data: {
          email,
          verified: true
        }
      });

    } catch (error) {
      logger.error('Email verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: req.body.email
      });

      res.status(400).json({
        success: false,
        error: 'Verification failed',
        code: 'VERIFICATION_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/v1/auth/resend-verification
 * @desc Resend verification code
 * @access Public
 */
router.post('/resend-verification',
  [body('email').isEmail().normalizeEmail()],
  async (req: Request, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const { email } = req.body;

      // Resend confirmation code
      const resendCommand = new ResendConfirmationCodeCommand({
        ClientId: process.env.COGNITO_WEB_CLIENT_ID!,
        Username: email
      });

      try {
        await cognitoClient.send(resendCommand);
      } catch (error) {
        // Try mobile client
        const mobileResendCommand = new ResendConfirmationCodeCommand({
          ClientId: process.env.COGNITO_MOBILE_CLIENT_ID!,
          Username: email
        });
        await cognitoClient.send(mobileResendCommand);
      }

      res.json({
        success: true,
        message: 'Verification code resent successfully'
      });

    } catch (error) {
      logger.error('Resend verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email: req.body.email
      });

      res.status(400).json({
        success: false,
        error: 'Failed to resend verification code',
        code: 'RESEND_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me',
  authenticate,
  auditRead('user'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get user with role-specific details
      let userQuery = '';
      if (req.userRole === UserRole.PATIENT) {
        userQuery = `
          SELECT u.*, p.id as patient_id, p.dialysis_clinic_id, p.assigned_social_worker_id,
                 p.date_of_birth, p.address, p.primary_care_physician, p.insurance_provider,
                 p.profile_completed, p.onboarding_completed,
                 dc.name as dialysis_clinic_name,
                 CONCAT(sw_u.first_name, ' ', sw_u.last_name) as social_worker_name
          FROM users u
          LEFT JOIN patients p ON u.id = p.user_id
          LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
          LEFT JOIN social_workers sw ON p.assigned_social_worker_id = sw.id
          LEFT JOIN users sw_u ON sw.user_id = sw_u.id
          WHERE u.id = $1 AND u.deleted_at IS NULL
        `;
      } else if (req.userRole === UserRole.SOCIAL_WORKER) {
        userQuery = `
          SELECT u.*, sw.id as social_worker_id, sw.dialysis_clinic_id, sw.license_number,
                 sw.department, sw.email_notifications_enabled,
                 dc.name as dialysis_clinic_name
          FROM users u
          LEFT JOIN social_workers sw ON u.id = sw.user_id
          LEFT JOIN dialysis_clinics dc ON sw.dialysis_clinic_id = dc.id
          WHERE u.id = $1 AND u.deleted_at IS NULL
        `;
      } else {
        userQuery = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
      }

      const result = await db.query(userQuery, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const user = result.rows[0];

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number,
          emailVerified: user.email_verified,
          lastLoginAt: user.last_login_at,
          createdAt: user.created_at,
          ...(req.userRole === UserRole.PATIENT && {
            patientId: user.patient_id,
            dialysisClinic: user.dialysis_clinic_name,
            socialWorkerName: user.social_worker_name,
            profileCompleted: user.profile_completed,
            onboardingCompleted: user.onboarding_completed,
            dateOfBirth: user.date_of_birth,
            address: user.address,
            primaryCarePhysician: user.primary_care_physician,
            insuranceProvider: user.insurance_provider
          }),
          ...(req.userRole === UserRole.SOCIAL_WORKER && {
            socialWorkerId: user.social_worker_id,
            dialysisClinic: user.dialysis_clinic_name,
            licenseNumber: user.license_number,
            department: user.department,
            emailNotificationsEnabled: user.email_notifications_enabled
          })
        }
      });

    } catch (error) {
      logger.error('Get user profile failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get user profile',
        code: 'PROFILE_ERROR'
      });
    }
  }
);

export default router;