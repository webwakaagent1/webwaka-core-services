/**
 * Tenant Context Middleware
 * Enforces INV-002: Strict Tenant Isolation
 * Ensures all operations are scoped to the correct tenant
 */

import { Request, Response, NextFunction } from 'express';
import { TenantContext, ActorType, TenantIsolationError } from '../types';
import { AuditLogService } from '../services/AuditLogService';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      userId?: string;
      actorType?: ActorType;
    }
  }
}

/**
 * Extract tenant context from JWT token or request headers
 */
export function extractTenantContext(req: Request): TenantContext {
  // In a real implementation, this would extract from JWT token
  // For now, we'll use headers as a placeholder
  
  const tenantId = req.headers['x-tenant-id'] as string;
  const userId = req.headers['x-user-id'] as string;
  const actorType = req.headers['x-actor-type'] as ActorType;
  
  if (!tenantId || !userId || !actorType) {
    throw new TenantIsolationError('Missing tenant context headers');
  }
  
  return {
    tenantId,
    actorId: userId,
    actorType,
    partnerId: req.headers['x-partner-id'] as string | undefined,
    clientId: req.headers['x-client-id'] as string | undefined
  };
}

/**
 * Middleware to enforce tenant isolation on all requests
 */
export function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extract tenant context from request
    const tenantContext = extractTenantContext(req);
    
    // Attach to request for downstream use
    req.tenantContext = tenantContext;
    req.userId = tenantContext.actorId;
    req.actorType = tenantContext.actorType;
    
    // Log the request with tenant context
    logger.debug('Tenant context established', {
      tenantId: tenantContext.tenantId,
      userId: tenantContext.actorId,
      actorType: tenantContext.actorType,
      path: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    logger.error('Tenant context extraction failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
      headers: req.headers
    });
    
    res.status(403).json({
      error: 'TENANT_ISOLATION_ERROR',
      message: 'Failed to establish tenant context'
    });
  }
}

/**
 * Verify that a resource belongs to the current tenant
 * This is a critical security check to prevent cross-tenant access
 */
export function verifyTenantOwnership(
  resourceTenantId: string,
  requestTenantId: string
): void {
  if (resourceTenantId !== requestTenantId) {
    logger.error('Tenant isolation breach attempt detected', {
      resourceTenantId,
      requestTenantId,
      timestamp: new Date().toISOString()
    });
    
    throw new TenantIsolationError(
      'Resource does not belong to the current tenant',
      {
        resourceTenantId,
        requestTenantId
      }
    );
  }
}

/**
 * Middleware to verify tenant ownership of a resource
 * Usage: app.get('/api/users/:id', verifyResourceTenant(getUserTenant), handler)
 */
export function verifyResourceTenant(
  getTenantId: (req: Request) => Promise<string>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantContext) {
        throw new TenantIsolationError('No tenant context available');
      }
      
      const resourceTenantId = await getTenantId(req);
      verifyTenantOwnership(resourceTenantId, req.tenantContext.tenantId);
      
      next();
    } catch (error) {
      if (error instanceof TenantIsolationError) {
        res.status(403).json({
          error: error.code,
          message: error.message,
          details: error.details
        });
      } else {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Failed to verify tenant ownership'
        });
      }
    }
  };
}

/**
 * Enforce super admin access with audit logging (INV-003)
 */
export function requireSuperAdminWithAudit(
  auditLogService: AuditLogService
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantContext) {
        throw new TenantIsolationError('No tenant context available');
      }
      
      if (req.tenantContext.actorType !== ActorType.SUPER_ADMIN) {
        // Log the unauthorized access attempt
        await auditLogService.logFailedAction(
          req.tenantContext.tenantId,
          req.tenantContext.actorType,
          req.tenantContext.actorId,
          'Unauthorized super admin access attempt',
          req.ip || 'unknown',
          req.headers['user-agent'] || 'unknown'
        );
        
        throw new TenantIsolationError('Super admin access required');
      }
      
      // Log successful super admin access
      await auditLogService.logSuperAdminAccess(
        req.tenantContext.tenantId,
        req.tenantContext.actorId,
        req.path,
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );
      
      next();
    } catch (error) {
      if (error instanceof TenantIsolationError) {
        res.status(403).json({
          error: error.code,
          message: error.message
        });
      } else {
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Failed to verify super admin access'
        });
      }
    }
  };
}

/**
 * Middleware to add tenant ID to all queries
 * Ensures that database queries are automatically scoped to the tenant
 */
export function scopeToTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantContext) {
    res.status(403).json({
      error: 'TENANT_ISOLATION_ERROR',
      message: 'No tenant context available'
    });
    return;
  }
  
  // Store tenant ID for use in database queries
  res.locals.tenantId = req.tenantContext.tenantId;
  
  next();
}
