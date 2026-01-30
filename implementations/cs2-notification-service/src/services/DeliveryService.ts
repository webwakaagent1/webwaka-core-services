import { pool } from '../config/database';
import { logger } from '../utils/logger';
import {
  DeliveryLog,
  NotificationChannel,
  NotificationStatus,
  NotificationStats,
  NotificationFilter,
} from '../models/types';
import { v4 as uuidv4 } from 'uuid';

export class DeliveryService {
  async createDeliveryLog(
    notificationId: string,
    channel: NotificationChannel,
    status: NotificationStatus,
    providerResponse?: string,
    providerMessageId?: string,
    errorMessage?: string
  ): Promise<DeliveryLog> {
    const client = await pool.connect();
    try {
      const id = uuidv4();

      const result = await client.query(
        `INSERT INTO delivery_logs 
         (id, notification_id, channel, status, provider_response, provider_message_id, error_message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          id,
          notificationId,
          channel,
          status,
          providerResponse || null,
          providerMessageId || null,
          errorMessage || null,
          JSON.stringify({}),
        ]
      );

      const log = this.mapRowToDeliveryLog(result.rows[0]);
      logger.debug('Delivery log created', {
        logId: log.id,
        notificationId,
        status,
      });
      return log;
    } finally {
      client.release();
    }
  }

  async updateDeliveryStatus(
    notificationId: string,
    status: NotificationStatus,
    additionalData?: {
      deliveredAt?: Date;
      openedAt?: Date;
      clickedAt?: Date;
      bouncedAt?: Date;
      errorMessage?: string;
    }
  ): Promise<void> {
    const client = await pool.connect();
    try {
      const setClauses: string[] = ['status = $2'];
      const values: any[] = [notificationId, status];
      let paramCount = 3;

      if (additionalData?.deliveredAt) {
        setClauses.push(`delivered_at = $${paramCount++}`);
        values.push(additionalData.deliveredAt);
      }
      if (additionalData?.openedAt) {
        setClauses.push(`opened_at = $${paramCount++}`);
        values.push(additionalData.openedAt);
      }
      if (additionalData?.clickedAt) {
        setClauses.push(`clicked_at = $${paramCount++}`);
        values.push(additionalData.clickedAt);
      }
      if (additionalData?.bouncedAt) {
        setClauses.push(`bounced_at = $${paramCount++}`);
        values.push(additionalData.bouncedAt);
      }
      if (additionalData?.errorMessage) {
        setClauses.push(`error_message = $${paramCount++}`);
        values.push(additionalData.errorMessage);
      }

      await client.query(
        `UPDATE delivery_logs SET ${setClauses.join(', ')} 
         WHERE notification_id = $1 ORDER BY created_at DESC LIMIT 1`,
        values
      );
    } finally {
      client.release();
    }
  }

  async trackOpen(notificationId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE delivery_logs SET opened_at = NOW() 
         WHERE notification_id = $1 AND opened_at IS NULL`,
        [notificationId]
      );

      await client.query(
        `UPDATE notifications SET metadata = metadata || $1 
         WHERE id = $2`,
        [JSON.stringify({ openedAt: new Date().toISOString() }), notificationId]
      );

      logger.info('Notification opened', { notificationId });
    } finally {
      client.release();
    }
  }

  async trackClick(notificationId: string, linkUrl?: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE delivery_logs SET clicked_at = NOW() 
         WHERE notification_id = $1`,
        [notificationId]
      );

      await client.query(
        `UPDATE notifications SET metadata = metadata || $1 
         WHERE id = $2`,
        [JSON.stringify({ clickedAt: new Date().toISOString(), clickedLink: linkUrl }), notificationId]
      );

      logger.info('Notification clicked', { notificationId, linkUrl });
    } finally {
      client.release();
    }
  }

  async getDeliveryLogs(notificationId: string): Promise<DeliveryLog[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM delivery_logs WHERE notification_id = $1 ORDER BY created_at DESC',
        [notificationId]
      );
      return result.rows.map(this.mapRowToDeliveryLog);
    } finally {
      client.release();
    }
  }

  async getStats(filter: NotificationFilter): Promise<NotificationStats> {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM notifications
        WHERE 1=1
      `;
      const values: any[] = [];
      let paramCount = 1;

      if (filter.tenantId) {
        query += ` AND tenant_id = $${paramCount++}`;
        values.push(filter.tenantId);
      }
      if (filter.channel) {
        query += ` AND channel = $${paramCount++}`;
        values.push(filter.channel);
      }
      if (filter.startDate) {
        query += ` AND created_at >= $${paramCount++}`;
        values.push(filter.startDate);
      }
      if (filter.endDate) {
        query += ` AND created_at <= $${paramCount++}`;
        values.push(filter.endDate);
      }

      const result = await client.query(query, values);
      const row = result.rows[0];

      const openQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE d.opened_at IS NOT NULL) as opened,
          COUNT(*) FILTER (WHERE d.clicked_at IS NOT NULL) as clicked
        FROM delivery_logs d
        JOIN notifications n ON d.notification_id = n.id
        WHERE n.status = 'delivered'
        ${filter.tenantId ? `AND n.tenant_id = $1` : ''}
      `;

      const openResult = await client.query(openQuery, filter.tenantId ? [filter.tenantId] : []);
      const openRow = openResult.rows[0];

      const delivered = parseInt(row.delivered);
      const opened = parseInt(openRow?.opened || 0);
      const clicked = parseInt(openRow?.clicked || 0);

      return {
        total: parseInt(row.total),
        pending: parseInt(row.pending),
        sent: parseInt(row.sent),
        delivered,
        failed: parseInt(row.failed),
        openRate: delivered > 0 ? (opened / delivered) * 100 : undefined,
        clickRate: delivered > 0 ? (clicked / delivered) * 100 : undefined,
      };
    } finally {
      client.release();
    }
  }

  private mapRowToDeliveryLog(row: any): DeliveryLog {
    return {
      id: row.id,
      notificationId: row.notification_id,
      channel: row.channel,
      status: row.status,
      providerResponse: row.provider_response,
      providerMessageId: row.provider_message_id,
      deliveredAt: row.delivered_at,
      openedAt: row.opened_at,
      clickedAt: row.clicked_at,
      bouncedAt: row.bounced_at,
      errorMessage: row.error_message,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

export const deliveryService = new DeliveryService();
