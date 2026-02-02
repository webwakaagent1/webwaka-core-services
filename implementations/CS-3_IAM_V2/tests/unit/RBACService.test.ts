/**
 * Unit Tests for RBACService
 * 
 * Tests for role-based access control including role creation, assignment, and permission checking
 */

import { RBACService } from '../../src/services/RBACService';
import { AuditLogService } from '../../src/services/AuditLogService';
import { UserModel } from '../../src/models/User';
import { RoleModel } from '../../src/models/Role';
import {
  Permission,
  PermissionAction,
  ResourceType,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '../../src/types';

describe('RBACService', () => {
  let rbacService: RBACService;
  let auditLogService: AuditLogService;

  beforeEach(() => {
    auditLogService = new AuditLogService();
    rbacService = new RBACService(auditLogService);
    
    // Mock audit log service methods
    jest.spyOn(auditLogService, 'logRoleManagementEvent').mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('System Roles Initialization', () => {
    it('should initialize with system roles', () => {
      const roles = rbacService.listRoles('any-tenant');
      
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.some(r => r.name === 'Super Admin')).toBe(true);
      expect(roles.some(r => r.name === 'Partner Admin')).toBe(true);
      expect(roles.some(r => r.name === 'Viewer')).toBe(true);
    });

    it('should mark system roles as type "system"', () => {
      const roles = rbacService.listRoles('any-tenant');
      const systemRoles = roles.filter(r => r.type === 'system');
      
      expect(systemRoles.length).toBeGreaterThan(0);
    });
  });

  describe('createRole', () => {
    const tenantId = 'tenant-123';
    const permissions: Permission[] = [
      {
        permissionId: 'perm-1',
        resource: ResourceType.USER,
        action: PermissionAction.READ,
        scope: 'organization',
        description: 'Read users'
      }
    ];

    it('should create a custom role', async () => {
      const role = await rbacService.createRole(
        tenantId,
        'Custom Role',
        'A custom role for testing',
        permissions,
        undefined,
        'admin-456'
      );

      expect(role).toBeInstanceOf(RoleModel);
      expect(role.name).toBe('Custom Role');
      expect(role.type).toBe('custom');
      expect(role.tenantId).toBe(tenantId);
      expect(role.permissions).toEqual(permissions);
      expect(role.isActive).toBe(true);
    });

    it('should throw ValidationError for empty role name', async () => {
      await expect(
        rbacService.createRole(tenantId, '', 'Description', permissions)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for whitespace-only role name', async () => {
      await expect(
        rbacService.createRole(tenantId, '   ', 'Description', permissions)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for duplicate role name in same tenant', async () => {
      await rbacService.createRole(tenantId, 'Unique Role', 'Description', permissions);
      
      await expect(
        rbacService.createRole(tenantId, 'Unique Role', 'Another description', permissions)
      ).rejects.toThrow(ValidationError);
    });

    it('should allow same role name in different tenants', async () => {
      await rbacService.createRole(tenantId, 'Shared Name', 'Description', permissions);
      
      const role2 = await rbacService.createRole(
        'tenant-456',
        'Shared Name',
        'Description',
        permissions
      );

      expect(role2.tenantId).toBe('tenant-456');
    });

    it('should log role creation when actorId is provided', async () => {
      await rbacService.createRole(
        tenantId,
        'Logged Role',
        'Description',
        permissions,
        undefined,
        'admin-456'
      );

      expect(auditLogService.logRoleManagementEvent).toHaveBeenCalled();
    });

    it('should support parent role for hierarchy', async () => {
      const parentRole = await rbacService.createRole(
        tenantId,
        'Parent Role',
        'Parent',
        permissions
      );

      const childRole = await rbacService.createRole(
        tenantId,
        'Child Role',
        'Child',
        [],
        parentRole.roleId
      );

      expect(childRole.parentRoleId).toBe(parentRole.roleId);
    });
  });

  describe('updateRole', () => {
    let customRole: RoleModel;
    const tenantId = 'tenant-123';

    beforeEach(async () => {
      customRole = await rbacService.createRole(
        tenantId,
        'Updatable Role',
        'Original description',
        []
      );
    });

    it('should update role name', async () => {
      const updated = await rbacService.updateRole(
        customRole.roleId,
        { name: 'Updated Name' },
        'admin-456'
      );

      expect(updated.name).toBe('Updated Name');
    });

    it('should update role description', async () => {
      const updated = await rbacService.updateRole(
        customRole.roleId,
        { description: 'Updated description' }
      );

      expect(updated.description).toBe('Updated description');
    });

    it('should update role permissions', async () => {
      const newPermissions: Permission[] = [
        {
          permissionId: 'new-perm',
          resource: ResourceType.ROLE,
          action: PermissionAction.READ,
          description: 'Read roles'
        }
      ];

      const updated = await rbacService.updateRole(
        customRole.roleId,
        { permissions: newPermissions }
      );

      expect(updated.permissions).toEqual(newPermissions);
    });

    it('should update role active status', async () => {
      const updated = await rbacService.updateRole(
        customRole.roleId,
        { isActive: false }
      );

      expect(updated.isActive).toBe(false);
    });

    it('should throw NotFoundError for non-existent role', async () => {
      await expect(
        rbacService.updateRole('non-existent-role', { name: 'New Name' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when updating system role', async () => {
      const systemRoles = rbacService.listRoles('system');
      const systemRole = systemRoles.find(r => r.type === 'system');

      if (systemRole) {
        await expect(
          rbacService.updateRole(systemRole.roleId, { name: 'Hacked Name' })
        ).rejects.toThrow(ForbiddenError);
      }
    });

    it('should log role update when actorId is provided', async () => {
      await rbacService.updateRole(
        customRole.roleId,
        { name: 'Logged Update' },
        'admin-456'
      );

      expect(auditLogService.logRoleManagementEvent).toHaveBeenCalled();
    });
  });

  describe('deleteRole', () => {
    let customRole: RoleModel;
    const tenantId = 'tenant-123';

    beforeEach(async () => {
      customRole = await rbacService.createRole(
        tenantId,
        'Deletable Role',
        'Description',
        []
      );
    });

    it('should delete a custom role', async () => {
      await rbacService.deleteRole(customRole.roleId, 'admin-456');

      expect(rbacService.getRole(customRole.roleId)).toBeNull();
    });

    it('should throw NotFoundError for non-existent role', async () => {
      await expect(
        rbacService.deleteRole('non-existent-role')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when deleting system role', async () => {
      const systemRoles = rbacService.listRoles('system');
      const systemRole = systemRoles.find(r => r.type === 'system');

      if (systemRole) {
        await expect(
          rbacService.deleteRole(systemRole.roleId)
        ).rejects.toThrow(ForbiddenError);
      }
    });

    it('should throw ValidationError when role is assigned to users', async () => {
      // Assign role to a user first
      await rbacService.assignRole(
        'user-123',
        customRole.roleId,
        tenantId
      );

      await expect(
        rbacService.deleteRole(customRole.roleId)
      ).rejects.toThrow(ValidationError);
    });

    it('should log role deletion when actorId is provided', async () => {
      await rbacService.deleteRole(customRole.roleId, 'admin-456');

      expect(auditLogService.logRoleManagementEvent).toHaveBeenCalled();
    });
  });

  describe('assignRole', () => {
    let customRole: RoleModel;
    const tenantId = 'tenant-123';
    const userId = 'user-456';

    beforeEach(async () => {
      customRole = await rbacService.createRole(
        tenantId,
        'Assignable Role',
        'Description',
        []
      );
    });

    it('should assign a role to a user', async () => {
      const assignment = await rbacService.assignRole(
        userId,
        customRole.roleId,
        tenantId,
        undefined,
        undefined,
        'admin-789'
      );

      expect(assignment.userId).toBe(userId);
      expect(assignment.roleId).toBe(customRole.roleId);
      expect(assignment.tenantId).toBe(tenantId);
      expect(assignment.assignedBy).toBe('admin-789');
    });

    it('should support scope in role assignment', async () => {
      const assignment = await rbacService.assignRole(
        userId,
        customRole.roleId,
        tenantId,
        'team-123'
      );

      expect(assignment.scope).toBe('team-123');
    });

    it('should support expiration in role assignment', async () => {
      const expiresAt = new Date(Date.now() + 86400000); // 1 day from now
      
      const assignment = await rbacService.assignRole(
        userId,
        customRole.roleId,
        tenantId,
        undefined,
        expiresAt
      );

      expect(assignment.expiresAt).toEqual(expiresAt);
    });

    it('should throw NotFoundError for non-existent role', async () => {
      await expect(
        rbacService.assignRole(userId, 'non-existent-role', tenantId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should log role assignment when actorId is provided', async () => {
      await rbacService.assignRole(
        userId,
        customRole.roleId,
        tenantId,
        undefined,
        undefined,
        'admin-789'
      );

      expect(auditLogService.logRoleManagementEvent).toHaveBeenCalled();
    });
  });

  describe('revokeRole', () => {
    let customRole: RoleModel;
    const tenantId = 'tenant-123';
    const userId = 'user-456';
    let assignmentId: string;

    beforeEach(async () => {
      customRole = await rbacService.createRole(
        tenantId,
        'Revocable Role',
        'Description',
        []
      );
      
      const assignment = await rbacService.assignRole(
        userId,
        customRole.roleId,
        tenantId
      );
      assignmentId = assignment.assignmentId;
    });

    it('should revoke a role assignment', async () => {
      await rbacService.revokeRole(assignmentId, tenantId, 'admin-789');

      const assignments = rbacService.getUserRoleAssignments(userId);
      expect(assignments.find(a => a.assignmentId === assignmentId)).toBeUndefined();
    });

    it('should throw NotFoundError for non-existent assignment', async () => {
      await expect(
        rbacService.revokeRole('non-existent-assignment', tenantId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should log role revocation when actorId is provided', async () => {
      await rbacService.revokeRole(assignmentId, tenantId, 'admin-789');

      expect(auditLogService.logRoleManagementEvent).toHaveBeenCalled();
    });
  });

  describe('hasPermission', () => {
    let customRole: RoleModel;
    const tenantId = 'tenant-123';
    let user: UserModel;

    beforeEach(async () => {
      const permissions: Permission[] = [
        {
          permissionId: 'perm-1',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          scope: 'organization',
          description: 'Read users'
        },
        {
          permissionId: 'perm-2',
          resource: ResourceType.ROLE,
          action: PermissionAction.MANAGE,
          scope: 'global',
          description: 'Manage roles'
        }
      ];

      customRole = await rbacService.createRole(
        tenantId,
        'Permission Test Role',
        'Description',
        permissions
      );

      const assignment = await rbacService.assignRole(
        'user-456',
        customRole.roleId,
        tenantId
      );

      user = new UserModel({
        userId: 'user-456',
        tenantId,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        roles: [assignment]
      });
    });

    it('should return true when user has the permission', async () => {
      const hasPermission = await rbacService.hasPermission(
        user,
        ResourceType.USER,
        PermissionAction.READ
      );

      expect(hasPermission).toBe(true);
    });

    it('should return false when user lacks the permission', async () => {
      const hasPermission = await rbacService.hasPermission(
        user,
        ResourceType.USER,
        PermissionAction.DELETE
      );

      expect(hasPermission).toBe(false);
    });

    it('should check scope when provided', async () => {
      const hasPermission = await rbacService.hasPermission(
        user,
        ResourceType.USER,
        PermissionAction.READ,
        'organization'
      );

      expect(hasPermission).toBe(true);
    });

    it('should allow global scope to satisfy any scope requirement', async () => {
      const hasPermission = await rbacService.hasPermission(
        user,
        ResourceType.ROLE,
        PermissionAction.MANAGE,
        'any-scope'
      );

      expect(hasPermission).toBe(true);
    });

    it('should ignore expired role assignments', async () => {
      const expiredAssignment = await rbacService.assignRole(
        'user-789',
        customRole.roleId,
        tenantId,
        undefined,
        new Date(Date.now() - 86400000) // Expired yesterday
      );

      const expiredUser = new UserModel({
        userId: 'user-789',
        tenantId,
        email: 'expired@example.com',
        firstName: 'Expired',
        lastName: 'User',
        roles: [expiredAssignment]
      });

      const hasPermission = await rbacService.hasPermission(
        expiredUser,
        ResourceType.USER,
        PermissionAction.READ
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    let customRole: RoleModel;
    const tenantId = 'tenant-123';
    let user: UserModel;

    beforeEach(async () => {
      const permissions: Permission[] = [
        {
          permissionId: 'perm-1',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          description: 'Read users'
        },
        {
          permissionId: 'perm-2',
          resource: ResourceType.ROLE,
          action: PermissionAction.READ,
          description: 'Read roles'
        }
      ];

      customRole = await rbacService.createRole(
        tenantId,
        'Multi Permission Role',
        'Description',
        permissions
      );

      const assignment = await rbacService.assignRole(
        'user-456',
        customRole.roleId,
        tenantId
      );

      user = new UserModel({
        userId: 'user-456',
        tenantId,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        roles: [assignment]
      });
    });

    it('should return all permissions for a user', async () => {
      const permissions = await rbacService.getUserPermissions(user);

      expect(permissions.length).toBe(2);
      expect(permissions.some(p => p.resource === ResourceType.USER)).toBe(true);
      expect(permissions.some(p => p.resource === ResourceType.ROLE)).toBe(true);
    });

    it('should return empty array for user with no roles', async () => {
      const noRoleUser = new UserModel({
        userId: 'user-no-roles',
        tenantId,
        email: 'noroles@example.com',
        firstName: 'No',
        lastName: 'Roles',
        roles: []
      });

      const permissions = await rbacService.getUserPermissions(noRoleUser);

      expect(permissions).toEqual([]);
    });
  });

  describe('getRole', () => {
    it('should return role by ID', async () => {
      const createdRole = await rbacService.createRole(
        'tenant-123',
        'Findable Role',
        'Description',
        []
      );

      const foundRole = rbacService.getRole(createdRole.roleId);

      expect(foundRole).not.toBeNull();
      expect(foundRole?.roleId).toBe(createdRole.roleId);
    });

    it('should return null for non-existent role', () => {
      const role = rbacService.getRole('non-existent-role');

      expect(role).toBeNull();
    });
  });

  describe('listRoles', () => {
    it('should list all roles for a tenant including system roles', async () => {
      await rbacService.createRole('tenant-123', 'Custom 1', 'Description', []);
      await rbacService.createRole('tenant-123', 'Custom 2', 'Description', []);

      const roles = rbacService.listRoles('tenant-123');

      expect(roles.length).toBeGreaterThan(2);
      expect(roles.some(r => r.name === 'Custom 1')).toBe(true);
      expect(roles.some(r => r.name === 'Custom 2')).toBe(true);
      expect(roles.some(r => r.type === 'system')).toBe(true);
    });

    it('should not include roles from other tenants', async () => {
      await rbacService.createRole('tenant-123', 'Tenant 123 Role', 'Description', []);
      await rbacService.createRole('tenant-456', 'Tenant 456 Role', 'Description', []);

      const roles = rbacService.listRoles('tenant-123');

      expect(roles.some(r => r.name === 'Tenant 123 Role')).toBe(true);
      expect(roles.some(r => r.name === 'Tenant 456 Role')).toBe(false);
    });
  });

  describe('getUserRoleAssignments', () => {
    it('should return all role assignments for a user', async () => {
      const role1 = await rbacService.createRole('tenant-123', 'Role 1', 'Description', []);
      const role2 = await rbacService.createRole('tenant-123', 'Role 2', 'Description', []);

      await rbacService.assignRole('user-456', role1.roleId, 'tenant-123');
      await rbacService.assignRole('user-456', role2.roleId, 'tenant-123');

      const assignments = rbacService.getUserRoleAssignments('user-456');

      expect(assignments.length).toBe(2);
    });

    it('should return empty array for user with no assignments', () => {
      const assignments = rbacService.getUserRoleAssignments('user-no-assignments');

      expect(assignments).toEqual([]);
    });
  });
});
