/**
 * Unit Tests for IAM Models
 * 
 * Tests for UserModel, SessionModel, RoleModel, and AuditLogModel
 */

import { UserModel } from '../../src/models/User';
import { SessionModel, DeviceModel, DEFAULT_SESSION_POLICIES } from '../../src/models/Session';
import { RoleModel, SYSTEM_ROLES } from '../../src/models/Role';
import { AuditLogModel, AuditLogQuery } from '../../src/models/AuditLog';
import {
  TwoFactorMethod,
  SessionStatus,
  PermissionAction,
  ResourceType,
  AuditAction,
  ActorType
} from '../../src/types';

describe('UserModel', () => {
  describe('constructor', () => {
    it('should create user with default values', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      });

      expect(user.userId).toBe('user-123');
      expect(user.tenantId).toBe('tenant-456');
      expect(user.emailVerified).toBe(false);
      expect(user.phoneVerified).toBe(false);
      expect(user.twoFactorEnabled).toBe(false);
      expect(user.twoFactorMethods).toEqual([]);
      expect(user.roles).toEqual([]);
      expect(user.loginAttempts).toBe(0);
      expect(user.status).toBe('active');
    });
  });

  describe('isLockedOut', () => {
    it('should return false when lockedUntil is not set', () => {
      const user = new UserModel({ userId: 'user-123', tenantId: 'tenant-456' });
      expect(user.isLockedOut()).toBe(false);
    });

    it('should return true when lockedUntil is in the future', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        lockedUntil: new Date(Date.now() + 3600000)
      });
      expect(user.isLockedOut()).toBe(true);
    });

    it('should return false when lockedUntil is in the past', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        lockedUntil: new Date(Date.now() - 3600000)
      });
      expect(user.isLockedOut()).toBe(false);
    });
  });

  describe('isPasswordExpired', () => {
    it('should return false when passwordExpiresAt is not set', () => {
      const user = new UserModel({ userId: 'user-123', tenantId: 'tenant-456' });
      expect(user.isPasswordExpired()).toBe(false);
    });

    it('should return true when passwordExpiresAt is in the past', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        passwordExpiresAt: new Date(Date.now() - 3600000)
      });
      expect(user.isPasswordExpired()).toBe(true);
    });

    it('should return false when passwordExpiresAt is in the future', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        passwordExpiresAt: new Date(Date.now() + 3600000)
      });
      expect(user.isPasswordExpired()).toBe(false);
    });
  });

  describe('getFullName', () => {
    it('should return full name', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(user.getFullName()).toBe('John Doe');
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        roles: [{ roleId: 'role-789', userId: 'user-123', tenantId: 'tenant-456', assignedAt: new Date(), assignedBy: 'admin' }]
      });
      expect(user.hasRole('role-789')).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        roles: []
      });
      expect(user.hasRole('role-789')).toBe(false);
    });

    it('should return false when role assignment is expired', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        roles: [{
          roleId: 'role-789',
          userId: 'user-123',
          tenantId: 'tenant-456',
          assignedAt: new Date(),
          assignedBy: 'admin',
          expiresAt: new Date(Date.now() - 3600000)
        }]
      });
      expect(user.hasRole('role-789')).toBe(false);
    });
  });

  describe('has2FAEnabled', () => {
    it('should return true when 2FA is enabled with methods', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        twoFactorEnabled: true,
        twoFactorMethods: [TwoFactorMethod.TOTP]
      });
      expect(user.has2FAEnabled()).toBe(true);
    });

    it('should return false when 2FA is disabled', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        twoFactorEnabled: false
      });
      expect(user.has2FAEnabled()).toBe(false);
    });

    it('should return false when 2FA is enabled but no methods', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        twoFactorEnabled: true,
        twoFactorMethods: []
      });
      expect(user.has2FAEnabled()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should exclude passwordHash from JSON output', () => {
      const user = new UserModel({
        userId: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        passwordHash: 'secret-hash'
      });
      const json = user.toJSON();
      expect(json.passwordHash).toBeUndefined();
      expect(json.email).toBe('test@example.com');
    });
  });
});

describe('SessionModel', () => {
  describe('constructor', () => {
    it('should create session with default values', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date(Date.now() + 3600000)
      });

      expect(session.sessionId).toBe('session-123');
      expect(session.status).toBe(SessionStatus.ACTIVE);
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();
    });
  });

  describe('isValid', () => {
    it('should return true for active, non-expired session', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        status: SessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3600000)
      });
      expect(session.isValid()).toBe(true);
    });

    it('should return false for expired session', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        status: SessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 3600000)
      });
      expect(session.isValid()).toBe(false);
    });

    it('should return false for revoked session', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        status: SessionStatus.REVOKED,
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: new Date()
      });
      expect(session.isValid()).toBe(false);
    });
  });

  describe('isIdle', () => {
    it('should return true when idle time exceeds threshold', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        lastActivityAt: new Date(Date.now() - 3600000), // 1 hour ago
        expiresAt: new Date(Date.now() + 3600000)
      });
      expect(session.isIdle(30)).toBe(true); // 30 minutes threshold
    });

    it('should return false when idle time is within threshold', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        lastActivityAt: new Date(Date.now() - 600000), // 10 minutes ago
        expiresAt: new Date(Date.now() + 3600000)
      });
      expect(session.isIdle(30)).toBe(false);
    });
  });

  describe('revoke', () => {
    it('should revoke session with reason', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date(Date.now() + 3600000)
      });

      session.revoke('User logout');

      expect(session.status).toBe(SessionStatus.REVOKED);
      expect(session.revokedAt).toBeDefined();
      expect(session.revokeReason).toBe('User logout');
    });
  });

  describe('updateActivity', () => {
    it('should update last activity timestamp', () => {
      const session = new SessionModel({
        sessionId: 'session-123',
        userId: 'user-456',
        tenantId: 'tenant-789',
        deviceId: 'device-012',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        lastActivityAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 3600000)
      });

      const oldActivity = session.lastActivityAt;
      session.updateActivity();

      expect(session.lastActivityAt.getTime()).toBeGreaterThan(oldActivity.getTime());
    });
  });
});

describe('DeviceModel', () => {
  describe('trust and untrust', () => {
    it('should mark device as trusted', () => {
      const device = new DeviceModel({
        deviceId: 'device-123',
        deviceName: 'Chrome on Windows',
        deviceType: 'desktop',
        osName: 'Windows',
        osVersion: '10',
        browserName: 'Chrome',
        browserVersion: '120'
      });

      device.trust();
      expect(device.isTrusted).toBe(true);

      device.untrust();
      expect(device.isTrusted).toBe(false);
    });
  });

  describe('getFingerprint', () => {
    it('should return device fingerprint', () => {
      const device = new DeviceModel({
        deviceId: 'device-123',
        deviceName: 'Chrome on Windows',
        deviceType: 'desktop',
        osName: 'Windows',
        osVersion: '10',
        browserName: 'Chrome',
        browserVersion: '120'
      });

      expect(device.getFingerprint()).toBe('Windows|Chrome|desktop');
    });
  });
});

describe('DEFAULT_SESSION_POLICIES', () => {
  it('should have stricter policies for super admin', () => {
    const superAdminPolicy = DEFAULT_SESSION_POLICIES.SUPER_ADMIN;
    const endUserPolicy = DEFAULT_SESSION_POLICIES.END_USER;

    expect(superAdminPolicy.maxConcurrentSessions).toBeLessThan(endUserPolicy.maxConcurrentSessions);
    expect(superAdminPolicy.sessionTimeoutMinutes).toBeLessThan(endUserPolicy.sessionTimeoutMinutes);
    expect(superAdminPolicy.requireMfaOnNewDevice).toBe(true);
    expect(superAdminPolicy.ipWhitelistEnabled).toBe(true);
  });
});

describe('RoleModel', () => {
  describe('hasPermission', () => {
    it('should return true when role has the permission', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'tenant-456',
        name: 'Test Role',
        description: 'Test',
        type: 'custom',
        permissions: [{
          permissionId: 'perm-1',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          scope: 'organization',
          description: 'Read users'
        }]
      });

      expect(role.hasPermission(ResourceType.USER, PermissionAction.READ)).toBe(true);
    });

    it('should return false when role lacks the permission', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'tenant-456',
        name: 'Test Role',
        description: 'Test',
        type: 'custom',
        permissions: []
      });

      expect(role.hasPermission(ResourceType.USER, PermissionAction.READ)).toBe(false);
    });

    it('should allow global scope to satisfy any scope requirement', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'tenant-456',
        name: 'Test Role',
        description: 'Test',
        type: 'custom',
        permissions: [{
          permissionId: 'perm-1',
          resource: ResourceType.USER,
          action: PermissionAction.MANAGE,
          scope: 'global',
          description: 'Manage all users'
        }]
      });

      expect(role.hasPermission(ResourceType.USER, PermissionAction.MANAGE, 'any-scope')).toBe(true);
    });
  });

  describe('addPermission and removePermission', () => {
    it('should add and remove permissions', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'tenant-456',
        name: 'Test Role',
        description: 'Test',
        type: 'custom',
        permissions: []
      });

      const permission = {
        permissionId: 'perm-1',
        resource: ResourceType.USER,
        action: PermissionAction.READ,
        description: 'Read users'
      };

      role.addPermission(permission);
      expect(role.permissions.length).toBe(1);

      role.removePermission('perm-1');
      expect(role.permissions.length).toBe(0);
    });

    it('should not add duplicate permissions', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'tenant-456',
        name: 'Test Role',
        description: 'Test',
        type: 'custom',
        permissions: []
      });

      const permission = {
        permissionId: 'perm-1',
        resource: ResourceType.USER,
        action: PermissionAction.READ,
        description: 'Read users'
      };

      role.addPermission(permission);
      role.addPermission(permission);
      expect(role.permissions.length).toBe(1);
    });
  });

  describe('canBeDeleted', () => {
    it('should return true for custom roles', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'tenant-456',
        name: 'Custom Role',
        description: 'Test',
        type: 'custom'
      });

      expect(role.canBeDeleted()).toBe(true);
    });

    it('should return false for system roles', () => {
      const role = new RoleModel({
        roleId: 'role-123',
        tenantId: 'system',
        name: 'System Role',
        description: 'Test',
        type: 'system'
      });

      expect(role.canBeDeleted()).toBe(false);
    });
  });
});

describe('SYSTEM_ROLES', () => {
  it('should define all required system roles', () => {
    expect(SYSTEM_ROLES.SUPER_ADMIN).toBeDefined();
    expect(SYSTEM_ROLES.PARTNER_ADMIN).toBeDefined();
    expect(SYSTEM_ROLES.CLIENT_ADMIN).toBeDefined();
    expect(SYSTEM_ROLES.VIEWER).toBeDefined();
    expect(SYSTEM_ROLES.EDITOR).toBeDefined();
  });

  it('should mark all system roles as type "system"', () => {
    Object.values(SYSTEM_ROLES).forEach(role => {
      expect(role.type).toBe('system');
    });
  });
});

describe('AuditLogModel', () => {
  describe('isCriticalEvent', () => {
    it('should return true for super admin access', () => {
      const log = new AuditLogModel({
        auditLogId: 'log-123',
        tenantId: 'tenant-456',
        action: AuditAction.SUPER_ADMIN_ACCESS,
        actorType: ActorType.SUPER_ADMIN,
        actorId: 'admin-789',
        resourceType: ResourceType.TENANT,
        resourceId: 'tenant-456',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(log.isCriticalEvent()).toBe(true);
    });

    it('should return true for tenant isolation breach attempt', () => {
      const log = new AuditLogModel({
        auditLogId: 'log-123',
        tenantId: 'tenant-456',
        action: AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT,
        actorType: ActorType.END_USER,
        actorId: 'user-789',
        resourceType: ResourceType.TENANT,
        resourceId: 'tenant-999',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(log.isCriticalEvent()).toBe(true);
    });

    it('should return false for regular login', () => {
      const log = new AuditLogModel({
        auditLogId: 'log-123',
        tenantId: 'tenant-456',
        action: AuditAction.LOGIN,
        actorType: ActorType.END_USER,
        actorId: 'user-789',
        resourceType: ResourceType.USER,
        resourceId: 'user-789',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(log.isCriticalEvent()).toBe(false);
    });
  });

  describe('isSuperAdminAction', () => {
    it('should return true for super admin actor type', () => {
      const log = new AuditLogModel({
        auditLogId: 'log-123',
        tenantId: 'tenant-456',
        action: AuditAction.LOGIN,
        actorType: ActorType.SUPER_ADMIN,
        actorId: 'admin-789',
        resourceType: ResourceType.USER,
        resourceId: 'admin-789',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(log.isSuperAdminAction()).toBe(true);
    });

    it('should return false for non-super admin actor type', () => {
      const log = new AuditLogModel({
        auditLogId: 'log-123',
        tenantId: 'tenant-456',
        action: AuditAction.LOGIN,
        actorType: ActorType.END_USER,
        actorId: 'user-789',
        resourceType: ResourceType.USER,
        resourceId: 'user-789',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(log.isSuperAdminAction()).toBe(false);
    });
  });

  describe('getActionDescription', () => {
    it('should return human-readable description for actions', () => {
      const log = new AuditLogModel({
        auditLogId: 'log-123',
        tenantId: 'tenant-456',
        action: AuditAction.LOGIN,
        actorType: ActorType.END_USER,
        actorId: 'user-789',
        resourceType: ResourceType.USER,
        resourceId: 'user-789',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(log.getActionDescription()).toBe('User logged in');
    });
  });
});

describe('AuditLogQuery', () => {
  it('should build query with all filters', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');

    const query = new AuditLogQuery()
      .byTenant('tenant-123')
      .byAction(AuditAction.LOGIN)
      .byActor('user-456')
      .byActorType(ActorType.END_USER)
      .byResource(ResourceType.USER, 'user-456')
      .byStatus('success')
      .byDateRange(startDate, endDate)
      .criticalOnly()
      .setLimit(50)
      .setOffset(10)
      ;
    query.setSortBy('timestamp', 'asc');

    const built = query.build();

    expect(built.filters.tenantId).toBe('tenant-123');
    expect(built.filters.action).toBe(AuditAction.LOGIN);
    expect(built.filters.actorId).toBe('user-456');
    expect(built.filters.actorType).toBe(ActorType.END_USER);
    expect(built.filters.resourceType).toBe(ResourceType.USER);
    expect(built.filters.resourceId).toBe('user-456');
    expect(built.filters.status).toBe('success');
    expect(built.filters.dateRange.start).toEqual(startDate);
    expect(built.filters.dateRange.end).toEqual(endDate);
    expect(built.filters.criticalOnly).toBe(true);
    expect(built.pagination.limit).toBe(50);
    expect(built.pagination.offset).toBe(10);
    expect(built.sort.field).toBe('timestamp');
    expect(built.sort.order).toBe('asc');
  });

  it('should limit max results to 1000', () => {
    const query = new AuditLogQuery().setLimit(5000);
    const built = query.build();

    expect(built.pagination.limit).toBe(1000);
  });
});
