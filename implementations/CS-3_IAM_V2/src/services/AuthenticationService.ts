/**
 * AuthenticationService
 * Handles user authentication including local login, social login, and 2FA
 */

import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { UserModel } from '../models/User';
import { SessionModel, DEFAULT_SESSION_POLICIES } from '../models/Session';
import { AuditLogService } from './AuditLogService';
import {
  User,
  AuthCredentials,
  AuthToken,
  OAuthProfile,
  AuthProvider,
  TwoFactorMethod,
  TwoFactorSetup,
  TwoFactorChallenge,
  UnauthorizedError,
  ValidationError,
  ActorType,
  AuditAction
} from '../types';
import { logger } from '../utils/logger';

export class AuthenticationService {
  private jwtSecret: string;
  private accessTokenExpiry: string = '1h';
  private refreshTokenExpiry: string = '7d';
  private users: Map<string, UserModel> = new Map();
  private sessions: Map<string, SessionModel> = new Map();
  private twoFactorChallenges: Map<string, TwoFactorChallenge> = new Map();

  constructor(
    jwtSecret: string,
    private auditLogService: AuditLogService
  ) {
    this.jwtSecret = jwtSecret;
  }

  /**
   * Register a new user with local credentials
   */
  async registerLocal(
    tenantId: string,
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<UserModel> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    // Validate password strength
    if (!this.isStrongPassword(password)) {
      throw new ValidationError(
        'Password must be at least 12 characters and contain uppercase, numbers, and special characters'
      );
    }

    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(
      u => u.tenantId === tenantId && u.email === email
    );

    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = new UserModel({
      userId: uuidv4(),
      tenantId,
      email,
      emailVerified: false,
      firstName,
      lastName,
      passwordHash,
      status: 'active',
      preferredLanguage: 'en',
      timezone: 'UTC',
      roles: []
    });

    this.users.set(user.userId, user);

    logger.info('User registered', {
      userId: user.userId,
      email: user.email,
      tenantId
    });

    return user;
  }

  /**
   * Authenticate user with local credentials
   */
  async authenticateLocal(
    tenantId: string,
    credentials: AuthCredentials,
    ipAddress: string,
    userAgent: string
  ): Promise<{ user: UserModel; mfaRequired: boolean; challengeId?: string }> {
    // Find user by email
    const user = Array.from(this.users.values()).find(
      u => u.tenantId === tenantId && u.email === credentials.email
    );

    if (!user) {
      await this.auditLogService.logFailedAction(
        tenantId,
        ActorType.END_USER,
        credentials.email,
        'User not found',
        ipAddress,
        userAgent,
        AuditAction.LOGIN_FAILED
      );
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if user is locked out
    if (user.isLockedOut()) {
      await this.auditLogService.logFailedAction(
        tenantId,
        ActorType.END_USER,
        user.userId,
        'User account locked',
        ipAddress,
        userAgent,
        AuditAction.LOGIN_FAILED
      );
      throw new UnauthorizedError('Account is temporarily locked');
    }

    // Verify password
    if (!user.passwordHash || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
      user.loginAttempts++;
      if (user.loginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
      }
      this.users.set(user.userId, user);

      await this.auditLogService.logFailedAction(
        tenantId,
        ActorType.END_USER,
        user.userId,
        'Invalid password',
        ipAddress,
        userAgent,
        AuditAction.LOGIN_FAILED
      );
      throw new UnauthorizedError('Invalid credentials');
    }

    // Reset login attempts
    user.loginAttempts = 0;
    user.lastLoginAt = new Date();
    this.users.set(user.userId, user);

    // Check if 2FA is required
    if (user.has2FAEnabled()) {
      const challenge = await this.createTwoFactorChallenge(user.userId, tenantId);
      return {
        user,
        mfaRequired: true,
        challengeId: challenge.challengeId
      };
    }

    // Log successful login
    await this.auditLogService.logAuthEvent(
      tenantId,
      user.userId,
      AuditAction.LOGIN,
      ipAddress,
      userAgent,
      'success'
    );

    return { user, mfaRequired: false };
  }

  /**
   * Authenticate with OAuth provider
   */
  async authenticateOAuth(
    tenantId: string,
    profile: OAuthProfile,
    ipAddress: string,
    userAgent: string
  ): Promise<{ user: UserModel; isNewUser: boolean }> {
    // Find or create user
    let user = Array.from(this.users.values()).find(
      u => u.tenantId === tenantId && u.email === profile.email
    );

    const isNewUser = !user;

    if (!user) {
      user = new UserModel({
        userId: uuidv4(),
        tenantId,
        email: profile.email,
        emailVerified: true,
        firstName: profile.name.split(' ')[0],
        lastName: profile.name.split(' ').slice(1).join(' '),
        profilePicture: profile.picture,
        status: 'active',
        preferredLanguage: 'en',
        timezone: 'UTC',
        roles: [],
        metadata: {
          oauthProvider: profile.provider,
          oauthId: profile.id
        }
      });
      this.users.set(user.userId, user);
    } else {
      // Update OAuth metadata
      if (!user.metadata) user.metadata = {};
      user.metadata.oauthProvider = profile.provider;
      user.metadata.oauthId = profile.id;
      user.lastLoginAt = new Date();
      this.users.set(user.userId, user);
    }

    await this.auditLogService.logAuthEvent(
      tenantId,
      user.userId,
      AuditAction.LOGIN,
      ipAddress,
      userAgent,
      'success'
    );

    return { user, isNewUser };
  }

  /**
   * Create a session for authenticated user
   */
  async createSession(
    userId: string,
    tenantId: string,
    deviceId: string,
    deviceName: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ session: SessionModel; tokens: AuthToken }> {
    const user = this.users.get(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Get session policy
    const policy = DEFAULT_SESSION_POLICIES[user.roles[0]?.roleId || 'END_USER'] ||
      DEFAULT_SESSION_POLICIES.END_USER;

    // Check concurrent sessions
    const userSessions = Array.from(this.sessions.values()).filter(
      s => s.userId === userId && s.status === 'active'
    );

    if (userSessions.length >= policy.maxConcurrentSessions) {
      // Revoke oldest session
      const oldestSession = userSessions.reduce((a, b) =>
        a.createdAt < b.createdAt ? a : b
      );
      oldestSession.revoke('New session created');
    }

    // Create session
    const session = new SessionModel({
      sessionId: uuidv4(),
      userId,
      tenantId,
      deviceId,
      deviceName,
      ipAddress,
      userAgent,
      status: 'active',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      expiresAt: new Date(Date.now() + policy.sessionTimeoutMinutes * 60 * 1000)
    });

    this.sessions.set(session.sessionId, session);

    // Generate tokens
    const tokens = this.generateTokens(userId, tenantId, session.sessionId);

    await this.auditLogService.logSessionEvent(
      tenantId,
      userId,
      AuditAction.SESSION_CREATED,
      session.sessionId,
      ipAddress,
      userAgent
    );

    return { session, tokens };
  }

  /**
   * Setup 2FA for user
   */
  async setup2FA(
    userId: string,
    tenantId: string,
    method: TwoFactorMethod
  ): Promise<TwoFactorSetup> {
    const user = this.users.get(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const setup: TwoFactorSetup = {
      method,
      isVerified: false
    };

    if (method === TwoFactorMethod.TOTP) {
      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `WebWaka (${user.email})`,
        issuer: 'WebWaka',
        length: 32
      });

      setup.secret = secret.base32;
      setup.qrCode = await QRCode.toDataURL(secret.otpauth_url!);
      setup.backupCodes = this.generateBackupCodes(10);
    } else if (method === TwoFactorMethod.SMS) {
      // Phone number would be provided separately
      setup.phoneNumber = user.phone;
    }

    return setup;
  }

  /**
   * Verify 2FA code
   */
  async verify2FA(
    challengeId: string,
    code: string
  ): Promise<{ verified: boolean; backupCodesRemaining?: number }> {
    const challenge = this.twoFactorChallenges.get(challengeId);
    if (!challenge) {
      throw new UnauthorizedError('Invalid or expired challenge');
    }

    if (challenge.expiresAt < new Date()) {
      this.twoFactorChallenges.delete(challengeId);
      throw new UnauthorizedError('Challenge expired');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      this.twoFactorChallenges.delete(challengeId);
      throw new UnauthorizedError('Too many failed attempts');
    }

    const user = this.users.get(challenge.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret: user.metadata?.totpSecret || '',
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      challenge.attempts++;
      return { verified: false };
    }

    // Remove challenge
    this.twoFactorChallenges.delete(challengeId);

    // Log 2FA verification
    await this.auditLogService.logAuthEvent(
      challenge.userId,
      user.userId,
      AuditAction.MFA_VERIFIED,
      'unknown',
      'unknown',
      'success'
    );

    return { verified: true };
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string, reason: string = 'User initiated'): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.revoke(reason);
      await this.auditLogService.logSessionEvent(
        session.tenantId,
        session.userId,
        AuditAction.SESSION_REVOKED,
        sessionId,
        session.ipAddress,
        session.userAgent
      );
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): { userId: string; tenantId: string; sessionId: string } | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      return {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        sessionId: decoded.sessionId
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private generateTokens(userId: string, tenantId: string, sessionId: string): AuthToken {
    const accessToken = jwt.sign(
      { userId, tenantId, sessionId },
      this.jwtSecret,
      { expiresIn: this.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
      { userId, tenantId, sessionId, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: this.refreshTokenExpiry }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour in seconds
      tokenType: 'Bearer'
    };
  }

  /**
   * Create 2FA challenge
   */
  private async createTwoFactorChallenge(
    userId: string,
    tenantId: string
  ): Promise<TwoFactorChallenge> {
    const challenge: TwoFactorChallenge = {
      challengeId: uuidv4(),
      userId,
      method: TwoFactorMethod.TOTP,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
      maxAttempts: 5
    };

    this.twoFactorChallenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  /**
   * Generate backup codes for 2FA
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check password strength
   */
  private isStrongPassword(password: string): boolean {
    return (
      password.length >= 12 &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    );
  }
}
