/**
 * Global Type Declarations for CS-3 IAM V2 Tests
 */

declare global {
  var testUtils: {
    generateUUID: () => string;
    sleep: (ms: number) => Promise<void>;
    generateTenantId: () => string;
    generateUserId: () => string;
    generateEmail: () => string;
    generateStrongPassword: () => string;
  };
}

export {};
