/**
 * Role Model
 * Represents a role in the RBAC system with support for role hierarchies
 */

import { Role, Permission, PermissionAction, ResourceType } from '../types';

export class RoleModel implements Role {
  roleId: string;
  tenantId: string;
  name: string;
  description: string;
  type: 'system' | 'custom';
  permissions: Permission[];
  parentRoleId?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;

  constructor(data: Partial<Role>) {
    Object.assign(this, data);
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.permissions = this.permissions || [];
    this.isActive = this.isActive !== false;
  }

  /**
   * Check if role has a specific permission
   */
  hasPermission(resource: ResourceType, action: PermissionAction, scope?: string): boolean {
    return this.permissions.some(p => 
      p.resource === resource && 
      p.action === action &&
      (!scope || p.scope === scope || p.scope === 'global')
    );
  }

  /**
   * Add a permission to the role
   */
  addPermission(permission: Permission): void {
    if (!this.permissions.find(p => p.permissionId === permission.permissionId)) {
      this.permissions.push(permission);
      this.updatedAt = new Date();
    }
  }

  /**
   * Remove a permission from the role
   */
  removePermission(permissionId: string): void {
    const index = this.permissions.findIndex(p => p.permissionId === permissionId);
    if (index > -1) {
      this.permissions.splice(index, 1);
      this.updatedAt = new Date();
    }
  }

  /**
   * Get all permissions including inherited ones (if role hierarchy is supported)
   */
  getAllPermissions(allRoles?: Map<string, RoleModel>): Permission[] {
    let allPerms = [...this.permissions];
    
    if (this.parentRoleId && allRoles) {
      const parentRole = allRoles.get(this.parentRoleId);
      if (parentRole) {
        const parentPerms = parentRole.getAllPermissions(allRoles);
        allPerms = [...allPerms, ...parentPerms];
      }
    }
    
    // Remove duplicates
    const uniquePerms = new Map<string, Permission>();
    allPerms.forEach(p => uniquePerms.set(p.permissionId, p));
    
    return Array.from(uniquePerms.values());
  }

  /**
   * Check if role can be deleted (system roles cannot be deleted)
   */
  canBeDeleted(): boolean {
    return this.type === 'custom';
  }

  /**
   * Get role hierarchy path
   */
  getHierarchyPath(allRoles?: Map<string, RoleModel>): string[] {
    const path = [this.roleId];
    
    if (this.parentRoleId && allRoles) {
      const parentRole = allRoles.get(this.parentRoleId);
      if (parentRole) {
        path.unshift(...parentRole.getHierarchyPath(allRoles));
      }
    }
    
    return path;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      roleId: this.roleId,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      type: this.type,
      permissions: this.permissions,
      parentRoleId: this.parentRoleId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive
    };
  }
}

/**
 * Standard system roles for WebWaka
 */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full platform access with audit logging',
    type: 'system' as const
  },
  PARTNER_ADMIN: {
    name: 'Partner Admin',
    description: 'Full access to partner resources',
    type: 'system' as const
  },
  CLIENT_ADMIN: {
    name: 'Client Admin',
    description: 'Full access to client resources',
    type: 'system' as const
  },
  TENANT_ADMIN: {
    name: 'Tenant Admin',
    description: 'Administrative access to tenant',
    type: 'system' as const
  },
  USER_MANAGER: {
    name: 'User Manager',
    description: 'Can manage users and roles',
    type: 'system' as const
  },
  AUDITOR: {
    name: 'Auditor',
    description: 'Read-only access to audit logs',
    type: 'system' as const
  },
  DEVELOPER: {
    name: 'Developer',
    description: 'Access to APIs and integrations',
    type: 'system' as const
  },
  VIEWER: {
    name: 'Viewer',
    description: 'Read-only access to resources',
    type: 'system' as const
  },
  EDITOR: {
    name: 'Editor',
    description: 'Can create and edit resources',
    type: 'system' as const
  },
  OPERATOR: {
    name: 'Operator',
    description: 'Can execute operations',
    type: 'system' as const
  }
};
