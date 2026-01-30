import { LedgerService } from '../../src/services/LedgerService';
import { TransactionType, ActorType, TransactionStatus } from '../../src/models/Transaction';
import { testConnection, closePool } from '../../src/config/database';
import Decimal from 'decimal.js';

/**
 * Integration tests for complete transaction flows
 * 
 * Tests end-to-end scenarios including sale, commission, and payout flows.
 */

describe('Transaction Flow Integration Tests', () => {
  let ledgerService: LedgerService;
  const testTenantId = '550e8400-e29b-41d4-a716-446655440000';
  const merchantId = '660e8400-e29b-41d4-a716-446655440000';
  const agentId = '770e8400-e29b-41d4-a716-446655440000';
  
  beforeAll(async () => {
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to test database');
    }
    
    ledgerService = new LedgerService();
  });
  
  afterAll(async () => {
    await closePool();
  });
  
  describe('Complete Sale Flow', () => {
    it('should record a complete sale transaction flow', async () => {
      // Step 1: Record sale transaction
      const saleRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.SALE,
        amount: '10000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        externalReference: 'ORDER-TEST-001',
        description: 'Integration test - Product sale',
        metadata: {
          productId: 'PROD-001',
          quantity: 5,
          unitPrice: '2000.00'
        }
      };
      
      const saleResult = await ledgerService.recordTransaction(saleRequest);
      
      // Verify sale transaction
      expect(saleResult.transaction).toBeDefined();
      expect(saleResult.transaction.status).toBe(TransactionStatus.COMPLETED);
      expect(saleResult.transaction.amount.toString()).toBe('10000.00');
      expect(saleResult.entries).toHaveLength(2);
      
      // Step 2: Record commission for agent
      const commissionRate = 0.10; // 10% commission
      const commissionAmount = new Decimal(saleRequest.amount).times(commissionRate);
      
      const commissionRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.COMMISSION,
        amount: commissionAmount.toString(),
        currency: 'NGN',
        actorType: ActorType.AGENT,
        actorId: agentId,
        externalReference: `COMM-${saleResult.transaction.id}`,
        description: `Commission for sale ${saleRequest.externalReference}`,
        metadata: {
          saleTransactionId: saleResult.transaction.id,
          commissionRate: commissionRate,
          saleAmount: saleRequest.amount
        }
      };
      
      const commissionResult = await ledgerService.recordTransaction(commissionRequest);
      
      // Verify commission transaction
      expect(commissionResult.transaction).toBeDefined();
      expect(commissionResult.transaction.amount.toString()).toBe('1000.00');
      expect(commissionResult.entries).toHaveLength(2);
      
      // Step 3: Retrieve both transactions
      const saleTransaction = await ledgerService.getTransaction(
        saleResult.transaction.id,
        testTenantId
      );
      
      const commissionTransaction = await ledgerService.getTransaction(
        commissionResult.transaction.id,
        testTenantId
      );
      
      expect(saleTransaction).toBeDefined();
      expect(commissionTransaction).toBeDefined();
      
      // Step 4: Query all transactions for this flow
      const queryResult = await ledgerService.queryTransactions({
        tenantId: testTenantId,
        actorId: merchantId,
        limit: 10,
        offset: 0
      });
      
      expect(queryResult.transactions.length).toBeGreaterThan(0);
      
      const foundSale = queryResult.transactions.find(
        tx => tx.id === saleResult.transaction.id
      );
      expect(foundSale).toBeDefined();
    });
  });
  
  describe('Refund Flow', () => {
    it('should record a refund transaction', async () => {
      // Step 1: Record original sale
      const saleRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.SALE,
        amount: '5000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        externalReference: 'ORDER-TEST-002',
        description: 'Integration test - Sale to be refunded'
      };
      
      const saleResult = await ledgerService.recordTransaction(saleRequest);
      expect(saleResult.transaction.status).toBe(TransactionStatus.COMPLETED);
      
      // Step 2: Record refund
      const refundRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.REFUND,
        amount: '5000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        externalReference: `REFUND-${saleResult.transaction.id}`,
        description: `Refund for ${saleRequest.externalReference}`,
        metadata: {
          originalTransactionId: saleResult.transaction.id,
          refundReason: 'Customer request'
        }
      };
      
      const refundResult = await ledgerService.recordTransaction(refundRequest);
      
      // Verify refund transaction
      expect(refundResult.transaction).toBeDefined();
      expect(refundResult.transaction.transactionType).toBe(TransactionType.REFUND);
      expect(refundResult.transaction.amount.toString()).toBe('5000.00');
      expect(refundResult.entries).toHaveLength(2);
    });
  });
  
  describe('Commission Payout Flow', () => {
    it('should record commission accrual and payout', async () => {
      // Step 1: Record commission accrual
      const commissionRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.COMMISSION,
        amount: '2000.00',
        currency: 'NGN',
        actorType: ActorType.AGENT,
        actorId: agentId,
        description: 'Integration test - Commission accrual'
      };
      
      const commissionResult = await ledgerService.recordTransaction(commissionRequest);
      expect(commissionResult.transaction.status).toBe(TransactionStatus.COMPLETED);
      
      // Step 2: Record payout
      const payoutRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.PAYOUT,
        amount: '2000.00',
        currency: 'NGN',
        actorType: ActorType.AGENT,
        actorId: agentId,
        externalReference: `PAYOUT-${commissionResult.transaction.id}`,
        description: `Payout for commission ${commissionResult.transaction.id}`,
        metadata: {
          commissionTransactionId: commissionResult.transaction.id,
          paymentMethod: 'bank_transfer',
          bankAccount: 'XXXX-1234'
        }
      };
      
      const payoutResult = await ledgerService.recordTransaction(payoutRequest);
      
      // Verify payout transaction
      expect(payoutResult.transaction).toBeDefined();
      expect(payoutResult.transaction.transactionType).toBe(TransactionType.PAYOUT);
      expect(payoutResult.transaction.amount.toString()).toBe('2000.00');
      expect(payoutResult.entries).toHaveLength(2);
    });
  });
  
  describe('Platform Fee Flow', () => {
    it('should record platform fee transactions', async () => {
      const feeRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.FEE,
        amount: '500.00',
        currency: 'NGN',
        actorType: ActorType.PLATFORM,
        actorId: 'platform-001',
        description: 'Integration test - Platform fee',
        metadata: {
          feeType: 'transaction_fee',
          feeRate: 0.05
        }
      };
      
      const feeResult = await ledgerService.recordTransaction(feeRequest);
      
      // Verify fee transaction
      expect(feeResult.transaction).toBeDefined();
      expect(feeResult.transaction.transactionType).toBe(TransactionType.FEE);
      expect(feeResult.transaction.amount.toString()).toBe('500.00');
      expect(feeResult.entries).toHaveLength(2);
    });
  });
  
  describe('Multi-Currency Support', () => {
    it('should handle transactions in different currencies', async () => {
      // USD transaction
      const usdRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.SALE,
        amount: '100.00',
        currency: 'USD',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        description: 'Integration test - USD transaction'
      };
      
      const usdResult = await ledgerService.recordTransaction(usdRequest);
      expect(usdResult.transaction.currency).toBe('USD');
      
      // NGN transaction
      const ngnRequest = {
        tenantId: testTenantId,
        transactionType: TransactionType.SALE,
        amount: '50000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        description: 'Integration test - NGN transaction'
      };
      
      const ngnResult = await ledgerService.recordTransaction(ngnRequest);
      expect(ngnResult.transaction.currency).toBe('NGN');
    });
  });
  
  describe('Account Balance Tracking', () => {
    it('should track account balances correctly', async () => {
      // Get initial balance
      const cashAccountId = '990e8400-e29b-41d4-a716-446655440000';
      const initialBalance = await ledgerService.getAccountBalance(
        cashAccountId,
        testTenantId
      );
      
      // Record a transaction
      const transactionAmount = new Decimal('3000.00');
      const request = {
        tenantId: testTenantId,
        transactionType: TransactionType.SALE,
        amount: transactionAmount.toString(),
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        description: 'Integration test - Balance tracking'
      };
      
      await ledgerService.recordTransaction(request);
      
      // Get updated balance
      const updatedBalance = await ledgerService.getAccountBalance(
        cashAccountId,
        testTenantId
      );
      
      // Verify balance increased (assuming Cash is debited for sales)
      expect(updatedBalance.greaterThan(initialBalance)).toBe(true);
      expect(updatedBalance.minus(initialBalance).toString()).toBe(transactionAmount.toString());
    });
  });
  
  describe('Tenant Isolation', () => {
    it('should enforce strict tenant isolation', async () => {
      const tenant1 = '550e8400-e29b-41d4-a716-446655440000';
      const tenant2 = '660e8400-e29b-41d4-a716-446655440000';
      
      // Create transaction for tenant 1
      const request1 = {
        tenantId: tenant1,
        transactionType: TransactionType.SALE,
        amount: '1000.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        description: 'Tenant 1 transaction'
      };
      
      const result1 = await ledgerService.recordTransaction(request1);
      
      // Try to retrieve with tenant 2 credentials
      const crossTenantResult = await ledgerService.getTransaction(
        result1.transaction.id,
        tenant2
      );
      
      // Should return null due to tenant isolation
      expect(crossTenantResult).toBeNull();
      
      // Query transactions for tenant 2 should not include tenant 1 transactions
      const tenant2Transactions = await ledgerService.queryTransactions({
        tenantId: tenant2,
        limit: 100,
        offset: 0
      });
      
      const foundTenant1Transaction = tenant2Transactions.transactions.find(
        tx => tx.id === result1.transaction.id
      );
      
      expect(foundTenant1Transaction).toBeUndefined();
    });
  });
  
  describe('Transaction Metadata', () => {
    it('should preserve transaction metadata', async () => {
      const metadata = {
        orderId: 'ORDER-12345',
        customerId: 'CUST-67890',
        productIds: ['PROD-001', 'PROD-002'],
        shippingAddress: {
          street: '123 Test St',
          city: 'Lagos',
          country: 'Nigeria'
        },
        tags: ['urgent', 'vip']
      };
      
      const request = {
        tenantId: testTenantId,
        transactionType: TransactionType.SALE,
        amount: '7500.00',
        currency: 'NGN',
        actorType: ActorType.MERCHANT,
        actorId: merchantId,
        description: 'Integration test - Metadata preservation',
        metadata
      };
      
      const result = await ledgerService.recordTransaction(request);
      
      // Retrieve and verify metadata
      const retrieved = await ledgerService.getTransaction(
        result.transaction.id,
        testTenantId
      );
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.transaction.metadata).toEqual(metadata);
    });
  });
  
  describe('High-Volume Transaction Processing', () => {
    it('should handle multiple concurrent transactions', async () => {
      const transactionCount = 10;
      const promises = [];
      
      for (let i = 0; i < transactionCount; i++) {
        const request = {
          tenantId: testTenantId,
          transactionType: TransactionType.SALE,
          amount: `${(i + 1) * 100}.00`,
          currency: 'NGN',
          actorType: ActorType.MERCHANT,
          actorId: merchantId,
          description: `Concurrent transaction ${i + 1}`
        };
        
        promises.push(ledgerService.recordTransaction(request));
      }
      
      const results = await Promise.all(promises);
      
      // Verify all transactions completed successfully
      expect(results).toHaveLength(transactionCount);
      results.forEach(result => {
        expect(result.transaction.status).toBe(TransactionStatus.COMPLETED);
        expect(result.entries).toHaveLength(2);
      });
    });
  });
});
