import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthenticatedRequest, UserRole, TransplantCenterSelection } from './types';
import { authorize } from './middleware/auth';
import { auditCreate, auditRead } from './middleware/audit';
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
 * @route GET /api/v1/transplant-centers
 * @desc Get all transplant centers (Mobile app - for selection)
 * @access Public (for mobile app display) / Private (for logged in users)
 */
router.get('/',
  auditRead('transplant_center'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const transplantCentersResult = await db.query(`
        SELECT 
          id, name, address, city, state, zip_code, distance_miles,
          phone, email, website, specialties, average_wait_time_months,
          is_active, created_at
        FROM transplant_centers
        WHERE is_active = true
        ORDER BY distance_miles ASC
      `);

      // Format data for the mobile app chatbot display
      const formattedCenters = transplantCentersResult.rows.map((center, index) => ({
        id: center.id,
        name: center.name,
        address: center.address,
        city: center.city,
        state: center.state,
        zipCode: center.zip_code,
        distanceMiles: center.distance_miles,
        phone: center.phone,
        email: center.email,
        website: center.website,
        specialties: center.specialties,
        averageWaitTimeMonths: center.average_wait_time_months,
        
        // Formatted strings for chatbot display (matching your requirements exactly)
        displayOrder: index + 1,
        formattedAddress: `• Address: ${center.address}, ${center.city}, ${center.state} ${center.zip_code} (${center.distance_miles} miles)`,
        formattedSpecialties: `• Specialties: ${Array.isArray(center.specialties) ? center.specialties.join(' & ') : center.specialties}`,
        formattedWaitTime: `• Average Wait Time: ${center.average_wait_time_months} months`,
        formattedContact: `• Contact: ${center.phone}`
      }));

      res.json({
        success: true,
        data: formattedCenters,
        meta: {
          total: formattedCenters.length,
          maxSelections: 3
        }
      });

    } catch (error) {
      logger.error('Get transplant centers failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get transplant centers',
        code: 'TRANSPLANT_CENTERS_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/v1/transplant-centers/select
 * @desc Submit transplant center selections (Mobile app - Amelia chatbot)
 * @access Private - Patients only
 */
router.post('/select',
  authorize(UserRole.PATIENT),
  [
    body('transplantCenterIds')
      .isArray({ min: 1, max: 3 })
      .withMessage('Must select 1-3 transplant centers'),
    body('transplantCenterIds.*')
      .isUUID()
      .withMessage('Invalid transplant center ID format')
  ],
  auditCreate('patient_referral'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const { transplantCenterIds }: TransplantCenterSelection = req.body;

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

      // Check if patient already has referrals
      const existingReferrals = await db.query(
        'SELECT id FROM patient_referrals WHERE patient_id = $1',
        [patientId]
      );

      if (existingReferrals.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Transplant center selections already submitted',
          code: 'SELECTIONS_ALREADY_SUBMITTED'
        });
      }

      // Verify ROI consent is signed
      const roiResult = await db.query(
        'SELECT id FROM roi_consents WHERE patient_id = $1 AND status = $2',
        [patientId, 'signed']
      );

      if (roiResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'ROI consent must be signed before selecting transplant centers',
          code: 'ROI_CONSENT_REQUIRED'
        });
      }

      // Verify all transplant center IDs exist and are active
      const centersResult = await db.query(
        'SELECT id, name FROM transplant_centers WHERE id = ANY($1) AND is_active = true',
        [transplantCenterIds]
      );

      if (centersResult.rows.length !== transplantCenterIds.length) {
        return res.status(400).json({
          success: false,
          error: 'One or more invalid transplant center selections',
          code: 'INVALID_TRANSPLANT_CENTERS'
        });
      }

      // Create referral records in transaction
      const referrals = await db.transaction(async (client) => {
        const createdReferrals = [];

        for (let i = 0; i < transplantCenterIds.length; i++) {
          const centerId = transplantCenterIds[i];
          const selectionOrder = i + 1;

          const referralResult = await client.query(`
            INSERT INTO patient_referrals (
              patient_id, transplant_center_id, status, selection_order, submitted_at
            ) VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, submitted_at
          `, [patientId, centerId, 'submitted', selectionOrder]);

          createdReferrals.push({
            id: referralResult.rows[0].id,
            transplantCenterId: centerId,
            selectionOrder,
            status: 'submitted',
            submittedAt: referralResult.rows[0].submitted_at
          });
        }

        // Mark patient onboarding as completed
        await client.query(
          'UPDATE patients SET onboarding_completed = true WHERE id = $1',
          [patientId]
        );

        return createdReferrals;
      });

      // Get patient and social worker info for notification
      const notificationDataResult = await db.query(`
        SELECT 
          p.id as patient_id,
          u.first_name, u.last_name, u.email,
          sw.id as social_worker_id,
          sw_u.email as social_worker_email,
          CONCAT(sw_u.first_name, ' ', sw_u.last_name) as social_worker_name,
          dc.name as clinic_name
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN social_workers sw ON p.assigned_social_worker_id = sw.id
        LEFT JOIN users sw_u ON sw.user_id = sw_u.id
        LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
        WHERE p.id = $1
      `, [patientId]);

      const notificationData = notificationDataResult.rows[0];

      // Create notification for social worker
      if (notificationData.social_worker_id) {
        await db.query(`
          INSERT INTO notifications (
            recipient_id, patient_id, type, title, message, data, status, sent_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
          notificationData.social_worker_id,
          patientId,
          'referral_submitted',
          'Patient Completed Transplant Referral',
          `${notificationData.first_name} ${notificationData.last_name} has completed their profile and selected ${transplantCenterIds.length} transplant center(s) for referral.`,
          JSON.stringify({
            patientName: `${notificationData.first_name} ${notificationData.last_name}`,
            patientEmail: notificationData.email,
            selectedCenters: centersResult.rows.map(c => c.name),
            referralCount: transplantCenterIds.length,
            clinic: notificationData.clinic_name,
            completedAt: new Date().toISOString()
          }),
          'unread'
        ]);
      }

      // Get selected centers info for response
      const selectedCentersResult = await db.query(`
        SELECT tc.name, tc.address, tc.city, tc.state, tc.specialties, tc.average_wait_time_months
        FROM transplant_centers tc
        WHERE tc.id = ANY($1)
        ORDER BY array_position($1, tc.id)
      `, [transplantCenterIds]);

      logger.info('Transplant center selections submitted', {
        userId,
        patientId,
        centerCount: transplantCenterIds.length,
        centerIds: transplantCenterIds,
        socialWorkerId: notificationData.social_worker_id
      });

      res.status(201).json({
        success: true,
        message: 'Transplant center selections submitted successfully',
        data: {
          referrals,
          selectedCenters: selectedCentersResult.rows.map((center, index) => ({
            name: center.name,
            address: `${center.address}, ${center.city}, ${center.state}`,
            specialties: center.specialties,
            averageWaitTime: center.average_wait_time_months,
            selectionOrder: index + 1
          })),
          onboardingCompleted: true,
          socialWorkerNotified: !!notificationData.social_worker_id
        }
      });

    } catch (error) {
      logger.error('Transplant center selection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId,
        centerIds: req.body.transplantCenterIds
      });

      res.status(500).json({
        success: false,
        error: 'Failed to submit transplant center selections',
        code: 'SELECTION_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/transplant-centers/my-selections
 * @desc Get patient's selected transplant centers (Mobile app)
 * @access Private - Patients only
 */
router.get('/my-selections',
  authorize(UserRole.PATIENT),
  auditRead('patient_referral'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get patient's referrals
      const referralsResult = await db.query(`
        SELECT 
          pr.id, pr.selection_order, pr.status, pr.submitted_at, pr.acknowledged_at, pr.completed_at,
          tc.id as center_id, tc.name, tc.address, tc.city, tc.state, tc.distance_miles,
          tc.phone, tc.specialties, tc.average_wait_time_months
        FROM patient_referrals pr
        JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
        JOIN patients p ON pr.patient_id = p.id
        WHERE p.user_id = $1
        ORDER BY pr.selection_order ASC
      `, [userId]);

      if (referralsResult.rows.length === 0) {
        return res.json({
          success: true,
          data: {
            hasSelections: false,
            selections: [],
            message: 'No transplant centers selected yet'
          }
        });
      }

      const selections = referralsResult.rows.map(row => ({
        referralId: row.id,
        center: {
          id: row.center_id,
          name: row.name,
          address: `${row.address}, ${row.city}, ${row.state}`,
          distance: row.distance_miles,
          phone: row.phone,
          specialties: row.specialties,
          averageWaitTime: row.average_wait_time_months
        },
        selectionOrder: row.selection_order,
        status: row.status,
        submittedAt: row.submitted_at,
        acknowledgedAt: row.acknowledged_at,
        completedAt: row.completed_at
      }));

      res.json({
        success: true,
        data: {
          hasSelections: true,
          selections,
          totalSelected: selections.length,
          submittedAt: selections[0]?.submittedAt
        }
      });

    } catch (error) {
      logger.error('Get patient selections failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get selections',
        code: 'SELECTIONS_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/transplant-centers/chatbot-data
 * @desc Get transplant centers formatted for Amelia chatbot (Mobile app)
 * @access Private - Patients only
 */
router.get('/chatbot-data',
  authorize(UserRole.PATIENT),
  auditRead('transplant_center'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const centersResult = await db.query(`
        SELECT id, name, address, city, state, zip_code, distance_miles,
               phone, specialties, average_wait_time_months
        FROM transplant_centers
        WHERE is_active = true
        ORDER BY distance_miles ASC
      `);

      // Format exactly as specified in requirements for Amelia chatbot
      const formattedMessage = {
        greeting: "I'm Amelia, your virtual transplant coordinator. To begin your transplant referral process, please review the list of nearby transplant centers below and choose up to three by replying with their corresponding numbers. Once you've made your selections, I'll contact those centers on your behalf to express your interest and get you next steps.",
        centers: centersResult.rows.map((center, index) => ({
          number: index + 1,
          id: center.id,
          name: center.name,
          formattedDisplay: [
            `${center.name}`,
            `• Address: ${center.address}, ${center.city}, ${center.state} ${center.zip_code} (${center.distance_miles} miles)`,
            `• Specialties: ${Array.isArray(center.specialties) ? center.specialties.join(' & ') : center.specialties}`,
            `• Average Wait Time: ${center.average_wait_time_months} months`,
            `• Contact: ${center.phone}`
          ].join('\n')
        })),
        instructions: "Please select up to 3 centers by choosing their numbers (1-10).",
        maxSelections: 3
      };

      res.json({
        success: true,
        data: formattedMessage
      });

    } catch (error) {
      logger.error('Get chatbot data failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get chatbot data',
        code: 'CHATBOT_DATA_ERROR'
      });
    }
  }
);

export default router;