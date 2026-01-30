import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import { transaction as dbTransaction } from '../config/database';
import { logger, logTransaction } from '../utils/logger';
import {
  Transaction,
  LedgerEntry,
  CreateTransactionRequest,
  TransactionType,
  TransactionStatus,
  EntryType,
  getDoubleEntryTemplate,
  validateTransactionBalance,
  validateCurrencyConsistency,
  TransactionQueryFilters
} from '../models/Transaction';
import { Account, AccountType } from '../models/Account';

/**
 * Financial Ledger Service
 * 
 * Implements double-entry accounting with immutable, append-only ledger.
 * Ensures financial integrity through validation and atomic transactions.
 */
export class LedgerService {
  /**
   * Record a new financial transaction
   * 
   * Creates a transaction with balanced double-entry ledger entries.
   * All entries are recorded atomically or rolled back on error.
   * 
   * @param request Transaction details
   * @returns Created transaction with ledger entries
   */
  async recordTransaction(
    request: CreateTransactionRequest
  ): Promise<{ transaction: Transaction; entries: LedgerEntry[] }> {
    // Validate request
    this.validateTransactionRequest(request);
    
    // Convert amount to Decimal for precision
    const amount = new Decimal(request.amount);
    
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('Transaction amount must be positive');
    }
    
    // Generate transaction ID
    const transactionId = uuidv4();
    const now = new Date();
    
    try {
      return await dbTransaction(async (client) => {
        // Get double-entry template
        const template = getDoubleEntryTemplate(request.transactionType);
        
        // Get accounts for debit and credit
        const debitAccount = await this.getAccountByCode(
          client,
          request.tenantId,
          template.debitAccountCode
        );
        
        const creditAccount = await this.getAccountByCode(
          client,
          request.tenantId,
          template.creditAccountCode
        );
        
        // Validate accounts exist and are active
        if (!debitAccount || !debitAccount.isActive) {
          throw new Error(`Debit account ${template.debitAccountCode} not found or inactive`);
        }
        
        if (!creditAccount || !creditAccount.isActive) {
          throw new Error(`Credit account ${template.creditAccountCode} not found or inactive`);
        }
        
        // Validate currency consistency
        if (debitAccount.currency !== request.currency || 
            creditAccount.currency !== request.currency) {
          throw new Error('Account currency mismatch');
        }
        
        // Create transaction record
        const transaction: Transaction = {
          id: transactionId,
          tenantId: request.tenantId,
          transactionType: request.transactionType,
          transactionDate: now,
          amount,
          currency: request.currency,
          status: TransactionStatus.COMPLETED,
          externalReference: request.externalReference,
          description: request.description,
          metadata: request.metadata,
          actorType: request.actorType,
          actorId: request.actorId,
          createdAt: now,
          updatedAt: now
        };
        
        // Insert transaction
        await client.query(
          `INSERT INTO transactions (
            id, tenant_id, transaction_type, transaction_date, amount, currency,
            status, external_reference, description, metadata, actor_type, actor_id,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            transaction.id,
            transaction.tenantId,
            transaction.transactionType,
            transaction.transactionDate,
            transaction.amount.toString(),
            transaction.currency,
            transaction.status,
            transaction.externalReference,
            transaction.description,
            JSON.stringify(transaction.metadata || {}),
            transaction.actorType,
            transaction.actorId,
            transaction.createdAt,
            transaction.updatedAt
          ]
        );
        
        // Create debit entry
        const debitEntry: LedgerEntry = {
          id: uuidv4(),
          tenantId: request.tenantId,
          transactionId,
          entryDate: now,
          accountId: debitAccount.id,
          actorType: request.actorType,
          actorId: request.actorId,
          transactionType: request.transactionType,
          amount,
          currency: request.currency,
          entryType: EntryType.DEBIT,
          externalReference: request.externalReference,
          description: `${template.description} - Debit`,
          metadata: request.metadata,
          createdAt: now
        };
        
        // Create credit entry
        const creditEntry: LedgerEntry = {
          id: uuidv4(),
          tenantId: request.tenantId,
          transactionId,
          entryDate: now,
          accountId: creditAccount.id,
          actorType: request.actorType,
          actorId: request.actorId,
          transactionType: request.transactionType,
          amount,
          currency: request.currency,
          entryType: EntryType.CREDIT,
          externalReference: request.externalReference,
          description: `${template.description} - Credit`,
          metadata: request.metadata,
          createdAt: now
        };
        
        const entries = [debitEntry, creditEntry];
        
        // Validate balance
        if (!validateTransactionBalance(entries)) {
          throw new Error('Transaction entries are not balanced');
        }
        
        // Validate currency consistency
        if (!validateCurrencyConsistency(entries)) {
          throw new Error('Transaction entries have inconsistent currencies');
        }
        
        // Insert ledger entries
        for (const entry of entries) {
          await client.query(
            `INSERT INTO ledger_entries (
              id, tenant_id, transaction_id, entry_date, account_id, actor_type,
              actor_id, transaction_type, amount, currency, entry_type,
              external_reference, description, metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              entry.id,
              entry.tenantId,
              entry.transactionId,
              entry.entryDate,
              entry.accountId,
              entry.actorType,
              entry.actorId,
              entry.transactionType,
              entry.amount.toString(),
              entry.currency,
              entry.entryType,
              entry.externalReference,
              entry.description,
              JSON.stringify(entry.metadata || {}),
              entry.createdAt
            ]
          );
        }
        
        // Update account balances (done via database triggers)
        
        // Log transaction for audit trail
        logTransaction(
          'RECORD_TRANSACTION',
          transactionId,
          request.tenantId,
          request.actorId,
          {
            transactionType: request.transactionType,
            amount: amount.toString(),
            currency: request.currency
          }
        );
        
        logger.info('Transaction recorded successfully', {
          transactionId,
          tenantId: request.tenantId,
          type: request.transactionType,
          amount: amount.toString()
        });
        
        return { transaction, entries };
      });
    } catch (error) {
      logger.error('Failed to record transaction', {
        error: (error as Error).message,
        request
      });
      throw error;
    }
  }
  
  /**
   * Get transaction by ID
   */
  async getTransaction(
    transactionId: string,
    tenantId: string
  ): Promise<{ transaction: Transaction; entries: LedgerEntry[] } | null> {
    try {
      return await dbTransaction(async (client) => {
        // Get transaction
        const txResult = await client.query(
          `SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2`,
          [transactionId, tenantId]
        );
        
        if (txResult.rows.length === 0) {
          return null;
        }
        
        const transaction = this.mapRowToTransaction(txResult.rows[0]);
        
        // Get ledger entries
        const entriesResult = await client.query(
          `SELECT * FROM ledger_entries WHERE transaction_id = $1 AND tenant_id = $2 ORDER BY entry_type`,
          [transactionId, tenantId]
        );
        
        const entries = entriesResult.rows.map(row => this.mapRowToLedgerEntry(row));
        
        return { transaction, entries };
      });
    } catch (error) {
      logger.error('Failed to get transaction', {
        error: (error as Error).message,
        transactionId,
        tenantId
      });
      throw error;
    }
  }
  
  /**
   * Query transactions with filters
   */
  async queryTransactions(
    filters: TransactionQueryFilters
  ): Promise<{ transactions: Transaction[]; total: number }> {
    try {
      return await dbTransaction(async (client) => {
        // Build query
        let query = 'SELECT * FROM transactions WHERE tenant_id = $1';
        const params: any[] = [filters.tenantId];
        let paramIndex = 2;
        
        if (filters.startDate) {
          query += ` AND transaction_date >= $${paramIndex}`;
          params.push(filters.startDate);
          paramIndex++;
        }
        
        if (filters.endDate) {
          query += ` AND transaction_date <= $${paramIndex}`;
          params.push(filters.endDate);
          paramIndex++;
        }
        
        if (filters.transactionType) {
          query += ` AND transaction_type = $${paramIndex}`;
          params.push(filters.transactionType);
          paramIndex++;
        }
        
        if (filters.actorType) {
          query += ` AND actor_type = $${paramIndex}`;
          params.push(filters.actorType);
          paramIndex++;
        }
        
        if (filters.actorId) {
          query += ` AND actor_id = $${paramIndex}`;
          params.push(filters.actorId);
          paramIndex++;
        }
        
        if (filters.status) {
          query += ` AND status = $${paramIndex}`;
          params.push(filters.status);
          paramIndex++;
        }
        
        // Get total count
        const countResult = await client.query(
          query.replace('SELECT *', 'SELECT COUNT(*)'),
          params
        );
        const total = parseInt(countResult.rows[0].count);
        
        // Add sorting
        const sortBy = filters.sortBy || 'date';
        const sortOrder = filters.sortOrder || 'desc';
        query += ` ORDER BY ${sortBy === 'date' ? 'transaction_date' : 'amount'} ${sortOrder}`;
        
        // Add pagination
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        // Execute query
        const result = await client.query(query, params);
        const transactions = result.rows.map(row => this.mapRowToTransaction(row));
        
        return { transactions, total };
      });
    } catch (error) {
      logger.error('Failed to query transactions', {
        error: (error as Error).message,
        filters
      });
      throw error;
    }
  }
  
  /**
   * Get account balance
   */
  async getAccountBalance(
    accountId: string,
    tenantId: string,
    effectiveDate?: Date
  ): Promise<Decimal> {
    try {
      return await dbTransaction(async (client) => {
        let query = `
          SELECT COALESCE(SUM(
            CASE 
              WHEN entry_type = 'DEBIT' THEN amount
              WHEN entry_type = 'CREDIT' THEN -amount
            END
          ), 0) as balance
          FROM ledger_entries
          WHERE account_id = $1 AND tenant_id = $2
        `;
        
        const params: any[] = [accountId, tenantId];
        
        if (effectiveDate) {
          query += ' AND entry_date <= $3';
          params.push(effectiveDate);
        }
        
        const result = await client.query(query, params);
        return new Decimal(result.rows[0].balance);
      });
    } catch (error) {
      logger.error('Failed to get account balance', {
        error: (error as Error).message,
        accountId,
        tenantId
      });
      throw error;
    }
  }
  
  /**
   * Helper: Get account by code
   */
  private async getAccountByCode(
    client: any,
    tenantId: string,
    accountCode: string
  ): Promise<Account | null> {
    const result = await client.query(
      'SELECT * FROM accounts WHERE tenant_id = $1 AND account_code = $2',
      [tenantId, accountCode]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToAccount(result.rows[0]);
  }
  
  /**
   * Helper: Validate transaction request
   */
  private validateTransactionRequest(request: CreateTransactionRequest): void {
    if (!request.tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    if (!request.transactionType) {
      throw new Error('Transaction type is required');
    }
    
    if (!request.amount) {
      throw new Error('Amount is required');
    }
    
    if (!request.currency) {
      throw new Error('Currency is required');
    }
    
    if (!request.actorType || !request.actorId) {
      throw new Error('Actor type and ID are required');
    }
    
    if (!request.description) {
      throw new Error('Description is required');
    }
  }
  
  /**
   * Helper: Map database row to Transaction
   */
  private mapRowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      transactionType: row.transaction_type,
      transactionDate: row.transaction_date,
      amount: new Decimal(row.amount),
      currency: row.currency,
      status: row.status,
      externalReference: row.external_reference,
      description: row.description,
      metadata: row.metadata,
      actorType: row.actor_type,
      actorId: row.actor_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  
  /**
   * Helper: Map database row to LedgerEntry
   */
  private mapRowToLedgerEntry(row: any): LedgerEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      transactionId: row.transaction_id,
      entryDate: row.entry_date,
      accountId: row.account_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      transactionType: row.transaction_type,
      amount: new Decimal(row.amount),
      currency: row.currency,
      entryType: row.entry_type,
      externalReference: row.external_reference,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.created_at
    };
  }
  
  /**
   * Helper: Map database row to Account
   */
  private mapRowToAccount(row: any): Account {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      accountType: row.account_type,
      normalBalance: row.normal_balance,
      currency: row.currency,
      balance: new Decimal(row.balance),
      parentAccountId: row.parent_account_id,
      isActive: row.is_active,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
