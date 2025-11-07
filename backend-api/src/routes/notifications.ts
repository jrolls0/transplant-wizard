import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { AuthenticatedRequest, UserRole, NotificationType, CreateNotificationRequest } from './types';
import { authorize } from './middleware/auth';
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
 * @route GET /api/v1/notifications
 * @desc Get notifications for social worker (Web app)
 * @access Private - Social Workers only
 */
router.get('/',
  authorize(UserRole.SOCIAL_WORKER),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['all', 'unread', 'read', 'archived']),
    query('type').optional().isIn(Object.values(NotificationType))
  ],
  auditRead('notification'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string || 'all';
      const type = req.query.type as string;
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
      let whereConditions = ['n.recipient_id = $1'];
      let queryParams: any[] = [socialWorkerId];
      let paramIndex = 2;

      // Add status filter
      if (status !== 'all') {
        whereConditions.push(`n.status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      // Add type filter
      if (type) {
        whereConditions.push(`n.type = $${paramIndex}`);
        queryParams.push(type);
        paramIndex++;
      }

      // Get notifications with patient information
      const notificationsQuery = `
        SELECT 
          n.id, n.type, n.title, n.message, n.data, n.status, 
          n.sent_at, n.read_at, n.archived_at,
          p.id as patient_id,
          u.first_name, u.last_name, u.email as patient_email
        FROM notifications n
        LEFT JOIN patients p ON n.patient_id = p.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY n.sent_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limit, offset);

      const notificationsResult = await db.query(notificationsQuery, queryParams);

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM notifications n
        WHERE ${whereConditions.join(' AND ')}
      `;

      const countResult = await db.query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      // Get unread count
      const unreadCountResult = await db.query(
        'SELECT COUNT(*) as unread_count FROM notifications WHERE recipient_id = $1 AND status = $2',
        [socialWorkerId, 'unread']
      );

      const notifications = notificationsResult.rows.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        status: notification.status,
        sentAt: notification.sent_at,
        readAt: notification.read_at,
        archivedAt: notification.archived_at,
        patient: notification.patient_id ? {
          id: notification.patient_id,
          name: `${notification.first_name} ${notification.last_name}`,
          email: notification.patient_email
        } : null
      }));

      res.json({
        success: true,
        data: notifications,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
          unreadCount: parseInt(unreadCountResult.rows[0].unread_count)
        }
      });

    } catch (error) {
      logger.error('Get notifications failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get notifications',
        code: 'NOTIFICATIONS_ERROR'
      });
    }
  }
);

/**
 * @route PUT /api/v1/notifications/:notificationId/read
 * @desc Mark notification as read (Web app)
 * @access Private - Social Workers only
 */
router.put('/:notificationId/read',
  authorize(UserRole.SOCIAL_WORKER),
  [param('notificationId').isUUID()],
  auditUpdate('notification'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const notificationId = req.params.notificationId;

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

      // Update notification status
      const updateResult = await db.query(`
        UPDATE notifications 
        SET status = 'read', read_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND recipient_id = $2 AND status = 'unread'
        RETURNING id, status, read_at
      `, [notificationId, socialWorkerId]);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found or already read',
          code: 'NOTIFICATION_NOT_FOUND'
        });
      }

      // Emit real-time update via WebSocket
      const io = req.app.get('io');
      if (io) {
        io.to(`social-worker-${socialWorkerId}`).emit('notification-read', {
          notificationId,
          readAt: updateResult.rows[0].read_at
        });
      }

      logger.info('Notification marked as read', {
        userId,
        notificationId,
        socialWorkerId
      });

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: {
          id: updateResult.rows[0].id,
          status: updateResult.rows[0].status,
          readAt: updateResult.rows[0].read_at
        }
      });

    } catch (error) {
      logger.error('Mark notification as read failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId,
        notificationId: req.params.notificationId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read',
        code: 'NOTIFICATION_READ_ERROR'
      });
    }
  }
);

/**
 * @route PUT /api/v1/notifications/mark-all-read
 * @desc Mark all notifications as read (Web app)
 * @access Private - Social Workers only
 */
router.put('/mark-all-read',
  authorize(UserRole.SOCIAL_WORKER),
  auditUpdate('notification'),
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

      // Update all unread notifications
      const updateResult = await db.query(`
        UPDATE notifications 
        SET status = 'read', read_at = NOW(), updated_at = NOW()
        WHERE recipient_id = $1 AND status = 'unread'
        RETURNING id
      `, [socialWorkerId]);

      const updatedCount = updateResult.rows.length;

      // Emit real-time update via WebSocket
      const io = req.app.get('io');
      if (io) {
        io.to(`social-worker-${socialWorkerId}`).emit('all-notifications-read', {
          updatedCount,
          readAt: new Date()
        });
      }

      logger.info('All notifications marked as read', {
        userId,
        socialWorkerId,
        updatedCount
      });

      res.json({
        success: true,
        message: `${updatedCount} notifications marked as read`,
        data: {
          updatedCount,
          readAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Mark all notifications as read failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read',
        code: 'NOTIFICATIONS_READ_ERROR'
      });
    }
  }
);

/**
 * @route PUT /api/v1/notifications/:notificationId/archive
 * @desc Archive notification (Web app)
 * @access Private - Social Workers only
 */
router.put('/:notificationId/archive',
  authorize(UserRole.SOCIAL_WORKER),
  [param('notificationId').isUUID()],
  auditUpdate('notification'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      const userId = req.userId!;
      const notificationId = req.params.notificationId;

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

      // Update notification status
      const updateResult = await db.query(`
        UPDATE notifications 
        SET status = 'archived', archived_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND recipient_id = $2
        RETURNING id, status, archived_at
      `, [notificationId, socialWorkerId]);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found',
          code: 'NOTIFICATION_NOT_FOUND'
        });
      }

      logger.info('Notification archived', {
        userId,
        notificationId,
        socialWorkerId
      });

      res.json({
        success: true,
        message: 'Notification archived',
        data: {
          id: updateResult.rows[0].id,
          status: updateResult.rows[0].status,
          archivedAt: updateResult.rows[0].archived_at
        }
      });

    } catch (error) {
      logger.error('Archive notification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId,
        notificationId: req.params.notificationId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to archive notification',
        code: 'NOTIFICATION_ARCHIVE_ERROR'
      });
    }
  }
);

/**
 * @route GET /api/v1/notifications/unread-count
 * @desc Get unread notification count (Web app - for real-time updates)
 * @access Private - Social Workers only
 */
router.get('/unread-count',
  authorize(UserRole.SOCIAL_WORKER),
  auditRead('notification'),
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

      // Get unread count
      const countResult = await db.query(
        'SELECT COUNT(*) as unread_count FROM notifications WHERE recipient_id = $1 AND status = $2',
        [socialWorkerId, 'unread']
      );

      res.json({
        success: true,
        data: {
          unreadCount: parseInt(countResult.rows[0].unread_count)
        }
      });

    } catch (error) {
      logger.error('Get unread count failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get unread count',
        code: 'UNREAD_COUNT_ERROR'
      });
    }
  }
);

/**
 * @route POST /api/v1/notifications/test
 * @desc Create test notification (Development only)
 * @access Private - Admin only
 */
router.post('/test',
  authorize(UserRole.ADMIN),
  [
    body('recipientId').isUUID(),
    body('type').isIn(Object.values(NotificationType)),
    body('title').isLength({ min: 1, max: 200 }),
    body('message').isLength({ min: 1, max: 1000 }),
    body('patientId').optional().isUUID()
  ],
  auditCreate('notification'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (handleValidationErrors(req, res)) return;

      // Only allow in development environment
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          error: 'Test notifications not allowed in production',
          code: 'NOT_ALLOWED_IN_PRODUCTION'
        });
      }

      const { recipientId, patientId, type, title, message }: CreateNotificationRequest = req.body;

      // Create test notification
      const notificationResult = await db.query(`
        INSERT INTO notifications (
          recipient_id, patient_id, type, title, message, data, status, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, sent_at
      `, [
        recipientId,
        patientId || null,
        type,
        title,
        message,
        JSON.stringify({ test: true, createdBy: req.userId }),
        'unread'
      ]);

      const notificationId = notificationResult.rows[0].id;

      // Emit real-time notification via WebSocket
      const io = req.app.get('io');
      if (io) {
        io.to(`social-worker-${recipientId}`).emit('new-notification', {
          id: notificationId,
          type,
          title,
          message,
          sentAt: notificationResult.rows[0].sent_at
        });
      }

      logger.info('Test notification created', {
        notificationId,
        recipientId,
        type,
        createdBy: req.userId
      });

      res.status(201).json({
        success: true,
        message: 'Test notification created',
        data: {
          id: notificationId,
          sentAt: notificationResult.rows[0].sent_at
        }
      });

    } catch (error) {
      logger.error('Create test notification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.userId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create test notification',
        code: 'TEST_NOTIFICATION_ERROR'
      });
    }
  }
);

export default router;