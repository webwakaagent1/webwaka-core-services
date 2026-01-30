/**
 * User Model
 * Represents a user in the IAM V2 system with support for multiple authentication methods
 */

import { User, TwoFactorMethod, RoleAssignment } from '../types';

export class UserModel implements User {
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

  constructor(data: Partial<User>) {
    Object.assign(this, data);
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.emailVerified = this.emailVerified || false;
    this.phoneVerified = this.phoneVerified || false;
    this.twoFactorEnabled = this.twoFactorEnabled || false;
    this.twoFactorMethods = this.twoFactorMethods || [];
    this.roles = this.roles || [];
    this.loginAttempts = this.loginAttempts || 0;
    this.status = this.status || 'active';
  }

  /**
   * Check if user is locked out due to failed login attempts
   */
  isLockedOut(): boolean {
    if (!this.lockedUntil) return false;
    return this.lockedUntil > new Date();
  }

  /**
   * Check if user's password has expired
   */
  isPasswordExpired(): boolean {
    if (!this.passwordExpiresAt) return false;
    return this.passwordExpiresAt < new Date();
  }

  /**
   * Get user's full name
   */
  getFullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * Check if user has a specific role
   */
  hasRole(roleId: string): boolean {
    return this.roles.some(r => r.roleId === roleId && (!r.expiresAt || r.expiresAt > new Date()));
  }

  /**
   * Check if 2FA is enabled for this user
   */
  has2FAEnabled(): boolean {
    return this.twoFactorEnabled && this.twoFactorMethods.length > 0;
  }

  /**
   * Get active 2FA methods
   */
  getActive2FAMethods(): TwoFactorMethod[] {
    return this.twoFactorMethods;
  }

  /**
   * Convert to JSON (exclude sensitive data)
   */
  toJSON() {
    const { passwordHash, ...rest } = this;
    return rest;
  }
}
