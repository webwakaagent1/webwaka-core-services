import Decimal from 'decimal.js';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { PricingModelService } from './PricingModelService';
import { ScopeService } from './ScopeService';
import { OverrideService } from './OverrideService';
import {
  PricingModel,
  PricingConfig,
  PricingRule,
  RuleCondition,
  RuleAction,
  CalculatePriceRequest,
  CalculatePriceResponse,
  PriceAdjustment,
  PriceBreakdown,
} from '../types';

export class PricingCalculator {
  private pricingModelService: PricingModelService;
  private scopeService: ScopeService;
  private overrideService: OverrideService;

  constructor() {
    this.pricingModelService = new PricingModelService();
    this.scopeService = new ScopeService();
    this.overrideService = new OverrideService();
  }

  async calculatePrice(request: CalculatePriceRequest): Promise<CalculatePriceResponse> {
    const { tenantId, scopeType, scopeId, deploymentType, itemType, quantity, metadata } = request;

    let pricingModelId = request.pricingModelId;
    if (!pricingModelId) {
      const resolvedId = await this.scopeService.resolvePricingModel(
        tenantId, scopeType, scopeId, deploymentType
      );
      if (!resolvedId) {
        throw new Error('No applicable pricing model found for the given scope');
      }
      pricingModelId = resolvedId;
    }

    const pricingModel = await this.pricingModelService.getPricingModel(tenantId, pricingModelId);
    if (!pricingModel) {
      throw new Error('Pricing model not found');
    }

    const overrides = await this.overrideService.getActiveOverrides(
      tenantId, pricingModelId, scopeType, scopeId
    );

    let effectiveConfig = { ...pricingModel.config };
    const appliedOverrides: string[] = [];
    
    for (const override of overrides) {
      effectiveConfig = this.applyOverride(effectiveConfig, override.overrideValue);
      appliedOverrides.push(override.id);
    }

    const baseCalculation = this.calculateBasePrice(pricingModel.modelType, effectiveConfig, quantity, itemType);

    const rules = await this.pricingModelService.listRules(tenantId, pricingModelId);
    const activeRules = rules.filter(rule => this.isRuleActive(rule));
    
    const { adjustments, appliedRuleIds } = this.applyRules(
      activeRules, baseCalculation.total, metadata || {}
    );

    const adjustmentTotal = adjustments.reduce((sum, adj) => sum.plus(adj.amount), new Decimal(0));
    const finalPrice = new Decimal(baseCalculation.total).plus(adjustmentTotal);

    logger.info('Price calculated', {
      tenantId,
      pricingModelId,
      modelType: pricingModel.modelType,
      basePrice: baseCalculation.total,
      finalPrice: finalPrice.toNumber(),
    });

    return {
      basePrice: baseCalculation.total,
      adjustments,
      finalPrice: Math.max(0, finalPrice.toNumber()),
      currency: effectiveConfig.currency || 'NGN',
      breakdown: baseCalculation.breakdown,
      appliedRules: appliedRuleIds,
      appliedOverrides,
    };
  }

  private calculateBasePrice(
    modelType: string,
    config: PricingConfig,
    quantity: number,
    itemType: string
  ): { total: number; breakdown: PriceBreakdown[] } {
    const breakdown: PriceBreakdown[] = [];
    let total = new Decimal(0);

    switch (modelType) {
      case 'flat':
        total = new Decimal(config.basePrice || 0).times(quantity);
        breakdown.push({
          component: 'Flat Rate',
          quantity,
          unitPrice: config.basePrice || 0,
          subtotal: total.toNumber(),
        });
        break;

      case 'usage_based':
        total = new Decimal(config.basePrice || 0).times(quantity);
        breakdown.push({
          component: `Usage (${config.usageMetric || itemType})`,
          quantity,
          unitPrice: config.basePrice || 0,
          subtotal: total.toNumber(),
        });
        break;

      case 'tiered':
        if (config.tiers && config.tiers.length > 0) {
          let remainingQty = quantity;
          for (const tier of config.tiers) {
            if (remainingQty <= 0) break;
            
            const tierMax = tier.maxQuantity ?? Infinity;
            const tierQty = Math.min(remainingQty, tierMax - tier.minQuantity + 1);
            
            if (tierQty > 0) {
              const tierTotal = new Decimal(tier.unitPrice).times(tierQty);
              const flatFee = tier.flatFee ? new Decimal(tier.flatFee) : new Decimal(0);
              
              total = total.plus(tierTotal).plus(flatFee);
              breakdown.push({
                component: `Tier ${tier.minQuantity}-${tier.maxQuantity || '∞'}`,
                quantity: tierQty,
                unitPrice: tier.unitPrice,
                subtotal: tierTotal.plus(flatFee).toNumber(),
              });
              
              remainingQty -= tierQty;
            }
          }
        }
        break;

      case 'subscription':
        total = new Decimal(config.basePrice || 0);
        breakdown.push({
          component: `Subscription (${config.subscriptionPeriod || 'monthly'})`,
          quantity: 1,
          unitPrice: config.basePrice || 0,
          subtotal: total.toNumber(),
        });
        break;

      case 'revenue_share':
        const revenueAmount = quantity;
        const sharePercent = config.revenueSharePercent || 0;
        total = new Decimal(revenueAmount).times(sharePercent).dividedBy(100);
        breakdown.push({
          component: `Revenue Share (${sharePercent}%)`,
          quantity: revenueAmount,
          unitPrice: sharePercent / 100,
          subtotal: total.toNumber(),
        });
        break;

      case 'hybrid':
        if (config.components && config.components.length > 0) {
          for (const component of config.components) {
            const componentResult = this.calculateBasePrice(
              component.type,
              { ...config, ...component.config },
              quantity,
              itemType
            );
            const weight = component.weight || 1;
            const weightedTotal = new Decimal(componentResult.total).times(weight);
            total = total.plus(weightedTotal);
            breakdown.push(...componentResult.breakdown.map(b => ({
              ...b,
              component: `${component.type}: ${b.component}`,
              subtotal: new Decimal(b.subtotal).times(weight).toNumber(),
            })));
          }
        }
        break;

      default:
        throw new Error(`Unknown pricing model type: ${modelType}`);
    }

    if (config.minimumCharge && total.lessThan(config.minimumCharge)) {
      total = new Decimal(config.minimumCharge);
    }
    if (config.maximumCharge && total.greaterThan(config.maximumCharge)) {
      total = new Decimal(config.maximumCharge);
    }

    return { total: total.toNumber(), breakdown };
  }

  private applyRules(
    rules: PricingRule[],
    basePrice: number,
    context: Record<string, unknown>
  ): { adjustments: PriceAdjustment[]; appliedRuleIds: string[] } {
    const adjustments: PriceAdjustment[] = [];
    const appliedRuleIds: string[] = [];
    let currentPrice = new Decimal(basePrice);

    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.evaluateConditions(rule.conditions, context, currentPrice.toNumber())) {
        for (const action of rule.actions) {
          if (action.type === 'skip') continue;

          const adjustment = this.calculateAdjustment(action, currentPrice.toNumber());
          adjustments.push({
            type: action.type,
            amount: adjustment,
            reason: action.reason || rule.name,
            ruleId: rule.id,
          });
          currentPrice = currentPrice.plus(adjustment);
          appliedRuleIds.push(rule.id);
        }
      }
    }

    return { adjustments, appliedRuleIds };
  }

  private evaluateConditions(
    conditions: RuleCondition[],
    context: Record<string, unknown>,
    currentPrice: number
  ): boolean {
    if (conditions.length === 0) return true;

    return conditions.every(condition => {
      const fieldValue = condition.field === 'price' ? currentPrice : context[condition.field];
      return this.evaluateCondition(condition, fieldValue);
    });
  }

  private evaluateCondition(condition: RuleCondition, value: unknown): boolean {
    const { operator, value: conditionValue } = condition;

    switch (operator) {
      case 'eq':
        return value === conditionValue;
      case 'neq':
        return value !== conditionValue;
      case 'gt':
        return typeof value === 'number' && value > (conditionValue as number);
      case 'gte':
        return typeof value === 'number' && value >= (conditionValue as number);
      case 'lt':
        return typeof value === 'number' && value < (conditionValue as number);
      case 'lte':
        return typeof value === 'number' && value <= (conditionValue as number);
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(value);
      case 'not_in':
        return Array.isArray(conditionValue) && !conditionValue.includes(value);
      case 'contains':
        return typeof value === 'string' && value.includes(conditionValue as string);
      case 'between':
        if (typeof value !== 'number' || !Array.isArray(conditionValue) || conditionValue.length !== 2) {
          return false;
        }
        return value >= (conditionValue[0] as number) && value <= (conditionValue[1] as number);
      default:
        return false;
    }
  }

  private calculateAdjustment(action: RuleAction, price: number): number {
    const value = action.value;
    const unit = action.unit || 'fixed';

    switch (action.type) {
      case 'apply_discount':
        return unit === 'percent' ? new Decimal(price).times(value).dividedBy(100).negated().toNumber()
          : new Decimal(value).negated().toNumber();
      case 'apply_surcharge':
      case 'add_fee':
        return unit === 'percent' ? new Decimal(price).times(value).dividedBy(100).toNumber()
          : new Decimal(value).toNumber();
      case 'set_price':
        return new Decimal(value).minus(price).toNumber();
      case 'apply_multiplier':
        return new Decimal(price).times(value - 1).toNumber();
      default:
        return 0;
    }
  }

  private applyOverride(config: PricingConfig, overrideValue: Record<string, unknown>): PricingConfig {
    return { ...config, ...overrideValue } as PricingConfig;
  }

  private isRuleActive(rule: PricingRule): boolean {
    if (!rule.isActive) return false;
    const now = new Date();
    if (rule.effectiveFrom && now < rule.effectiveFrom) return false;
    if (rule.effectiveTo && now > rule.effectiveTo) return false;
    return true;
  }
}
