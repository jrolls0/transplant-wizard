import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { AuthenticatedRequest, UserRole, SocialWorkerDashboard } from './types';
import { authorize, authorizeSocialWorkerPatients } from './middleware/auth';
import { auditRead } from './middleware/audit';
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
 * @route GET /api/v1/social-workers/dashboard
 * @desc Get social worker dashboard data (Web app)
 * @access Private - Social Workers only
 */
router.get('/dashboard',
  authorize(UserRole.SOCIAL_WORKER),
  auditRead('social_worker_dashboard'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get social worker ID
      const socialWorkerResult = await db.query(
        'SELECT id, dialysis_clinic_id FROM social_workers WHERE user_id = $1',
        [userId]
      );

      if (socialWorkerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Social worker profile not found',
          code: 'SOCIAL_WORKER_NOT_FOUND'
        });
      }

      const socialWorkerId = socialWorkerResult.rows[0].id;
      const clinicId = socialWorkerResult.rows[0].dialysis_clinic_id;

      // Get dashboard statistics
      const statsResult = await db.query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_patients,
          COUNT(DISTINCT CASE WHEN pr.id IS NOT NULL THEN p.id END) as patients_with_referrals,
          COUNT(DISTINCT pr.id) as total_referrals,
          COUNT(DISTINCT CASE WHEN pr.status = 'submitted' THEN pr.id END) as pending_referrals,
          COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN p.id END) as new_registrations
        FROM patients p
        LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
        WHERE p.assigned_social_worker_id = $1
      `, [socialWorkerId]);

      const stats = statsResult.rows[0];

      // Get recent notifications (last 10)
      const notificationsResult = await db.query(`
        SELECT 
          n.id, n.type, n.title, n.message, n.data, n.status, n.sent_at, n.read_at,
          u.first_name, u.last_name, u.email as patient_email
        FROM notifications n
        LEFT JOIN patients p ON n.patient_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE n.recipient_id = $1
        ORDER BY n.sent_at DESC
        LIMIT 10
      `, [socialWorkerId]);

      // Get patients list with their status
      const patientsResult = await db.query(`
        SELECT 
          p.id, p.profile_completed, p.onboarding_completed, p.created_at,
          u.first_name, u.last_name, u.email, u.phone_number, u.last_login_at,
          COUNT(pr.id) as referral_count,
          MAX(roi.signed_at) as roi_signed_at,
          CASE WHEN COUNT(pr.id) > 0 THEN 'referrals_submitted'
               WHEN MAX(roi.signed_at) IS NOT NULL THEN 'roi_signed'
               WHEN p.profile_completed THEN 'profile_completed'
               ELSE 'registered' END as status
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
        LEFT JOIN roi_consents roi ON p.id = roi.patient_id AND roi.status = 'signed'
        WHERE p.assigned_social_worker_id = $1
        AND u.deleted_at IS NULL
        GROUP BY p.id, p.profile_completed, p.onboarding_completed, p.created_at,
                 u.first_name, u.last_name, u.email, u.phone_number, u.last_login_at
        ORDER BY p.created_at DESC
      `, [socialWorkerId]);

      // Get clinic information
      const clinicResult = await db.query(
        'SELECT name, address, phone FROM dialysis_clinics WHERE id = $1',
        [clinicId]
      );

      const clinic = clinicResult.rows[0];

      const dashboardData: SocialWorkerDashboard = {
        totalPatients: parseInt(stats.total_patients),
        pendingReferrals: parseInt(stats.pending_referrals),
        newRegistrations: parseInt(stats.new_registrations),
        recentNotifications: notificationsResult.rows.map(notification => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          status: notification.status,
          sentAt: notification.sent_at,
          readAt: notification.read_at,
          patient: notification.first_name ? {
            name: `${notification.first_name} ${notification.last_name}`,
            email: notification.patient_email
          } : null
        })),
        patientsList: patientsResult.rows.map(patient => ({
          id: patient.id,
          firstName: patient.first_name,
          lastName: patient.last_name,
          email: patient.email,
          phoneNumber: patient.phone_number,
          registeredAt: patient.created_at,
          lastLoginAt: patient.last_login_at,
          status: patient.status,
          profileCompleted: patient.profile_completed,
          onboardingCompleted: patient.onboarding_completed,
          referralCount: parseInt(patient.referral_count),
          roiSignedAt: patient.roi_signed_at
        }))
      };

      res.json({
        success: true,
        data: {
          dashboard: dashboardData,
          clinic: {
            name: clinic.name,
            address: clinic.address,
            phone: clinic.phone
          },
          summary: {
            totalPatients: parseInt(stats.total_patients),
            patientsWithReferrals: parseInt(stats.patients_with_referrals),
            totalReferrals: parseInt(stats.total_referrals),
            pendingReferrals: parseInt(stats.pending_referrals),
            newRegistrations: parseInt(stats.new_registrations)
          }
        }
      });

    } catch (error) {
      logger.error('Get social worker dashboard failed', {
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
 * @route GET /api/v1/social-workers/patients
 * @desc Get detailed list of assigned patients (Web app)
 * @access Private - Social Workers only
 */
router.get('/patients',
  authorize(UserRole.SOCIAL_WORKER),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['all', 'registered', 'profile_completed', 'roi_signed', 'referrals_submitted']),
    query('search').optional().isLength({ max: 100 })
  ],
  auditRead('patient'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string || 'all';
      const search = req.query.search as string || '';
      const offset = (page - 1) * limit;

      // Get social worker ID
      const socialWorkerResult = await db.query(
        'SELECT id FROM social_workers WHERE user_id = $1',
        [userId]
      );

      if (socialWorkerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Social worker profile not found',
          code: 'SOCIAL_WORKER_NOT_FOUND'
        });
      }

      const socialWorkerId = socialWorkerResult.rows[0].id;

      // Build dynamic query based on filters
      let whereConditions = ['p.assigned_social_worker_id = $1', 'u.deleted_at IS NULL'];
      let queryParams: any[] = [socialWorkerId];
      let paramIndex = 2;

      // Add search filter
      if (search) {
        whereConditions.push(`(
          u.first_name ILIKE $${paramIndex} OR 
          u.last_name ILIKE $${paramIndex} OR 
          u.email ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // Build status filter
      let statusCondition = '';
      if (status !== 'all') {
        switch (status) {
          case 'registered':
            statusCondition = 'AND p.profile_completed = false';
            break;
          case 'profile_completed':
            statusCondition = 'AND p.profile_completed = true AND roi_count = 0';
            break;
          case 'roi_signed':
            statusCondition = 'AND roi_count > 0 AND referral_count = 0';
            break;
          case 'referrals_submitted':
            statusCondition = 'AND referral_count > 0';
            break;
        }
      }

      // Get patients with pagination
      const patientsQuery = `
        SELECT 
          p.id, p.profile_completed, p.onboarding_completed, p.created_at,
          p.date_of_birth, p.address, p.primary_care_physician, p.insurance_provider,
          u.first_name, u.last_name, u.email, u.phone_number, u.last_login_at,
          COUNT(DISTINCT pr.id) as referral_count,
          COUNT(DISTINCT roi.id) as roi_count,
          MAX(roi.signed_at) as roi_signed_at,
          json_agg(
            DISTINCT jsonb_build_object(
              'center_name', tc.name,
              'selection_order', pr.selection_order,
              'status', pr.status,
              'submitted_at', pr.submitted_at
            )
          ) FILTER (WHERE pr.id IS NOT NULL) as referrals,
          CASE WHEN COUNT(DISTINCT pr.id) > 0 THEN 'referrals_submitted'
               WHEN COUNT(DISTINCT roi.id) > 0 THEN 'roi_signed'
               WHEN p.profile_completed THEN 'profile_completed'
               ELSE 'registered' END as current_status
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
        LEFT JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
        LEFT JOIN roi_consents roi ON p.id = roi.patient_id AND roi.status = 'signed'
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY p.id, p.profile_completed, p.onboarding_completed, p.created_at,
                 p.date_of_birth, p.address, p.primary_care_physician, p.insurance_provider,
                 u.first_name, u.last_name, u.email, u.phone_number, u.last_login_at
        ${statusCondition}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const patientsResult = await db.query(patientsQuery, queryParams);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(DISTINCT p.id) as total
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
        LEFT JOIN roi_consents roi ON p.id = roi.patient_id AND roi.status = 'signed'
        WHERE ${whereConditions.join(' AND ')}
        ${statusCondition}
      `;

      const countResult = await db.query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      const patients = patientsResult.rows.map(patient => ({
        id: patient.id,
        firstName: patient.first_name,
        lastName: patient.last_name,
        email: patient.email,
        phoneNumber: patient.phone_number,
        dateOfBirth: patient.date_of_birth,
        address: patient.address,
        primaryCarePhysician: patient.primary_care_physician,
        insuranceProvider: patient.insurance_provider,
        registeredAt: patient.created_at,
        lastLoginAt: patient.last_login_at,
        status: patient.current_status,
        profileCompleted: patient.profile_completed,
        onboardingCompleted: patient.onboarding_completed,
        roiSigned: patient.roi_count > 0,
        roiSignedAt: patient.roi_signed_at,
        referralCount: parseInt(patient.referral_count),
        referrals: patient.referrals || []
      }));

      res.json({
        success: true,
        data: patients,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      });

    } catch (error) {
      logger.error('Get social worker patients failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get patients',
        code: 'PATIENTS_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/social-workers/patients/:patientId
 * @desc Get detailed patient information (Web app)
 * @access Private - Social Workers only (for their assigned patients)
 */
router.get('/patients/:patientId',
  authorize(UserRole.SOCIAL_WORKER),
  [param('patientId').isUUID()],
  authorizeSocialWorkerPatients,
  auditRead('patient'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const patientId = req.params.patientId;

      // Get comprehensive patient information
      const patientResult = await db.query(`
        SELECT 
          p.*,
          u.first_name, u.last_name, u.email, u.phone_number, u.status as user_status,
          u.created_at as registered_at, u.last_login_at,
          dc.name as dialysis_clinic_name, dc.address as clinic_address, dc.phone as clinic_phone,
          roi.id as roi_id, roi.digital_signature, roi.signed_at as roi_signed_at, roi.status as roi_status
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
        LEFT JOIN roi_consents roi ON p.id = roi.patient_id AND roi.status = 'signed'
        WHERE p.id = $1 AND u.deleted_at IS NULL
      `, [patientId]);

      if (patientResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Patient not found',
          code: 'PATIENT_NOT_FOUND'
        });
      }

      const patient = patientResult.rows[0];

      // Get referrals with transplant center details
      const referralsResult = await db.query(`
        SELECT 
          pr.id, pr.selection_order, pr.status, pr.submitted_at, pr.acknowledged_at, pr.completed_at,
          tc.name, tc.address, tc.city, tc.state, tc.phone, tc.specialties, tc.average_wait_time_months
        FROM patient_referrals pr
        JOIN transplant_centers tc ON pr.transplant_center_id = tc.id
        WHERE pr.patient_id = $1
        ORDER BY pr.selection_order ASC
      `, [patientId]);

      // Get notification history for this patient
      const notificationsResult = await db.query(`
        SELECT 
          n.id, n.type, n.title, n.message, n.data, n.status, n.sent_at, n.read_at
        FROM notifications n
        WHERE n.patient_id = $1
        ORDER BY n.sent_at DESC
        LIMIT 20
      `, [patientId]);

      res.json({
        success: true,
        data: {
          patient: {
            id: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            email: patient.email,
            phoneNumber: patient.phone_number,
            dateOfBirth: patient.date_of_birth,
            address: patient.address,
            primaryCarePhysician: patient.primary_care_physician,
            insuranceProvider: patient.insurance_provider,
            profileCompleted: patient.profile_completed,
            onboardingCompleted: patient.onboarding_completed,
            userStatus: patient.user_status,
            registeredAt: patient.registered_at,
            lastLoginAt: patient.last_login_at,
            dialysisClinic: {
              name: patient.dialysis_clinic_name,
              address: patient.clinic_address,
              phone: patient.clinic_phone
            }
          },
          roi: patient.roi_id ? {
            id: patient.roi_id,
            digitalSignature: patient.digital_signature,
            signedAt: patient.roi_signed_at,
            status: patient.roi_status
          } : null,
          referrals: referralsResult.rows.map(referral => ({
            id: referral.id,
            selectionOrder: referral.selection_order,
            status: referral.status,
            submittedAt: referral.submitted_at,
            acknowledgedAt: referral.acknowledged_at,
            completedAt: referral.completed_at,
            transplantCenter: {
              name: referral.name,
              address: `${referral.address}, ${referral.city}, ${referral.state}`,
              phone: referral.phone,
              specialties: referral.specialties,
              averageWaitTime: referral.average_wait_time_months
            }
          })),
          notifications: notificationsResult.rows.map(notification => ({
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            status: notification.status,
            sentAt: notification.sent_at,
            readAt: notification.read_at
          }))
        }
      });

    } catch (error) {
      logger.error('Get patient details failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId,
        patientId: req.params.patientId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get patient details',
        code: 'PATIENT_DETAILS_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/social-workers/statistics
 * @desc Get social worker statistics and analytics (Web app)
 * @access Private - Social Workers only
 */
router.get('/statistics',
  authorize(UserRole.SOCIAL_WORKER),
  auditRead('social_worker_statistics'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;

      // Get social worker ID
      const socialWorkerResult = await db.query(
        'SELECT id FROM social_workers WHERE user_id = $1',
        [userId]
      );

      if (socialWorkerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Social worker profile not found',
          code: 'SOCIAL_WORKER_NOT_FOUND'
        });
      }

      const socialWorkerId = socialWorkerResult.rows[0].id;

      // Get comprehensive statistics
      const statsResult = await db.query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_patients,
          COUNT(DISTINCT CASE WHEN p.profile_completed = true THEN p.id END) as completed_profiles,
          COUNT(DISTINCT CASE WHEN roi.id IS NOT NULL THEN p.id END) as signed_roi,
          COUNT(DISTINCT CASE WHEN pr.id IS NOT NULL THEN p.id END) as patients_with_referrals,
          COUNT(DISTINCT pr.id) as total_referrals,
          COUNT(DISTINCT CASE WHEN pr.status = 'submitted' THEN pr.id END) as pending_referrals,
          COUNT(DISTINCT CASE WHEN pr.status = 'completed' THEN pr.id END) as completed_referrals,
          COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN p.id END) as new_this_week,
          COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN p.id END) as new_this_month,
          AVG(EXTRACT(DAY FROM (COALESCE(pr.submitted_at, NOW()) - p.created_at))) as avg_days_to_referral
        FROM patients p
        LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
        LEFT JOIN roi_consents roi ON p.id = roi.patient_id AND roi.status = 'signed'
        WHERE p.assigned_social_worker_id = $1
      `, [socialWorkerId]);

      const stats = statsResult.rows[0];

      // Get monthly registration trends (last 6 months)
      const trendsResult = await db.query(`
        SELECT 
          DATE_TRUNC('month', p.created_at) as month,
          COUNT(p.id) as registrations,
          COUNT(CASE WHEN pr.id IS NOT NULL THEN p.id END) as with_referrals
        FROM patients p
        LEFT JOIN patient_referrals pr ON p.id = pr.patient_id
        WHERE p.assigned_social_worker_id = $1
        AND p.created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', p.created_at)
        ORDER BY month ASC
      `, [socialWorkerId]);

      // Get referral status breakdown
      const referralStatusResult = await db.query(`
        SELECT 
          pr.status,
          COUNT(*) as count
        FROM patient_referrals pr
        JOIN patients p ON pr.patient_id = p.id
        WHERE p.assigned_social_worker_id = $1
        GROUP BY pr.status
      `, [socialWorkerId]);

      res.json({
        success: true,
        data: {
          overview: {
            totalPatients: parseInt(stats.total_patients),
            completedProfiles: parseInt(stats.completed_profiles),
            signedROI: parseInt(stats.signed_roi),
            patientsWithReferrals: parseInt(stats.patients_with_referrals),
            totalReferrals: parseInt(stats.total_referrals),
            pendingReferrals: parseInt(stats.pending_referrals),
            completedReferrals: parseInt(stats.completed_referrals),
            newThisWeek: parseInt(stats.new_this_week),
            newThisMonth: parseInt(stats.new_this_month),
            averageDaysToReferral: Math.round(parseFloat(stats.avg_days_to_referral) || 0)
          },
          trends: trendsResult.rows.map(row => ({
            month: row.month,
            registrations: parseInt(row.registrations),
            withReferrals: parseInt(row.with_referrals)
          })),
          referralStatusBreakdown: referralStatusResult.rows.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
          }, {} as Record<string, number>)
        }
      });

    } catch (error) {
      logger.error('Get social worker statistics failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        code: 'STATISTICS_ERROR'
      });
    }
  }
);

export default router;