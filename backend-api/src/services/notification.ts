import { Server as SocketIOServer } from 'socket.io';
import { NotificationType, CreateNotificationRequest } from './types';
import DatabaseConfig from './config/database';
import logger from './config/logger';

class NotificationService {
  private io: SocketIOServer | null = null;
  private db: DatabaseConfig;

  constructor() {
    this.db = DatabaseConfig.getInstance();
  }

  public setSocketIO(io: SocketIOServer): void {
    this.io = io;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        ip: socket.handshake.address
      });

      // Handle social worker joining their notification room
      socket.on('join-social-worker-room', (socialWorkerId: string) => {
        socket.join(`social-worker-${socialWorkerId}`);
        logger.debug('Social worker joined notification room', {
          socketId: socket.id,
          socialWorkerId
        });
      });

      // Handle real-time notification status updates
      socket.on('mark-notification-read', async (data: { notificationId: string, socialWorkerId: string }) => {
        try {
          await this.db.query(`
            UPDATE notifications 
            SET status = 'read', read_at = NOW()
            WHERE id = $1 AND recipient_id = $2
          `, [data.notificationId, data.socialWorkerId]);

          // Broadcast the update to all connected clients for this social worker
          socket.to(`social-worker-${data.socialWorkerId}`).emit('notification-read', {
            notificationId: data.notificationId,
            readAt: new Date()
          });

        } catch (error) {
          logger.error('Failed to mark notification as read via WebSocket', {
            error: error instanceof Error ? error.message : 'Unknown error',
            notificationId: data.notificationId,
            socialWorkerId: data.socialWorkerId
          });
        }
      });

      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason
        });
      });
    });
  }

  /**
   * Create and send notification to social worker
   */
  public async createNotification(data: {
    recipientId: string;
    patientId?: string;
    type: NotificationType;
    title: string;
    message: string;
    additionalData?: Record<string, any>;
  }): Promise<string | null> {
    try {
      // Insert notification into database
      const notificationResult = await this.db.query(`
        INSERT INTO notifications (
          recipient_id, patient_id, type, title, message, data, status, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, sent_at
      `, [
        data.recipientId,
        data.patientId || null,
        data.type,
        data.title,
        data.message,
        JSON.stringify(data.additionalData || {}),
        'unread'
      ]);

      const notificationId = notificationResult.rows[0].id;
      const sentAt = notificationResult.rows[0].sent_at;

      // Send real-time notification via WebSocket
      if (this.io) {
        this.io.to(`social-worker-${data.recipientId}`).emit('new-notification', {
          id: notificationId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.additionalData,
          sentAt,
          patientId: data.patientId
        });

        logger.debug('Real-time notification sent', {
          notificationId,
          recipientId: data.recipientId,
          type: data.type
        });
      }

      logger.info('Notification created', {
        notificationId,
        recipientId: data.recipientId,
        type: data.type,
        patientId: data.patientId
      });

      return notificationId;

    } catch (error) {
      logger.error('Failed to create notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        recipientId: data.recipientId,
        type: data.type
      });
      return null;
    }
  }

  /**
   * Send patient registration notification to assigned social worker
   */
  public async notifyPatientRegistration(patientId: string): Promise<void> {
    try {
      // Get patient and social worker information
      const patientInfoResult = await this.db.query(`
        SELECT 
          p.id, p.assigned_social_worker_id,
          u.first_name, u.last_name, u.email,
          dc.name as clinic_name
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
        WHERE p.id = $1
      `, [patientId]);

      if (patientInfoResult.rows.length === 0 || !patientInfoResult.rows[0].assigned_social_worker_id) {
        logger.warn('Patient not found or no assigned social worker', { patientId });
        return;
      }

      const patient = patientInfoResult.rows[0];

      await this.createNotification({
        recipientId: patient.assigned_social_worker_id,
        patientId,
        type: NotificationType.PATIENT_REGISTERED,
        title: 'New Patient Registration',
        message: `${patient.first_name} ${patient.last_name} has registered and been assigned to you at ${patient.clinic_name}.`,
        additionalData: {
          patientName: `${patient.first_name} ${patient.last_name}`,
          patientEmail: patient.email,
          clinic: patient.clinic_name,
          registrationTime: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to send patient registration notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId
      });
    }
  }

  /**
   * Send ROI consent signed notification to assigned social worker
   */
  public async notifyROISigned(patientId: string, roiId: string): Promise<void> {
    try {
      // Get patient and social worker information
      const patientInfoResult = await this.db.query(`
        SELECT 
          p.id, p.assigned_social_worker_id,
          u.first_name, u.last_name, u.email,
          dc.name as clinic_name,
          roi.digital_signature, roi.signed_at
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
        LEFT JOIN roi_consents roi ON roi.id = $2
        WHERE p.id = $1
      `, [patientId, roiId]);

      if (patientInfoResult.rows.length === 0 || !patientInfoResult.rows[0].assigned_social_worker_id) {
        logger.warn('Patient not found or no assigned social worker', { patientId, roiId });
        return;
      }

      const patient = patientInfoResult.rows[0];

      await this.createNotification({
        recipientId: patient.assigned_social_worker_id,
        patientId,
        type: NotificationType.ROI_SIGNED,
        title: 'ROI Consent Signed',
        message: `${patient.first_name} ${patient.last_name} has signed their Release of Information consent.`,
        additionalData: {
          patientName: `${patient.first_name} ${patient.last_name}`,
          patientEmail: patient.email,
          clinic: patient.clinic_name,
          roiId,
          digitalSignature: patient.digital_signature,
          signedAt: patient.signed_at
        }
      });

    } catch (error) {
      logger.error('Failed to send ROI signed notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId,
        roiId
      });
    }
  }

  /**
   * Send transplant center referral submitted notification
   */
  public async notifyReferralSubmitted(patientId: string, selectedCenterIds: string[]): Promise<void> {
    try {
      // Get patient, social worker, and transplant center information
      const patientInfoResult = await this.db.query(`
        SELECT 
          p.id, p.assigned_social_worker_id,
          u.first_name, u.last_name, u.email,
          dc.name as clinic_name
        FROM patients p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN dialysis_clinics dc ON p.dialysis_clinic_id = dc.id
        WHERE p.id = $1
      `, [patientId]);

      if (patientInfoResult.rows.length === 0 || !patientInfoResult.rows[0].assigned_social_worker_id) {
        logger.warn('Patient not found or no assigned social worker', { patientId });
        return;
      }

      const patient = patientInfoResult.rows[0];

      // Get selected transplant centers
      const centersResult = await this.db.query(`
        SELECT name FROM transplant_centers WHERE id = ANY($1)
        ORDER BY array_position($1, id)
      `, [selectedCenterIds]);

      const centerNames = centersResult.rows.map(row => row.name);

      await this.createNotification({
        recipientId: patient.assigned_social_worker_id,
        patientId,
        type: NotificationType.REFERRAL_SUBMITTED,
        title: 'Transplant Referral Completed',
        message: `${patient.first_name} ${patient.last_name} has completed their transplant referral process and selected ${centerNames.length} transplant center(s).`,
        additionalData: {
          patientName: `${patient.first_name} ${patient.last_name}`,
          patientEmail: patient.email,
          clinic: patient.clinic_name,
          selectedCenters: centerNames,
          centerCount: centerNames.length,
          completedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to send referral submitted notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId,
        selectedCenterIds
      });
    }
  }

  /**
   * Get unread notification count for a social worker
   */
  public async getUnreadCount(socialWorkerId: string): Promise<number> {
    try {
      const result = await this.db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE recipient_id = $1 AND status = $2',
        [socialWorkerId, 'unread']
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Failed to get unread notification count', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socialWorkerId
      });
      return 0;
    }
  }

  /**
   * Broadcast unread count update to social worker
   */
  public async broadcastUnreadCountUpdate(socialWorkerId: string): Promise<void> {
    if (!this.io) return;

    try {
      const unreadCount = await this.getUnreadCount(socialWorkerId);
      
      this.io.to(`social-worker-${socialWorkerId}`).emit('unread-count-update', {
        unreadCount,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to broadcast unread count update', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socialWorkerId
      });
    }
  }
}

// Export singleton instance
export default new NotificationService();