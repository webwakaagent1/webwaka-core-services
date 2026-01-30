/**
 * CS-3 IAM V2 - Main Entry Point
 * Exports all public APIs and services
 */

// Types
export * from './types';

// Models
export { UserModel } from './models/User';
export { RoleModel, SYSTEM_ROLES } from './models/Role';
export { SessionModel, DeviceModel, DEFAULT_SESSION_POLICIES } from './models/Session';
export { AuditLogModel, AuditLogQuery } from './models/AuditLog';

// Services
export { AuditLogService, auditLogService } from './services/AuditLogService';
export { AuthenticationService } from './services/AuthenticationService';
export { RBACService, rbacService } from './services/RBACService';

// Middleware
export {
  tenantContextMiddleware,
  extractTenantContext,
  verifyTenantOwnership,
  verifyResourceTenant,
  requireSuperAdminWithAudit,
  scopeToTenant
} from './middleware/tenantContext';

// Utils
export { logger } from './utils/logger';

/**
 * Initialize IAM V2 system
 */
export async function initializeIAMV2(config: {
  jwtSecret: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
}): Promise<{
  authService: AuthenticationService;
  rbacService: RBACService;
  auditLogService: AuditLogService;
}> {
  const auditLogService = new (require('./services/AuditLogService').AuditLogService)();
  const authService = new (require('./services/AuthenticationService').AuthenticationService)(
    config.jwtSecret,
    auditLogService
  );
  const rbacService = new (require('./services/RBACService').RBACService)(auditLogService);

  return {
    authService,
    rbacService,
    auditLogService
  };
}
