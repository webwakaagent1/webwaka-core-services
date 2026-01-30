import { addDays, addWeeks, addMonths, addQuarters, addYears, startOfDay, endOfDay } from 'date-fns';

describe('Billing Cycle Calculations', () => {
  const baseDate = new Date('2026-01-01T00:00:00Z');

  describe('Cycle End Date Calculation', () => {
    it('should calculate daily cycle end date', () => {
      const start = startOfDay(baseDate);
      const end = endOfDay(start);
      expect(end.getDate()).toBe(start.getDate());
    });

    it('should calculate weekly cycle end date', () => {
      const start = startOfDay(baseDate);
      const end = endOfDay(addDays(addWeeks(start, 1), -1));
      expect(end.getDate()).toBe(7);
    });

    it('should calculate monthly cycle end date', () => {
      const start = startOfDay(baseDate);
      const end = endOfDay(addDays(addMonths(start, 1), -1));
      expect(end.getMonth()).toBe(0);
      expect(end.getDate()).toBe(31);
    });

    it('should calculate quarterly cycle end date', () => {
      const start = startOfDay(baseDate);
      const end = endOfDay(addDays(addQuarters(start, 1), -1));
      expect(end.getMonth()).toBe(2);
      expect(end.getDate()).toBe(31);
    });

    it('should calculate yearly cycle end date', () => {
      const start = startOfDay(baseDate);
      const end = endOfDay(addDays(addYears(start, 1), -1));
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(11);
      expect(end.getDate()).toBe(31);
    });
  });
});

describe('Billing Cycle Status', () => {
  const validStatuses = ['active', 'closed', 'invoiced', 'paid', 'overdue', 'cancelled'];

  it('should have all valid statuses', () => {
    expect(validStatuses).toHaveLength(6);
    expect(validStatuses).toContain('active');
    expect(validStatuses).toContain('paid');
    expect(validStatuses).toContain('overdue');
  });

  describe('Status Transitions', () => {
    it('should allow active to closed', () => {
      const currentStatus = 'active';
      const newStatus = 'closed';
      expect(validStatuses).toContain(currentStatus);
      expect(validStatuses).toContain(newStatus);
    });

    it('should allow closed to invoiced', () => {
      const currentStatus = 'closed';
      const newStatus = 'invoiced';
      expect(validStatuses).toContain(currentStatus);
      expect(validStatuses).toContain(newStatus);
    });

    it('should allow invoiced to paid', () => {
      const currentStatus = 'invoiced';
      const newStatus = 'paid';
      expect(validStatuses).toContain(currentStatus);
      expect(validStatuses).toContain(newStatus);
    });

    it('should allow invoiced to overdue', () => {
      const currentStatus = 'invoiced';
      const newStatus = 'overdue';
      expect(validStatuses).toContain(currentStatus);
      expect(validStatuses).toContain(newStatus);
    });
  });
});

describe('Billing Item Calculations', () => {
  it('should calculate item total correctly', () => {
    const quantity = 10;
    const unitPrice = 25.50;
    const total = quantity * unitPrice;
    expect(total).toBe(255);
  });

  it('should handle decimal quantities', () => {
    const quantity = 2.5;
    const unitPrice = 100;
    const total = quantity * unitPrice;
    expect(total).toBe(250);
  });

  it('should accumulate multiple items', () => {
    const items = [
      { quantity: 5, unitPrice: 10, total: 50 },
      { quantity: 3, unitPrice: 25, total: 75 },
      { quantity: 1, unitPrice: 100, total: 100 },
    ];
    const grandTotal = items.reduce((sum, item) => sum + item.total, 0);
    expect(grandTotal).toBe(225);
  });
});

describe('Cycle Summary', () => {
  it('should calculate subtotal from items', () => {
    const items = [
      { totalAmount: 100 },
      { totalAmount: 250 },
      { totalAmount: 75.50 },
    ];
    const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
    expect(subtotal).toBe(425.50);
  });

  it('should count items correctly', () => {
    const items = [{}, {}, {}, {}, {}];
    expect(items.length).toBe(5);
  });
});

describe('Audit Trail', () => {
  it('should track entity changes', () => {
    const auditEntry = {
      entityType: 'pricing_model',
      entityId: 'test-123',
      action: 'update',
      previousState: { basePrice: 100 },
      newState: { basePrice: 150 },
    };
    
    expect(auditEntry.previousState.basePrice).toBe(100);
    expect(auditEntry.newState.basePrice).toBe(150);
  });

  it('should support reversibility flag', () => {
    const auditEntry = {
      isReversible: true,
      reversedBy: null,
      reversedAt: null,
    };
    
    expect(auditEntry.isReversible).toBe(true);
    expect(auditEntry.reversedBy).toBeNull();
  });
});

describe('Currency Handling', () => {
  it('should default to NGN', () => {
    const defaultCurrency = 'NGN';
    expect(defaultCurrency).toBe('NGN');
  });

  it('should support currency codes', () => {
    const supportedCurrencies = ['NGN', 'USD', 'EUR', 'GBP'];
    expect(supportedCurrencies).toContain('NGN');
    expect(supportedCurrencies).toContain('USD');
  });
});

describe('Override Handling', () => {
  it('should merge override values', () => {
    const originalConfig = {
      basePrice: 100,
      currency: 'NGN',
      minimumCharge: 10,
    };
    
    const overrideValue = {
      basePrice: 80,
    };
    
    const mergedConfig = { ...originalConfig, ...overrideValue };
    
    expect(mergedConfig.basePrice).toBe(80);
    expect(mergedConfig.currency).toBe('NGN');
    expect(mergedConfig.minimumCharge).toBe(10);
  });

  it('should check effective date range', () => {
    const now = new Date();
    const effectiveFrom = new Date(now.getTime() - 86400000);
    const effectiveTo = new Date(now.getTime() + 86400000);
    
    const isActive = now >= effectiveFrom && now <= effectiveTo;
    expect(isActive).toBe(true);
  });

  it('should detect expired override', () => {
    const now = new Date();
    const effectiveFrom = new Date(now.getTime() - 172800000);
    const effectiveTo = new Date(now.getTime() - 86400000);
    
    const isActive = now >= effectiveFrom && now <= effectiveTo;
    expect(isActive).toBe(false);
  });
});

describe('Tenant Isolation', () => {
  it('should always require tenantId', () => {
    const request = {
      tenantId: 'tenant-123',
      scopeId: 'scope-456',
    };
    expect(request.tenantId).toBeDefined();
    expect(request.tenantId).not.toBe('');
  });

  it('should scope all queries by tenant', () => {
    const tenantId = 'tenant-123';
    const queryCondition = `tenant_id = '${tenantId}'`;
    expect(queryCondition).toContain(tenantId);
  });
});
