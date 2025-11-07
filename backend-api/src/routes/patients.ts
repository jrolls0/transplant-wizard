import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { AuthenticatedRequest, UserRole, ROIConsentRequest, TransplantCenterSelection } from './types';
import { authorize, authorizePatientSelf } from './middleware/auth';
import { auditCreate, auditUpdate, auditRead } from './middleware/audit';
import DatabaseConfig from './config/database';
import logger from './config/logger';

const router = Router();
const db = DatabaseConfig.getInstance();

// Helper function to handle validation errors
const handleValidationErrors = (req: AuthenticatedRequest, res: Response): boolean => {
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
 * @route GET /api/v1/patients/dashboard
 * @desc Get patient dashboard data (Mobile app)
 * @access Private - Patients only
 */
router.get('/dashboard',
  authorize(UserRole.PATIENT),
  auditRead('patient_dashboard'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get patient data with all related information
      const patientResult = await db.query(`
        SELECT 
          p.id, p.profile_completed, p.onboarding_completed,
          u.first_name, u.last_name, u.email,
          dc.name as dialysis_clinic_name,
          CONCAT(sw_u.first_name, ' ', sw_u.last_name) as social_worker_name,
          sw_u.email as social_worker_email
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
        LEFT JOIN social_workers sw ON p.assigned_social_worker_id = sw.id
        LEFT JOIN users sw_u ON sw.user_id = sw_u.id
        WHERE p.user_id = $1
      `, [userId]);

      if (patientResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Patient profile not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      const patient = patientResult.rows[0];

      // Check ROI consent status
      const roiResult = await db.query(`
        SELECT id, status, signed_at 
        FROM roi_consents 
        WHERE patient_id = $1 AND status = 'signed'
        ORDER BY signed_at DESC 
        LIMIT 1
      `, [patient.id]);

      const roiSigned = roiResult.rows.length > 0;

      // Get transplant center referrals
      const referralsResult = await db.query(`
        SELECT 
          pr.id, pr.selection_order, pr.status, pr.submitted_at,
          tc.name, tc.address, tc.city, tc.state, tc.distance_miles,
          tc.specialties, tc.average_wait_time_months, tc.phone
        FROM patient_referrals pr
        JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
        WHERE pr.patient_id = $1
        ORDER BY pr.selection_order ASC
      `, [patient.id]);

      // Get next steps based on current progress
      const nextSteps = [];
      if (!patient.profile_completed) {
        nextSteps.push({
          step: 'complete_profile',
          title: 'Complete Your Profile',
          description: 'Add your personal and medical information',
          required: true
        });
      }
      if (!roiSigned) {
        nextSteps.push({
          step: 'sign_roi',
          title: 'Sign Release of Information',
          description: 'Authorize sharing of your medical records',
          required: true
        });
      }
      if (referralsResult.rows.length === 0) {
        nextSteps.push({
          step: 'select_transplant_centers',
          title: 'Select Transplant Centers',
          description: 'Choose up to 3 transplant centers for referral',
          required: true
        });
      }

      res.json({
        success: true,
        data: {
          patient: {
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            email: patient.email,
            dialysisClinic: patient.dialysis_clinic_name,
            socialWorker: {
              name: patient.social_worker_name,
              email: patient.social_worker_email
            }
          },
          progress: {
            profileCompleted: patient.profile_completed,
            onboardingCompleted: patient.onboarding_completed,
            roiSigned,
            referralsSubmitted: referralsResult.rows.length,
            totalSteps: 4,
            completedSteps: [
              patient.profile_completed,
              roiSigned,
              referralsResult.rows.length > 0,
              patient.onboarding_completed
            ].filter(Boolean).length
          },
          selectedTransplantCenters: referralsResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            address: `${row.address}, ${row.city}, ${row.state}`,
            distance: row.distance_miles,
            specialties: row.specialties,
            averageWaitTime: row.average_wait_time_months,
            phone: row.phone,
            selectionOrder: row.selection_order,
            status: row.status,
            submittedAt: row.submitted_at
          })),
          nextSteps
        }
      });

    } catch (error) {
      logger.error('Get patient dashboard failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard data',
        code: 'DASHBOARD_ERROR'
      });
    }
  }
);

/**
 * @route PUT /api/v1/patients/profile
 * @desc Update patient profile (Mobile app)
 * @access Private - Patients only
 */
router.put('/profile',
  authorize(UserRole.PATIENT),
  [
    body('dateOfBirth').optional().isISO8601(),
    body('address').optional().isLength({ max: 500 }).trim(),
    body('primaryCarePhysician').optional().isLength({ max: 200 }).trim(),
    body('insuranceProvider').optional().isLength({ max: 200 }).trim(),
    body('phoneNumber').optional().isMobilePhone()
  ],
  auditUpdate('patient'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const { dateOfBirth, address, primaryCarePhysician, insuranceProvider, phoneNumber } = req.body;

      // Get patient ID
      const patientResult = await db.query(
        'SELECT id FROM patients WHERE user_id = $1',
        [userId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Patient profile not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      const patientId = patientResult.rows[0].id;

      // Update patient profile in transaction
      await db.transaction(async (client) => {
        // Update patient table
        if (dateOfBirth || address || primaryCarePhysician || insuranceProvider) {
          await client.query(`
            UPDATE patients 
            SET date_of_birth = COALESCE($1, date_of_birth),
                address = COALESCE($2, address),
                primary_care_physician = COALESCE($3, primary_care_physician),
                insurance_provider = COALESCE($4, insurance_provider),
                profile_completed = true,
                updated_at = NOW()
            WHERE id = $5
          `, [
            dateOfBirth ? new Date(dateOfBirth) : null,
            address,
            primaryCarePhysician,
            insuranceProvider,
            patientId
          ]);
        }

        // Update user table (phone number)
        if (phoneNumber) {
          await client.query(`
            UPDATE users 
            SET phone_number = $1, updated_at = NOW()
            WHERE id = $2
          `, [phoneNumber, userId]);
        }
      });

      logger.info('Patient profile updated', {
        userId,
        patientId,
        fieldsUpdated: Object.keys(req.body)
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          profileCompleted: true
        }
      });

    } catch (error) {
      logger.error('Update patient profile failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update profile',
        code: 'PROFILE_UPDATE_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/v1/patients/roi-consent
 * @desc Sign ROI consent (Mobile app)
 * @access Private - Patients only
 */
router.post('/roi-consent',
  authorize(UserRole.PATIENT),
  [
    body('digitalSignature').isLength({ min: 1, max: 500 }).trim(),
    body('consentText').isLength({ min: 1 })
  ],
  auditCreate('roi_consent'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const { digitalSignature, consentText }: ROIConsentRequest = req.body;

      // Get patient ID
      const patientResult = await db.query(
        'SELECT id FROM patients WHERE user_id = $1',
        [userId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Patient profile not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      const patientId = patientResult.rows[0].id;

      // Check if ROI already signed
      const existingROI = await db.query(
        'SELECT id FROM roi_consents WHERE patient_id = $1 AND status = $2',
        [patientId, 'signed']
      );

      if (existingROI.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'ROI consent already signed',
          code: 'ROI_ALREADY_SIGNED'
        });
      }

      // Create ROI consent record
      const roiResult = await db.query(`
        INSERT INTO roi_consents (
          patient_id, consent_text, digital_signature, 
          ip_address, user_agent, status, signed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, signed_at
      `, [
        patientId,
        consentText,
        digitalSignature,
        req.ip,
        req.get('User-Agent'),
        'signed'
      ]);

      const roiId = roiResult.rows[0].id;
      const signedAt = roiResult.rows[0].signed_at;

      logger.info('ROI consent signed', {
        userId,
        patientId,
        roiId,
        signature: digitalSignature.substring(0, 10) + '...'
      });

      res.status(201).json({
        success: true,
        message: 'ROI consent signed successfully',
        data: {
          roiId,
          signedAt,
          status: 'signed'
        }
      });

    } catch (error) {
      logger.error('ROI consent signing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to sign ROI consent',
        code: 'ROI_CONSENT_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/patients/roi-consent
 * @desc Get ROI consent status (Mobile app)
 * @access Private - Patients only
 */
router.get('/roi-consent',
  authorize(UserRole.PATIENT),
  auditRead('roi_consent'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get patient ID and ROI status
      const result = await db.query(`
        SELECT 
          p.id as patient_id,
          roi.id as roi_id,
          roi.status,
          roi.signed_at,
          roi.digital_signature,
          sc.value as consent_text
        FROM patients p
        LEFT JOIN roi_consents roi ON p.id = roi.patient_id AND roi.status = 'signed'
        LEFT JOIN system_configurations sc ON sc.key = 'roi_consent_text'
        WHERE p.user_id = $1
        ORDER BY roi.signed_at DESC
        LIMIT 1
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Patient profile not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      const data = result.rows[0];

      res.json({
        success: true,
        data: {
          isSigned: !!data.roi_id,
          consentText: data.consent_text,
          ...(data.roi_id && {
            roiId: data.roi_id,
            signedAt: data.signed_at,
            digitalSignature: data.digital_signature
          })
        }
      });

    } catch (error) {
      logger.error('Get ROI consent failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get ROI consent',
        code: 'ROI_CONSENT_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/patients/dialysis-clinics
 * @desc Get dialysis clinics and social workers (Mobile app registration)
 * @access Public
 */
router.get('/dialysis-clinics',
  auditRead('dialysis_clinic'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const clinicsResult = await db.query(`
        SELECT 
          dc.id,
          dc.name,
          dc.address,
          dc.phone,
          dc.email,
          json_agg(
            json_build_object(
              'id', sw.id,
              'name', CONCAT(u.first_name, ' ', u.last_name),
              'department', sw.department,
              'email', u.email
            ) ORDER BY u.first_name, u.last_name
          ) as social_workers
        FROM dialysis_clinics dc
        LEFT JOIN social_workers sw ON dc.id = sw.dialysis_clinic_id
        LEFT JOIN users u ON sw.user_id = u.id AND u.status = 'active' AND u.deleted_at IS NULL
        WHERE dc.is_active = true
        GROUP BY dc.id, dc.name, dc.address, dc.phone, dc.email
        ORDER BY dc.name
      `);

      res.json({
        success: true,
        data: clinicsResult.rows.map(clinic => ({
          id: clinic.id,
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone,
          email: clinic.email,
          socialWorkers: clinic.social_workers.filter((sw: any) => sw.id !== null)
        }))
      });

    } catch (error) {
      logger.error('Get dialysis clinics failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get dialysis clinics',
        code: 'CLINICS_ERROR'
      });
    }
  }
);

export default router;