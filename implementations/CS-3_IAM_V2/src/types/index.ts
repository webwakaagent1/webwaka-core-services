/**
 * CS-3 IAM V2 - Core Type Definitions
 * Defines all TypeScript interfaces and types for the IAM V2 system
 */

// ============================================================================
// TENANT & ACTOR TYPES
// ============================================================================

export enum ActorType {
  SUPER_ADMIN = 'super_admin',
  PARTNER = 'partner',
  CLIENT = 'client',
  MERCHANT = 'merchant',
  VENDOR = 'vendor',
  AGENT = 'agent',
  END_USER = 'end_user'
}

export interface TenantContext {
  tenantId: string;
  partnerId?: string;
  clientId?: string;
  actorType: ActorType;
  actorId: string;
}

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  APPLE = 'apple',
  GITHUB = 'github'
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface OAuthProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: AuthProvider;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// ============================================================================
// TWO-FACTOR AUTHENTICATION TYPES
// ============================================================================

export enum TwoFactorMethod {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email'
}

export interface TwoFactorSetup {
  method: TwoFactorMethod;
  secret?: string; // For TOTP
  qrCode?: string; // For TOTP QR code
  phoneNumber?: string; // For SMS
  isVerified: boolean;
  backupCodes?: string[];
}

export interface TwoFactorChallenge {
  challengeId: string;
  userId: string;
  method: TwoFactorMethod;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
}

// ============================================================================
// SESSION MANAGEMENT TYPES
// ============================================================================

export enum SessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  SUSPENDED = 'suspended'
}

export interface SessionPolicy {
  maxConcurrentSessions: number;
  sessionTimeoutMinutes: number;
  idleTimeoutMinutes: number;
  rememberMeDays?: number;
  requireMfaOnNewDevice: boolean;
  ipWhitelistEnabled: boolean;
  allowedIps?: string[];
}

export interface Session {
  sessionId: string;
  userId: string;
  tenantId: string;
  deviceId: string;
  deviceName?: string;
  ipAddress: string;
  userAgent: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  osName: string;
  osVersion: string;
  browserName: string;
  browserVersion: string;
  lastSeenAt: Date;
  isTrusted: boolean;
}

// ============================================================================
// ROLE-BASED ACCESS CONTROL TYPES
// ============================================================================

export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute',
  APPROVE = 'approve',
  REJECT = 'reject',
  EXPORT = 'export',
  IMPORT = 'import',
  MANAGE = 'manage'
}

export enum ResourceType {
  USER = 'user',
  ROLE = 'role',
  PERMISSION = 'permission',
  TENANT = 'tenant',
  PARTNER = 'partner',
  CLIENT = 'client',
  SESSION = 'session',
  AUDIT_LOG = 'audit_log',
  INTEGRATION = 'integration',
  CONFIGURATION = 'configuration'
}

export interface Permission {
  permissionId: string;
  resource: ResourceType;
  action: PermissionAction;
  scope?: string; // e.g., 'own', 'team', 'organization', 'global'
  conditions?: Record<string, any>; // Conditional access rules
  description: string;
}

export interface Role {
  roleId: string;
  tenantId: string;
  name: string;
  description: string;
  type: 'system' | 'custom';
  permissions: Permission[];
  parentRoleId?: string; // For role hierarchies
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface RoleAssignment {
  assignmentId: string;
  userId: string;
  roleId: string;
  tenantId: string;
  assignedAt: Date;
  assignedBy: string;
  expiresAt?: Date;
  scope?: string; // e.g., 'organization', 'team', 'project'
}

// ============================================================================
// USER TYPES
// ============================================================================

export interface User {
  userId: string;
  tenantId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  phone?: string;
  phoneVerified: boolean;
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  passwordHash?: string;
  passwordChangedAt?: Date;
  passwordExpiresAt?: Date;
  lastLoginAt?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  preferredLanguage: string;
  timezone: string;
  twoFactorEnabled: boolean;
  twoFactorMethods: TwoFactorMethod[];
  roles: RoleAssignment[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  phone?: string;
  preferredLanguage: string;
  timezone: string;
  twoFactorEnabled: boolean;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export enum AuditAction {
  // Authentication events
  LOGIN = 'login',
  LOGOUT = 'logout',
  LOGIN_FAILED = 'login_failed',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET = 'password_reset',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  MFA_VERIFIED = 'mfa_verified',
  
  // Session events
  SESSION_CREATED = 'session_created',
  SESSION_REVOKED = 'session_revoked',
  SESSION_EXPIRED = 'session_expired',
  DEVICE_TRUSTED = 'device_trusted',
  DEVICE_REVOKED = 'device_revoked',
  
  // User management
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  USER_SUSPENDED = 'user_suspended',
  USER_REACTIVATED = 'user_reactivated',
  
  // Role management
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REVOKED = 'role_revoked',
  
  // Permission management
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  
  // Super Admin actions
  SUPER_ADMIN_ACCESS = 'super_admin_access',
  TENANT_ISOLATION_BREACH_ATTEMPT = 'tenant_isolation_breach_attempt'
}

export interface AuditLog {
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
  // Immutable - append-only
  createdAt: Date;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface AuthRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthToken;
  mfaRequired?: boolean;
  mfaChallenge?: string;
}

export interface MFAVerifyRequest {
  challengeId: string;
  code: string;
}

export interface CreateRoleRequest {
  name: string;
  description: string;
  permissions: Permission[];
  parentRoleId?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: Permission[];
  isActive?: boolean;
}

export interface AssignRoleRequest {
  userId: string;
  roleId: string;
  scope?: string;
  expiresAt?: Date;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class IAMError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'IAMError';
  }
}

export class TenantIsolationError extends IAMError {
  constructor(message: string, details?: Record<string, any>) {
    super('TENANT_ISOLATION_ERROR', 403, message, details);
    this.name = 'TenantIsolationError';
  }
}

export class UnauthorizedError extends IAMError {
  constructor(message: string = 'Unauthorized', details?: Record<string, any>) {
    super('UNAUTHORIZED', 401, message, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends IAMError {
  constructor(message: string = 'Forbidden', details?: Record<string, any>) {
    super('FORBIDDEN', 403, message, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends IAMError {
  constructor(resource: string, details?: Record<string, any>) {
    super('NOT_FOUND', 404, `${resource} not found`, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends IAMError {
  constructor(message: string, details?: Record<string, any>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface IAMConfig {
  // JWT Configuration
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  
  // OAuth Configuration
  oauth: {
    google?: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    facebook?: {
      appId: string;
      appSecret: string;
      callbackUrl: string;
    };
    apple?: {
      teamId: string;
      keyId: string;
      privateKey: string;
      callbackUrl: string;
    };
    github?: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
  };
  
  // 2FA Configuration
  twoFactor: {
    totpWindowSize: number;
    smsSender: string;
    emailSender: string;
    backupCodeCount: number;
  };
  
  // Session Configuration
  session: {
    defaultPolicy: SessionPolicy;
    cookieName: string;
    cookieSecure: boolean;
    cookieHttpOnly: boolean;
    cookieSameSite: 'strict' | 'lax' | 'none';
  };
  
  // Security Configuration
  security: {
    passwordMinLength: number;
    passwordRequireUppercase: boolean;
    passwordRequireNumbers: boolean;
    passwordRequireSpecialChars: boolean;
    passwordExpiryDays?: number;
    maxLoginAttempts: number;
    lockoutDurationMinutes: number;
    enableIpWhitelist: boolean;
  };
  
  // Audit Configuration
  audit: {
    enabled: boolean;
    retentionDays: number;
    encryptionEnabled: boolean;
  };
}
