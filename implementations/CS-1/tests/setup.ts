/**
 * Test Setup
 * 
 * Global configuration and utilities for tests
 */

import { pool } from '../src/config/database';

// Set test environment variables
// Note: DATABASE_URL is set by the workflow/test environment
// Individual DB_* variables are fallbacks for local testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Fallback DATABASE_URL for local testing (if not already set)
if (!process.env.DATABASE_URL) {
  const dbHost = process.env.TEST_DB_HOST || 'localhost';
  const dbPort = process.env.TEST_DB_PORT || '5432';
  const dbName = process.env.TEST_DB_NAME || 'webwaka_ledger_test';
  const dbUser = process.env.TEST_DB_USER || 'webwaka_test';
  const dbPassword = process.env.TEST_DB_PASSWORD || 'test_password';
  process.env.DATABASE_URL = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
}

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
(global as any).testUtils = {
  generateUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  
  sleep: (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Mock console methods to reduce noise
(global as any).console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global setup: Create standard accounts for all tests
beforeAll(async () => {
  try {
    // Check if standard accounts already exist
    const result = await pool.query(
      "SELECT COUNT(*) as count FROM accounts WHERE account_code = '1000-0001'"
    );
    
    if (parseInt(result.rows[0].count) === 0) {
      // Create standard accounts for test tenant
      const testTenantId = '550e8400-e29b-41d4-a716-446655440000';
      await pool.query('SELECT create_standard_accounts($1)', [testTenantId]);
      console.error('✅ Standard accounts created for test tenant');
    } else {
      console.error('✅ Standard accounts already exist');
    }
  } catch (error) {
    console.error('❌ Failed to create standard accounts:', error);
    throw error;
  }
});
