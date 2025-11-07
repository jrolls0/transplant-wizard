import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { AuthenticatedRequest, UserRole } from './types';
import { authorize } from './middleware/auth';
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
 * @route GET /api/v1/admin/system-health
 * @desc Get system health and status
 * @access Private - Admin only
 */
router.get('/system-health',
  authorize(UserRole.ADMIN),
  auditRead('system_health'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Database health check
      const dbHealthResult = await db.query('SELECT NOW() as timestamp, version() as version');
      const dbHealth = {
        status: 'healthy',
        timestamp: dbHealthResult.rows[0].timestamp,
        version: dbHealthResult.rows[0].version.split(' ').slice(0, 2).join(' ')
      };

      // Get system statistics
      const statsResult = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
          (SELECT COUNT(*) FROM patients) as total_patients,
          (SELECT COUNT(*) FROM social_workers) as total_social_workers,
          (SELECT COUNT(*) FROM patient_referrals) as total_referrals,
          (SELECT COUNT(*) FROM roi_consents WHERE status = 'signed') as signed_roi,
          (SELECT COUNT(*) FROM notifications WHERE sent_at >= NOW() - INTERVAL '24 hours') as notifications_24h,
          (SELECT COUNT(*) FROM audit_logs WHERE occurred_at >= NOW() - INTERVAL '24 hours') as audit_logs_24h
      `);

      const stats = statsResult.rows[0];

      // Get recent activity
      const recentActivityResult = await db.query(`
        SELECT 
          'user_registration' as activity_type,
          COUNT(*) as count,
          'last_24h' as period
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        UNION ALL
        SELECT 
          'referral_submission' as activity_type,
          COUNT(*) as count,
          'last_24h' as period
        FROM patient_referrals 
        WHERE submitted_at >= NOW() - INTERVAL '24 hours'
        UNION ALL
        SELECT 
          'roi_signed' as activity_type,
          COUNT(*) as count,
          'last_24h' as period
        FROM roi_consents 
        WHERE signed_at >= NOW() - INTERVAL '24 hours'
      `);

      res.json({
        success: true,
        data: {
          system: {
            status: 'healthy',
            uptime: process.uptime(),
            environment: process.env.NODE_ENV,
            version: process.env.API_VERSION || 'v1',
            timestamp: new Date().toISOString()
          },
          database: dbHealth,
          statistics: {
            totalUsers: parseInt(stats.total_users),
            totalPatients: parseInt(stats.total_patients),
            totalSocialWorkers: parseInt(stats.total_social_workers),
            totalReferrals: parseInt(stats.total_referrals),
            signedROI: parseInt(stats.signed_roi),
            notifications24h: parseInt(stats.notifications_24h),
            auditLogs24h: parseInt(stats.audit_logs_24h)
          },
          recentActivity: recentActivityResult.rows.reduce((acc, row) => {
            acc[row.activity_type] = parseInt(row.count);
            return acc;
          }, {} as Record<string, number>)
        }
      });

    } catch (error) {
      logger.error('Get system health failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get system health',
        code: 'SYSTEM_HEALTH_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/admin/audit-logs
 * @desc Get audit logs for compliance
 * @access Private - Admin only
 */
router.get('/audit-logs',
  authorize(UserRole.ADMIN),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('action').optional().isIn(['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT']),
    query('resource_type').optional().isLength({ max: 100 }),
    query('user_id').optional().isUUID(),
    query('phi_accessed').optional().isBoolean(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601()
  ],
  auditRead('audit_log'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const action = req.query.action as string;
      const resourceType = req.query.resource_type as string;
      const userId = req.query.user_id as string;
      const phiAccessed = req.query.phi_accessed as string;
      const startDate = req.query.start_date as string;
      const endDate = req.query.end_date as string;
      const offset = (page - 1) * limit;

      // Build dynamic query
      let whereConditions: string[] = [];
      let queryParams: any[] = [];
      let paramIndex = 1;

      if (action) {
        whereConditions.push(`al.action = $${paramIndex}`);
        queryParams.push(action);
        paramIndex++;
      }

      if (resourceType) {
        whereConditions.push(`al.resource_type = $${paramIndex}`);
        queryParams.push(resourceType);
        paramIndex++;
      }

      if (userId) {
        whereConditions.push(`al.user_id = $${paramIndex}`);
        queryParams.push(userId);
        paramIndex++;
      }

      if (phiAccessed === 'true') {
        whereConditions.push(`al.phi_accessed = true`);
      } else if (phiAccessed === 'false') {
        whereConditions.push(`al.phi_accessed = false`);
      }

      if (startDate) {
        whereConditions.push(`al.occurred_at >= $${paramIndex}`);
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        whereConditions.push(`al.occurred_at <= $${paramIndex}`);
        queryParams.push(endDate);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get audit logs
      const auditLogsQuery = `
        SELECT 
          al.*,
          u.email as user_email,
          u.first_name,
          u.last_name
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.occurred_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const auditLogsResult = await db.query(auditLogsQuery, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM audit_logs al
        ${whereClause}
      `;

      const countResult = await db.query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      const auditLogs = auditLogsResult.rows.map(log => ({
        id: log.id,
        userId: log.user_id,
        userEmail: log.user_email,
        userName: log.first_name && log.last_name ? `${log.first_name} ${log.last_name}` : null,
        userRole: log.user_role,
        sessionId: log.session_id,
        action: log.action,
        resourceType: log.resource_type,
        resourceId: log.resource_id,
        endpoint: log.endpoint,
        method: log.method,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        oldValues: log.old_values,
        newValues: log.new_values,
        phiAccessed: log.phi_accessed,
        phiFields: log.phi_fields,
        description: log.description,
        metadata: log.metadata,
        occurredAt: log.occurred_at
      }));

      res.json({
        success: true,
        data: auditLogs,
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
      logger.error('Get audit logs failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get audit logs',
        code: 'AUDIT_LOGS_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/admin/analytics
 * @desc Get system analytics and insights
 * @access Private - Admin only
 */
router.get('/analytics',
  authorize(UserRole.ADMIN),
  [
    query('period').optional().isIn(['7d', '30d', '90d', '6m', '1y']),
    query('metric').optional().isIn(['registrations', 'referrals', 'roi_signups', 'logins', 'all'])
  ],
  auditRead('system_analytics'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const period = req.query.period as string || '30d';
      const metric = req.query.metric as string || 'all';

      // Convert period to SQL interval
      const intervalMap: Record<string, string> = {
        '7d': '7 days',
        '30d': '30 days',
        '90d': '90 days',
        '6m': '6 months',
        '1y': '1 year'
      };

      const interval = intervalMap[period];

      // Get registration trends
      const registrationTrendsResult = await db.query(`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as registrations,
          COUNT(CASE WHEN role = 'patient' THEN 1 END) as patient_registrations,
          COUNT(CASE WHEN role = 'social_worker' THEN 1 END) as social_worker_registrations
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '${interval}'
        AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date ASC
      `);

      // Get referral trends
      const referralTrendsResult = await db.query(`
        SELECT 
          DATE_TRUNC('day', submitted_at) as date,
          COUNT(*) as referrals,
          COUNT(DISTINCT patient_id) as unique_patients
        FROM patient_referrals 
        WHERE submitted_at >= NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC('day', submitted_at)
        ORDER BY date ASC
      `);

      // Get ROI signing trends
      const roiTrendsResult = await db.query(`
        SELECT 
          DATE_TRUNC('day', signed_at) as date,
          COUNT(*) as roi_signed
        FROM roi_consents 
        WHERE signed_at >= NOW() - INTERVAL '${interval}'
        AND status = 'signed'
        GROUP BY DATE_TRUNC('day', signed_at)
        ORDER BY date ASC
      `);

      // Get clinic distribution
      const clinicDistributionResult = await db.query(`
        SELECT 
          dc.name as clinic_name,
          COUNT(DISTINCT p.id) as patient_count,
          COUNT(DISTINCT sw.id) as social_worker_count
        FROM dialysis_clinics dc
        LEFT JOIN patients p ON dc.id = p.dialysis_clinic_id
        LEFT JOIN social_workers sw ON dc.id = sw.dialysis_clinic_id
        WHERE dc.is_active = true
        GROUP BY dc.id, dc.name
        ORDER BY patient_count DESC
      `);

      // Get transplant center popularity
      const transplantCenterPopularityResult = await db.query(`
        SELECT 
          tc.name as center_name,
          COUNT(pr.id) as selection_count,
          AVG(pr.selection_order) as avg_selection_order
        FROM transplant_centers tc
        LEFT JOIN patient_referrals pr ON tc.id = pr.transplant_center_id
        WHERE tc.is_active = true
        GROUP BY tc.id, tc.name
        ORDER BY selection_count DESC
      `);

      res.json({
        success: true,
        data: {
          period,
          trends: {
            registrations: registrationTrendsResult.rows,
            referrals: referralTrendsResult.rows,
            roiSignups: roiTrendsResult.rows
          },
          distribution: {
            clinics: clinicDistributionResult.rows,
            transplantCenters: transplantCenterPopularityResult.rows
          }
        }
      });

    } catch (error) {
      logger.error('Get analytics failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get analytics',
        code: 'ANALYTICS_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/admin/system-config
 * @desc Get system configuration
 * @access Private - Admin only
 */
router.get('/system-config',
  authorize(UserRole.ADMIN),
  auditRead('system_configuration'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const configResult = await db.query(`
        SELECT key, value, description, created_at, updated_at
        FROM system_configurations
        ORDER BY key ASC
      `);

      res.json({
        success: true,
        data: configResult.rows
      });

    } catch (error) {
      logger.error('Get system config failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get system configuration',
        code: 'SYSTEM_CONFIG_ERROR'
      });
    }
  }
);

export default router;