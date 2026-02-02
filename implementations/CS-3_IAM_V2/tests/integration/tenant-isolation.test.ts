/**
 * Integration Tests for Cross-Tenant Access Prevention
 * 
 * Tests for INV-002: Strict Tenant Isolation
 * Ensures resources from one tenant cannot be accessed by another tenant
 */

import { Request, Response, NextFunction } from 'express';
import {
  extractTenantContext,
  tenantContextMiddleware,
  verifyTenantOwnership,
  verifyResourceTenant,
  requireSuperAdminWithAudit,
  scopeToTenant
} from '../../src/middleware/tenantContext';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { AuditLogService } from '../../src/services/AuditLogService';
import { RBACService } from '../../src/services/RBACService';
import { AuditLogQuery } from '../../src/models/AuditLog';
import { TenantIsolationError, ActorType, AuditAction } from '../../src/types';

// Mock Express objects
const mockRequest = (headers: Record<string, string> = {}, tenantContext?: any): Partial<Request> => ({
  headers,
  path: '/api/test',
  method: 'GET',
  ip: '127.0.0.1',
  tenantContext
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    locals: {}
  };
  return res;
};

describe('Tenant Isolation Integration Tests', () => {
  let authService: AuthenticationService;
  let auditLogService: AuditLogService;
  let rbacService: RBACService;
  const jwtSecret = 'tenant-isolation-test-secret';

  beforeEach(() => {
    auditLogService = new AuditLogService();
    authService = new AuthenticationService(jwtSecret, auditLogService);
    rbacService = new RBACService(auditLogService);
  });

  describe('Cross-Tenant Access Prevention', () => {
    const tenant1 = 'tenant-isolation-1';
    const tenant2 = 'tenant-isolation-2';

    it('should prevent access to resources from different tenant', () => {
      // Attempt to access tenant2 resource from tenant1 context
      expect(() => {
        verifyTenantOwnership(tenant2, tenant1);
      }).toThrow(TenantIsolationError);
    });

    it('should allow access to resources from same tenant', () => {
      expect(() => {
        verifyTenantOwnership(tenant1, tenant1);
      }).not.toThrow();
    });

    it('should log tenant isolation breach attempts', async () => {
      const log = await auditLogService.logTenantIsolationBreach(
        tenant2,
        tenant1,
        'malicious-user',
        '192.168.1.100',
        'Malicious Agent'
      );

      expect(log.action).toBe(AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT);
      expect(log.status).toBe('failure');
      expect(log.isCriticalEvent()).toBe(true);

      // Query for breach attempts
      const query = new AuditLogQuery()
        .byTenant(tenant1)
        .byAction(AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT);

      const { logs } = await auditLogService.queryLogs(query);
      expect(logs.length).toBe(1);
      expect(logs[0].resourceId).toBe(tenant2);
    });
  });

  describe('User Isolation Between Tenants', () => {
    const tenant1 = 'tenant-user-isolation-1';
    const tenant2 = 'tenant-user-isolation-2';
    const email = 'shared@example.com';
    const password = 'SharedPassword@123!';

    it('should create separate users for same email in different tenants', async () => {
      const user1 = await authService.registerLocal(
        tenant1,
        email,
        password,
        'Tenant1',
        'User'
      );

      const user2 = await authService.registerLocal(
        tenant2,
        email,
        password,
        'Tenant2',
        'User'
      );

      expect(user1.userId).not.toBe(user2.userId);
      expect(user1.tenantId).toBe(tenant1);
      expect(user2.tenantId).toBe(tenant2);
    });

    it('should authenticate users only in their tenant', async () => {
      await authService.registerLocal(tenant1, 'auth-test@example.com', password, 'Auth', 'Test');

      // Should succeed in correct tenant
      const result = await authService.authenticateLocal(
        tenant1,
        { email: 'auth-test@example.com', password },
        '127.0.0.1',
        'Test Agent'
      );
      expect(result.user.tenantId).toBe(tenant1);

      // Should fail in wrong tenant
      await expect(
        authService.authenticateLocal(
          tenant2,
          { email: 'auth-test@example.com', password },
          '127.0.0.1',
          'Test Agent'
        )
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Session Isolation Between Tenants', () => {
    const tenant1 = 'tenant-session-isolation-1';
    const tenant2 = 'tenant-session-isolation-2';
    const password = 'SessionIsolation@123!';

    it('should create sessions scoped to tenant', async () => {
      const user1 = await authService.registerLocal(
        tenant1,
        'session1@example.com',
        password,
        'Session1',
        'User'
      );

      const { session, tokens } = await authService.createSession(
        user1.userId,
        tenant1,
        'device-1',
        'Device 1',
        '127.0.0.1',
        'Test Agent'
      );

      expect(session.tenantId).toBe(tenant1);

      // Verify token contains correct tenant
      const payload = authService.verifyToken(tokens.accessToken);
      expect(payload?.tenantId).toBe(tenant1);
    });
  });

  describe('Role Isolation Between Tenants', () => {
    const tenant1 = 'tenant-role-isolation-1';
    const tenant2 = 'tenant-role-isolation-2';

    it('should create roles scoped to tenant', async () => {
      const role1 = await rbacService.createRole(
        tenant1,
        'Tenant1 Role',
        'Role for tenant 1',
        []
      );

      const role2 = await rbacService.createRole(
        tenant2,
        'Tenant2 Role',
        'Role for tenant 2',
        []
      );

      expect(role1.tenantId).toBe(tenant1);
      expect(role2.tenantId).toBe(tenant2);
    });

    it('should list only roles for specific tenant plus system roles', () => {
      const tenant1Roles = rbacService.listRoles(tenant1);
      const tenant2Roles = rbacService.listRoles(tenant2);

      // Each tenant should see their own roles plus system roles
      const tenant1CustomRoles = tenant1Roles.filter(r => r.tenantId === tenant1);
      const tenant2CustomRoles = tenant2Roles.filter(r => r.tenantId === tenant2);

      // Custom roles should be isolated
      tenant1CustomRoles.forEach(r => {
        expect(tenant2CustomRoles.find(r2 => r2.roleId === r.roleId)).toBeUndefined();
      });
    });
  });

  describe('Audit Log Isolation Between Tenants', () => {
    const tenant1 = 'tenant-audit-isolation-1';
    const tenant2 = 'tenant-audit-isolation-2';

    it('should isolate audit logs by tenant', async () => {
      // Create logs in tenant1
      await auditLogService.logAuthEvent(
        tenant1,
        'user-t1',
        AuditAction.LOGIN,
        '127.0.0.1',
        'Test Agent'
      );

      // Create logs in tenant2
      await auditLogService.logAuthEvent(
        tenant2,
        'user-t2',
        AuditAction.LOGIN,
        '127.0.0.1',
        'Test Agent'
      );

      // Query tenant1 logs
      const tenant1Query = new AuditLogQuery().byTenant(tenant1);
      const { logs: tenant1Logs } = await auditLogService.queryLogs(tenant1Query);

      // Query tenant2 logs
      const tenant2Query = new AuditLogQuery().byTenant(tenant2);
      const { logs: tenant2Logs } = await auditLogService.queryLogs(tenant2Query);

      // Verify isolation
      tenant1Logs.forEach(log => {
        expect(log.tenantId).toBe(tenant1);
      });

      tenant2Logs.forEach(log => {
        expect(log.tenantId).toBe(tenant2);
      });
    });

    it('should export only tenant-specific logs', async () => {
      const tenant = 'tenant-export-isolation';

      // Create logs
      await auditLogService.logAuthEvent(tenant, 'user-1', AuditAction.LOGIN, '127.0.0.1', 'Agent');
      await auditLogService.logAuthEvent(tenant, 'user-2', AuditAction.LOGOUT, '127.0.0.1', 'Agent');

      // Export logs
      const startDate = new Date(Date.now() - 3600000);
      const endDate = new Date(Date.now() + 3600000);
      const exported = await auditLogService.exportLogs(tenant, startDate, endDate, 'json');
      const logs = JSON.parse(exported);

      // All exported logs should belong to the tenant
      logs.forEach((log: any) => {
        expect(log.tenantId).toBe(tenant);
      });
    });
  });

  describe('Middleware Tenant Enforcement', () => {
    it('should reject requests without tenant context', () => {
      const req = mockRequest({}) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      tenantContextMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'TENANT_ISOLATION_ERROR',
        message: 'Failed to establish tenant context'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept requests with valid tenant context', () => {
      const req = mockRequest({
        'x-tenant-id': 'valid-tenant',
        'x-user-id': 'valid-user',
        'x-actor-type': ActorType.END_USER
      }) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      tenantContextMiddleware(req, res, next);

      expect(req.tenantContext).toBeDefined();
      expect(req.tenantContext?.tenantId).toBe('valid-tenant');
      expect(next).toHaveBeenCalled();
    });

    it('should verify resource tenant ownership', async () => {
      const req = mockRequest({}, {
        tenantId: 'owner-tenant',
        actorId: 'user-123',
        actorType: ActorType.END_USER
      }) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      // Resource belongs to same tenant
      const getTenantId = jest.fn().mockResolvedValue('owner-tenant');
      const middleware = verifyResourceTenant(getTenantId);

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject access to resource from different tenant', async () => {
      const req = mockRequest({}, {
        tenantId: 'requester-tenant',
        actorId: 'user-123',
        actorType: ActorType.END_USER
      }) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      // Resource belongs to different tenant
      const getTenantId = jest.fn().mockResolvedValue('owner-tenant');
      const middleware = verifyResourceTenant(getTenantId);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should scope database queries to tenant', () => {
      const req = mockRequest({}, {
        tenantId: 'scoped-tenant',
        actorId: 'user-123',
        actorType: ActorType.END_USER
      }) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      scopeToTenant(req, res, next);

      expect(res.locals.tenantId).toBe('scoped-tenant');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Super Admin Cross-Tenant Access (INV-003)', () => {
    it('should allow super admin access with audit logging', async () => {
      const req = mockRequest({}, {
        tenantId: 'target-tenant',
        actorId: 'super-admin-123',
        actorType: ActorType.SUPER_ADMIN
      }) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      const middleware = requireSuperAdminWithAudit(auditLogService);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();

      // Verify audit log was created
      const query = new AuditLogQuery()
        .byTenant('target-tenant')
        .byAction(AuditAction.SUPER_ADMIN_ACCESS);

      const { logs } = await auditLogService.queryLogs(query);
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe('super-admin-123');
    });

    it('should deny non-super admin access to super admin routes', async () => {
      const req = mockRequest({}, {
        tenantId: 'target-tenant',
        actorId: 'regular-user-123',
        actorType: ActorType.END_USER
      }) as Request;
      const res = mockResponse() as Response;
      const next = jest.fn();

      const middleware = requireSuperAdminWithAudit(auditLogService);
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();

      // Verify failed attempt was logged
      const query = new AuditLogQuery()
        .byTenant('target-tenant')
        .byStatus('failure');

      const { logs } = await auditLogService.queryLogs(query);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Critical Event Notification', () => {
    it('should trigger handlers on tenant isolation breach', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      auditLogService.onCriticalEvent(handler);

      await auditLogService.logTenantIsolationBreach(
        'target-tenant',
        'attacker-tenant',
        'attacker-user',
        '192.168.1.100',
        'Attacker Agent'
      );

      expect(handler).toHaveBeenCalled();
      const calledLog = handler.mock.calls[0][0];
      expect(calledLog.action).toBe(AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT);
    });

    it('should trigger handlers on super admin access', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      auditLogService.onCriticalEvent(handler);

      await auditLogService.logSuperAdminAccess(
        'target-tenant',
        'super-admin-123',
        '/api/admin/users',
        '10.0.0.1',
        'Admin Agent'
      );

      expect(handler).toHaveBeenCalled();
      const calledLog = handler.mock.calls[0][0];
      expect(calledLog.action).toBe(AuditAction.SUPER_ADMIN_ACCESS);
    });
  });
});
