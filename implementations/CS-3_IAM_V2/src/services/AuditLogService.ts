/**
 * AuditLogService
 * Manages immutable audit logs for all IAM operations
 * Enforces INV-003: Audited Super Admin Access
 */

import { v4 as uuidv4 } from 'uuid';
import { AuditLogModel, AuditLogQuery } from '../models/AuditLog';
import {
  AuditLog,
  AuditAction,
  ActorType,
  ResourceType,
  AuditLogModel as AuditLogType
} from '../types';
import { logger } from '../utils/logger';

export class AuditLogService {
  private logs: Map<string, AuditLogModel> = new Map();
  private criticalEventHandlers: Array<(log: AuditLogModel) => Promise<void>> = [];

  /**
   * Log an authentication event
   */
  async logAuthEvent(
    tenantId: string,
    userId: string,
    action: AuditAction,
    ipAddress: string,
    userAgent: string,
    status: 'success' | 'failure' = 'success',
    errorMessage?: string
  ): Promise<AuditLogModel> {
    return this.createAuditLog({
      tenantId,
      action,
      actorType: ActorType.END_USER,
      actorId: userId,
      resourceType: ResourceType.USER,
      resourceId: userId,
      ipAddress,
      userAgent,
      status,
      errorMessage
    });
  }

  /**
   * Log a user management event
   */
  async logUserManagementEvent(
    tenantId: string,
    action: AuditAction,
    userId: string,
    targetUserId: string,
    actorType: ActorType,
    actorId: string,
    ipAddress: string,
    userAgent: string,
    changes?: Record<string, any>
  ): Promise<AuditLogModel> {
    return this.createAuditLog({
      tenantId,
      action,
      actorType,
      actorId,
      resourceType: ResourceType.USER,
      resourceId: targetUserId,
      changes,
      ipAddress,
      userAgent,
      status: 'success'
    });
  }

  /**
   * Log a role management event
   */
  async logRoleManagementEvent(
    tenantId: string,
    action: AuditAction,
    roleId: string,
    actorType: ActorType,
    actorId: string,
    ipAddress: string,
    userAgent: string,
    changes?: Record<string, any>
  ): Promise<AuditLogModel> {
    return this.createAuditLog({
      tenantId,
      action,
      actorType,
      actorId,
      resourceType: ResourceType.ROLE,
      resourceId: roleId,
      changes,
      ipAddress,
      userAgent,
      status: 'success'
    });
  }

  /**
   * Log a session event
   */
  async logSessionEvent(
    tenantId: string,
    userId: string,
    action: AuditAction,
    sessionId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuditLogModel> {
    return this.createAuditLog({
      tenantId,
      action,
      actorType: ActorType.END_USER,
      actorId: userId,
      resourceType: ResourceType.SESSION,
      resourceId: sessionId,
      ipAddress,
      userAgent,
      status: 'success'
    });
  }

  /**
   * Log a super admin access event (INV-003)
   */
  async logSuperAdminAccess(
    tenantId: string,
    superAdminId: string,
    action: string,
    ipAddress: string,
    userAgent: string,
    metadata?: Record<string, any>
  ): Promise<AuditLogModel> {
    const log = await this.createAuditLog({
      tenantId,
      action: AuditAction.SUPER_ADMIN_ACCESS,
      actorType: ActorType.SUPER_ADMIN,
      actorId: superAdminId,
      resourceType: ResourceType.TENANT,
      resourceId: tenantId,
      ipAddress,
      userAgent,
      status: 'success',
      metadata: {
        action,
        ...metadata
      }
    });

    // Trigger critical event handlers
    await this.notifyCriticalEvent(log);

    return log;
  }

  /**
   * Log a tenant isolation breach attempt (INV-002)
   */
  async logTenantIsolationBreach(
    attemptedTenantId: string,
    requestTenantId: string,
    actorId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuditLogModel> {
    const log = await this.createAuditLog({
      tenantId: requestTenantId,
      action: AuditAction.TENANT_ISOLATION_BREACH_ATTEMPT,
      actorType: ActorType.END_USER,
      actorId,
      resourceType: ResourceType.TENANT,
      resourceId: attemptedTenantId,
      ipAddress,
      userAgent,
      status: 'failure',
      errorMessage: 'Attempted to access resource from different tenant'
    });

    // Trigger critical event handlers
    await this.notifyCriticalEvent(log);

    return log;
  }

  /**
   * Log a failed action
   */
  async logFailedAction(
    tenantId: string,
    actorType: ActorType,
    actorId: string,
    errorMessage: string,
    ipAddress: string,
    userAgent: string,
    action: AuditAction = AuditAction.LOGIN_FAILED
  ): Promise<AuditLogModel> {
    return this.createAuditLog({
      tenantId,
      action,
      actorType,
      actorId,
      resourceType: ResourceType.USER,
      resourceId: actorId,
      ipAddress,
      userAgent,
      status: 'failure',
      errorMessage
    });
  }

  /**
   * Create an audit log entry (internal)
   */
  private async createAuditLog(data: Partial<AuditLogType>): Promise<AuditLogModel> {
    const log = new AuditLogModel({
      auditLogId: uuidv4(),
      ...data,
      timestamp: new Date(),
      createdAt: new Date()
    });

    // Store in memory (in production, this would be persisted to database)
    this.logs.set(log.auditLogId, log);

    // Log to application logger
    logger.info('Audit log created', {
      auditLogId: log.auditLogId,
      action: log.action,
      actorType: log.actorType,
      resourceType: log.resourceType,
      status: log.status
    });

    // Notify critical event handlers if this is a critical event
    if (log.isCriticalEvent()) {
      await this.notifyCriticalEvent(log);
    }

    return log;
  }

  /**
   * Query audit logs
   */
  async queryLogs(query: AuditLogQuery): Promise<{ logs: AuditLogModel[]; total: number }> {
    const builtQuery = query.build();
    const filters = builtQuery.filters;

    // Filter logs based on query
    let results = Array.from(this.logs.values()).filter(log => {
      if (filters.tenantId && log.tenantId !== filters.tenantId) return false;
      if (filters.action && log.action !== filters.action) return false;
      if (filters.actorId && log.actorId !== filters.actorId) return false;
      if (filters.actorType && log.actorType !== filters.actorType) return false;
      if (filters.resourceType && log.resourceType !== filters.resourceType) return false;
      if (filters.resourceId && log.resourceId !== filters.resourceId) return false;
      if (filters.status && log.status !== filters.status) return false;
      if (filters.criticalOnly && !log.isCriticalEvent()) return false;
      if (filters.dateRange) {
        const ts = log.timestamp.getTime();
        if (ts < filters.dateRange.start.getTime() || ts > filters.dateRange.end.getTime()) {
          return false;
        }
      }
      return true;
    });

    // Sort
    results.sort((a, b) => {
      const aVal = a[builtQuery.sort.field as keyof AuditLogModel];
      const bVal = b[builtQuery.sort.field as keyof AuditLogModel];
      
      if (aVal < bVal) return builtQuery.sort.order === 'asc' ? -1 : 1;
      if (aVal > bVal) return builtQuery.sort.order === 'asc' ? 1 : -1;
      return 0;
    });

    // Paginate
    const total = results.length;
    const { limit, offset } = builtQuery.pagination;
    results = results.slice(offset, offset + limit);

    return { logs: results, total };
  }

  /**
   * Get audit log by ID
   */
  async getLogById(auditLogId: string): Promise<AuditLogModel | null> {
    return this.logs.get(auditLogId) || null;
  }

  /**
   * Export audit logs (for compliance)
   */
  async exportLogs(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const query = new AuditLogQuery()
      .byTenant(tenantId)
      .byDateRange(startDate, endDate)
      .setLimit(10000);

    const { logs } = await this.queryLogs(query);

    if (format === 'json') {
      return JSON.stringify(logs.map(l => l.toJSON()), null, 2);
    } else {
      // CSV export
      const headers = [
        'Audit Log ID',
        'Timestamp',
        'Action',
        'Actor Type',
        'Actor ID',
        'Resource Type',
        'Resource ID',
        'Status',
        'IP Address'
      ];

      const rows = logs.map(log => [
        log.auditLogId,
        log.timestamp.toISOString(),
        log.action,
        log.actorType,
        log.actorId,
        log.resourceType,
        log.resourceId,
        log.status,
        log.ipAddress
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return csv;
    }
  }

  /**
   * Register a handler for critical events
   */
  onCriticalEvent(handler: (log: AuditLogModel) => Promise<void>): void {
    this.criticalEventHandlers.push(handler);
  }

  /**
   * Notify all critical event handlers
   */
  private async notifyCriticalEvent(log: AuditLogModel): Promise<void> {
    for (const handler of this.criticalEventHandlers) {
      try {
        await handler(log);
      } catch (error) {
        logger.error('Critical event handler failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          auditLogId: log.auditLogId
        });
      }
    }
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(tenantId: string): Promise<Record<string, any>> {
    const logs = Array.from(this.logs.values()).filter(l => l.tenantId === tenantId);

    const stats = {
      totalLogs: logs.length,
      failedActions: logs.filter(l => l.isFailed()).length,
      criticalEvents: logs.filter(l => l.isCriticalEvent()).length,
      superAdminAccess: logs.filter(l => l.isSuperAdminAction()).length,
      actionBreakdown: {} as Record<string, number>,
      actorTypeBreakdown: {} as Record<string, number>
    };

    logs.forEach(log => {
      stats.actionBreakdown[log.action] = (stats.actionBreakdown[log.action] || 0) + 1;
      stats.actorTypeBreakdown[log.actorType] = (stats.actorTypeBreakdown[log.actorType] || 0) + 1;
    });

    return stats;
  }
}

// Export singleton instance
export const auditLogService = new AuditLogService();
