import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

/**
 * Database Configuration for Financial Ledger Service
 * 
 * Provides PostgreSQL connection pool with optimized settings
 * for financial transaction workloads.
 */

const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'webwaka_ledger',
  user: process.env.DB_USER || 'webwaka',
  password: process.env.DB_PASSWORD,
  
  // Connection pool settings optimized for financial workloads
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  min: parseInt(process.env.DB_POOL_MIN || '5'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  
  // Enable SSL in production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA
  } : false,
  
  // Application name for monitoring
  application_name: 'cs1-financial-ledger'
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err, client) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

// Handle pool connection
pool.on('connect', (client) => {
  logger.debug('New database connection established');
});

// Handle pool removal
pool.on('remove', (client) => {
  logger.debug('Database connection removed from pool');
});

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful', { timestamp: result.rows[0].now });
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Execute query with automatic client management
 */
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query execution failed', { 
      error: (error as Error).message,
      query: text 
    });
    throw error;
  }
}

/**
 * Execute transaction with automatic rollback on error
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error: (error as Error).message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close database pool gracefully
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}
