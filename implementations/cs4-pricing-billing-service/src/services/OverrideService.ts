import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { AuditService } from './AuditService';
import { PricingOverride, ActorRole, ScopeType } from '../types';

export class OverrideService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createOverride(
    tenantId: string,
    pricingModelId: string,
    scopeId: string,
    overrideType: string,
    overrideValue: Record<string, unknown>,
    reason: string,
    effectiveFrom: Date,
    createdBy: string,
    createdByRole: ActorRole,
    options: {
      effectiveTo?: Date;
      requiresApproval?: boolean;
    } = {}
  ): Promise<PricingOverride> {
    const id = uuidv4();
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO pricing_overrides 
        (id, tenant_id, pricing_model_id, scope_id, override_type, override_value, reason, 
         effective_from, effective_to, version, is_active, created_by, created_at,
         approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        id, tenantId, pricingModelId, scopeId, overrideType,
        JSON.stringify(overrideValue), reason, effectiveFrom,
        options.effectiveTo, 1, !options.requiresApproval, createdBy, now,
        options.requiresApproval ? null : createdBy,
        options.requiresApproval ? null : now
      ]
    );

    const override = this.mapRowToOverride(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'pricing_override',
      id,
      'create',
      createdBy,
      createdByRole,
      undefined,
      override,
      reason
    );

    logger.info('Created pricing override', { id, pricingModelId, scopeId });
    return override;
  }

  async getOverride(tenantId: string, id: string): Promise<PricingOverride | null> {
    const result = await pool.query(
      'SELECT * FROM pricing_overrides WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows.length > 0 ? this.mapRowToOverride(result.rows[0]) : null;
  }

  async getActiveOverrides(
    tenantId: string,
    pricingModelId: string,
    scopeType: ScopeType,
    scopeId?: string
  ): Promise<PricingOverride[]> {
    const now = new Date();

    let query = `
      SELECT po.* FROM pricing_overrides po
      JOIN pricing_scopes ps ON po.scope_id = ps.id
      WHERE po.tenant_id = $1 
        AND po.pricing_model_id = $2 
        AND po.is_active = true
        AND po.approved_by IS NOT NULL
        AND po.effective_from <= $3
        AND (po.effective_to IS NULL OR po.effective_to >= $3)
    `;
    const params: unknown[] = [tenantId, pricingModelId, now];

    if (scopeId) {
      query += ` AND (ps.scope_type = $4 AND ps.scope_id = $5)`;
      params.push(scopeType, scopeId);
    }

    query += ' ORDER BY po.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(row => this.mapRowToOverride(row));
  }

  async listOverrides(
    tenantId: string,
    options: {
      pricingModelId?: string;
      scopeId?: string;
      isActive?: boolean;
      includeExpired?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ overrides: PricingOverride[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.pricingModelId) {
      conditions.push(`pricing_model_id = $${paramIndex++}`);
      params.push(options.pricingModelId);
    }
    if (options.scopeId) {
      conditions.push(`scope_id = $${paramIndex++}`);
      params.push(options.scopeId);
    }
    if (options.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }
    if (!options.includeExpired) {
      conditions.push(`(effective_to IS NULL OR effective_to >= $${paramIndex++})`);
      params.push(new Date());
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM pricing_overrides WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM pricing_overrides WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      overrides: result.rows.map(row => this.mapRowToOverride(row)),
      total,
    };
  }

  async approveOverride(
    tenantId: string,
    id: string,
    approvedBy: string,
    approvedByRole: ActorRole
  ): Promise<PricingOverride | null> {
    const existing = await this.getOverride(tenantId, id);
    if (!existing) return null;

    if (existing.approvedBy) {
      throw new Error('Override has already been approved');
    }

    const now = new Date();

    const result = await pool.query(
      `UPDATE pricing_overrides 
       SET approved_by = $1, approved_at = $2, is_active = true
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [approvedBy, now, id, tenantId]
    );

    const updated = this.mapRowToOverride(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'pricing_override',
      id,
      'approve',
      approvedBy,
      approvedByRole,
      existing,
      updated,
      'Override approved'
    );

    logger.info('Approved pricing override', { id, approvedBy });
    return updated;
  }

  async deactivateOverride(
    tenantId: string,
    id: string,
    deactivatedBy: string,
    deactivatedByRole: ActorRole,
    reason?: string
  ): Promise<PricingOverride | null> {
    const existing = await this.getOverride(tenantId, id);
    if (!existing) return null;

    const result = await pool.query(
      `UPDATE pricing_overrides SET is_active = false WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    const updated = this.mapRowToOverride(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'pricing_override',
      id,
      'deactivate',
      deactivatedBy,
      deactivatedByRole,
      existing,
      updated,
      reason
    );

    logger.info('Deactivated pricing override', { id });
    return updated;
  }

  async getOverrideHistory(
    tenantId: string,
    pricingModelId: string,
    scopeId: string
  ): Promise<PricingOverride[]> {
    const result = await pool.query(
      `SELECT * FROM pricing_overrides 
       WHERE tenant_id = $1 AND pricing_model_id = $2 AND scope_id = $3
       ORDER BY version DESC, created_at DESC`,
      [tenantId, pricingModelId, scopeId]
    );
    return result.rows.map(row => this.mapRowToOverride(row));
  }

  private mapRowToOverride(row: Record<string, unknown>): PricingOverride {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      pricingModelId: row.pricing_model_id as string,
      scopeId: row.scope_id as string,
      overrideType: row.override_type as string,
      overrideValue: row.override_value as Record<string, unknown>,
      reason: row.reason as string,
      approvedBy: row.approved_by as string | undefined,
      approvedAt: row.approved_at ? new Date(row.approved_at as string) : undefined,
      effectiveFrom: new Date(row.effective_from as string),
      effectiveTo: row.effective_to ? new Date(row.effective_to as string) : undefined,
      version: row.version as number,
      isActive: row.is_active as boolean,
      createdBy: row.created_by as string,
      createdAt: new Date(row.created_at as string),
    };
  }
}
