/**
 * AuditLog Model
 * Represents an immutable audit log entry for all IAM operations
 * Enforces INV-003: Audited Super Admin Access
 */

import { AuditLog, AuditAction, ActorType, ResourceType } from '../types';

export class AuditLogModel implements AuditLog {
  auditLogId: string;
  tenantId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId: string;
  resourceType: ResourceType;
  resourceId: string;
  changes?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  createdAt: Date;

  constructor(data: Partial<AuditLog>) {
    Object.assign(this, data);
    this.timestamp = this.timestamp || new Date();
    this.createdAt = this.createdAt || new Date();
    this.status = this.status || 'success';
  }

  /**
   * Check if this is a critical security event
   */
  isCriticalEvent(): boolean {
    const criticalActions = [
      AuditAction.SUPER_ADMIN_ACCESS,
      AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT,
      AuditAction.LOGIN_FAILED,
      AuditAction.USER_DELETED,
      AuditAction.ROLE_DELETED,
      AuditAction.PASSWORD_RESET
    ];
    return criticalActions.includes(this.action);
  }

  /**
   * Check if this is a super admin action
   */
  isSuperAdminAction(): boolean {
    return this.actorType === ActorType.SUPER_ADMIN;
  }

  /**
   * Check if this is a failed action
   */
  isFailed(): boolean {
    return this.status === 'failure';
  }

  /**
   * Get human-readable action description
   */
  getActionDescription(): string {
    const descriptions: Record<AuditAction, string> = {
      [AuditAction.LOGIN]: 'User logged in',
      [AuditAction.LOGOUT]: 'User logged out',
      [AuditAction.LOGIN_FAILED]: 'Login attempt failed',
      [AuditAction.PASSWORD_CHANGED]: 'Password changed',
      [AuditAction.PASSWORD_RESET]: 'Password reset',
      [AuditAction.MFA_ENABLED]: 'Two-factor authentication enabled',
      [AuditAction.MFA_DISABLED]: 'Two-factor authentication disabled',
      [AuditAction.MFA_VERIFIED]: 'Two-factor authentication verified',
      [AuditAction.SESSION_CREATED]: 'Session created',
      [AuditAction.SESSION_REVOKED]: 'Session revoked',
      [AuditAction.SESSION_EXPIRED]: 'Session expired',
      [AuditAction.DEVICE_TRUSTED]: 'Device marked as trusted',
      [AuditAction.DEVICE_REVOKED]: 'Device revoked',
      [AuditAction.USER_CREATED]: 'User created',
      [AuditAction.USER_UPDATED]: 'User updated',
      [AuditAction.USER_DELETED]: 'User deleted',
      [AuditAction.USER_SUSPENDED]: 'User suspended',
      [AuditAction.USER_REACTIVATED]: 'User reactivated',
      [AuditAction.ROLE_CREATED]: 'Role created',
      [AuditAction.ROLE_UPDATED]: 'Role updated',
      [AuditAction.ROLE_DELETED]: 'Role deleted',
      [AuditAction.ROLE_ASSIGNED]: 'Role assigned',
      [AuditAction.ROLE_REVOKED]: 'Role revoked',
      [AuditAction.PERMISSION_GRANTED]: 'Permission granted',
      [AuditAction.PERMISSION_REVOKED]: 'Permission revoked',
      [AuditAction.SUPER_ADMIN_ACCESS]: 'Super admin accessed tenant',
      [AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT]: 'Tenant isolation breach attempt'
    };
    return descriptions[this.action] || 'Unknown action';
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      auditLogId: this.auditLogId,
      tenantId: this.tenantId,
      action: this.action,
      actionDescription: this.getActionDescription(),
      actorType: this.actorType,
      actorId: this.actorId,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      changes: this.changes,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      status: this.status,
      errorMessage: this.errorMessage,
      metadata: this.metadata,
      timestamp: this.timestamp,
      createdAt: this.createdAt,
      isCriticalEvent: this.isCriticalEvent(),
      isSuperAdminAction: this.isSuperAdminAction()
    };
  }

  /**
   * Create a sanitized version for external consumption
   */
  toSafeJSON() {
    const json = this.toJSON();
    // Remove sensitive information
    delete json.userAgent;
    return json;
  }
}

/**
 * Audit log query builder for filtering and searching
 */
export class AuditLogQuery {
  private filters: Record<string, any> = {};
  private limit: number = 100;
  private offset: number = 0;
  private sortBy: string = 'timestamp';
  private sortOrder: 'asc' | 'desc' = 'desc';

  /**
   * Filter by tenant ID
   */
  byTenant(tenantId: string): this {
    this.filters.tenantId = tenantId;
    return this;
  }

  /**
   * Filter by action
   */
  byAction(action: AuditAction): this {
    this.filters.action = action;
    return this;
  }

  /**
   * Filter by actor
   */
  byActor(actorId: string): this {
    this.filters.actorId = actorId;
    return this;
  }

  /**
   * Filter by actor type
   */
  byActorType(actorType: ActorType): this {
    this.filters.actorType = actorType;
    return this;
  }

  /**
   * Filter by resource
   */
  byResource(resourceType: ResourceType, resourceId?: string): this {
    this.filters.resourceType = resourceType;
    if (resourceId) {
      this.filters.resourceId = resourceId;
    }
    return this;
  }

  /**
   * Filter by status
   */
  byStatus(status: 'success' | 'failure'): this {
    this.filters.status = status;
    return this;
  }

  /**
   * Filter by date range
   */
  byDateRange(startDate: Date, endDate: Date): this {
    this.filters.dateRange = { start: startDate, end: endDate };
    return this;
  }

  /**
   * Filter critical events only
   */
  criticalOnly(): this {
    this.filters.criticalOnly = true;
    return this;
  }

  /**
   * Set pagination limit
   */
  setLimit(limit: number): this {
    this.limit = Math.min(limit, 1000); // Max 1000 per query
    return this;
  }

  /**
   * Set pagination offset
   */
  setOffset(offset: number): this {
    this.offset = offset;
    return this;
  }

  /**
   * Set sort order
   */
  sortBy(field: string, order: 'asc' | 'desc' = 'desc'): this {
    this.sortBy = field;
    this.sortOrder = order;
    return this;
  }

  /**
   * Get the built query
   */
  build(): Record<string, any> {
    return {
      filters: this.filters,
      pagination: {
        limit: this.limit,
        offset: this.offset
      },
      sort: {
        field: this.sortBy,
        order: this.sortOrder
      }
    };
  }
}
