/**
 * Unit Tests for Tenant Context Middleware
 * 
 * Tests for INV-002: Strict Tenant Isolation
 * Covers: tenantContextMiddleware, verifyTenantOwnership, requireSuperAdminWithAudit, scopeToTenant
 */

import { Request, Response, NextFunction } from 'express';
import {
  extractTenantContext,
  tenantContextMiddleware,
  verifyTenantOwnership,
  verifyResourceTenant,
  requireSuperAdminWithAudit,
  scopeToTenant
} from '../../src/middleware/tenantContext';
import { AuditLogService } from '../../src/services/AuditLogService';
import { TenantIsolationError, ActorType } from '../../src/types';

// Mock Express Request, Response, and NextFunction
const mockRequest = (headers: Record<string, string> = {}): Partial<Request> => ({
  headers,
  path: '/api/test',
  method: 'GET',
  ip: '127.0.0.1'
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    locals: {}
  };
  return res;
};

const mockNext: NextFunction = jest.fn();

describe('Tenant Context Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractTenantContext', () => {
    it('should extract tenant context from valid headers', () => {
      const req = mockRequest({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-456',
        'x-actor-type': ActorType.END_USER
      }) as Request;

      const context = extractTenantContext(req);

      expect(context.tenantId).toBe('tenant-123');
      expect(context.actorId).toBe('user-456');
      expect(context.actorType).toBe(ActorType.END_USER);
    });

    it('should throw TenantIsolationError when tenant ID is missing', () => {
      const req = mockRequest({
        'x-user-id': 'user-456',
        'x-actor-type': ActorType.END_USER
      }) as Request;

      expect(() => extractTenantContext(req)).toThrow(TenantIsolationError);
    });

    it('should throw TenantIsolationError when user ID is missing', () => {
      const req = mockRequest({
        'x-tenant-id': 'tenant-123',
        'x-actor-type': ActorType.END_USER
      }) as Request;

      expect(() => extractTenantContext(req)).toThrow(TenantIsolationError);
    });

    it('should throw TenantIsolationError when actor type is missing', () => {
      const req = mockRequest({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-456'
      }) as Request;

      expect(() => extractTenantContext(req)).toThrow(TenantIsolationError);
    });

    it('should include optional partner and client IDs when present', () => {
      const req = mockRequest({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-456',
        'x-actor-type': ActorType.PARTNER,
        'x-partner-id': 'partner-789',
        'x-client-id': 'client-012'
      }) as Request;

      const context = extractTenantContext(req);

      expect(context.partnerId).toBe('partner-789');
      expect(context.clientId).toBe('client-012');
    });
  });

  describe('tenantContextMiddleware', () => {
    it('should attach tenant context to request on valid headers', () => {
      const req = mockRequest({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-456',
        'x-actor-type': ActorType.END_USER
      }) as Request;
      const res = mockResponse() as Response;

      tenantContextMiddleware(req, res, mockNext);

      expect(req.tenantContext).toBeDefined();
      expect(req.tenantContext?.tenantId).toBe('tenant-123');
      expect(req.userId).toBe('user-456');
      expect(req.actorType).toBe(ActorType.END_USER);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when tenant context extraction fails', () => {
      const req = mockRequest({}) as Request;
      const res = mockResponse() as Response;

      tenantContextMiddleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'TENANT_ISOLATION_ERROR',
        message: 'Failed to establish tenant context'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('verifyTenantOwnership', () => {
    it('should not throw when tenant IDs match', () => {
      expect(() => {
        verifyTenantOwnership('tenant-123', 'tenant-123');
      }).not.toThrow();
    });

    it('should throw TenantIsolationError when tenant IDs do not match', () => {
      expect(() => {
        verifyTenantOwnership('tenant-123', 'tenant-456');
      }).toThrow(TenantIsolationError);
    });

    it('should include tenant IDs in error details', () => {
      try {
        verifyTenantOwnership('tenant-123', 'tenant-456');
      } catch (error) {
        expect(error).toBeInstanceOf(TenantIsolationError);
        expect((error as TenantIsolationError).details).toEqual({
          resourceTenantId: 'tenant-123',
          requestTenantId: 'tenant-456'
        });
      }
    });
  });

  describe('verifyResourceTenant', () => {
    it('should call next when resource belongs to tenant', async () => {
      const req = mockRequest({
        'x-tenant-id': 'tenant-123',
        'x-user-id': 'user-456',
        'x-actor-type': ActorType.END_USER
      }) as Request;
      req.tenantContext = {
        tenantId: 'tenant-123',
        actorId: 'user-456',
        actorType: ActorType.END_USER
      };
      const res = mockResponse() as Response;
      const getTenantId = jest.fn().mockResolvedValue('tenant-123');

      const middleware = verifyResourceTenant(getTenantId);
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when resource belongs to different tenant', async () => {
      const req = mockRequest({}) as Request;
      req.tenantContext = {
        tenantId: 'tenant-123',
        actorId: 'user-456',
        actorType: ActorType.END_USER
      };
      const res = mockResponse() as Response;
      const getTenantId = jest.fn().mockResolvedValue('tenant-999');

      const middleware = verifyResourceTenant(getTenantId);
      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when no tenant context is available', async () => {
      const req = mockRequest({}) as Request;
      const res = mockResponse() as Response;
      const getTenantId = jest.fn().mockResolvedValue('tenant-123');

      const middleware = verifyResourceTenant(getTenantId);
      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireSuperAdminWithAudit', () => {
    let auditLogService: AuditLogService;

    beforeEach(() => {
      auditLogService = new AuditLogService();
      jest.spyOn(auditLogService, 'logSuperAdminAccess').mockResolvedValue({} as any);
      jest.spyOn(auditLogService, 'logFailedAction').mockResolvedValue({} as any);
    });

    it('should allow super admin access and log it', async () => {
      const req = mockRequest({}) as Request;
      req.tenantContext = {
        tenantId: 'tenant-123',
        actorId: 'super-admin-456',
        actorType: ActorType.SUPER_ADMIN
      };
      const res = mockResponse() as Response;

      const middleware = requireSuperAdminWithAudit(auditLogService);
      await middleware(req, res, mockNext);

      expect(auditLogService.logSuperAdminAccess).toHaveBeenCalledWith(
        'tenant-123',
        'super-admin-456',
        '/api/test',
        '127.0.0.1',
        expect.any(String)
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny non-super admin access and log the attempt', async () => {
      const req = mockRequest({}) as Request;
      req.tenantContext = {
        tenantId: 'tenant-123',
        actorId: 'user-456',
        actorType: ActorType.END_USER
      };
      const res = mockResponse() as Response;

      const middleware = requireSuperAdminWithAudit(auditLogService);
      await middleware(req, res, mockNext);

      expect(auditLogService.logFailedAction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when no tenant context is available', async () => {
      const req = mockRequest({}) as Request;
      const res = mockResponse() as Response;

      const middleware = requireSuperAdminWithAudit(auditLogService);
      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('scopeToTenant', () => {
    it('should store tenant ID in response locals', () => {
      const req = mockRequest({}) as Request;
      req.tenantContext = {
        tenantId: 'tenant-123',
        actorId: 'user-456',
        actorType: ActorType.END_USER
      };
      const res = mockResponse() as Response;

      scopeToTenant(req, res, mockNext);

      expect(res.locals.tenantId).toBe('tenant-123');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when no tenant context is available', () => {
      const req = mockRequest({}) as Request;
      const res = mockResponse() as Response;

      scopeToTenant(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'TENANT_ISOLATION_ERROR',
        message: 'No tenant context available'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
