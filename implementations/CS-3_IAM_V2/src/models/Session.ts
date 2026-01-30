/**
 * Session Model
 * Represents a user session with device tracking and status management
 */

import { Session, SessionStatus, SessionPolicy, DeviceInfo } from '../types';

export class SessionModel implements Session {
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

  constructor(data: Partial<Session>) {
    Object.assign(this, data);
    this.createdAt = this.createdAt || new Date();
    this.lastActivityAt = this.lastActivityAt || new Date();
    this.status = this.status || SessionStatus.ACTIVE;
  }

  /**
   * Check if session is still valid
   */
  isValid(): boolean {
    return (
      this.status === SessionStatus.ACTIVE &&
      this.expiresAt > new Date() &&
      !this.revokedAt
    );
  }

  /**
   * Check if session has expired
   */
  isExpired(): boolean {
    return this.expiresAt <= new Date();
  }

  /**
   * Check if session is idle (based on last activity)
   */
  isIdle(idleTimeoutMinutes: number): boolean {
    const idleTime = Date.now() - this.lastActivityAt.getTime();
    return idleTime > idleTimeoutMinutes * 60 * 1000;
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(): void {
    this.lastActivityAt = new Date();
  }

  /**
   * Revoke the session
   */
  revoke(reason: string = 'User initiated'): void {
    this.status = SessionStatus.REVOKED;
    this.revokedAt = new Date();
    this.revokeReason = reason;
  }

  /**
   * Suspend the session
   */
  suspend(reason: string = 'Security suspension'): void {
    this.status = SessionStatus.SUSPENDED;
    this.revokeReason = reason;
  }

  /**
   * Get session age in minutes
   */
  getAgeMinutes(): number {
    return Math.floor((Date.now() - this.createdAt.getTime()) / (60 * 1000));
  }

  /**
   * Get time remaining until expiration in minutes
   */
  getTimeRemainingMinutes(): number {
    const remaining = this.expiresAt.getTime() - Date.now();
    return Math.floor(remaining / (60 * 1000));
  }

  /**
   * Convert to JSON (exclude sensitive data)
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      tenantId: this.tenantId,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      ipAddress: this.ipAddress,
      status: this.status,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
      revokeReason: this.revokeReason
    };
  }
}

/**
 * Device Model
 * Represents a user device with trust status
 */
export class DeviceModel implements DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  osName: string;
  osVersion: string;
  browserName: string;
  browserVersion: string;
  lastSeenAt: Date;
  isTrusted: boolean;

  constructor(data: Partial<DeviceInfo>) {
    Object.assign(this, data);
    this.lastSeenAt = this.lastSeenAt || new Date();
    this.isTrusted = this.isTrusted || false;
  }

  /**
   * Mark device as trusted
   */
  trust(): void {
    this.isTrusted = true;
  }

  /**
   * Mark device as untrusted
   */
  untrust(): void {
    this.isTrusted = false;
  }

  /**
   * Update last seen timestamp
   */
  updateLastSeen(): void {
    this.lastSeenAt = new Date();
  }

  /**
   * Get device fingerprint (for security verification)
   */
  getFingerprint(): string {
    return `${this.osName}|${this.browserName}|${this.deviceType}`;
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: this.deviceType,
      osName: this.osName,
      osVersion: this.osVersion,
      browserName: this.browserName,
      browserVersion: this.browserVersion,
      lastSeenAt: this.lastSeenAt,
      isTrusted: this.isTrusted
    };
  }
}

/**
 * Default session policies for different actor types
 */
export const DEFAULT_SESSION_POLICIES: Record<string, SessionPolicy> = {
  SUPER_ADMIN: {
    maxConcurrentSessions: 3,
    sessionTimeoutMinutes: 30,
    idleTimeoutMinutes: 15,
    requireMfaOnNewDevice: true,
    ipWhitelistEnabled: true,
    allowedIps: []
  },
  PARTNER_ADMIN: {
    maxConcurrentSessions: 5,
    sessionTimeoutMinutes: 480, // 8 hours
    idleTimeoutMinutes: 60,
    requireMfaOnNewDevice: false,
    ipWhitelistEnabled: false
  },
  CLIENT_ADMIN: {
    maxConcurrentSessions: 5,
    sessionTimeoutMinutes: 480,
    idleTimeoutMinutes: 60,
    requireMfaOnNewDevice: false,
    ipWhitelistEnabled: false
  },
  END_USER: {
    maxConcurrentSessions: 10,
    sessionTimeoutMinutes: 1440, // 24 hours
    idleTimeoutMinutes: 120,
    rememberMeDays: 30,
    requireMfaOnNewDevice: false,
    ipWhitelistEnabled: false
  }
};
