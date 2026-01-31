/**
 * Integration Tests for Authorization Enforcement
 * 
 * Tests RBAC permission checking, role hierarchies, and access control
 */

import { RBACService } from '../../src/services/RBACService';
import { AuditLogService } from '../../src/services/AuditLogService';
import { UserModel } from '../../src/models/User';
import { RoleModel } from '../../src/models/Role';
import {
  Permission,
  PermissionAction,
  ResourceType,
  RoleAssignment,
  AuditAction
} from '../../src/types';

describe('Authorization Integration Tests', () => {
  let rbacService: RBACService;
  let auditLogService: AuditLogService;

  beforeEach(() => {
    auditLogService = new AuditLogService();
    rbacService = new RBACService(auditLogService);
  });

  describe('Role-Based Access Control', () => {
    const tenantId = 'tenant-rbac-test';

    it('should enforce role-based permissions', async () => {
      // Create roles with different permission levels
      const viewerRole = await rbacService.createRole(
        tenantId,
        'Viewer',
        'Read-only access',
        [{
          permissionId: 'view-users',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          scope: 'organization',
          description: 'View users'
        }]
      );

      const editorRole = await rbacService.createRole(
        tenantId,
        'Editor',
        'Read and write access',
        [
          {
            permissionId: 'view-users-editor',
            resource: ResourceType.USER,
            action: PermissionAction.READ,
            scope: 'organization',
            description: 'View users'
          },
          {
            permissionId: 'edit-users',
            resource: ResourceType.USER,
            action: PermissionAction.UPDATE,
            scope: 'organization',
            description: 'Edit users'
          }
        ]
      );

      // Create users with different roles
      const viewerAssignment = await rbacService.assignRole(
        'viewer-user',
        viewerRole.roleId,
        tenantId
      );

      const editorAssignment = await rbacService.assignRole(
        'editor-user',
        editorRole.roleId,
        tenantId
      );

      const viewerUser = new UserModel({
        userId: 'viewer-user',
        tenantId,
        email: 'viewer@example.com',
        firstName: 'Viewer',
        lastName: 'User',
        roles: [viewerAssignment]
      });

      const editorUser = new UserModel({
        userId: 'editor-user',
        tenantId,
        email: 'editor@example.com',
        firstName: 'Editor',
        lastName: 'User',
        roles: [editorAssignment]
      });

      // Test viewer permissions
      expect(await rbacService.hasPermission(viewerUser, ResourceType.USER, PermissionAction.READ)).toBe(true);
      expect(await rbacService.hasPermission(viewerUser, ResourceType.USER, PermissionAction.UPDATE)).toBe(false);
      expect(await rbacService.hasPermission(viewerUser, ResourceType.USER, PermissionAction.DELETE)).toBe(false);

      // Test editor permissions
      expect(await rbacService.hasPermission(editorUser, ResourceType.USER, PermissionAction.READ)).toBe(true);
      expect(await rbacService.hasPermission(editorUser, ResourceType.USER, PermissionAction.UPDATE)).toBe(true);
      expect(await rbacService.hasPermission(editorUser, ResourceType.USER, PermissionAction.DELETE)).toBe(false);
    });

    it('should support multiple roles per user', async () => {
      // Create separate roles
      const userManagerRole = await rbacService.createRole(
        tenantId,
        'User Manager',
        'Manage users',
        [{
          permissionId: 'manage-users',
          resource: ResourceType.USER,
          action: PermissionAction.MANAGE,
          scope: 'organization',
          description: 'Manage users'
        }]
      );

      const roleManagerRole = await rbacService.createRole(
        tenantId,
        'Role Manager',
        'Manage roles',
        [{
          permissionId: 'manage-roles',
          resource: ResourceType.ROLE,
          action: PermissionAction.MANAGE,
          scope: 'organization',
          description: 'Manage roles'
        }]
      );

      // Assign both roles to user
      const userAssignment = await rbacService.assignRole('multi-role-user', userManagerRole.roleId, tenantId);
      const roleAssignment = await rbacService.assignRole('multi-role-user', roleManagerRole.roleId, tenantId);

      const multiRoleUser = new UserModel({
        userId: 'multi-role-user',
        tenantId,
        email: 'multi@example.com',
        firstName: 'Multi',
        lastName: 'Role',
        roles: [userAssignment, roleAssignment]
      });

      // User should have permissions from both roles
      expect(await rbacService.hasPermission(multiRoleUser, ResourceType.USER, PermissionAction.MANAGE)).toBe(true);
      expect(await rbacService.hasPermission(multiRoleUser, ResourceType.ROLE, PermissionAction.MANAGE)).toBe(true);

      // Get all permissions
      const permissions = await rbacService.getUserPermissions(multiRoleUser);
      expect(permissions.length).toBe(2);
    });

    it('should handle role expiration', async () => {
      // Create role
      const tempRole = await rbacService.createRole(
        tenantId,
        'Temporary Role',
        'Expires soon',
        [{
          permissionId: 'temp-perm',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          description: 'Temporary permission'
        }]
      );

      // Assign with past expiration
      const expiredAssignment: RoleAssignment = {
        assignmentId: 'expired-assignment',
        userId: 'temp-user',
        roleId: tempRole.roleId,
        tenantId,
        assignedAt: new Date(Date.now() - 86400000),
        assignedBy: 'admin',
        expiresAt: new Date(Date.now() - 3600000) // Expired 1 hour ago
      };

      const tempUser = new UserModel({
        userId: 'temp-user',
        tenantId,
        email: 'temp@example.com',
        firstName: 'Temp',
        lastName: 'User',
        roles: [expiredAssignment]
      });

      // Expired role should not grant permissions
      expect(await rbacService.hasPermission(tempUser, ResourceType.USER, PermissionAction.READ)).toBe(false);
    });

    it('should support scoped permissions', async () => {
      // Create role with organization scope
      const orgScopedRole = await rbacService.createRole(
        tenantId,
        'Org Scoped Role',
        'Organization scoped access',
        [{
          permissionId: 'org-scoped-perm',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          scope: 'organization',
          description: 'Read users in organization'
        }]
      );

      // Create role with global scope
      const globalScopedRole = await rbacService.createRole(
        tenantId,
        'Global Scoped Role',
        'Global access',
        [{
          permissionId: 'global-scoped-perm',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          scope: 'global',
          description: 'Read all users'
        }]
      );

      const orgAssignment = await rbacService.assignRole('org-user', orgScopedRole.roleId, tenantId);
      const globalAssignment = await rbacService.assignRole('global-user', globalScopedRole.roleId, tenantId);

      const orgUser = new UserModel({
        userId: 'org-user',
        tenantId,
        email: 'org@example.com',
        firstName: 'Org',
        lastName: 'User',
        roles: [orgAssignment]
      });

      const globalUser = new UserModel({
        userId: 'global-user',
        tenantId,
        email: 'global@example.com',
        firstName: 'Global',
        lastName: 'User',
        roles: [globalAssignment]
      });

      // Org user can only access organization scope
      expect(await rbacService.hasPermission(orgUser, ResourceType.USER, PermissionAction.READ, 'organization')).toBe(true);
      expect(await rbacService.hasPermission(orgUser, ResourceType.USER, PermissionAction.READ, 'global')).toBe(false);

      // Global user can access any scope
      expect(await rbacService.hasPermission(globalUser, ResourceType.USER, PermissionAction.READ, 'organization')).toBe(true);
      expect(await rbacService.hasPermission(globalUser, ResourceType.USER, PermissionAction.READ, 'global')).toBe(true);
      expect(await rbacService.hasPermission(globalUser, ResourceType.USER, PermissionAction.READ, 'any-scope')).toBe(true);
    });
  });

  describe('Role Hierarchy', () => {
    const tenantId = 'tenant-hierarchy-test';

    it('should inherit permissions from parent role', async () => {
      // Create parent role with base permissions
      const parentRole = await rbacService.createRole(
        tenantId,
        'Parent Role',
        'Base permissions',
        [{
          permissionId: 'parent-perm',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          description: 'Read users'
        }]
      );

      // Create child role with additional permissions
      const childRole = await rbacService.createRole(
        tenantId,
        'Child Role',
        'Extended permissions',
        [{
          permissionId: 'child-perm',
          resource: ResourceType.USER,
          action: PermissionAction.UPDATE,
          description: 'Update users'
        }],
        parentRole.roleId
      );

      // Verify child role has parent reference
      expect(childRole.parentRoleId).toBe(parentRole.roleId);

      // Get all permissions including inherited
      const allPermissions = childRole.getAllPermissions(
        new Map([[parentRole.roleId, parentRole], [childRole.roleId, childRole]])
      );

      expect(allPermissions.length).toBe(2);
      expect(allPermissions.some(p => p.permissionId === 'parent-perm')).toBe(true);
      expect(allPermissions.some(p => p.permissionId === 'child-perm')).toBe(true);
    });

    it('should get role hierarchy path', async () => {
      // Create three-level hierarchy
      const grandparentRole = await rbacService.createRole(
        tenantId,
        'Grandparent Role',
        'Top level',
        []
      );

      const parentRole = await rbacService.createRole(
        tenantId,
        'Parent Role',
        'Middle level',
        [],
        grandparentRole.roleId
      );

      const childRole = await rbacService.createRole(
        tenantId,
        'Child Role',
        'Bottom level',
        [],
        parentRole.roleId
      );

      const roleMap = new Map([
        [grandparentRole.roleId, grandparentRole],
        [parentRole.roleId, parentRole],
        [childRole.roleId, childRole]
      ]);

      const path = childRole.getHierarchyPath(roleMap);

      expect(path.length).toBe(3);
      expect(path[0]).toBe(grandparentRole.roleId);
      expect(path[1]).toBe(parentRole.roleId);
      expect(path[2]).toBe(childRole.roleId);
    });
  });

  describe('Role Lifecycle Management', () => {
    const tenantId = 'tenant-lifecycle-test';

    it('should manage complete role lifecycle', async () => {
      // Create role
      const role = await rbacService.createRole(
        tenantId,
        'Lifecycle Role',
        'Testing lifecycle',
        [{
          permissionId: 'lifecycle-perm',
          resource: ResourceType.USER,
          action: PermissionAction.READ,
          description: 'Read users'
        }],
        undefined,
        'admin-123'
      );

      expect(role.isActive).toBe(true);

      // Update role
      const updatedRole = await rbacService.updateRole(
        role.roleId,
        {
          description: 'Updated description',
          permissions: [
            {
              permissionId: 'updated-perm',
              resource: ResourceType.USER,
              action: PermissionAction.UPDATE,
              description: 'Update users'
            }
          ]
        },
        'admin-123'
      );

      expect(updatedRole.description).toBe('Updated description');
      expect(updatedRole.permissions[0].action).toBe(PermissionAction.UPDATE);

      // Deactivate role
      const deactivatedRole = await rbacService.updateRole(
        role.roleId,
        { isActive: false },
        'admin-123'
      );

      expect(deactivatedRole.isActive).toBe(false);

      // Delete role (should succeed since no assignments)
      await rbacService.deleteRole(role.roleId, 'admin-123');

      expect(rbacService.getRole(role.roleId)).toBeNull();
    });

    it('should prevent deletion of assigned roles', async () => {
      // Create and assign role
      const role = await rbacService.createRole(
        tenantId,
        'Assigned Role',
        'Cannot delete',
        []
      );

      await rbacService.assignRole('user-123', role.roleId, tenantId);

      // Attempt to delete should fail
      await expect(
        rbacService.deleteRole(role.roleId)
      ).rejects.toThrow('Cannot delete role that is assigned to users');
    });

    it('should track role changes in audit log', async () => {
      const actorId = 'admin-audit-123';

      // Create role
      const role = await rbacService.createRole(
        tenantId,
        'Audited Role',
        'Track changes',
        [],
        undefined,
        actorId
      );

      // Update role
      await rbacService.updateRole(
        role.roleId,
        { description: 'Updated' },
        actorId
      );

      // Assign role
      await rbacService.assignRole('user-456', role.roleId, tenantId, undefined, undefined, actorId);

      // Query audit logs
      const { logs } = await auditLogService.queryLogs(
        new (require('../../src/models/AuditLog').AuditLogQuery)()
          .byTenant(tenantId)
          .byResource(ResourceType.ROLE, role.roleId)
      );

      const actions = logs.map(l => l.action);
      expect(actions).toContain(AuditAction.ROLE_CREATED);
      expect(actions).toContain(AuditAction.ROLE_UPDATED);
      expect(actions).toContain(AuditAction.ROLE_ASSIGNED);
    });
  });

  describe('Permission Aggregation', () => {
    const tenantId = 'tenant-aggregation-test';

    it('should aggregate permissions from multiple roles without duplicates', async () => {
      // Create roles with overlapping permissions
      const role1 = await rbacService.createRole(
        tenantId,
        'Role 1',
        'First role',
        [
          {
            permissionId: 'shared-perm',
            resource: ResourceType.USER,
            action: PermissionAction.READ,
            description: 'Read users'
          },
          {
            permissionId: 'role1-perm',
            resource: ResourceType.ROLE,
            action: PermissionAction.READ,
            description: 'Read roles'
          }
        ]
      );

      const role2 = await rbacService.createRole(
        tenantId,
        'Role 2',
        'Second role',
        [
          {
            permissionId: 'shared-perm-2',
            resource: ResourceType.USER,
            action: PermissionAction.READ,
            description: 'Read users (duplicate action)'
          },
          {
            permissionId: 'role2-perm',
            resource: ResourceType.SESSION,
            action: PermissionAction.READ,
            description: 'Read sessions'
          }
        ]
      );

      const assignment1 = await rbacService.assignRole('multi-user', role1.roleId, tenantId);
      const assignment2 = await rbacService.assignRole('multi-user', role2.roleId, tenantId);

      const user = new UserModel({
        userId: 'multi-user',
        tenantId,
        email: 'multi@example.com',
        firstName: 'Multi',
        lastName: 'User',
        roles: [assignment1, assignment2]
      });

      const permissions = await rbacService.getUserPermissions(user);

      // Should have all unique permissions
      expect(permissions.length).toBe(4);

      // User should have access to all resources
      expect(await rbacService.hasPermission(user, ResourceType.USER, PermissionAction.READ)).toBe(true);
      expect(await rbacService.hasPermission(user, ResourceType.ROLE, PermissionAction.READ)).toBe(true);
      expect(await rbacService.hasPermission(user, ResourceType.SESSION, PermissionAction.READ)).toBe(true);
    });
  });

  describe('System Role Protection', () => {
    it('should prevent modification of system roles', async () => {
      const systemRoles = rbacService.listRoles('system');
      const superAdminRole = systemRoles.find(r => r.name === 'Super Admin');

      if (superAdminRole) {
        // Attempt to update system role
        await expect(
          rbacService.updateRole(superAdminRole.roleId, { name: 'Hacked Admin' })
        ).rejects.toThrow('System roles cannot be modified');

        // Attempt to delete system role
        await expect(
          rbacService.deleteRole(superAdminRole.roleId)
        ).rejects.toThrow('System roles cannot be deleted');
      }
    });

    it('should allow assigning system roles to users', async () => {
      const systemRoles = rbacService.listRoles('system');
      const viewerRole = systemRoles.find(r => r.name === 'Viewer');

      if (viewerRole) {
        const assignment = await rbacService.assignRole(
          'system-role-user',
          viewerRole.roleId,
          'tenant-system-test'
        );

        expect(assignment.roleId).toBe(viewerRole.roleId);
      }
    });
  });
});
