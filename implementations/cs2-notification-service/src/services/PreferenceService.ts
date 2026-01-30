import { pool } from '../config/database';
import { logger } from '../utils/logger';
import {
  UserPreference,
  CreateUserPreferenceInput,
  UpdateUserPreferenceInput,
  NotificationChannel,
} from '../models/types';
import { v4 as uuidv4 } from 'uuid';

export class PreferenceService {
  async createPreference(input: CreateUserPreferenceInput): Promise<UserPreference> {
    const client = await pool.connect();
    try {
      const id = uuidv4();

      const result = await client.query(
        `INSERT INTO user_preferences 
         (id, tenant_id, user_id, channel, enabled, frequency, quiet_hours_start, quiet_hours_end, timezone, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          input.tenantId,
          input.userId,
          input.channel,
          input.enabled !== false,
          input.frequency || 'realtime',
          input.quietHoursStart || null,
          input.quietHoursEnd || null,
          input.timezone || 'Africa/Lagos',
          JSON.stringify(input.metadata || {}),
        ]
      );

      const preference = this.mapRowToPreference(result.rows[0]);
      logger.info('User preference created', {
        preferenceId: preference.id,
        userId: preference.userId,
        channel: preference.channel,
      });
      return preference;
    } finally {
      client.release();
    }
  }

  async getPreference(id: string): Promise<UserPreference | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM user_preferences WHERE id = $1',
        [id]
      );
      return result.rows.length > 0 ? this.mapRowToPreference(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getUserPreferences(tenantId: string, userId: string): Promise<UserPreference[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM user_preferences WHERE tenant_id = $1 AND user_id = $2 ORDER BY channel',
        [tenantId, userId]
      );
      return result.rows.map(this.mapRowToPreference);
    } finally {
      client.release();
    }
  }

  async getUserPreferenceByChannel(
    tenantId: string,
    userId: string,
    channel: NotificationChannel
  ): Promise<UserPreference | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM user_preferences WHERE tenant_id = $1 AND user_id = $2 AND channel = $3',
        [tenantId, userId, channel]
      );
      return result.rows.length > 0 ? this.mapRowToPreference(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async updatePreference(id: string, input: UpdateUserPreferenceInput): Promise<UserPreference> {
    const client = await pool.connect();
    try {
      const setClauses: string[] = ['updated_at = NOW()'];
      const values: any[] = [];
      let paramCount = 1;

      if (input.enabled !== undefined) {
        setClauses.push(`enabled = $${paramCount++}`);
        values.push(input.enabled);
      }
      if (input.frequency !== undefined) {
        setClauses.push(`frequency = $${paramCount++}`);
        values.push(input.frequency);
      }
      if (input.quietHoursStart !== undefined) {
        setClauses.push(`quiet_hours_start = $${paramCount++}`);
        values.push(input.quietHoursStart);
      }
      if (input.quietHoursEnd !== undefined) {
        setClauses.push(`quiet_hours_end = $${paramCount++}`);
        values.push(input.quietHoursEnd);
      }
      if (input.timezone !== undefined) {
        setClauses.push(`timezone = $${paramCount++}`);
        values.push(input.timezone);
      }
      if (input.metadata !== undefined) {
        setClauses.push(`metadata = $${paramCount++}`);
        values.push(JSON.stringify(input.metadata));
      }

      values.push(id);

      const result = await client.query(
        `UPDATE user_preferences SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Preference not found: ${id}`);
      }

      const preference = this.mapRowToPreference(result.rows[0]);
      logger.info('User preference updated', { preferenceId: id });
      return preference;
    } finally {
      client.release();
    }
  }

  async upsertPreference(input: CreateUserPreferenceInput): Promise<UserPreference> {
    const existing = await this.getUserPreferenceByChannel(
      input.tenantId,
      input.userId,
      input.channel
    );

    if (existing) {
      return this.updatePreference(existing.id, {
        enabled: input.enabled,
        frequency: input.frequency,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        timezone: input.timezone,
        metadata: input.metadata,
      });
    }

    return this.createPreference(input);
  }

  async deletePreference(id: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM user_preferences WHERE id = $1', [id]);
      logger.info('User preference deleted', { preferenceId: id });
    } finally {
      client.release();
    }
  }

  async isChannelEnabled(
    tenantId: string,
    userId: string,
    channel: NotificationChannel
  ): Promise<boolean> {
    const preference = await this.getUserPreferenceByChannel(tenantId, userId, channel);
    return preference ? preference.enabled : true;
  }

  async isWithinQuietHours(
    tenantId: string,
    userId: string,
    channel: NotificationChannel
  ): Promise<boolean> {
    const preference = await this.getUserPreferenceByChannel(tenantId, userId, channel);
    if (!preference || !preference.quietHoursStart || !preference.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const userTime = new Intl.DateTimeFormat('en-US', {
      timeZone: preference.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    const [currentHour, currentMinute] = userTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = preference.quietHoursStart.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;

    const [endHour, endMinute] = preference.quietHoursEnd.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  private mapRowToPreference(row: any): UserPreference {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      channel: row.channel,
      enabled: row.enabled,
      frequency: row.frequency,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      timezone: row.timezone,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const preferenceService = new PreferenceService();
