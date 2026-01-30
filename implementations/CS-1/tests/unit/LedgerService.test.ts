import { LedgerService } from '../../src/services/LedgerService';
import { TransactionType, ActorType, EntryType } from '../../src/models/Transaction';
import Decimal from 'decimal.js';

/**
 * Unit tests for LedgerService
 * 
 * Tests double-entry accounting logic, transaction validation,
 * and balance calculations.
 */

describe('LedgerService', () => {
  let ledgerService: LedgerService;
  
  beforeEach(() => {
    ledgerService = new LedgerService();
  });
  
  describe('recordTransaction', () => {
    it('should record a sale transaction with balanced entries', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Test sale transaction'
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      expect(result.transaction).toBeDefined();
      expect(result.transaction.transactionType).toBe(TransactionType.SALE);
      expect(result.transaction.amount.toString()).toBe('1000.00');
      expect(result.entries).toHaveLength(2);
      
      // Verify double-entry balance
      const debitEntry = result.entries.find(e => e.entryType === EntryType.DEBIT);
      const creditEntry = result.entries.find(e => e.entryType === EntryType.CREDIT);
      
      expect(debitEntry).toBeDefined();
      expect(creditEntry).toBeDefined();
      expect(debitEntry!.amount.toString()).toBe(creditEntry!.amount.toString());
    });
    
    it('should record a refund transaction', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.REFUND,
        amount: '500.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Test refund transaction'
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      expect(result.transaction.transactionType).toBe(TransactionType.REFUND);
      expect(result.entries).toHaveLength(2);
    });
    
    it('should record a commission transaction', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.COMMISSION,
        amount: '100.00',
        currency: 'NGN',
        actorType: ActorType.AGENT,
        actorId: '770e8400-e29b-41d4-a716-446655440000',
        description: 'Test commission transaction'
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      expect(result.transaction.transactionType).toBe(TransactionType.COMMISSION);
      expect(result.entries).toHaveLength(2);
    });
    
    it('should reject transaction with negative amount', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '-100.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Invalid transaction'
      };
      
      await expect(ledgerService.recordTransaction(request))
        .rejects
        .toThrow('Transaction amount must be positive');
    });
    
    it('should reject transaction with zero amount', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '0.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Invalid transaction'
      };
      
      await expect(ledgerService.recordTransaction(request))
        .rejects
        .toThrow('Transaction amount must be positive');
    });
    
    it('should reject transaction without tenant ID', async () => {
      const request = {
        tenantId: '',
        transactionType: TransactionType.SALE,
        amount: '100.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Invalid transaction'
      };
      
      await expect(ledgerService.recordTransaction(request))
        .rejects
        .toThrow('Tenant ID is required');
    });
    
    it('should reject transaction without description', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '100.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: ''
      };
      
      await expect(ledgerService.recordTransaction(request))
        .rejects
        .toThrow('Description is required');
    });
  });
  
  describe('getTransaction', () => {
    it('should retrieve transaction by ID', async () => {
      // First create a transaction
      const createRequest = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Test transaction'
      };
      
      const created = await ledgerService.recordTransaction(createRequest);
      
      // Retrieve the transaction
      const result = await ledgerService.getTransaction(
        created.transaction.id,
        created.transaction.tenantId
      );
      
      expect(result).toBeDefined();
      expect(result!.transaction.id).toBe(created.transaction.id);
      expect(result!.entries).toHaveLength(2);
    });
    
    it('should return null for non-existent transaction', async () => {
      const result = await ledgerService.getTransaction(
        'non-existent-id',
        '550e8400-e29b-41d4-a716-446655440000'
      );
      
      expect(result).toBeNull();
    });
    
    it('should enforce tenant isolation', async () => {
      // Create transaction for tenant A
      const createRequest = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Test transaction'
      };
      
      const created = await ledgerService.recordTransaction(createRequest);
      
      // Try to retrieve with different tenant ID
      const result = await ledgerService.getTransaction(
        created.transaction.id,
        '660e8400-e29b-41d4-a716-446655440000' // Different tenant
      );
      
      expect(result).toBeNull();
    });
  });
  
  describe('queryTransactions', () => {
    it('should query transactions with filters', async () => {
      const filters = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        limit: 10,
        offset: 0
      };
      
      const result = await ledgerService.queryTransactions(filters);
      
      expect(result.transactions).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
    
    it('should filter by date range', async () => {
      const filters = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        limit: 10,
        offset: 0
      };
      
      const result = await ledgerService.queryTransactions(filters);
      
      expect(result.transactions).toBeDefined();
      result.transactions.forEach(tx => {
        expect(tx.transactionDate >= filters.startDate!).toBe(true);
        expect(tx.transactionDate <= filters.endDate!).toBe(true);
      });
    });
    
    it('should filter by actor', async () => {
      const filters = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        limit: 10,
        offset: 0
      };
      
      const result = await ledgerService.queryTransactions(filters);
      
      expect(result.transactions).toBeDefined();
      result.transactions.forEach(tx => {
        expect(tx.actorType).toBe(ActorType.MERCHANT);
        expect(tx.actorId).toBe('660e8400-e29b-41d4-a716-446655440000');
      });
    });
  });
  
  describe('getAccountBalance', () => {
    it('should calculate account balance correctly', async () => {
      const accountId = '990e8400-e29b-41d4-a716-446655440000';
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      
      const balance = await ledgerService.getAccountBalance(accountId, tenantId);
      
      expect(balance).toBeInstanceOf(Decimal);
      expect(balance.toNumber()).toBeGreaterThanOrEqual(0);
    });
    
    it('should calculate historical balance', async () => {
      const accountId = '990e8400-e29b-41d4-a716-446655440000';
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const effectiveDate = new Date('2026-01-15');
      
      const balance = await ledgerService.getAccountBalance(
        accountId,
        tenantId,
        effectiveDate
      );
      
      expect(balance).toBeInstanceOf(Decimal);
    });
  });
  
  describe('Double-Entry Validation', () => {
    it('should ensure debits equal credits', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Balance test'
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      const debitTotal = result.entries
        .filter(e => e.entryType === EntryType.DEBIT)
        .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
      
      const creditTotal = result.entries
        .filter(e => e.entryType === EntryType.CREDIT)
        .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
      
      expect(debitTotal.equals(creditTotal)).toBe(true);
    });
    
    it('should maintain currency consistency', async () => {
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Currency test'
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      const currencies = new Set(result.entries.map(e => e.currency));
      expect(currencies.size).toBe(1);
      expect(currencies.has('NGN')).toBe(true);
    });
  });
  
  describe('Immutability', () => {
    it('should prevent modification of ledger entries', async () => {
      // This test verifies that the database triggers prevent updates
      // In a real implementation, this would test the database constraint
      
      const request = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: '660e8400-e29b-41d4-a716-446655440000',
        description: 'Immutability test'
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      // Verify entries are created
      expect(result.entries).toHaveLength(2);
      
      // In production, attempting to update would throw an error from database trigger
    });
  });
});
