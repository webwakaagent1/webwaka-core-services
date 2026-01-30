import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PricingScope, ScopeType, DeploymentType } from '../types';

export class ScopeService {
  async createScope(
    tenantId: string,
    pricingModelId: string,
    scopeType: ScopeType,
    options: {
      scopeId?: string;
      deploymentType?: DeploymentType;
      isOverride?: boolean;
      parentScopeId?: string;
    } = {}
  ): Promise<PricingScope> {
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO pricing_scopes 
        (id, tenant_id, pricing_model_id, scope_type, scope_id, deployment_type, is_override, parent_scope_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id, tenantId, pricingModelId, scopeType,
        options.scopeId, options.deploymentType,
        options.isOverride || false, options.parentScopeId, new Date()
      ]
    );

    logger.info('Created pricing scope', { id, scopeType, pricingModelId });
    return this.mapRowToScope(result.rows[0]);
  }

  async getScope(tenantId: string, id: string): Promise<PricingScope | null> {
    const result = await pool.query(
      'SELECT * FROM pricing_scopes WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows.length > 0 ? this.mapRowToScope(result.rows[0]) : null;
  }

  async findScope(
    tenantId: string,
    scopeType: ScopeType,
    scopeId?: string,
    deploymentType?: DeploymentType
  ): Promise<PricingScope | null> {
    let query = 'SELECT * FROM pricing_scopes WHERE tenant_id = $1 AND scope_type = $2';
    const params: unknown[] = [tenantId, scopeType];

    if (scopeId) {
      query += ' AND scope_id = $3';
      params.push(scopeId);
    } else {
      query += ' AND scope_id IS NULL';
    }

    if (deploymentType) {
      query += ` AND deployment_type = $${params.length + 1}`;
      params.push(deploymentType);
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0 ? this.mapRowToScope(result.rows[0]) : null;
  }

  async listScopes(
    tenantId: string,
    options: {
      pricingModelId?: string;
      scopeType?: ScopeType;
      deploymentType?: DeploymentType;
    } = {}
  ): Promise<PricingScope[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.pricingModelId) {
      conditions.push(`pricing_model_id = $${paramIndex++}`);
      params.push(options.pricingModelId);
    }
    if (options.scopeType) {
      conditions.push(`scope_type = $${paramIndex++}`);
      params.push(options.scopeType);
    }
    if (options.deploymentType) {
      conditions.push(`deployment_type = $${paramIndex++}`);
      params.push(options.deploymentType);
    }

    const result = await pool.query(
      `SELECT * FROM pricing_scopes WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`,
      params
    );

    return result.rows.map(row => this.mapRowToScope(row));
  }

  async getScopeHierarchy(tenantId: string, scopeId: string): Promise<PricingScope[]> {
    const hierarchy: PricingScope[] = [];
    let currentScope = await this.getScope(tenantId, scopeId);

    while (currentScope) {
      hierarchy.unshift(currentScope);
      if (currentScope.parentScopeId) {
        currentScope = await this.getScope(tenantId, currentScope.parentScopeId);
      } else {
        break;
      }
    }

    return hierarchy;
  }

  async resolvePricingModel(
    tenantId: string,
    scopeType: ScopeType,
    scopeId?: string,
    deploymentType?: DeploymentType
  ): Promise<string | null> {
    const scopePriority: ScopeType[] = [
      'individual', 'contract', 'segment', 'group',
      scopeType, 'deployment', 'global'
    ].filter((v, i, a) => a.indexOf(v) === i) as ScopeType[];

    for (const st of scopePriority) {
      let query = `
        SELECT ps.*, pm.is_active as model_active 
        FROM pricing_scopes ps
        JOIN pricing_models pm ON ps.pricing_model_id = pm.id
        WHERE ps.tenant_id = $1 AND ps.scope_type = $2 AND pm.is_active = true
      `;
      const params: unknown[] = [tenantId, st];

      if (st === scopeType && scopeId) {
        query += ' AND ps.scope_id = $3';
        params.push(scopeId);
      }

      if (st === 'deployment' && deploymentType) {
        query += ` AND ps.deployment_type = $${params.length + 1}`;
        params.push(deploymentType);
      }

      query += ' ORDER BY ps.is_override DESC LIMIT 1';

      const result = await pool.query(query, params);
      if (result.rows.length > 0) {
        return result.rows[0].pricing_model_id as string;
      }
    }

    return null;
  }

  async deleteScope(tenantId: string, id: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM pricing_scopes WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    return result.rows.length > 0;
  }

  private mapRowToScope(row: Record<string, unknown>): PricingScope {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      pricingModelId: row.pricing_model_id as string,
      scopeType: row.scope_type as ScopeType,
      scopeId: row.scope_id as string | undefined,
      deploymentType: row.deployment_type as DeploymentType | undefined,
      isOverride: row.is_override as boolean,
      parentScopeId: row.parent_scope_id as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}
