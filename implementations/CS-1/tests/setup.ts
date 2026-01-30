/**
 * Test Setup
 * 
 * Global configuration and utilities for tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST || 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT || '5432';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'webwaka_ledger_test';
process.env.DB_USER = process.env.TEST_DB_USER || 'webwaka_test';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'test_password';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
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
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
