/**
 * Test Setup for CS-3 IAM V2
 * 
 * Global configuration and utilities for IAM tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

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
  },

  generateTenantId: () => {
    return `tenant-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  },

  generateUserId: () => {
    return `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  },

  generateEmail: () => {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@example.com`;
  },

  generateStrongPassword: () => {
    return `Test@Password123!${Math.random().toString(36).substring(2, 8)}`;
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

// Export empty to make this a module
export {};
