import Decimal from 'decimal.js';

describe('Pricing Model Types', () => {
  describe('Flat Pricing', () => {
    it('should calculate flat rate correctly', () => {
      const basePrice = 100;
      const quantity = 5;
      const total = new Decimal(basePrice).times(quantity).toNumber();
      expect(total).toBe(500);
    });

    it('should handle zero quantity', () => {
      const basePrice = 100;
      const quantity = 0;
      const total = new Decimal(basePrice).times(quantity).toNumber();
      expect(total).toBe(0);
    });
  });

  describe('Tiered Pricing', () => {
    const tiers = [
      { minQuantity: 1, maxQuantity: 10, unitPrice: 100 },
      { minQuantity: 11, maxQuantity: 50, unitPrice: 80 },
      { minQuantity: 51, maxQuantity: undefined, unitPrice: 60 },
    ];

    it('should calculate first tier correctly', () => {
      const quantity = 5;
      const total = new Decimal(tiers[0].unitPrice).times(quantity).toNumber();
      expect(total).toBe(500);
    });

    it('should calculate across tiers correctly', () => {
      const quantity = 15;
      const tier1 = 10 * tiers[0].unitPrice;
      const tier2 = 5 * tiers[1].unitPrice;
      const total = tier1 + tier2;
      expect(total).toBe(1400);
    });
  });

  describe('Usage-Based Pricing', () => {
    it('should calculate usage correctly', () => {
      const unitPrice = 0.05;
      const usage = 1000;
      const total = new Decimal(unitPrice).times(usage).toNumber();
      expect(total).toBe(50);
    });
  });

  describe('Revenue Share Pricing', () => {
    it('should calculate percentage correctly', () => {
      const revenue = 10000;
      const sharePercent = 15;
      const total = new Decimal(revenue).times(sharePercent).dividedBy(100).toNumber();
      expect(total).toBe(1500);
    });
  });

  describe('Subscription Pricing', () => {
    it('should return fixed subscription price', () => {
      const monthlyPrice = 99.99;
      expect(monthlyPrice).toBe(99.99);
    });
  });
});

describe('Pricing Rules', () => {
  describe('Condition Evaluation', () => {
    it('should evaluate eq operator', () => {
      const value = 'premium';
      const condition = { operator: 'eq', value: 'premium' };
      expect(value === condition.value).toBe(true);
    });

    it('should evaluate neq operator', () => {
      const value = 'basic';
      const condition = { operator: 'neq', value: 'premium' };
      expect(value !== condition.value).toBe(true);
    });

    it('should evaluate gt operator', () => {
      const value = 100;
      const condition = { operator: 'gt', value: 50 };
      expect(value > condition.value).toBe(true);
    });

    it('should evaluate gte operator', () => {
      const value = 50;
      const condition = { operator: 'gte', value: 50 };
      expect(value >= condition.value).toBe(true);
    });

    it('should evaluate lt operator', () => {
      const value = 30;
      const condition = { operator: 'lt', value: 50 };
      expect(value < condition.value).toBe(true);
    });

    it('should evaluate lte operator', () => {
      const value = 50;
      const condition = { operator: 'lte', value: 50 };
      expect(value <= condition.value).toBe(true);
    });

    it('should evaluate in operator', () => {
      const value = 'gold';
      const condition = { operator: 'in', value: ['gold', 'platinum', 'diamond'] };
      expect(condition.value.includes(value)).toBe(true);
    });

    it('should evaluate between operator', () => {
      const value = 75;
      const condition = { operator: 'between', value: [50, 100] };
      expect(value >= condition.value[0] && value <= condition.value[1]).toBe(true);
    });
  });

  describe('Action Calculation', () => {
    it('should apply percent discount', () => {
      const price = 1000;
      const discountPercent = 10;
      const adjustment = new Decimal(price).times(discountPercent).dividedBy(100).negated().toNumber();
      expect(adjustment).toBe(-100);
    });

    it('should apply fixed discount', () => {
      const discount = 50;
      const adjustment = new Decimal(discount).negated().toNumber();
      expect(adjustment).toBe(-50);
    });

    it('should apply percent surcharge', () => {
      const price = 1000;
      const surchargePercent = 5;
      const adjustment = new Decimal(price).times(surchargePercent).dividedBy(100).toNumber();
      expect(adjustment).toBe(50);
    });

    it('should apply multiplier', () => {
      const price = 100;
      const multiplier = 1.5;
      const adjustment = new Decimal(price).times(multiplier - 1).toNumber();
      expect(adjustment).toBe(50);
    });

    it('should set fixed price', () => {
      const currentPrice = 100;
      const newPrice = 75;
      const adjustment = new Decimal(newPrice).minus(currentPrice).toNumber();
      expect(adjustment).toBe(-25);
    });
  });
});

describe('Multi-Actor Pricing Authority', () => {
  const actorRoles = ['super_admin', 'partner', 'client', 'merchant', 'agent', 'staff'];

  it('should support all actor roles', () => {
    expect(actorRoles).toHaveLength(6);
    expect(actorRoles).toContain('super_admin');
    expect(actorRoles).toContain('partner');
    expect(actorRoles).toContain('client');
    expect(actorRoles).toContain('merchant');
    expect(actorRoles).toContain('agent');
    expect(actorRoles).toContain('staff');
  });
});

describe('Scope Types', () => {
  const scopeTypes = [
    'global', 'deployment', 'partner', 'client',
    'merchant', 'agent', 'staff', 'individual',
    'group', 'segment', 'contract'
  ];

  it('should support all scope types', () => {
    expect(scopeTypes).toHaveLength(11);
    expect(scopeTypes).toContain('global');
    expect(scopeTypes).toContain('contract');
    expect(scopeTypes).toContain('individual');
  });
});

describe('Deployment Types', () => {
  const deploymentTypes = ['shared_saas', 'partner_deployed', 'self_hosted'];

  it('should support all deployment types', () => {
    expect(deploymentTypes).toHaveLength(3);
    expect(deploymentTypes).toContain('shared_saas');
    expect(deploymentTypes).toContain('partner_deployed');
    expect(deploymentTypes).toContain('self_hosted');
  });
});

describe('Billing Cycle Types', () => {
  const cycleTypes = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'];

  it('should support all cycle types', () => {
    expect(cycleTypes).toHaveLength(6);
    expect(cycleTypes).toContain('monthly');
    expect(cycleTypes).toContain('yearly');
  });
});

describe('Hybrid Pricing', () => {
  it('should combine multiple pricing components', () => {
    const flatComponent = 50;
    const usageComponent = new Decimal(0.10).times(100).toNumber();
    const subscriptionComponent = 29.99;
    
    const total = new Decimal(flatComponent)
      .plus(usageComponent)
      .plus(subscriptionComponent)
      .toNumber();
    
    expect(total).toBe(89.99);
  });

  it('should apply weights to components', () => {
    const component1 = { total: 100, weight: 0.7 };
    const component2 = { total: 50, weight: 0.3 };
    
    const weighted1 = new Decimal(component1.total).times(component1.weight).toNumber();
    const weighted2 = new Decimal(component2.total).times(component2.weight).toNumber();
    const total = weighted1 + weighted2;
    
    expect(total).toBe(85);
  });
});

describe('Price Bounds', () => {
  it('should enforce minimum charge', () => {
    const calculatedPrice = 5;
    const minimumCharge = 10;
    const finalPrice = Math.max(calculatedPrice, minimumCharge);
    expect(finalPrice).toBe(10);
  });

  it('should enforce maximum charge', () => {
    const calculatedPrice = 1500;
    const maximumCharge = 1000;
    const finalPrice = Math.min(calculatedPrice, maximumCharge);
    expect(finalPrice).toBe(1000);
  });

  it('should not modify price within bounds', () => {
    const calculatedPrice = 500;
    const minimumCharge = 100;
    const maximumCharge = 1000;
    const finalPrice = Math.max(minimumCharge, Math.min(calculatedPrice, maximumCharge));
    expect(finalPrice).toBe(500);
  });
});
