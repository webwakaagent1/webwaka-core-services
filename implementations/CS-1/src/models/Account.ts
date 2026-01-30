import Decimal from 'decimal.js';

/**
 * Account Types following standard accounting principles
 */
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE'
}

/**
 * Account normal balance (debit or credit)
 */
export enum NormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT'
}

/**
 * Account interface representing a ledger account
 */
export interface Account {
  id: string;
  tenantId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  currency: string;
  balance: Decimal;
  parentAccountId?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create account request
 */
export interface CreateAccountRequest {
  tenantId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  parentAccountId?: string;
  metadata?: Record<string, any>;
}

/**
 * Account balance snapshot
 */
export interface AccountBalance {
  accountId: string;
  tenantId: string;
  balance: Decimal;
  currency: string;
  effectiveDate: Date;
  balanceType: 'current' | 'historical';
}

/**
 * Get normal balance for account type
 */
export function getNormalBalance(accountType: AccountType): NormalBalance {
  switch (accountType) {
    case AccountType.ASSET:
    case AccountType.EXPENSE:
      return NormalBalance.DEBIT;
    case AccountType.LIABILITY:
    case AccountType.EQUITY:
    case AccountType.REVENUE:
      return NormalBalance.CREDIT;
  }
}

/**
 * Validate account code format
 * Standard format: XXXX-YYYY where X is category, Y is subcategory
 */
export function validateAccountCode(code: string): boolean {
  const pattern = /^\d{4}-\d{4}$/;
  return pattern.test(code);
}

/**
 * Standard chart of accounts template
 */
export const STANDARD_ACCOUNTS = {
  // Assets (1000-1999)
  CASH: '1000-0001',
  ACCOUNTS_RECEIVABLE: '1000-0002',
  INVENTORY: '1000-0003',
  
  // Liabilities (2000-2999)
  ACCOUNTS_PAYABLE: '2000-0001',
  COMMISSION_PAYABLE: '2000-0002',
  PLATFORM_FEE_PAYABLE: '2000-0003',
  
  // Equity (3000-3999)
  OWNER_EQUITY: '3000-0001',
  RETAINED_EARNINGS: '3000-0002',
  
  // Revenue (4000-4999)
  SALES_REVENUE: '4000-0001',
  COMMISSION_REVENUE: '4000-0002',
  PLATFORM_FEE_REVENUE: '4000-0003',
  SERVICE_REVENUE: '4000-0004',
  
  // Expenses (5000-5999)
  COST_OF_GOODS_SOLD: '5000-0001',
  COMMISSION_EXPENSE: '5000-0002',
  PLATFORM_FEE_EXPENSE: '5000-0003',
  OPERATING_EXPENSE: '5000-0004',
  REFUND_EXPENSE: '5000-0005'
};
