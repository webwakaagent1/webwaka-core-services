import Decimal from 'decimal.js';

/**
 * Transaction types supported by the ledger
 */
export enum TransactionType {
  SALE = 'SALE',
  REFUND = 'REFUND',
  COMMISSION = 'COMMISSION',
  PAYOUT = 'PAYOUT',
  FEE = 'FEE',
  ADJUSTMENT = 'ADJUSTMENT'
}

/**
 * Transaction status
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED'
}

/**
 * Actor types in the WebWaka ecosystem
 */
export enum ActorType {
  PLATFORM = 'PLATFORM',
  PARTNER = 'PARTNER',
  CLIENT = 'CLIENT',
  MERCHANT = 'MERCHANT',
  AGENT = 'AGENT',
  END_USER = 'END_USER'
}

/**
 * Entry type (debit or credit)
 */
export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

/**
 * Transaction interface
 */
export interface Transaction {
  id: string;
  tenantId: string;
  transactionType: TransactionType;
  transactionDate: Date;
  amount: Decimal;
  currency: string;
  status: TransactionStatus;
  externalReference?: string;
  description: string;
  metadata?: Record<string, any>;
  actorType: ActorType;
  actorId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Ledger entry interface (double-entry accounting)
 */
export interface LedgerEntry {
  id: string;
  tenantId: string;
  transactionId: string;
  entryDate: Date;
  accountId: string;
  actorType: ActorType;
  actorId: string;
  transactionType: TransactionType;
  amount: Decimal;
  currency: string;
  entryType: EntryType;
  externalReference?: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Create transaction request
 */
export interface CreateTransactionRequest {
  tenantId: string;
  transactionType: TransactionType;
  amount: string | number; // Will be converted to Decimal
  currency: string;
  actorType: ActorType;
  actorId: string;
  externalReference?: string;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Double-entry template for transaction types
 */
export interface DoubleEntryTemplate {
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
}

/**
 * Get double-entry template for transaction type
 */
export function getDoubleEntryTemplate(
  transactionType: TransactionType
): DoubleEntryTemplate {
  switch (transactionType) {
    case TransactionType.SALE:
      return {
        debitAccountCode: '1000-0001', // Cash
        creditAccountCode: '4000-0001', // Sales Revenue
        description: 'Sale transaction'
      };
    
    case TransactionType.REFUND:
      return {
        debitAccountCode: '5000-0005', // Refund Expense
        creditAccountCode: '1000-0001', // Cash
        description: 'Refund transaction'
      };
    
    case TransactionType.COMMISSION:
      return {
        debitAccountCode: '5000-0002', // Commission Expense
        creditAccountCode: '2000-0002', // Commission Payable
        description: 'Commission accrual'
      };
    
    case TransactionType.PAYOUT:
      return {
        debitAccountCode: '2000-0002', // Commission Payable
        creditAccountCode: '1000-0001', // Cash
        description: 'Commission payout'
      };
    
    case TransactionType.FEE:
      return {
        debitAccountCode: '5000-0003', // Platform Fee Expense
        creditAccountCode: '4000-0003', // Platform Fee Revenue
        description: 'Platform fee'
      };
    
    case TransactionType.ADJUSTMENT:
      // Adjustment requires manual account specification
      throw new Error('Adjustment transactions require explicit account specification');
  }
}

/**
 * Validate transaction balance (debits = credits)
 */
export function validateTransactionBalance(entries: LedgerEntry[]): boolean {
  let debitTotal = new Decimal(0);
  let creditTotal = new Decimal(0);
  
  for (const entry of entries) {
    if (entry.entryType === EntryType.DEBIT) {
      debitTotal = debitTotal.plus(entry.amount);
    } else {
      creditTotal = creditTotal.plus(entry.amount);
    }
  }
  
  return debitTotal.equals(creditTotal);
}

/**
 * Validate currency consistency
 */
export function validateCurrencyConsistency(entries: LedgerEntry[]): boolean {
  if (entries.length === 0) return true;
  
  const currency = entries[0].currency;
  return entries.every(entry => entry.currency === currency);
}

/**
 * Transaction query filters
 */
export interface TransactionQueryFilters {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  transactionType?: TransactionType;
  actorType?: ActorType;
  actorId?: string;
  minAmount?: Decimal;
  maxAmount?: Decimal;
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'date' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Transaction summary statistics
 */
export interface TransactionSummary {
  totalCount: number;
  totalAmount: Decimal;
  averageAmount: Decimal;
  byType: Record<TransactionType, { count: number; amount: Decimal }>;
  byActor: Record<ActorType, { count: number; amount: Decimal }>;
  byStatus: Record<TransactionStatus, { count: number; amount: Decimal }>;
}
