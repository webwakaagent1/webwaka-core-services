/**
 * Unit Tests for AuditLogService
 * 
 * Tests for INV-003: Audited Super Admin Access
 * Covers audit logging for all IAM operations
 */

import { AuditLogService } from '../../src/services/AuditLogService';
import { AuditLogModel, AuditLogQuery } from '../../src/models/AuditLog';
import { AuditAction, ActorType, ResourceType } from '../../src/types';

describe('AuditLogService', () => {
  let auditLogService: AuditLogService;

  beforeEach(() => {
    auditLogService = new AuditLogService();
  });

  describe('logAuthEvent', () => {
    it('should create an audit log for successful login', async () => {
      const log = await auditLogService.logAuthEvent(
        'tenant-123',
        'user-456',
        AuditAction.LOGIN,
        '127.0.0.1',
        'Mozilla/5.0',
        'success'
      );

      expect(log).toBeInstanceOf(AuditLogModel);
      expect(log.tenantId).toBe('tenant-123');
      expect(log.actorId).toBe('user-456');
      expect(log.action).toBe(AuditAction.LOGIN);
      expect(log.status).toBe('success');
      expect(log.ipAddress).toBe('127.0.0.1');
    });

    it('should create an audit log for failed login', async () => {
      const log = await auditLogService.logAuthEvent(
        'tenant-123',
        'user-456',
        AuditAction.LOGIN_FAILED,
        '127.0.0.1',
        'Mozilla/5.0',
        'failure',
        'Invalid credentials'
      );

      expect(log.action).toBe(AuditAction.LOGIN_FAILED);
      expect(log.status).toBe('failure');
      expect(log.errorMessage).toBe('Invalid credentials');
    });

    it('should create an audit log for logout', async () => {
      const log = await auditLogService.logAuthEvent(
        'tenant-123',
        'user-456',
        AuditAction.LOGOUT,
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(log.action).toBe(AuditAction.LOGOUT);
      expect(log.status).toBe('success');
    });
  });

  describe('logUserManagementEvent', () => {
    it('should create an audit log for user creation', async () => {
      const log = await auditLogService.logUserManagementEvent(
        'tenant-123',
        AuditAction.USER_CREATED,
        'admin-789',
        'user-456',
        ActorType.PARTNER,
        'admin-789',
        '127.0.0.1',
        'Mozilla/5.0',
        { email: 'newuser@example.com' }
      );

      expect(log.action).toBe(AuditAction.USER_CREATED);
      expect(log.resourceType).toBe(ResourceType.USER);
      expect(log.resourceId).toBe('user-456');
      expect(log.changes).toEqual({ email: 'newuser@example.com' });
    });

    it('should create an audit log for user update', async () => {
      const log = await auditLogService.logUserManagementEvent(
        'tenant-123',
        AuditAction.USER_UPDATED,
        'admin-789',
        'user-456',
        ActorType.PARTNER,
        'admin-789',
        '127.0.0.1',
        'Mozilla/5.0',
        { firstName: 'Updated' }
      );

      expect(log.action).toBe(AuditAction.USER_UPDATED);
      expect(log.changes).toEqual({ firstName: 'Updated' });
    });

    it('should create an audit log for user deletion', async () => {
      const log = await auditLogService.logUserManagementEvent(
        'tenant-123',
        AuditAction.USER_DELETED,
        'admin-789',
        'user-456',
        ActorType.PARTNER,
        'admin-789',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(log.action).toBe(AuditAction.USER_DELETED);
      expect(log.isCriticalEvent()).toBe(true);
    });
  });

  describe('logRoleManagementEvent', () => {
    it('should create an audit log for role creation', async () => {
      const log = await auditLogService.logRoleManagementEvent(
        'tenant-123',
        AuditAction.ROLE_CREATED,
        'role-789',
        ActorType.PARTNER,
        'admin-456',
        '127.0.0.1',
        'Mozilla/5.0',
        { name: 'Custom Role' }
      );

      expect(log.action).toBe(AuditAction.ROLE_CREATED);
      expect(log.resourceType).toBe(ResourceType.ROLE);
      expect(log.resourceId).toBe('role-789');
    });

    it('should create an audit log for role assignment', async () => {
      const log = await auditLogService.logRoleManagementEvent(
        'tenant-123',
        AuditAction.ROLE_ASSIGNED,
        'role-789',
        ActorType.PARTNER,
        'admin-456',
        '127.0.0.1',
        'Mozilla/5.0',
        { userId: 'user-123' }
      );

      expect(log.action).toBe(AuditAction.ROLE_ASSIGNED);
    });
  });

  describe('logSessionEvent', () => {
    it('should create an audit log for session creation', async () => {
      const log = await auditLogService.logSessionEvent(
        'tenant-123',
        'user-456',
        AuditAction.SESSION_CREATED,
        'session-789',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(log.action).toBe(AuditAction.SESSION_CREATED);
      expect(log.resourceType).toBe(ResourceType.SESSION);
      expect(log.resourceId).toBe('session-789');
    });

    it('should create an audit log for session revocation', async () => {
      const log = await auditLogService.logSessionEvent(
        'tenant-123',
        'user-456',
        AuditAction.SESSION_REVOKED,
        'session-789',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(log.action).toBe(AuditAction.SESSION_REVOKED);
    });
  });

  describe('logSuperAdminAccess (INV-003)', () => {
    it('should create an audit log for super admin access', async () => {
      const log = await auditLogService.logSuperAdminAccess(
        'tenant-123',
        'super-admin-456',
        '/api/admin/users',
        '127.0.0.1',
        'Mozilla/5.0',
        { reason: 'Support request' }
      );

      expect(log.action).toBe(AuditAction.SUPER_ADMIN_ACCESS);
      expect(log.actorType).toBe(ActorType.SUPER_ADMIN);
      expect(log.isSuperAdminAction()).toBe(true);
      expect(log.isCriticalEvent()).toBe(true);
    });

    it('should trigger critical event handlers for super admin access', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      auditLogService.onCriticalEvent(handler);

      await auditLogService.logSuperAdminAccess(
        'tenant-123',
        'super-admin-456',
        '/api/admin/users',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('logTenantIsolationBreach (INV-002)', () => {
    it('should create an audit log for tenant isolation breach attempt', async () => {
      const log = await auditLogService.logTenantIsolationBreach(
        'tenant-999',
        'tenant-123',
        'user-456',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(log.action).toBe(AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT);
      expect(log.status).toBe('failure');
      expect(log.isCriticalEvent()).toBe(true);
      expect(log.resourceId).toBe('tenant-999');
    });

    it('should trigger critical event handlers for breach attempt', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      auditLogService.onCriticalEvent(handler);

      await auditLogService.logTenantIsolationBreach(
        'tenant-999',
        'tenant-123',
        'user-456',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('logFailedAction', () => {
    it('should create an audit log for failed actions', async () => {
      const log = await auditLogService.logFailedAction(
        'tenant-123',
        ActorType.END_USER,
        'user-456',
        'Permission denied',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(log.status).toBe('failure');
      expect(log.errorMessage).toBe('Permission denied');
      expect(log.isFailed()).toBe(true);
    });
  });

  describe('queryLogs', () => {
    beforeEach(async () => {
      // Create multiple logs for testing queries
      await auditLogService.logAuthEvent('tenant-123', 'user-1', AuditAction.LOGIN, '127.0.0.1', 'Mozilla/5.0');
      await auditLogService.logAuthEvent('tenant-123', 'user-2', AuditAction.LOGIN, '127.0.0.1', 'Mozilla/5.0');
      await auditLogService.logAuthEvent('tenant-456', 'user-3', AuditAction.LOGIN, '127.0.0.1', 'Mozilla/5.0');
      await auditLogService.logAuthEvent('tenant-123', 'user-1', AuditAction.LOGOUT, '127.0.0.1', 'Mozilla/5.0');
      await auditLogService.logAuthEvent('tenant-123', 'user-1', AuditAction.LOGIN_FAILED, '127.0.0.1', 'Mozilla/5.0', 'failure');
    });

    it('should filter logs by tenant', async () => {
      const query = new AuditLogQuery().byTenant('tenant-123');
      const { logs, total } = await auditLogService.queryLogs(query);

      expect(total).toBe(4);
      logs.forEach(log => {
        expect(log.tenantId).toBe('tenant-123');
      });
    });

    it('should filter logs by action', async () => {
      const query = new AuditLogQuery().byTenant('tenant-123').byAction(AuditAction.LOGIN);
      const { logs, total } = await auditLogService.queryLogs(query);

      expect(total).toBe(2);
      logs.forEach(log => {
        expect(log.action).toBe(AuditAction.LOGIN);
      });
    });

    it('should filter logs by actor', async () => {
      const query = new AuditLogQuery().byTenant('tenant-123').byActor('user-1');
      const { logs, total } = await auditLogService.queryLogs(query);

      expect(total).toBe(3);
      logs.forEach(log => {
        expect(log.actorId).toBe('user-1');
      });
    });

    it('should filter logs by status', async () => {
      const query = new AuditLogQuery().byTenant('tenant-123').byStatus('failure');
      const { logs, total } = await auditLogService.queryLogs(query);

      expect(total).toBe(1);
      expect(logs[0].status).toBe('failure');
    });

    it('should support pagination', async () => {
      const query = new AuditLogQuery().byTenant('tenant-123').setLimit(2).setOffset(0);
      const { logs, total } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(2);
      expect(total).toBe(4);
    });
  });

  describe('getLogById', () => {
    it('should return log by ID', async () => {
      const createdLog = await auditLogService.logAuthEvent(
        'tenant-123',
        'user-456',
        AuditAction.LOGIN,
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const retrievedLog = await auditLogService.getLogById(createdLog.auditLogId);

      expect(retrievedLog).not.toBeNull();
      expect(retrievedLog?.auditLogId).toBe(createdLog.auditLogId);
    });

    it('should return null for non-existent log', async () => {
      const log = await auditLogService.getLogById('non-existent-id');

      expect(log).toBeNull();
    });
  });

  describe('exportLogs', () => {
    beforeEach(async () => {
      await auditLogService.logAuthEvent('tenant-123', 'user-1', AuditAction.LOGIN, '127.0.0.1', 'Mozilla/5.0');
      await auditLogService.logAuthEvent('tenant-123', 'user-2', AuditAction.LOGOUT, '127.0.0.1', 'Mozilla/5.0');
    });

    it('should export logs as JSON', async () => {
      const startDate = new Date(Date.now() - 3600000);
      const endDate = new Date(Date.now() + 3600000);

      const json = await auditLogService.exportLogs('tenant-123', startDate, endDate, 'json');
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it('should export logs as CSV', async () => {
      const startDate = new Date(Date.now() - 3600000);
      const endDate = new Date(Date.now() + 3600000);

      const csv = await auditLogService.exportLogs('tenant-123', startDate, endDate, 'csv');

      expect(csv).toContain('Audit Log ID');
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('Action');
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      await auditLogService.logAuthEvent('tenant-123', 'user-1', AuditAction.LOGIN, '127.0.0.1', 'Mozilla/5.0');
      await auditLogService.logAuthEvent('tenant-123', 'user-1', AuditAction.LOGIN_FAILED, '127.0.0.1', 'Mozilla/5.0', 'failure');
      await auditLogService.logSuperAdminAccess('tenant-123', 'super-admin', '/api/admin', '127.0.0.1', 'Mozilla/5.0');
    });

    it('should return correct statistics', async () => {
      const stats = await auditLogService.getStatistics('tenant-123');

      expect(stats.totalLogs).toBe(3);
      expect(stats.failedActions).toBe(1);
      expect(stats.criticalEvents).toBeGreaterThanOrEqual(1);
      expect(stats.superAdminAccess).toBe(1);
      expect(stats.actionBreakdown).toBeDefined();
      expect(stats.actorTypeBreakdown).toBeDefined();
    });
  });

  describe('onCriticalEvent', () => {
    it('should register and call critical event handlers', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      auditLogService.onCriticalEvent(handler1);
      auditLogService.onCriticalEvent(handler2);

      await auditLogService.logSuperAdminAccess(
        'tenant-123',
        'super-admin',
        '/api/admin',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should continue calling handlers even if one fails', async () => {
      const handler1 = jest.fn().mockRejectedValue(new Error('Handler error'));
      const handler2 = jest.fn().mockResolvedValue(undefined);

      auditLogService.onCriticalEvent(handler1);
      auditLogService.onCriticalEvent(handler2);

      await auditLogService.logSuperAdminAccess(
        'tenant-123',
        'super-admin',
        '/api/admin',
        '127.0.0.1',
        'Mozilla/5.0'
      );

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});
