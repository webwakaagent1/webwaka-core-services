import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PricingAuditLog, ActorRole } from '../types';

export class AuditService {
  async logAction(
    tenantId: string,
    entityType: string,
    entityId: string,
    action: string,
    actorId: string,
    actorRole: ActorRole,
    previousState?: unknown,
    newState?: unknown,
    reason?: string,
    isReversible: boolean = true
  ): Promise<PricingAuditLog> {
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO pricing_audit_log 
        (id, tenant_id, entity_type, entity_id, action, actor_id, actor_role, previous_state, new_state, reason, is_reversible, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        id, tenantId, entityType, entityId, action, actorId, actorRole,
        previousState ? JSON.stringify(previousState) : null,
        newState ? JSON.stringify(newState) : null,
        reason, isReversible, new Date()
      ]
    );

    logger.debug('Audit log created', { id, entityType, entityId, action });
    return this.mapRowToAuditLog(result.rows[0]);
  }

  async getAuditHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: PricingAuditLog[]; total: number }> {
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM pricing_audit_log 
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3`,
      [tenantId, entityType, entityId]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const result = await pool.query(
      `SELECT * FROM pricing_audit_log 
       WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [tenantId, entityType, entityId, limit, offset]
    );

    return {
      logs: result.rows.map(row => this.mapRowToAuditLog(row)),
      total,
    };
  }

  async reverseAction(
    tenantId: string,
    auditLogId: string,
    reversedBy: string,
    reversedByRole: ActorRole
  ): Promise<{ success: boolean; message: string; restoredState?: unknown }> {
    const auditResult = await pool.query(
      `SELECT * FROM pricing_audit_log WHERE id = $1 AND tenant_id = $2`,
      [auditLogId, tenantId]
    );

    if (auditResult.rows.length === 0) {
      return { success: false, message: 'Audit log not found' };
    }

    const auditLog = this.mapRowToAuditLog(auditResult.rows[0]);

    if (!auditLog.isReversible) {
      return { success: false, message: 'This action is not reversible' };
    }

    if (auditLog.reversedBy) {
      return { success: false, message: 'This action has already been reversed' };
    }

    if (!auditLog.previousState) {
      return { success: false, message: 'No previous state available to restore' };
    }

    await pool.query(
      `UPDATE pricing_audit_log 
       SET reversed_by = $1, reversed_at = $2 
       WHERE id = $3`,
      [reversedBy, new Date(), auditLogId]
    );

    await this.logAction(
      tenantId,
      auditLog.entityType,
      auditLog.entityId,
      'reverse',
      reversedBy,
      reversedByRole,
      auditLog.newState,
      auditLog.previousState,
      `Reversal of action: ${auditLog.action}`,
      false
    );

    logger.info('Action reversed', { auditLogId, entityType: auditLog.entityType, entityId: auditLog.entityId });

    return {
      success: true,
      message: 'Action reversed successfully',
      restoredState: auditLog.previousState,
    };
  }

  async searchAuditLogs(
    tenantId: string,
    filters: {
      entityType?: string;
      action?: string;
      actorId?: string;
      actorRole?: ActorRole;
      fromDate?: Date;
      toDate?: Date;
    },
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ logs: PricingAuditLog[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(filters.entityType);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(filters.actorId);
    }
    if (filters.actorRole) {
      conditions.push(`actor_role = $${paramIndex++}`);
      params.push(filters.actorRole);
    }
    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM pricing_audit_log WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM pricing_audit_log WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      logs: result.rows.map(row => this.mapRowToAuditLog(row)),
      total,
    };
  }

  private mapRowToAuditLog(row: Record<string, unknown>): PricingAuditLog {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      action: row.action as string,
      actorId: row.actor_id as string,
      actorRole: row.actor_role as ActorRole,
      previousState: row.previous_state as Record<string, unknown> | undefined,
      newState: row.new_state as Record<string, unknown> | undefined,
      reason: row.reason as string | undefined,
      isReversible: row.is_reversible as boolean,
      reversedBy: row.reversed_by as string | undefined,
      reversedAt: row.reversed_at ? new Date(row.reversed_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}
