/**
 * Global Type Declarations for Tests
 * 
 * This file provides TypeScript type definitions for global test utilities
 * to resolve the "Element implicitly has an 'any' type" error in tests/setup.ts
 */

declare global {
  var testUtils: {
    generateUUID: () => string;
    sleep: (ms: number) => Promise<void>;
  };
}

export {};
