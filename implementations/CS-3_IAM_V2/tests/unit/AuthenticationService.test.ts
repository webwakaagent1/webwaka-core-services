/**
 * Unit Tests for AuthenticationService
 * 
 * Tests authentication flows including local login, OAuth, 2FA, and session management
 */

import { AuthenticationService } from '../../src/services/AuthenticationService';
import { AuditLogService } from '../../src/services/AuditLogService';
import { UserModel } from '../../src/models/User';
import { SessionModel } from '../../src/models/Session';
import {
  AuthCredentials,
  AuthProvider,
  OAuthProfile,
  TwoFactorMethod,
  UnauthorizedError,
  ValidationError
} from '../../src/types';

describe('AuthenticationService', () => {
  let authService: AuthenticationService;
  let auditLogService: AuditLogService;
  const jwtSecret = 'test-jwt-secret-for-testing';

  beforeEach(() => {
    auditLogService = new AuditLogService();
    authService = new AuthenticationService(jwtSecret, auditLogService);
    
    // Mock audit log service methods
    jest.spyOn(auditLogService, 'logAuthEvent').mockResolvedValue({} as any);
    jest.spyOn(auditLogService, 'logFailedAction').mockResolvedValue({} as any);
    jest.spyOn(auditLogService, 'logSessionEvent').mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerLocal', () => {
    const tenantId = 'tenant-123';
    const validEmail = 'test@example.com';
    const validPassword = 'StrongP@ssword123!';
    const firstName = 'John';
    const lastName = 'Doe';

    it('should register a new user with valid credentials', async () => {
      const user = await authService.registerLocal(
        tenantId,
        validEmail,
        validPassword,
        firstName,
        lastName
      );

      expect(user).toBeInstanceOf(UserModel);
      expect(user.email).toBe(validEmail);
      expect(user.tenantId).toBe(tenantId);
      expect(user.firstName).toBe(firstName);
      expect(user.lastName).toBe(lastName);
      expect(user.status).toBe('active');
      expect(user.emailVerified).toBe(false);
    });

    it('should throw ValidationError for invalid email format', async () => {
      await expect(
        authService.registerLocal(tenantId, 'invalid-email', validPassword, firstName, lastName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for weak password', async () => {
      await expect(
        authService.registerLocal(tenantId, validEmail, 'weak', firstName, lastName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for password without uppercase', async () => {
      await expect(
        authService.registerLocal(tenantId, validEmail, 'weakpassword123!', firstName, lastName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for password without numbers', async () => {
      await expect(
        authService.registerLocal(tenantId, validEmail, 'WeakPassword!!!', firstName, lastName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for password without special characters', async () => {
      await expect(
        authService.registerLocal(tenantId, validEmail, 'WeakPassword123', firstName, lastName)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for duplicate email in same tenant', async () => {
      await authService.registerLocal(tenantId, validEmail, validPassword, firstName, lastName);
      
      await expect(
        authService.registerLocal(tenantId, validEmail, validPassword, 'Jane', 'Doe')
      ).rejects.toThrow(ValidationError);
    });

    it('should allow same email in different tenants', async () => {
      await authService.registerLocal(tenantId, validEmail, validPassword, firstName, lastName);
      
      const user2 = await authService.registerLocal(
        'tenant-456',
        validEmail,
        validPassword,
        'Jane',
        'Doe'
      );

      expect(user2.tenantId).toBe('tenant-456');
    });
  });

  describe('authenticateLocal', () => {
    const tenantId = 'tenant-123';
    const email = 'test@example.com';
    const password = 'StrongP@ssword123!';
    const ipAddress = '127.0.0.1';
    const userAgent = 'Mozilla/5.0';

    beforeEach(async () => {
      await authService.registerLocal(tenantId, email, password, 'John', 'Doe');
    });

    it('should authenticate user with valid credentials', async () => {
      const result = await authService.authenticateLocal(
        tenantId,
        { email, password },
        ipAddress,
        userAgent
      );

      expect(result.user).toBeInstanceOf(UserModel);
      expect(result.user.email).toBe(email);
      expect(result.mfaRequired).toBe(false);
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      await expect(
        authService.authenticateLocal(
          tenantId,
          { email: 'nonexistent@example.com', password },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for wrong password', async () => {
      await expect(
        authService.authenticateLocal(
          tenantId,
          { email, password: 'WrongPassword123!' },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for user in different tenant', async () => {
      await expect(
        authService.authenticateLocal(
          'tenant-999',
          { email, password },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should lock account after 5 failed attempts', async () => {
      const wrongCredentials = { email, password: 'WrongPassword123!' };

      // Attempt 5 failed logins
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.authenticateLocal(tenantId, wrongCredentials, ipAddress, userAgent)
        ).rejects.toThrow(UnauthorizedError);
      }

      // 6th attempt should fail with locked account
      await expect(
        authService.authenticateLocal(tenantId, { email, password }, ipAddress, userAgent)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should log failed authentication attempts', async () => {
      await expect(
        authService.authenticateLocal(
          tenantId,
          { email, password: 'WrongPassword123!' },
          ipAddress,
          userAgent
        )
      ).rejects.toThrow(UnauthorizedError);

      expect(auditLogService.logFailedAction).toHaveBeenCalled();
    });

    it('should log successful authentication', async () => {
      await authService.authenticateLocal(
        tenantId,
        { email, password },
        ipAddress,
        userAgent
      );

      expect(auditLogService.logAuthEvent).toHaveBeenCalled();
    });
  });

  describe('authenticateOAuth', () => {
    const tenantId = 'tenant-123';
    const ipAddress = '127.0.0.1';
    const userAgent = 'Mozilla/5.0';

    it('should create new user for first-time OAuth login', async () => {
      const profile: OAuthProfile = {
        id: 'google-123',
        email: 'oauth@example.com',
        name: 'OAuth User',
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
      expect(result.user.firstName).toBe('OAuth');
      expect(result.user.lastName).toBe('User');
      expect(result.user.emailVerified).toBe(true);
    });

    it('should return existing user for returning OAuth login', async () => {
      const profile: OAuthProfile = {
        id: 'google-123',
        email: 'oauth@example.com',
        name: 'OAuth User',
        provider: AuthProvider.GOOGLE
      };

      // First login
      await authService.authenticateOAuth(tenantId, profile, ipAddress, userAgent);

      // Second login
      const result = await authService.authenticateOAuth(
        tenantId,
        profile,
        ipAddress,
        userAgent
      );

      expect(result.isNewUser).toBe(false);
      expect(result.user.email).toBe(profile.email);
    });

    it('should log OAuth authentication', async () => {
      const profile: OAuthProfile = {
        id: 'google-123',
        email: 'oauth@example.com',
        name: 'OAuth User',
        provider: AuthProvider.GOOGLE
      };

      await authService.authenticateOAuth(tenantId, profile, ipAddress, userAgent);

      expect(auditLogService.logAuthEvent).toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    const tenantId = 'tenant-123';
    const email = 'test@example.com';
    const password = 'StrongP@ssword123!';
    const deviceId = 'device-123';
    const deviceName = 'Chrome on Windows';
    const ipAddress = '127.0.0.1';
    const userAgent = 'Mozilla/5.0';

    let userId: string;

    beforeEach(async () => {
      const user = await authService.registerLocal(tenantId, email, password, 'John', 'Doe');
      userId = user.userId;
    });

    it('should create a session with valid tokens', async () => {
      const result = await authService.createSession(
        userId,
        tenantId,
        deviceId,
        deviceName,
        ipAddress,
        userAgent
      );

      expect(result.session).toBeInstanceOf(SessionModel);
      expect(result.session.userId).toBe(userId);
      expect(result.session.tenantId).toBe(tenantId);
      expect(result.session.status).toBe('active');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.tokens.tokenType).toBe('Bearer');
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      await expect(
        authService.createSession(
          'non-existent-user',
          tenantId,
          deviceId,
          deviceName,
          ipAddress,
          userAgent
        )
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should log session creation', async () => {
      await authService.createSession(
        userId,
        tenantId,
        deviceId,
        deviceName,
        ipAddress,
        userAgent
      );

      expect(auditLogService.logSessionEvent).toHaveBeenCalled();
    });
  });

  describe('setup2FA', () => {
    const tenantId = 'tenant-123';
    const email = 'test@example.com';
    const password = 'StrongP@ssword123!';
    let userId: string;

    beforeEach(async () => {
      const user = await authService.registerLocal(tenantId, email, password, 'John', 'Doe');
      userId = user.userId;
    });

    it('should setup TOTP 2FA with secret and QR code', async () => {
      const setup = await authService.setup2FA(userId, tenantId, TwoFactorMethod.TOTP);

      expect(setup.method).toBe(TwoFactorMethod.TOTP);
      expect(setup.secret).toBeDefined();
      expect(setup.qrCode).toBeDefined();
      expect(setup.backupCodes).toBeDefined();
      expect(setup.backupCodes?.length).toBe(10);
      expect(setup.isVerified).toBe(false);
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      await expect(
        authService.setup2FA('non-existent-user', tenantId, TwoFactorMethod.TOTP)
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('revokeSession', () => {
    const tenantId = 'tenant-123';
    const email = 'test@example.com';
    const password = 'StrongP@ssword123!';
    let sessionId: string;

    beforeEach(async () => {
      const user = await authService.registerLocal(tenantId, email, password, 'John', 'Doe');
      const result = await authService.createSession(
        user.userId,
        tenantId,
        'device-123',
        'Test Device',
        '127.0.0.1',
        'Mozilla/5.0'
      );
      sessionId = result.session.sessionId;
    });

    it('should revoke an existing session', async () => {
      await authService.revokeSession(sessionId, 'User logout');

      expect(auditLogService.logSessionEvent).toHaveBeenCalled();
    });

    it('should not throw for non-existent session', async () => {
      await expect(
        authService.revokeSession('non-existent-session', 'Test')
      ).resolves.not.toThrow();
    });
  });

  describe('verifyToken', () => {
    const tenantId = 'tenant-123';
    const email = 'test@example.com';
    const password = 'StrongP@ssword123!';
    let accessToken: string;
    let userId: string;
    let sessionId: string;

    beforeEach(async () => {
      const user = await authService.registerLocal(tenantId, email, password, 'John', 'Doe');
      userId = user.userId;
      const result = await authService.createSession(
        userId,
        tenantId,
        'device-123',
        'Test Device',
        '127.0.0.1',
        'Mozilla/5.0'
      );
      accessToken = result.tokens.accessToken;
      sessionId = result.session.sessionId;
    });

    it('should verify valid token and return payload', () => {
      const payload = authService.verifyToken(accessToken);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(userId);
      expect(payload?.tenantId).toBe(tenantId);
      expect(payload?.sessionId).toBe(sessionId);
    });

    it('should return null for invalid token', () => {
      const payload = authService.verifyToken('invalid-token');

      expect(payload).toBeNull();
    });

    it('should return null for tampered token', () => {
      const tamperedToken = accessToken + 'tampered';
      const payload = authService.verifyToken(tamperedToken);

      expect(payload).toBeNull();
    });
  });
});
