import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { addDays, addWeeks, addMonths, addQuarters, addYears, startOfDay, endOfDay } from 'date-fns';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PricingCalculator } from './PricingCalculator';
import { AuditService } from './AuditService';
import {
  BillingCycle,
  BillingItem,
  BillingCycleType,
  BillingCycleStatus,
  ScopeType,
  ActorRole,
} from '../types';

export class BillingEngine {
  private pricingCalculator: PricingCalculator;
  private auditService: AuditService;

  constructor() {
    this.pricingCalculator = new PricingCalculator();
    this.auditService = new AuditService();
  }

  async createBillingCycle(
    tenantId: string,
    scopeId: string,
    scopeType: ScopeType,
    cycleType: BillingCycleType,
    startDate: Date,
    options: {
      endDate?: Date;
    } = {}
  ): Promise<BillingCycle> {
    const id = uuidv4();
    const endDate = options.endDate || this.calculateCycleEndDate(startDate, cycleType);

    const result = await pool.query(
      `INSERT INTO billing_cycles 
        (id, tenant_id, scope_id, scope_type, cycle_type, start_date, end_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, tenantId, scopeId, scopeType, cycleType, startDate, endDate, 'active', new Date(), new Date()]
    );

    logger.info('Created billing cycle', { id, tenantId, scopeId, cycleType });
    return this.mapRowToCycle(result.rows[0]);
  }

  async getBillingCycle(tenantId: string, id: string): Promise<BillingCycle | null> {
    const result = await pool.query(
      'SELECT * FROM billing_cycles WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows.length > 0 ? this.mapRowToCycle(result.rows[0]) : null;
  }

  async getActiveCycle(tenantId: string, scopeId: string, scopeType: ScopeType): Promise<BillingCycle | null> {
    const result = await pool.query(
      `SELECT * FROM billing_cycles 
       WHERE tenant_id = $1 AND scope_id = $2 AND scope_type = $3 AND status = 'active'
       ORDER BY start_date DESC LIMIT 1`,
      [tenantId, scopeId, scopeType]
    );
    return result.rows.length > 0 ? this.mapRowToCycle(result.rows[0]) : null;
  }

  async listBillingCycles(
    tenantId: string,
    options: {
      scopeId?: string;
      scopeType?: ScopeType;
      status?: BillingCycleStatus;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ cycles: BillingCycle[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (options.scopeId) {
      conditions.push(`scope_id = $${paramIndex++}`);
      params.push(options.scopeId);
    }
    if (options.scopeType) {
      conditions.push(`scope_type = $${paramIndex++}`);
      params.push(options.scopeType);
    }
    if (options.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(options.status);
    }
    if (options.fromDate) {
      conditions.push(`start_date >= $${paramIndex++}`);
      params.push(options.fromDate);
    }
    if (options.toDate) {
      conditions.push(`end_date <= $${paramIndex++}`);
      params.push(options.toDate);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM billing_cycles WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT * FROM billing_cycles WHERE ${whereClause}
       ORDER BY start_date DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      cycles: result.rows.map(row => this.mapRowToCycle(row)),
      total,
    };
  }

  async addBillingItem(
    tenantId: string,
    billingCycleId: string,
    pricingModelId: string,
    itemType: string,
    quantity: number,
    scopeType: ScopeType,
    scopeId?: string,
    options: {
      description?: string;
      metadata?: Record<string, unknown>;
      deploymentType?: 'shared_saas' | 'partner_deployed' | 'self_hosted';
    } = {}
  ): Promise<BillingItem> {
    const id = uuidv4();

    const priceResult = await this.pricingCalculator.calculatePrice({
      tenantId,
      pricingModelId,
      scopeType,
      scopeId,
      deploymentType: options.deploymentType,
      itemType,
      quantity,
      metadata: options.metadata,
    });

    const unitPrice = new Decimal(priceResult.finalPrice).dividedBy(quantity).toNumber();
    const totalAmount = priceResult.finalPrice;

    const result = await pool.query(
      `INSERT INTO billing_items 
        (id, tenant_id, billing_cycle_id, pricing_model_id, item_type, description, 
         quantity, unit_price, total_amount, currency, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        id, tenantId, billingCycleId, pricingModelId, itemType, options.description,
        quantity, unitPrice, totalAmount, priceResult.currency,
        JSON.stringify({
          ...options.metadata,
          priceBreakdown: priceResult.breakdown,
          appliedRules: priceResult.appliedRules,
          appliedOverrides: priceResult.appliedOverrides,
        }),
        new Date()
      ]
    );

    logger.info('Added billing item', { id, billingCycleId, itemType, totalAmount });
    return this.mapRowToItem(result.rows[0]);
  }

  async listBillingItems(
    tenantId: string,
    billingCycleId: string
  ): Promise<BillingItem[]> {
    const result = await pool.query(
      `SELECT * FROM billing_items 
       WHERE tenant_id = $1 AND billing_cycle_id = $2
       ORDER BY created_at ASC`,
      [tenantId, billingCycleId]
    );
    return result.rows.map(row => this.mapRowToItem(row));
  }

  async getCycleSummary(
    tenantId: string,
    billingCycleId: string
  ): Promise<{
    cycle: BillingCycle;
    items: BillingItem[];
    subtotal: number;
    total: number;
    currency: string;
    itemCount: number;
  }> {
    const cycle = await this.getBillingCycle(tenantId, billingCycleId);
    if (!cycle) {
      throw new Error('Billing cycle not found');
    }

    const items = await this.listBillingItems(tenantId, billingCycleId);

    const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const currency = items.length > 0 ? items[0].currency : 'NGN';

    return {
      cycle,
      items,
      subtotal,
      total: subtotal,
      currency,
      itemCount: items.length,
    };
  }

  async closeBillingCycle(
    tenantId: string,
    billingCycleId: string,
    closedBy: string,
    closedByRole: ActorRole
  ): Promise<BillingCycle> {
    const existing = await this.getBillingCycle(tenantId, billingCycleId);
    if (!existing) {
      throw new Error('Billing cycle not found');
    }

    if (existing.status !== 'active') {
      throw new Error(`Cannot close billing cycle with status: ${existing.status}`);
    }

    const result = await pool.query(
      `UPDATE billing_cycles 
       SET status = 'closed', updated_at = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [new Date(), billingCycleId, tenantId]
    );

    const updated = this.mapRowToCycle(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'billing_cycle',
      billingCycleId,
      'close',
      closedBy,
      closedByRole,
      existing,
      updated,
      'Billing cycle closed'
    );

    logger.info('Closed billing cycle', { billingCycleId, tenantId });
    return updated;
  }

  async updateCycleStatus(
    tenantId: string,
    billingCycleId: string,
    newStatus: BillingCycleStatus,
    updatedBy: string,
    updatedByRole: ActorRole
  ): Promise<BillingCycle> {
    const existing = await this.getBillingCycle(tenantId, billingCycleId);
    if (!existing) {
      throw new Error('Billing cycle not found');
    }

    const result = await pool.query(
      `UPDATE billing_cycles 
       SET status = $1, updated_at = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [newStatus, new Date(), billingCycleId, tenantId]
    );

    const updated = this.mapRowToCycle(result.rows[0]);

    await this.auditService.logAction(
      tenantId,
      'billing_cycle',
      billingCycleId,
      'status_change',
      updatedBy,
      updatedByRole,
      existing,
      updated,
      `Status changed from ${existing.status} to ${newStatus}`
    );

    logger.info('Updated billing cycle status', { billingCycleId, oldStatus: existing.status, newStatus });
    return updated;
  }

  private calculateCycleEndDate(startDate: Date, cycleType: BillingCycleType): Date {
    const start = startOfDay(startDate);
    switch (cycleType) {
      case 'daily':
        return endOfDay(start);
      case 'weekly':
        return endOfDay(addDays(addWeeks(start, 1), -1));
      case 'monthly':
        return endOfDay(addDays(addMonths(start, 1), -1));
      case 'quarterly':
        return endOfDay(addDays(addQuarters(start, 1), -1));
      case 'yearly':
        return endOfDay(addDays(addYears(start, 1), -1));
      default:
        return endOfDay(addMonths(start, 1));
    }
  }

  private mapRowToCycle(row: Record<string, unknown>): BillingCycle {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      scopeId: row.scope_id as string,
      scopeType: row.scope_type as ScopeType,
      cycleType: row.cycle_type as BillingCycleType,
      startDate: new Date(row.start_date as string),
      endDate: new Date(row.end_date as string),
      status: row.status as BillingCycleStatus,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapRowToItem(row: Record<string, unknown>): BillingItem {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      billingCycleId: row.billing_cycle_id as string,
      pricingModelId: row.pricing_model_id as string,
      itemType: row.item_type as string,
      description: row.description as string | undefined,
      quantity: parseFloat(row.quantity as string),
      unitPrice: parseFloat(row.unit_price as string),
      totalAmount: parseFloat(row.total_amount as string),
      currency: row.currency as string,
      metadata: row.metadata as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
    };
  }
}
