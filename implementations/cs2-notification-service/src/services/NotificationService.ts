import { pool } from '../config/database';
import { logger } from '../utils/logger';
import {
  Notification,
  CreateNotificationInput,
  NotificationFilter,
  NotificationStatus,
} from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { templateService } from './TemplateService';
import { preferenceService } from './PreferenceService';
import { deliveryService } from './DeliveryService';
import { getProvider } from '../providers';

const MAX_RETRIES = parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3');
const RETRY_DELAY_MS = parseInt(process.env.NOTIFICATION_RETRY_DELAY_MS || '5000');

export class NotificationService {
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const client = await pool.connect();
    try {
      const id = uuidv4();

      let subject = input.subject;
      let content = input.content || '';

      if (input.templateId || (input.templateData && Object.keys(input.templateData).length > 0)) {
        const template = input.templateId
          ? await templateService.getTemplate(input.templateId)
          : await templateService.getTemplateBySlug(
              input.tenantId,
              (input.templateData as any)?._templateSlug || 'default',
              input.channel
            );

        if (template) {
          const rendered = templateService.renderTemplate(template, input.templateData || {});
          subject = rendered.subject || subject;
          content = rendered.body;
        }
      }

      const result = await client.query(
        `INSERT INTO notifications 
         (id, tenant_id, user_id, channel, template_id, subject, content, recipient, priority, status, metadata, scheduled_at, retry_count, max_retries)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          id,
          input.tenantId,
          input.userId || null,
          input.channel,
          input.templateId || null,
          subject || null,
          content,
          input.recipient,
          input.priority || 'normal',
          input.scheduledAt ? 'pending' : 'queued',
          JSON.stringify(input.metadata || {}),
          input.scheduledAt || null,
          0,
          MAX_RETRIES,
        ]
      );

      const notification = this.mapRowToNotification(result.rows[0]);
      logger.info('Notification created', {
        notificationId: notification.id,
        channel: notification.channel,
        recipient: notification.recipient,
      });

      if (!input.scheduledAt) {
        this.processNotification(notification).catch((err) => {
          logger.error('Failed to process notification', {
            notificationId: notification.id,
            error: err.message,
          });
        });
      }

      return notification;
    } finally {
      client.release();
    }
  }

  async getNotification(id: string): Promise<Notification | null> {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT * FROM notifications WHERE id = $1', [id]);
      return result.rows.length > 0 ? this.mapRowToNotification(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async listNotifications(
    filter: NotificationFilter,
    limit: number = 100,
    offset: number = 0
  ): Promise<Notification[]> {
    const client = await pool.connect();
    try {
      let query = 'SELECT * FROM notifications WHERE 1=1';
      const values: any[] = [];
      let paramCount = 1;

      if (filter.tenantId) {
        query += ` AND tenant_id = $${paramCount++}`;
        values.push(filter.tenantId);
      }
      if (filter.userId) {
        query += ` AND user_id = $${paramCount++}`;
        values.push(filter.userId);
      }
      if (filter.channel) {
        query += ` AND channel = $${paramCount++}`;
        values.push(filter.channel);
      }
      if (filter.status) {
        query += ` AND status = $${paramCount++}`;
        values.push(filter.status);
      }
      if (filter.priority) {
        query += ` AND priority = $${paramCount++}`;
        values.push(filter.priority);
      }
      if (filter.startDate) {
        query += ` AND created_at >= $${paramCount++}`;
        values.push(filter.startDate);
      }
      if (filter.endDate) {
        query += ` AND created_at <= $${paramCount++}`;
        values.push(filter.endDate);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
      values.push(limit, offset);

      const result = await client.query(query, values);
      return result.rows.map(this.mapRowToNotification);
    } finally {
      client.release();
    }
  }

  async cancelNotification(id: string): Promise<Notification> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE notifications SET status = 'cancelled', updated_at = NOW() 
         WHERE id = $1 AND status IN ('pending', 'queued') RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error(`Cannot cancel notification ${id} - not found or already processed`);
      }

      logger.info('Notification cancelled', { notificationId: id });
      return this.mapRowToNotification(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async processNotification(notification: Notification): Promise<void> {
    if (notification.userId) {
      const isEnabled = await preferenceService.isChannelEnabled(
        notification.tenantId,
        notification.userId,
        notification.channel
      );

      if (!isEnabled) {
        await this.updateStatus(notification.id, 'cancelled');
        logger.info('Notification cancelled - channel disabled by user', {
          notificationId: notification.id,
          userId: notification.userId,
        });
        return;
      }

      const isQuietHours = await preferenceService.isWithinQuietHours(
        notification.tenantId,
        notification.userId,
        notification.channel
      );

      if (isQuietHours && notification.priority !== 'urgent') {
        logger.info('Notification deferred - quiet hours', {
          notificationId: notification.id,
        });
        return;
      }
    }

    const provider = getProvider(notification.channel);
    if (!provider || !provider.isAvailable()) {
      await this.handleFailure(notification, `Provider not available for channel: ${notification.channel}`);
      return;
    }

    if (!provider.validateRecipient(notification.recipient)) {
      await this.handleFailure(notification, `Invalid recipient format: ${notification.recipient}`);
      return;
    }

    await this.updateStatus(notification.id, 'sending');

    try {
      const result = await provider.send(notification);

      if (result.success) {
        await this.updateStatus(notification.id, 'sent', { sentAt: new Date() });
        await deliveryService.createDeliveryLog(
          notification.id,
          notification.channel,
          'sent',
          result.providerResponse,
          result.providerMessageId
        );
        logger.info('Notification sent successfully', {
          notificationId: notification.id,
          providerMessageId: result.providerMessageId,
        });
      } else {
        await this.handleFailure(notification, result.errorMessage || 'Unknown error');
      }
    } catch (error: any) {
      await this.handleFailure(notification, error.message);
    }
  }

  private async handleFailure(notification: Notification, errorMessage: string): Promise<void> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE notifications 
         SET retry_count = retry_count + 1, error_message = $2, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [notification.id, errorMessage]
      );

      const updated = this.mapRowToNotification(result.rows[0]);

      if (updated.retryCount >= updated.maxRetries) {
        await this.updateStatus(notification.id, 'failed', { failedAt: new Date() });
        await deliveryService.createDeliveryLog(
          notification.id,
          notification.channel,
          'failed',
          undefined,
          undefined,
          errorMessage
        );
        logger.error('Notification failed permanently', {
          notificationId: notification.id,
          retryCount: updated.retryCount,
          error: errorMessage,
        });
      } else {
        logger.warn('Notification failed, will retry', {
          notificationId: notification.id,
          retryCount: updated.retryCount,
          maxRetries: updated.maxRetries,
          error: errorMessage,
        });

        setTimeout(() => {
          this.processNotification(updated).catch((err) => {
            logger.error('Retry failed', { notificationId: notification.id, error: err.message });
          });
        }, RETRY_DELAY_MS * Math.pow(2, updated.retryCount));
      }
    } finally {
      client.release();
    }
  }

  private async updateStatus(
    id: string,
    status: NotificationStatus,
    additionalData?: { sentAt?: Date; failedAt?: Date }
  ): Promise<void> {
    const client = await pool.connect();
    try {
      let query = 'UPDATE notifications SET status = $2, updated_at = NOW()';
      const values: any[] = [id, status];
      let paramCount = 3;

      if (additionalData?.sentAt) {
        query += `, sent_at = $${paramCount++}`;
        values.push(additionalData.sentAt);
      }
      if (additionalData?.failedAt) {
        query += `, failed_at = $${paramCount++}`;
        values.push(additionalData.failedAt);
      }

      query += ' WHERE id = $1';
      await client.query(query, values);
    } finally {
      client.release();
    }
  }

  private mapRowToNotification(row: any): Notification {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      channel: row.channel,
      templateId: row.template_id,
      subject: row.subject,
      content: row.content,
      recipient: row.recipient,
      priority: row.priority,
      status: row.status,
      metadata: row.metadata,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      failedAt: row.failed_at,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const notificationService = new NotificationService();
