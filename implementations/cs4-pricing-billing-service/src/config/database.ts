import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_models (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        model_type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        is_system BOOLEAN DEFAULT false,
        created_by VARCHAR(36) NOT NULL,
        created_by_role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version INTEGER DEFAULT 1,
        CONSTRAINT valid_model_type CHECK (model_type IN ('flat', 'usage_based', 'tiered', 'subscription', 'revenue_share', 'hybrid'))
      );

      CREATE TABLE IF NOT EXISTS pricing_rules (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        pricing_model_id VARCHAR(36) NOT NULL REFERENCES pricing_models(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rule_type VARCHAR(50) NOT NULL,
        conditions JSONB NOT NULL DEFAULT '[]',
        actions JSONB NOT NULL DEFAULT '[]',
        priority INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        effective_from TIMESTAMP,
        effective_to TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pricing_scopes (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        pricing_model_id VARCHAR(36) NOT NULL REFERENCES pricing_models(id) ON DELETE CASCADE,
        scope_type VARCHAR(50) NOT NULL,
        scope_id VARCHAR(36),
        deployment_type VARCHAR(50),
        is_override BOOLEAN DEFAULT false,
        parent_scope_id VARCHAR(36) REFERENCES pricing_scopes(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_scope_type CHECK (scope_type IN ('global', 'deployment', 'partner', 'client', 'merchant', 'agent', 'staff', 'individual', 'group', 'segment', 'contract')),
        CONSTRAINT valid_deployment_type CHECK (deployment_type IS NULL OR deployment_type IN ('shared_saas', 'partner_deployed', 'self_hosted'))
      );

      CREATE TABLE IF NOT EXISTS billing_cycles (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        scope_id VARCHAR(36) NOT NULL,
        scope_type VARCHAR(50) NOT NULL,
        cycle_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_cycle_type CHECK (cycle_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
        CONSTRAINT valid_status CHECK (status IN ('active', 'closed', 'invoiced', 'paid', 'overdue', 'cancelled'))
      );

      CREATE TABLE IF NOT EXISTS billing_items (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        billing_cycle_id VARCHAR(36) NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
        pricing_model_id VARCHAR(36) NOT NULL REFERENCES pricing_models(id),
        item_type VARCHAR(100) NOT NULL,
        description TEXT,
        quantity DECIMAL(20, 6) NOT NULL DEFAULT 1,
        unit_price DECIMAL(20, 6) NOT NULL,
        total_amount DECIMAL(20, 6) NOT NULL,
        currency VARCHAR(3) DEFAULT 'NGN',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pricing_audit_log (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(36) NOT NULL,
        action VARCHAR(50) NOT NULL,
        actor_id VARCHAR(36) NOT NULL,
        actor_role VARCHAR(50) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        reason TEXT,
        is_reversible BOOLEAN DEFAULT true,
        reversed_by VARCHAR(36),
        reversed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pricing_overrides (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        pricing_model_id VARCHAR(36) NOT NULL REFERENCES pricing_models(id),
        scope_id VARCHAR(36) NOT NULL REFERENCES pricing_scopes(id),
        override_type VARCHAR(50) NOT NULL,
        override_value JSONB NOT NULL,
        reason TEXT NOT NULL,
        approved_by VARCHAR(36),
        approved_at TIMESTAMP,
        effective_from TIMESTAMP NOT NULL,
        effective_to TIMESTAMP,
        version INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pricing_models_tenant ON pricing_models(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_models_type ON pricing_models(model_type);
      CREATE INDEX IF NOT EXISTS idx_pricing_rules_model ON pricing_rules(pricing_model_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_scopes_model ON pricing_scopes(pricing_model_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_scopes_type ON pricing_scopes(scope_type, scope_id);
      CREATE INDEX IF NOT EXISTS idx_billing_cycles_tenant ON billing_cycles(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_billing_cycles_scope ON billing_cycles(scope_id, scope_type);
      CREATE INDEX IF NOT EXISTS idx_billing_items_cycle ON billing_items(billing_cycle_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_audit_entity ON pricing_audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_pricing_overrides_scope ON pricing_overrides(scope_id);
    `);
    logger.info('Database migrations applied');
  } finally {
    client.release();
  }
}
