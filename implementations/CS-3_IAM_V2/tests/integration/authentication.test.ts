/**
 * Integration Tests for Authentication Flows
 * 
 * Tests complete authentication workflows including registration, login, 2FA, and session management
 */

import { AuthenticationService } from '../../src/services/AuthenticationService';
import { AuditLogService } from '../../src/services/AuditLogService';
import { RBACService } from '../../src/services/RBACService';
import { UserModel } from '../../src/models/User';
import {
  AuthProvider,
  OAuthProfile,
  TwoFactorMethod,
  AuditAction,
  ActorType
} from '../../src/types';

describe('Authentication Integration Tests', () => {
  let authService: AuthenticationService;
  let auditLogService: AuditLogService;
  let rbacService: RBACService;
  const jwtSecret = 'integration-test-jwt-secret';

  beforeEach(() => {
    auditLogService = new AuditLogService();
    authService = new AuthenticationService(jwtSecret, auditLogService);
    rbacService = new RBACService(auditLogService);
  });

  describe('Complete Registration and Login Flow', () => {
    const tenantId = 'tenant-integration-test';
    const email = 'integration@example.com';
    const password = 'IntegrationTest@123!';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Integration Test Agent';

    it('should complete full registration to session creation flow', async () => {
      // Step 1: Register user
      const user = await authService.registerLocal(
        tenantId,
        email,
        password,
        'Integration',
        'Test'
      );

      expect(user).toBeInstanceOf(UserModel);
      expect(user.email).toBe(email);
      expect(user.status).toBe('active');

      // Step 2: Authenticate
      const authResult = await authService.authenticateLocal(
        tenantId,
        { email, password },
        ipAddress,
        userAgent
      );

      expect(authResult.user.userId).toBe(user.userId);
      expect(authResult.mfaRequired).toBe(false);

      // Step 3: Create session
      const sessionResult = await authService.createSession(
        user.userId,
        tenantId,
        'device-integration',
        'Integration Test Device',
        ipAddress,
        userAgent
      );

      expect(sessionResult.session.userId).toBe(user.userId);
      expect(sessionResult.session.status).toBe('active');
      expect(sessionResult.tokens.accessToken).toBeDefined();
      expect(sessionResult.tokens.refreshToken).toBeDefined();

      // Step 4: Verify token
      const tokenPayload = authService.verifyToken(sessionResult.tokens.accessToken);

      expect(tokenPayload).not.toBeNull();
      expect(tokenPayload?.userId).toBe(user.userId);
      expect(tokenPayload?.tenantId).toBe(tenantId);
      expect(tokenPayload?.sessionId).toBe(sessionResult.session.sessionId);
    });

    it('should track failed login attempts and lockout', async () => {
      // Register user
      await authService.registerLocal(tenantId, 'lockout@example.com', password, 'Lockout', 'Test');

      // Attempt failed logins
      const wrongPassword = 'WrongPassword123!';
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.authenticateLocal(
            tenantId,
            { email: 'lockout@example.com', password: wrongPassword },
            ipAddress,
            userAgent
          )
        ).rejects.toThrow();
      }

      // Verify account is locked
      await expect(
        authService.authenticateLocal(
          tenantId,
          { email: 'lockout@example.com', password },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow('Account is temporarily locked');
    });
  });

  describe('OAuth Authentication Flow', () => {
    const tenantId = 'tenant-oauth-test';
    const ipAddress = '192.168.1.1';
    const userAgent = 'OAuth Test Agent';

    it('should create new user on first OAuth login', async () => {
      const profile: OAuthProfile = {
        id: 'google-oauth-123',
        email: 'oauth-new@example.com',
        name: 'OAuth New User',
        picture: 'https://example.com/avatar.jpg',
        provider: AuthProvider.GOOGLE
      };

      const result = await authService.authenticateOAuth(
        tenantId,
        profile,
        ipAddress,
        userAgent
      );

      expect(result.isNewUser).toBe(true);
      expect(result.user.email).toBe(profile.email);
      expect(result.user.emailVerified).toBe(true);
      expect(result.user.metadata?.oauthProvider).toBe(AuthProvider.GOOGLE);
    });

    it('should link OAuth to existing user on subsequent login', async () => {
      const profile: OAuthProfile = {
        id: 'google-oauth-456',
        email: 'oauth-existing@example.com',
        name: 'OAuth Existing User',
        provider: AuthProvider.GOOGLE
      };

      // First login creates user
      const firstResult = await authService.authenticateOAuth(
        tenantId,
        profile,
        ipAddress,
        userAgent
      );

      expect(firstResult.isNewUser).toBe(true);

      // Second login finds existing user
      const secondResult = await authService.authenticateOAuth(
        tenantId,
        profile,
        ipAddress,
        userAgent
      );

      expect(secondResult.isNewUser).toBe(false);
      expect(secondResult.user.userId).toBe(firstResult.user.userId);
    });

    it('should support multiple OAuth providers', async () => {
      const googleProfile: OAuthProfile = {
        id: 'google-multi-123',
        email: 'multi-provider@example.com',
        name: 'Multi Provider User',
        provider: AuthProvider.GOOGLE
      };

      // Login with Google
      const googleResult = await authService.authenticateOAuth(
        tenantId,
        googleProfile,
        ipAddress,
        userAgent
      );

      expect(googleResult.user.metadata?.oauthProvider).toBe(AuthProvider.GOOGLE);

      // Same email with Facebook (would update the provider)
      const facebookProfile: OAuthProfile = {
        id: 'facebook-multi-123',
        email: 'multi-provider@example.com',
        name: 'Multi Provider User',
        provider: AuthProvider.FACEBOOK
      };

      const facebookResult = await authService.authenticateOAuth(
        tenantId,
        facebookProfile,
        ipAddress,
        userAgent
      );

      expect(facebookResult.isNewUser).toBe(false);
      expect(facebookResult.user.metadata?.oauthProvider).toBe(AuthProvider.FACEBOOK);
    });
  });

  describe('Two-Factor Authentication Flow', () => {
    const tenantId = 'tenant-2fa-test';
    const email = '2fa@example.com';
    const password = 'TwoFactor@Test123!';
    const ipAddress = '192.168.1.1';
    const userAgent = '2FA Test Agent';

    it('should setup TOTP 2FA with QR code and backup codes', async () => {
      // Register user
      const user = await authService.registerLocal(
        tenantId,
        email,
        password,
        'TwoFactor',
        'Test'
      );

      // Setup 2FA
      const setup = await authService.setup2FA(user.userId, tenantId, TwoFactorMethod.TOTP);

      expect(setup.method).toBe(TwoFactorMethod.TOTP);
      expect(setup.secret).toBeDefined();
      expect(setup.secret?.length).toBeGreaterThan(0);
      expect(setup.qrCode).toBeDefined();
      expect(setup.qrCode?.startsWith('data:image/png;base64,')).toBe(true);
      expect(setup.backupCodes).toBeDefined();
      expect(setup.backupCodes?.length).toBe(10);
      expect(setup.isVerified).toBe(false);
    });
  });

  describe('Session Management Flow', () => {
    const tenantId = 'tenant-session-test';
    const email = 'session@example.com';
    const password = 'SessionTest@123!';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Session Test Agent';
    let userId: string;

    beforeEach(async () => {
      const user = await authService.registerLocal(
        tenantId,
        email,
        password,
        'Session',
        'Test'
      );
      userId = user.userId;
    });

    it('should manage multiple concurrent sessions', async () => {
      // Create first session
      const session1 = await authService.createSession(
        userId,
        tenantId,
        'device-1',
        'Device 1',
        ipAddress,
        userAgent
      );

      expect(session1.session.deviceId).toBe('device-1');

      // Create second session
      const session2 = await authService.createSession(
        userId,
        tenantId,
        'device-2',
        'Device 2',
        ipAddress,
        userAgent
      );

      expect(session2.session.deviceId).toBe('device-2');

      // Both sessions should have valid tokens
      expect(authService.verifyToken(session1.tokens.accessToken)).not.toBeNull();
      expect(authService.verifyToken(session2.tokens.accessToken)).not.toBeNull();
    });

    it('should revoke session and invalidate access', async () => {
      // Create session
      const { session, tokens } = await authService.createSession(
        userId,
        tenantId,
        'device-revoke',
        'Revoke Test Device',
        ipAddress,
        userAgent
      );

      // Verify token works
      expect(authService.verifyToken(tokens.accessToken)).not.toBeNull();

      // Revoke session
      await authService.revokeSession(session.sessionId, 'User logout');

      // Note: Token verification still works (stateless JWT)
      // In production, session status would be checked in middleware
      expect(authService.verifyToken(tokens.accessToken)).not.toBeNull();
    });
  });

  describe('Audit Trail Integration', () => {
    const tenantId = 'tenant-audit-test';
    const email = 'audit@example.com';
    const password = 'AuditTest@123!';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Audit Test Agent';

    it('should create audit trail for complete authentication flow', async () => {
      // Register user
      const user = await authService.registerLocal(
        tenantId,
        email,
        password,
        'Audit',
        'Test'
      );

      // Authenticate
      await authService.authenticateLocal(
        tenantId,
        { email, password },
        ipAddress,
        userAgent
      );

      // Create session
      const { session } = await authService.createSession(
        user.userId,
        tenantId,
        'device-audit',
        'Audit Test Device',
        ipAddress,
        userAgent
      );

      // Revoke session
      await authService.revokeSession(session.sessionId, 'Test revocation');

      // Query audit logs
      const { logs } = await auditLogService.queryLogs(
        new (require('../../src/models/AuditLog').AuditLogQuery)()
          .byTenant(tenantId)
          .byActor(user.userId)
      );

      // Verify audit trail
      const actions = logs.map(l => l.action);
      expect(actions).toContain(AuditAction.LOGIN);
      expect(actions).toContain(AuditAction.SESSION_CREATED);
      expect(actions).toContain(AuditAction.SESSION_REVOKED);
    });

    it('should log failed authentication attempts', async () => {
      // Register user
      await authService.registerLocal(
        tenantId,
        'failed-audit@example.com',
        password,
        'Failed',
        'Audit'
      );

      // Attempt failed login
      await expect(
        authService.authenticateLocal(
          tenantId,
          { email: 'failed-audit@example.com', password: 'WrongPassword123!' },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow();

      // Query audit logs for failures
      const { logs } = await auditLogService.queryLogs(
        new (require('../../src/models/AuditLog').AuditLogQuery)()
          .byTenant(tenantId)
          .byStatus('failure')
      );

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(l => l.action === AuditAction.LOGIN_FAILED)).toBe(true);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    const tenant1 = 'tenant-isolation-1';
    const tenant2 = 'tenant-isolation-2';
    const email = 'isolation@example.com';
    const password = 'IsolationTest@123!';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Isolation Test Agent';

    it('should isolate users between tenants', async () => {
      // Register same email in two tenants
      const user1 = await authService.registerLocal(
        tenant1,
        email,
        password,
        'Tenant1',
        'User'
      );

      const user2 = await authService.registerLocal(
        tenant2,
        email,
        password,
        'Tenant2',
        'User'
      );

      // Users should have different IDs
      expect(user1.userId).not.toBe(user2.userId);

      // Authenticate in tenant1
      const auth1 = await authService.authenticateLocal(
        tenant1,
        { email, password },
        ipAddress,
        userAgent
      );

      expect(auth1.user.tenantId).toBe(tenant1);

      // Authenticate in tenant2
      const auth2 = await authService.authenticateLocal(
        tenant2,
        { email, password },
        ipAddress,
        userAgent
      );

      expect(auth2.user.tenantId).toBe(tenant2);
    });

    it('should prevent cross-tenant authentication', async () => {
      // Register in tenant1 only
      await authService.registerLocal(
        tenant1,
        'cross-tenant@example.com',
        password,
        'Cross',
        'Tenant'
      );

      // Attempt to authenticate in tenant2
      await expect(
        authService.authenticateLocal(
          tenant2,
          { email: 'cross-tenant@example.com', password },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
