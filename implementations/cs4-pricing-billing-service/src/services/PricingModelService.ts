import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { AuditService } from './AuditService';
import {
  PricingModel,
  PricingConfig,
  PricingModelType,
  ActorRole,
  PricingRule,
  RuleCondition,
  RuleAction,
} from '../types';

export class PricingModelService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createPricingModel(
    tenantId: string,
    name: string,
    modelType: PricingModelType,
    config: PricingConfig,
    createdBy: string,
    createdByRole: ActorRole,
    description?: string,
    isSystem: boolean = false
  ): Promise<PricingModel> {
    const id = uuidv4();
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO pricing_models 
        (id, tenant_id, name, description, model_type, config, is_active, is_system, created_by, created_by_role, created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [id, tenantId, name, description, modelType, JSON.stringify(config), true, isSystem, createdBy, createdByRole, now, now, 1]
    );

    const model = this.mapRowToModel(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'pricing_model',
      id,
      'create',
      createdBy,
      createdByRole,
      undefined,
      model,
      'Initial creation'
    );

    logger.info('Created pricing model', { id, tenantId, modelType });
    return model;
  }

  async getPricingModel(tenantId: string, id: string): Promise<PricingModel | null> {
    const result = await pool.query(
      'SELECT * FROM pricing_models WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows.length > 0 ? this.mapRowToModel(result.rows[0]) : null;
  }

  async listPricingModels(
    tenantId: string,
    options: {
      modelType?: PricingModelType;
      isActive?: boolean;
      isSystem?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ models: PricingModel[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.modelType) {
      conditions.push(`model_type = $${paramIndex++}`);
      params.push(options.modelType);
    }
    if (options.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(options.isActive);
    }
    if (options.isSystem !== undefined) {
      conditions.push(`is_system = $${paramIndex++}`);
      params.push(options.isSystem);
    }

    const whereClause = conditions.join(' AND ');
    
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM pricing_models WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM pricing_models WHERE ${whereClause} 
       ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      models: result.rows.map(row => this.mapRowToModel(row)),
      total,
    };
  }

  async updatePricingModel(
    tenantId: string,
    id: string,
    updates: Partial<{
      name: string;
      description: string;
      config: PricingConfig;
      isActive: boolean;
    }>,
    updatedBy: string,
    updatedByRole: ActorRole,
    reason?: string
  ): Promise<PricingModel | null> {
    const existing = await this.getPricingModel(tenantId, id);
    if (!existing) return null;

    if (existing.isSystem && updatedByRole !== 'super_admin') {
      throw new Error('Only Super Admin can modify system pricing models');
    }

    const setClauses: string[] = [];
    const params: unknown[] = [tenantId, id];
    let paramIndex = 3;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }
    if (updates.config !== undefined) {
      setClauses.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.config));
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(updates.isActive);
    }

    setClauses.push(`updated_at = $${paramIndex++}`, `version = version + 1`);
    params.push(new Date());

    const result = await pool.query(
      `UPDATE pricing_models SET ${setClauses.join(', ')} 
       WHERE tenant_id = $1 AND id = $2 
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;

    const updated = this.mapRowToModel(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'pricing_model',
      id,
      'update',
      updatedBy,
      updatedByRole,
      existing,
      updated,
      reason
    );

    logger.info('Updated pricing model', { id, tenantId });
    return updated;
  }

  async deletePricingModel(
    tenantId: string,
    id: string,
    deletedBy: string,
    deletedByRole: ActorRole,
    reason?: string
  ): Promise<boolean> {
    const existing = await this.getPricingModel(tenantId, id);
    if (!existing) return false;

    if (existing.isSystem) {
      throw new Error('Cannot delete system pricing models');
    }

    await pool.query(
      'DELETE FROM pricing_models WHERE tenant_id = $1 AND id = $2',
      [tenantId, id]
    );

    await this.auditService.logAction(
      tenantId,
      'pricing_model',
      id,
      'delete',
      deletedBy,
      deletedByRole,
      existing,
      undefined,
      reason
    );

    logger.info('Deleted pricing model', { id, tenantId });
    return true;
  }

  async createRule(
    tenantId: string,
    pricingModelId: string,
    name: string,
    ruleType: string,
    conditions: RuleCondition[],
    actions: RuleAction[],
    options: {
      description?: string;
      priority?: number;
      effectiveFrom?: Date;
      effectiveTo?: Date;
    } = {}
  ): Promise<PricingRule> {
    const id = uuidv4();
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO pricing_rules 
        (id, tenant_id, pricing_model_id, name, description, rule_type, conditions, actions, priority, is_active, effective_from, effective_to, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        id, tenantId, pricingModelId, name, options.description,
        ruleType, JSON.stringify(conditions), JSON.stringify(actions),
        options.priority || 0, true, options.effectiveFrom, options.effectiveTo, now, now
      ]
    );

    logger.info('Created pricing rule', { id, pricingModelId });
    return this.mapRowToRule(result.rows[0]);
  }

  async listRules(tenantId: string, pricingModelId: string): Promise<PricingRule[]> {
    const result = await pool.query(
      `SELECT * FROM pricing_rules WHERE tenant_id = $1 AND pricing_model_id = $2 
       ORDER BY priority DESC, created_at ASC`,
      [tenantId, pricingModelId]
    );
    return result.rows.map(row => this.mapRowToRule(row));
  }

  private mapRowToModel(row: Record<string, unknown>): PricingModel {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      modelType: row.model_type as PricingModelType,
      config: row.config as PricingConfig,
      isActive: row.is_active as boolean,
      isSystem: row.is_system as boolean,
      createdBy: row.created_by as string,
      createdByRole: row.created_by_role as ActorRole,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      version: row.version as number,
    };
  }

  private mapRowToRule(row: Record<string, unknown>): PricingRule {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      pricingModelId: row.pricing_model_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      ruleType: row.rule_type as string,
      conditions: row.conditions as RuleCondition[],
      actions: row.actions as RuleAction[],
      priority: row.priority as number,
      isActive: row.is_active as boolean,
      effectiveFrom: row.effective_from ? new Date(row.effective_from as string) : undefined,
      effectiveTo: row.effective_to ? new Date(row.effective_to as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
