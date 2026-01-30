export type PricingModelType = 'flat' | 'usage_based' | 'tiered' | 'subscription' | 'revenue_share' | 'hybrid';

export type ActorRole = 'super_admin' | 'partner' | 'client' | 'merchant' | 'agent' | 'staff';

export type ScopeType = 'global' | 'deployment' | 'partner' | 'client' | 'merchant' | 'agent' | 'staff' | 'individual' | 'group' | 'segment' | 'contract';

export type DeploymentType = 'shared_saas' | 'partner_deployed' | 'self_hosted';

export type BillingCycleType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type BillingCycleStatus = 'active' | 'closed' | 'invoiced' | 'paid' | 'overdue' | 'cancelled';

export interface PricingModel {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  modelType: PricingModelType;
  config: PricingConfig;
  isActive: boolean;
  isSystem: boolean;
  createdBy: string;
  createdByRole: ActorRole;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PricingConfig {
  basePrice?: number;
  currency?: string;
  tiers?: PricingTier[];
  usageMetric?: string;
  usageUnit?: string;
  subscriptionPeriod?: 'monthly' | 'quarterly' | 'yearly';
  revenueSharePercent?: number;
  commissionPercent?: number;
  minimumCharge?: number;
  maximumCharge?: number;
  components?: HybridComponent[];
}

export interface PricingTier {
  minQuantity: number;
  maxQuantity?: number;
  unitPrice: number;
  flatFee?: number;
}

export interface HybridComponent {
  type: PricingModelType;
  weight?: number;
  config: Partial<PricingConfig>;
}

export interface PricingRule {
  id: string;
  tenantId: string;
  pricingModelId: string;
  name: string;
  description?: string;
  ruleType: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  isActive: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'between';
  value: unknown;
}

export interface RuleAction {
  type: 'apply_discount' | 'apply_surcharge' | 'set_price' | 'apply_multiplier' | 'add_fee' | 'skip';
  value: number;
  unit?: 'percent' | 'fixed';
  reason?: string;
}

export interface PricingScope {
  id: string;
  tenantId: string;
  pricingModelId: string;
  scopeType: ScopeType;
  scopeId?: string;
  deploymentType?: DeploymentType;
  isOverride: boolean;
  parentScopeId?: string;
  createdAt: Date;
}

export interface BillingCycle {
  id: string;
  tenantId: string;
  scopeId: string;
  scopeType: ScopeType;
  cycleType: BillingCycleType;
  startDate: Date;
  endDate: Date;
  status: BillingCycleStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingItem {
  id: string;
  tenantId: string;
  billingCycleId: string;
  pricingModelId: string;
  itemType: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PricingAuditLog {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorRole: ActorRole;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  reason?: string;
  isReversible: boolean;
  reversedBy?: string;
  reversedAt?: Date;
  createdAt: Date;
}

export interface PricingOverride {
  id: string;
  tenantId: string;
  pricingModelId: string;
  scopeId: string;
  overrideType: string;
  overrideValue: Record<string, unknown>;
  reason: string;
  approvedBy?: string;
  approvedAt?: Date;
  effectiveFrom: Date;
  effectiveTo?: Date;
  version: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface CalculatePriceRequest {
  tenantId: string;
  pricingModelId?: string;
  scopeType: ScopeType;
  scopeId?: string;
  deploymentType?: DeploymentType;
  itemType: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface CalculatePriceResponse {
  basePrice: number;
  adjustments: PriceAdjustment[];
  finalPrice: number;
  currency: string;
  breakdown: PriceBreakdown[];
  appliedRules: string[];
  appliedOverrides: string[];
}

export interface PriceAdjustment {
  type: string;
  amount: number;
  reason: string;
  ruleId?: string;
  overrideId?: string;
}

export interface PriceBreakdown {
  component: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
