/**
 * RBACService
 * Manages role-based access control with support for custom roles and role hierarchies
 */

import { v4 as uuidv4 } from 'uuid';
import { RoleModel, SYSTEM_ROLES } from '../models/Role';
import { UserModel } from '../models/User';
import { AuditLogService } from './AuditLogService';
import {
  Role,
  Permission,
  RoleAssignment,
  PermissionAction,
  ResourceType,
  ActorType,
  AuditAction,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '../types';
import { logger } from '../utils/logger';

export class RBACService {
  private roles: Map<string, RoleModel> = new Map();
  private roleAssignments: Map<string, RoleAssignment> = new Map();
  private permissions: Map<string, Permission> = new Map();

  constructor(private auditLogService: AuditLogService) {
    this.initializeSystemRoles();
  }

  /**
   * Initialize system roles with default permissions
   */
  private initializeSystemRoles(): void {
    const systemRoles: Record<string, { name: string; description: string; permissions: Permission[] }> = {
      SUPER_ADMIN: {
        name: SYSTEM_ROLES.SUPER_ADMIN.name,
        description: SYSTEM_ROLES.SUPER_ADMIN.description,
        permissions: [
          {
            permissionId: uuidv4(),
            resource: ResourceType.USER,
            action: PermissionAction.MANAGE,
            scope: 'global',
            description: 'Manage all users'
          },
          {
            permissionId: uuidv4(),
            resource: ResourceType.ROLE,
            action: PermissionAction.MANAGE,
            scope: 'global',
            description: 'Manage all roles'
          },
          {
            permissionId: uuidv4(),
            resource: ResourceType.TENANT,
            action: PermissionAction.MANAGE,
            scope: 'global',
            description: 'Manage all tenants'
          },
          {
            permissionId: uuidv4(),
            resource: ResourceType.AUDIT_LOG,
            action: PermissionAction.READ,
            scope: 'global',
            description: 'Read all audit logs'
          }
        ]
      },
      PARTNER_ADMIN: {
        name: SYSTEM_ROLES.PARTNER_ADMIN.name,
        description: SYSTEM_ROLES.PARTNER_ADMIN.description,
        permissions: [
          {
            permissionId: uuidv4(),
            resource: ResourceType.USER,
            action: PermissionAction.MANAGE,
            scope: 'organization',
            description: 'Manage partner users'
          },
          {
            permissionId: uuidv4(),
            resource: ResourceType.ROLE,
            action: PermissionAction.MANAGE,
            scope: 'organization',
            description: 'Manage partner roles'
          },
          {
            permissionId: uuidv4(),
            resource: ResourceType.AUDIT_LOG,
            action: PermissionAction.READ,
            scope: 'organization',
            description: 'Read partner audit logs'
          }
        ]
      },
      VIEWER: {
        name: SYSTEM_ROLES.VIEWER.name,
        description: SYSTEM_ROLES.VIEWER.description,
        permissions: [
          {
            permissionId: uuidv4(),
            resource: ResourceType.USER,
            action: PermissionAction.READ,
            scope: 'organization',
            description: 'View users'
          },
          {
            permissionId: uuidv4(),
            resource: ResourceType.ROLE,
            action: PermissionAction.READ,
            scope: 'organization',
            description: 'View roles'
          }
        ]
      }
    };

    // Create system roles
    Object.entries(systemRoles).forEach(([key, roleData]) => {
      const role = new RoleModel({
        roleId: uuidv4(),
        tenantId: 'system',
        name: roleData.name,
        description: roleData.description,
        type: 'system',
        permissions: roleData.permissions,
        isActive: true
      });
      this.roles.set(role.roleId, role);
    });

    logger.info('System roles initialized', {
      count: Object.keys(systemRoles).length
    });
  }

  /**
   * Create a custom role
   */
  async createRole(
    tenantId: string,
    name: string,
    description: string,
    permissions: Permission[],
    parentRoleId?: string,
    actorId?: string
  ): Promise<RoleModel> {
    // Validate role name
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Role name is required');
    }

    // Check if role already exists
    const existingRole = Array.from(this.roles.values()).find(
      r => r.tenantId === tenantId && r.name.toLowerCase() === name.toLowerCase()
    );

    if (existingRole) {
      throw new ValidationError('Role with this name already exists');
    }

    // Create role
    const role = new RoleModel({
      roleId: uuidv4(),
      tenantId,
      name,
      description,
      type: 'custom',
      permissions,
      parentRoleId,
      isActive: true
    });

    this.roles.set(role.roleId, role);

    // Log role creation
    if (actorId) {
      await this.auditLogService.logRoleManagementEvent(
        tenantId,
        AuditAction.ROLE_CREATED,
        role.roleId,
        ActorType.PARTNER, // Assuming partner creates custom roles
        actorId,
        'unknown',
        'unknown',
        { name, description }
      );
    }

    logger.info('Role created', {
      roleId: role.roleId,
      tenantId,
      name
    });

    return role;
  }

  /**
   * Update a role
   */
  async updateRole(
    roleId: string,
    updates: Partial<Role>,
    actorId?: string
  ): Promise<RoleModel> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new NotFoundError('Role');
    }

    // System roles cannot be modified
    if (role.type === 'system') {
      throw new ForbiddenError('System roles cannot be modified');
    }

    // Update role
    if (updates.name) role.name = updates.name;
    if (updates.description) role.description = updates.description;
    if (updates.permissions) role.permissions = updates.permissions;
    if (updates.isActive !== undefined) role.isActive = updates.isActive;

    role.updatedAt = new Date();
    this.roles.set(roleId, role);

    // Log role update
    if (actorId) {
      await this.auditLogService.logRoleManagementEvent(
        role.tenantId,
        AuditAction.ROLE_UPDATED,
        roleId,
        ActorType.PARTNER,
        actorId,
        'unknown',
        'unknown',
        updates
      );
    }

    return role;
  }

  /**
   * Delete a role
   */
  async deleteRole(roleId: string, actorId?: string): Promise<void> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new NotFoundError('Role');
    }

    // System roles cannot be deleted
    if (!role.canBeDeleted()) {
      throw new ForbiddenError('System roles cannot be deleted');
    }

    // Check if role is assigned to any users
    const assignments = Array.from(this.roleAssignments.values()).filter(
      a => a.roleId === roleId
    );

    if (assignments.length > 0) {
      throw new ValidationError('Cannot delete role that is assigned to users');
    }

    this.roles.delete(roleId);

    // Log role deletion
    if (actorId) {
      await this.auditLogService.logRoleManagementEvent(
        role.tenantId,
        AuditAction.ROLE_DELETED,
        roleId,
        ActorType.PARTNER,
        actorId,
        'unknown',
        'unknown'
      );
    }

    logger.info('Role deleted', { roleId });
  }

  /**
   * Assign a role to a user
   */
  async assignRole(
    userId: string,
    roleId: string,
    tenantId: string,
    scope?: string,
    expiresAt?: Date,
    actorId?: string
  ): Promise<RoleAssignment> {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new NotFoundError('Role');
    }

    // Create assignment
    const assignment: RoleAssignment = {
      assignmentId: uuidv4(),
      userId,
      roleId,
      tenantId,
      assignedAt: new Date(),
      assignedBy: actorId || 'system',
      expiresAt,
      scope
    };

    this.roleAssignments.set(assignment.assignmentId, assignment);

    // Log role assignment
    if (actorId) {
      await this.auditLogService.logRoleManagementEvent(
        tenantId,
        AuditAction.ROLE_ASSIGNED,
        roleId,
        ActorType.PARTNER,
        actorId,
        'unknown',
        'unknown',
        { userId, scope }
      );
    }

    logger.info('Role assigned', {
      userId,
      roleId,
      tenantId
    });

    return assignment;
  }

  /**
   * Revoke a role from a user
   */
  async revokeRole(
    assignmentId: string,
    tenantId: string,
    actorId?: string
  ): Promise<void> {
    const assignment = this.roleAssignments.get(assignmentId);
    if (!assignment) {
      throw new NotFoundError('Role assignment');
    }

    this.roleAssignments.delete(assignmentId);

    // Log role revocation
    if (actorId) {
      await this.auditLogService.logRoleManagementEvent(
        tenantId,
        AuditAction.ROLE_REVOKED,
        assignment.roleId,
        ActorType.PARTNER,
        actorId,
        'unknown',
        'unknown',
        { userId: assignment.userId }
      );
    }

    logger.info('Role revoked', {
      userId: assignment.userId,
      roleId: assignment.roleId
    });
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(
    user: UserModel,
    resource: ResourceType,
    action: PermissionAction,
    scope?: string
  ): Promise<boolean> {
    // Get all roles for user
    const roleIds = user.roles
      .filter(r => !r.expiresAt || r.expiresAt > new Date())
      .map(r => r.roleId);

    // Check each role for permission
    for (const roleId of roleIds) {
      const role = this.roles.get(roleId);
      if (role && role.hasPermission(resource, action, scope)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(user: UserModel): Promise<Permission[]> {
    const permissions = new Map<string, Permission>();

    // Get all roles for user
    const roleIds = user.roles
      .filter(r => !r.expiresAt || r.expiresAt > new Date())
      .map(r => r.roleId);

    // Collect permissions from all roles
    for (const roleId of roleIds) {
      const role = this.roles.get(roleId);
      if (role) {
        const rolePerms = role.getAllPermissions(this.roles);
        rolePerms.forEach(p => permissions.set(p.permissionId, p));
      }
    }

    return Array.from(permissions.values());
  }

  /**
   * Get role by ID
   */
  getRole(roleId: string): RoleModel | null {
    return this.roles.get(roleId) || null;
  }

  /**
   * List all roles for a tenant
   */
  listRoles(tenantId: string): RoleModel[] {
    return Array.from(this.roles.values()).filter(r => r.tenantId === tenantId || r.tenantId === 'system');
  }

  /**
   * Get all role assignments for a user
   */
  getUserRoleAssignments(userId: string): RoleAssignment[] {
    return Array.from(this.roleAssignments.values()).filter(a => a.userId === userId);
  }
}

// Export singleton instance
export const rbacService = new RBACService(new AuditLogService());
