-- CS-1 Financial Ledger Service - Initial Database Schema
-- Version: 1.0
-- Date: January 30, 2026

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DATABASE webwaka_ledger SET row_security = on;

-- ============================================================================
-- ACCOUNTS TABLE
-- ============================================================================

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  account_code VARCHAR(20) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  balance DECIMAL(20, 4) NOT NULL DEFAULT 0,
  parent_account_id UUID REFERENCES accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE (tenant_id, account_code)
);

-- Indexes for accounts
CREATE INDEX idx_accounts_tenant_id ON accounts(tenant_id);
CREATE INDEX idx_accounts_account_code ON accounts(account_code);
CREATE INDEX idx_accounts_account_type ON accounts(account_type);
CREATE INDEX idx_accounts_parent_account_id ON accounts(parent_account_id);

-- Row Level Security for accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_tenant_isolation ON accounts
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================================
-- TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('SALE', 'REFUND', 'COMMISSION', 'PAYOUT', 'FEE', 'ADJUSTMENT')),
  transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
  amount DECIMAL(20, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
  external_reference VARCHAR(255),
  description TEXT NOT NULL,
  metadata JSONB,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('PLATFORM', 'PARTNER', 'CLIENT', 'MERCHANT', 'AGENT', 'END_USER')),
  actor_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for transactions
CREATE INDEX idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_transaction_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_actor ON transactions(actor_type, actor_id);
CREATE INDEX idx_transactions_external_reference ON transactions(external_reference);
CREATE INDEX idx_transactions_status ON transactions(status);

-- Row Level Security for transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_tenant_isolation ON transactions
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================================
-- LEDGER_ENTRIES TABLE (Immutable, Append-Only)
-- ============================================================================

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  entry_date TIMESTAMP NOT NULL DEFAULT NOW(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('PLATFORM', 'PARTNER', 'CLIENT', 'MERCHANT', 'AGENT', 'END_USER')),
  actor_id UUID NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('SALE', 'REFUND', 'COMMISSION', 'PAYOUT', 'FEE', 'ADJUSTMENT')),
  amount DECIMAL(20, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  external_reference VARCHAR(255),
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for ledger_entries
CREATE INDEX idx_ledger_entries_tenant_id ON ledger_entries(tenant_id);
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_entry_date ON ledger_entries(entry_date);
CREATE INDEX idx_ledger_entries_actor ON ledger_entries(actor_type, actor_id);

-- Row Level Security for ledger_entries
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_entries_tenant_isolation ON ledger_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================================
-- IMMUTABILITY ENFORCEMENT
-- ============================================================================

-- Prevent UPDATE on ledger_entries (immutable)
CREATE OR REPLACE FUNCTION prevent_ledger_entry_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_ledger_entry_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_entry_update();

-- Prevent DELETE on ledger_entries (immutable)
CREATE OR REPLACE FUNCTION prevent_ledger_entry_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_ledger_entry_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_entry_delete();

-- ============================================================================
-- ACCOUNT BALANCE UPDATES
-- ============================================================================

-- Update account balance when ledger entry is inserted
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  account_normal_balance VARCHAR(10);
BEGIN
  -- Get account normal balance
  SELECT normal_balance INTO account_normal_balance
  FROM accounts
  WHERE id = NEW.account_id;
  
  -- Update balance based on entry type and normal balance
  IF NEW.entry_type = account_normal_balance THEN
    -- Increase balance
    UPDATE accounts
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  ELSE
    -- Decrease balance
    UPDATE accounts
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- ============================================================================
-- ACCOUNT_BALANCES TABLE (Historical Snapshots)
-- ============================================================================

CREATE TABLE account_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  tenant_id UUID NOT NULL,
  balance DECIMAL(20, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  effective_date DATE NOT NULL,
  balance_type VARCHAR(20) NOT NULL CHECK (balance_type IN ('current', 'historical')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE (account_id, effective_date, balance_type)
);

-- Indexes for account_balances
CREATE INDEX idx_account_balances_account_id ON account_balances(account_id);
CREATE INDEX idx_account_balances_tenant_id ON account_balances(tenant_id);
CREATE INDEX idx_account_balances_effective_date ON account_balances(effective_date);

-- Row Level Security for account_balances
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_balances_tenant_isolation ON account_balances
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ============================================================================
-- AUDIT_LOG TABLE
-- ============================================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  actor_type VARCHAR(20) NOT NULL,
  actor_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  justification TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for audit_log
CREATE INDEX idx_audit_log_tenant_id ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Audit log is append-only (no RLS needed for reads)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_insert_only ON audit_log
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_log_read_all ON audit_log
  FOR SELECT
  USING (true);

-- Prevent UPDATE and DELETE on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_audit_log_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER trigger_prevent_audit_log_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();

-- ============================================================================
-- STANDARD CHART OF ACCOUNTS SEED DATA
-- ============================================================================

-- Function to create standard accounts for a tenant
CREATE OR REPLACE FUNCTION create_standard_accounts(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Assets
  INSERT INTO accounts (tenant_id, account_code, account_name, account_type, normal_balance, currency)
  VALUES
    (p_tenant_id, '1000-0001', 'Cash', 'ASSET', 'DEBIT', 'NGN'),
    (p_tenant_id, '1000-0002', 'Accounts Receivable', 'ASSET', 'DEBIT', 'NGN'),
    (p_tenant_id, '1000-0003', 'Inventory', 'ASSET', 'DEBIT', 'NGN');
  
  -- Liabilities
  INSERT INTO accounts (tenant_id, account_code, account_name, account_type, normal_balance, currency)
  VALUES
    (p_tenant_id, '2000-0001', 'Accounts Payable', 'LIABILITY', 'CREDIT', 'NGN'),
    (p_tenant_id, '2000-0002', 'Commission Payable', 'LIABILITY', 'CREDIT', 'NGN'),
    (p_tenant_id, '2000-0003', 'Platform Fee Payable', 'LIABILITY', 'CREDIT', 'NGN');
  
  -- Equity
  INSERT INTO accounts (tenant_id, account_code, account_name, account_type, normal_balance, currency)
  VALUES
    (p_tenant_id, '3000-0001', 'Owner Equity', 'EQUITY', 'CREDIT', 'NGN'),
    (p_tenant_id, '3000-0002', 'Retained Earnings', 'EQUITY', 'CREDIT', 'NGN');
  
  -- Revenue
  INSERT INTO accounts (tenant_id, account_code, account_name, account_type, normal_balance, currency)
  VALUES
    (p_tenant_id, '4000-0001', 'Sales Revenue', 'REVENUE', 'CREDIT', 'NGN'),
    (p_tenant_id, '4000-0002', 'Commission Revenue', 'REVENUE', 'CREDIT', 'NGN'),
    (p_tenant_id, '4000-0003', 'Platform Fee Revenue', 'REVENUE', 'CREDIT', 'NGN'),
    (p_tenant_id, '4000-0004', 'Service Revenue', 'REVENUE', 'CREDIT', 'NGN');
  
  -- Expenses
  INSERT INTO accounts (tenant_id, account_code, account_name, account_type, normal_balance, currency)
  VALUES
    (p_tenant_id, '5000-0001', 'Cost of Goods Sold', 'EXPENSE', 'DEBIT', 'NGN'),
    (p_tenant_id, '5000-0002', 'Commission Expense', 'EXPENSE', 'DEBIT', 'NGN'),
    (p_tenant_id, '5000-0003', 'Platform Fee Expense', 'EXPENSE', 'DEBIT', 'NGN'),
    (p_tenant_id, '5000-0004', 'Operating Expense', 'EXPENSE', 'DEBIT', 'NGN'),
    (p_tenant_id, '5000-0005', 'Refund Expense', 'EXPENSE', 'DEBIT', 'NGN');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- View: Account balances with account details
CREATE VIEW v_account_balances AS
SELECT 
  a.id as account_id,
  a.tenant_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.normal_balance,
  a.balance,
  a.currency,
  a.is_active
FROM accounts a;

-- View: Transaction summary
CREATE VIEW v_transaction_summary AS
SELECT 
  t.tenant_id,
  t.transaction_type,
  t.actor_type,
  COUNT(*) as transaction_count,
  SUM(t.amount) as total_amount,
  t.currency,
  DATE(t.transaction_date) as transaction_date
FROM transactions t
WHERE t.status = 'COMPLETED'
GROUP BY t.tenant_id, t.transaction_type, t.actor_type, t.currency, DATE(t.transaction_date);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE accounts IS 'Chart of accounts for double-entry accounting';
COMMENT ON TABLE transactions IS 'Financial transactions across the platform';
COMMENT ON TABLE ledger_entries IS 'Immutable, append-only ledger entries (double-entry)';
COMMENT ON TABLE account_balances IS 'Historical account balance snapshots';
COMMENT ON TABLE audit_log IS 'Immutable audit trail for all financial operations';

COMMENT ON COLUMN ledger_entries.entry_type IS 'DEBIT or CREDIT - must balance for each transaction';
COMMENT ON COLUMN accounts.normal_balance IS 'Normal balance type for the account (DEBIT for assets/expenses, CREDIT for liabilities/equity/revenue)';

-- End of migration
