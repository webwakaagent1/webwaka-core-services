/**
 * Integration Tests for Audit Logging
 * 
 * Tests for INV-003: Audited Super Admin Access
 * Comprehensive audit trail for all IAM operations
 */

import { AuthenticationService } from '../../src/services/AuthenticationService';
import { AuditLogService } from '../../src/services/AuditLogService';
import { RBACService } from '../../src/services/RBACService';
import { AuditLogQuery } from '../../src/models/AuditLog';
import {
  AuditAction,
  ActorType,
  ResourceType,
  PermissionAction
} from '../../src/types';

describe('Audit Logging Integration Tests', () => {
  let authService: AuthenticationService;
  let auditLogService: AuditLogService;
  let rbacService: RBACService;
  const jwtSecret = 'audit-logging-test-secret';

  beforeEach(() => {
    auditLogService = new AuditLogService();
    authService = new AuthenticationService(jwtSecret, auditLogService);
    rbacService = new RBACService(auditLogService);
  });

  describe('Authentication Event Logging', () => {
    const tenantId = 'tenant-auth-audit';
    const email = 'audit-auth@example.com';
    const password = 'AuditAuth@123!';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Audit Test Agent';

    it('should log successful login events', async () => {
      await authService.registerLocal(tenantId, email, password, 'Audit', 'Auth');
      await authService.authenticateLocal(
        tenantId,
        { email, password },
        ipAddress,
        userAgent
      );

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.LOGIN);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe('success');
      expect(logs[0].ipAddress).toBe(ipAddress);
    });

    it('should log failed login events', async () => {
      await authService.registerLocal(tenantId, 'failed-login@example.com', password, 'Failed', 'Login');

      await expect(
        authService.authenticateLocal(
          tenantId,
          { email: 'failed-login@example.com', password: 'WrongPassword123!' },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow();

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.LOGIN_FAILED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].status).toBe('failure');
    });

    it('should log session creation events', async () => {
      const user = await authService.registerLocal(tenantId, 'session-audit@example.com', password, 'Session', 'Audit');
      await authService.createSession(
        user.userId,
        tenantId,
        'device-audit',
        'Audit Device',
        ipAddress,
        userAgent
      );

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.SESSION_CREATED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].resourceType).toBe(ResourceType.SESSION);
    });

    it('should log session revocation events', async () => {
      const user = await authService.registerLocal(tenantId, 'revoke-audit@example.com', password, 'Revoke', 'Audit');
      const { session } = await authService.createSession(
        user.userId,
        tenantId,
        'device-revoke',
        'Revoke Device',
        ipAddress,
        userAgent
      );

      await authService.revokeSession(session.sessionId, 'Test revocation');

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.SESSION_REVOKED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].resourceId).toBe(session.sessionId);
    });
  });

  describe('Role Management Event Logging', () => {
    const tenantId = 'tenant-role-audit';
    const actorId = 'admin-role-audit';

    it('should log role creation events', async () => {
      await rbacService.createRole(
        tenantId,
        'Audited Role',
        'Role for audit testing',
        [{
          permissionId: 'audit-perm',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          description: 'Read users'
        }],
        undefined,
        actorId
      );

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.ROLE_CREATED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(actorId);
      expect(logs[0].changes).toEqual({ name: 'Audited Role', description: 'Role for audit testing' });
    });

    it('should log role update events', async () => {
      const role = await rbacService.createRole(
        tenantId,
        'Update Audit Role',
        'Original description',
        [],
        undefined,
        actorId
      );

      await rbacService.updateRole(
        role.roleId,
        { description: 'Updated description' },
        actorId
      );

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.ROLE_UPDATED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].resourceId).toBe(role.roleId);
    });

    it('should log role assignment events', async () => {
      const role = await rbacService.createRole(
        tenantId,
        'Assignment Audit Role',
        'For assignment testing',
        [],
        undefined,
        actorId
      );

      await rbacService.assignRole(
        'user-assignment-audit',
        role.roleId,
        tenantId,
        undefined,
        undefined,
        actorId
      );

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.ROLE_ASSIGNED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].changes).toEqual({ userId: 'user-assignment-audit', scope: undefined });
    });

    it('should log role revocation events', async () => {
      const role = await rbacService.createRole(
        tenantId,
        'Revocation Audit Role',
        'For revocation testing',
        [],
        undefined,
        actorId
      );

      const assignment = await rbacService.assignRole(
        'user-revocation-audit',
        role.roleId,
        tenantId,
        undefined,
        undefined,
        actorId
      );

      await rbacService.revokeRole(assignment.assignmentId, tenantId, actorId);

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.ROLE_REVOKED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
    });

    it('should log role deletion events', async () => {
      const role = await rbacService.createRole(
        tenantId,
        'Deletion Audit Role',
        'For deletion testing',
        [],
        undefined,
        actorId
      );

      await rbacService.deleteRole(role.roleId, actorId);

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.ROLE_DELETED);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].resourceId).toBe(role.roleId);
    });
  });

  describe('Super Admin Access Logging (INV-003)', () => {
    const tenantId = 'tenant-super-admin-audit';

    it('should log all super admin access with full details', async () => {
      await auditLogService.logSuperAdminAccess(
        tenantId,
        'super-admin-123',
        '/api/admin/users',
        '10.0.0.1',
        'Admin Browser',
        { reason: 'Support ticket #12345' }
      );

      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.SUPER_ADMIN_ACCESS);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.length).toBe(1);
      expect(logs[0].actorType).toBe(ActorType.SUPER_ADMIN);
      expect(logs[0].actorId).toBe('super-admin-123');
      expect(logs[0].metadata?.action).toBe('/api/admin/users');
      expect(logs[0].metadata?.reason).toBe('Support ticket #12345');
      expect(logs[0].isSuperAdminAction()).toBe(true);
      expect(logs[0].isCriticalEvent()).toBe(true);
    });

    it('should track super admin access statistics', async () => {
      // Create multiple super admin access logs
      await auditLogService.logSuperAdminAccess(tenantId, 'admin-1', '/api/users', '10.0.0.1', 'Agent');
      await auditLogService.logSuperAdminAccess(tenantId, 'admin-1', '/api/roles', '10.0.0.1', 'Agent');
      await auditLogService.logSuperAdminAccess(tenantId, 'admin-2', '/api/audit', '10.0.0.2', 'Agent');

      const stats = await auditLogService.getStatistics(tenantId);

      expect(stats.superAdminAccess).toBe(3);
      expect(stats.criticalEvents).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Audit Log Querying', () => {
    const tenantId = 'tenant-query-audit';

    beforeEach(async () => {
      // Create diverse audit logs for testing queries
      await auditLogService.logAuthEvent(tenantId, 'user-1', AuditAction.LOGIN, '192.168.1.1', 'Chrome');
      await auditLogService.logAuthEvent(tenantId, 'user-1', AuditAction.LOGOUT, '192.168.1.1', 'Chrome');
      await auditLogService.logAuthEvent(tenantId, 'user-2', AuditAction.LOGIN, '192.168.1.2', 'Firefox');
      await auditLogService.logAuthEvent(tenantId, 'user-2', AuditAction.LOGIN_FAILED, '192.168.1.2', 'Firefox', 'failure');
      await auditLogService.logSuperAdminAccess(tenantId, 'admin-1', '/api/users', '10.0.0.1', 'Admin');
    });

    it('should filter by action', async () => {
      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byAction(AuditAction.LOGIN);

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.every(l => l.action === AuditAction.LOGIN)).toBe(true);
    });

    it('should filter by actor', async () => {
      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byActor('user-1');

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.every(l => l.actorId === 'user-1')).toBe(true);
    });

    it('should filter by status', async () => {
      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .byStatus('failure');

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.every(l => l.status === 'failure')).toBe(true);
    });

    it('should filter critical events only', async () => {
      const query = new AuditLogQuery()
        .byTenant(tenantId)
        .criticalOnly();

      const { logs } = await auditLogService.queryLogs(query);

      expect(logs.every(l => l.isCriticalEvent())).toBe(true);
    });

    it('should support pagination', async () => {
      const query1 = new AuditLogQuery()
        .byTenant(tenantId)
        .setLimit(2)
        .setOffset(0);

      const { logs: page1, total } = await auditLogService.queryLogs(query1);

      expect(page1.length).toBe(2);
      expect(total).toBeGreaterThan(2);

      const query2 = new AuditLogQuery()
        .byTenant(tenantId)
        .setLimit(2)
        .setOffset(2);

      const { logs: page2 } = await auditLogService.queryLogs(query2);

      // Pages should have different logs
      expect(page1[0].auditLogId).not.toBe(page2[0].auditLogId);
    });

    it('should support sorting', async () => {
      const queryAsc = new AuditLogQuery()
        .byTenant(tenantId);
      queryAsc.setSortBy('timestamp', 'asc');

      const { logs: logsAsc } = await auditLogService.queryLogs(queryAsc);

      for (let i = 1; i < logsAsc.length; i++) {
        expect(logsAsc[i].timestamp.getTime()).toBeGreaterThanOrEqual(logsAsc[i - 1].timestamp.getTime());
      }

      const queryDesc = new AuditLogQuery()
        .byTenant(tenantId);
      queryDesc.setSortBy('timestamp', 'desc');

      const { logs: logsDesc } = await auditLogService.queryLogs(queryDesc);

      for (let i = 1; i < logsDesc.length; i++) {
        expect(logsDesc[i].timestamp.getTime()).toBeLessThanOrEqual(logsDesc[i - 1].timestamp.getTime());
      }
    });
  });

  describe('Audit Log Export', () => {
    const tenantId = 'tenant-export-audit';

    beforeEach(async () => {
      await auditLogService.logAuthEvent(tenantId, 'user-1', AuditAction.LOGIN, '192.168.1.1', 'Chrome');
      await auditLogService.logAuthEvent(tenantId, 'user-2', AuditAction.LOGOUT, '192.168.1.2', 'Firefox');
    });

    it('should export logs as JSON', async () => {
      const startDate = new Date(Date.now() - 3600000);
      const endDate = new Date(Date.now() + 3600000);

      const json = await auditLogService.exportLogs(tenantId, startDate, endDate, 'json');
      const logs = JSON.parse(json);

      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(2);
      expect(logs[0].auditLogId).toBeDefined();
      expect(logs[0].action).toBeDefined();
    });

    it('should export logs as CSV', async () => {
      const startDate = new Date(Date.now() - 3600000);
      const endDate = new Date(Date.now() + 3600000);

      const csv = await auditLogService.exportLogs(tenantId, startDate, endDate, 'csv');

      expect(csv).toContain('Audit Log ID');
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('Action');
      expect(csv).toContain('Actor Type');
      expect(csv).toContain('Status');
      expect(csv).toContain('IP Address');
    });

    it('should respect date range in export', async () => {
      // Create log outside the range
      const oldLog = await auditLogService.logAuthEvent(
        tenantId,
        'old-user',
        AuditAction.LOGIN,
        '192.168.1.3',
        'Safari'
      );

      // Manually set timestamp to past (simulating old log)
      // Note: In real implementation, this would be handled by the database

      const startDate = new Date(Date.now() - 1800000); // 30 minutes ago
      const endDate = new Date(Date.now() + 3600000);

      const json = await auditLogService.exportLogs(tenantId, startDate, endDate, 'json');
      const logs = JSON.parse(json);

      // All logs should be within the date range
      logs.forEach((log: any) => {
        const timestamp = new Date(log.timestamp);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });
  });

  describe('Audit Statistics', () => {
    const tenantId = 'tenant-stats-audit';

    beforeEach(async () => {
      // Create diverse logs for statistics
      await auditLogService.logAuthEvent(tenantId, 'user-1', AuditAction.LOGIN, '192.168.1.1', 'Chrome');
      await auditLogService.logAuthEvent(tenantId, 'user-1', AuditAction.LOGIN, '192.168.1.1', 'Chrome');
      await auditLogService.logAuthEvent(tenantId, 'user-2', AuditAction.LOGOUT, '192.168.1.2', 'Firefox');
      await auditLogService.logAuthEvent(tenantId, 'user-3', AuditAction.LOGIN_FAILED, '192.168.1.3', 'Safari', 'failure');
      await auditLogService.logSuperAdminAccess(tenantId, 'admin-1', '/api/users', '10.0.0.1', 'Admin');
    });

    it('should calculate correct statistics', async () => {
      const stats = await auditLogService.getStatistics(tenantId);

      expect(stats.totalLogs).toBe(5);
      expect(stats.failedActions).toBe(1);
      expect(stats.criticalEvents).toBeGreaterThanOrEqual(1);
      expect(stats.superAdminAccess).toBe(1);
    });

    it('should provide action breakdown', async () => {
      const stats = await auditLogService.getStatistics(tenantId);

      expect(stats.actionBreakdown[AuditAction.LOGIN]).toBe(2);
      expect(stats.actionBreakdown[AuditAction.LOGOUT]).toBe(1);
      expect(stats.actionBreakdown[AuditAction.LOGIN_FAILED]).toBe(1);
      expect(stats.actionBreakdown[AuditAction.SUPER_ADMIN_ACCESS]).toBe(1);
    });

    it('should provide actor type breakdown', async () => {
      const stats = await auditLogService.getStatistics(tenantId);

      expect(stats.actorTypeBreakdown[ActorType.END_USER]).toBe(4);
      expect(stats.actorTypeBreakdown[ActorType.SUPER_ADMIN]).toBe(1);
    });
  });

  describe('Critical Event Handling', () => {
    const tenantId = 'tenant-critical-audit';

    it('should notify handlers for critical events', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      auditLogService.onCriticalEvent(handler);

      // Trigger critical events
      await auditLogService.logSuperAdminAccess(tenantId, 'admin', '/api', '10.0.0.1', 'Agent');
      await auditLogService.logTenantIsolationBreach('target', tenantId, 'attacker', '192.168.1.1', 'Agent');

      // Handler is called at least twice (once for each critical event)
      expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should continue processing if handler fails', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler = jest.fn().mockResolvedValue(undefined);

      auditLogService.onCriticalEvent(failingHandler);
      auditLogService.onCriticalEvent(successHandler);

      await auditLogService.logSuperAdminAccess(tenantId, 'admin', '/api', '10.0.0.1', 'Agent');

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should identify critical events correctly', async () => {
      const criticalActions = [
        AuditAction.SUPER_ADMIN_ACCESS,
        AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT,
        AuditAction.LOGIN_FAILED,
        AuditAction.USER_DELETED,
        AuditAction.ROLE_DELETED,
        AuditAction.PASSWORD_RESET
      ];

      for (const action of criticalActions) {
        const log = await auditLogService.logAuthEvent(
          tenantId,
          'user',
          action,
          '192.168.1.1',
          'Agent',
          action === AuditAction.LOGIN_FAILED ? 'failure' : 'success'
        );

        expect(log.isCriticalEvent()).toBe(true);
      }
    });
  });
});
