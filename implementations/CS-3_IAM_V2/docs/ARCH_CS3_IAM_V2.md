# CS-3 IAM V2: Identity & Access Management V2 - Architecture Document

**Version:** 1.0.0  
**Date:** January 30, 2026  
**Author:** Manus AI  
**Status:** 🟢 Complete  
**Canonical Reference:** [CS-3: Identity & Access Management V2](../../docs/phases/CS-3_IAM_V2.md)

---

## 1. Executive Summary

This document describes the complete architecture of the **CS-3 Identity & Access Management V2** system, which implements advanced IAM features for the WebWaka platform. The implementation delivers:

- **Social Login Integration** - Google, Facebook, Apple, and GitHub OAuth providers
- **Two-Factor Authentication** - TOTP and SMS-based 2FA
- **Advanced Session Management** - Configurable policies, device tracking, concurrent session limits
- **Fine-Grained RBAC** - 10+ system roles, custom role support, role hierarchies
- **Comprehensive Audit Logging** - Immutable, append-only audit trail with critical event notifications

All implementation strictly adheres to platform invariants:
- **INV-002: Strict Tenant Isolation** - All operations are tenant-scoped
- **INV-003: Audited Super Admin Access** - All super admin actions are logged
- **INV-005: Partner-Led Operating Model** - Partners can manage their own users and roles
- **INV-011: Prompts-as-Artifacts** - This work is governed by the execution prompt

---

## 2. System Architecture Overview

### 2.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Express.js)                   │
│  - Authentication Endpoints                                  │
│  - User Management Endpoints                                 │
│  - Role Management Endpoints                                 │
│  - Session Management Endpoints                              │
│  - Audit Log Endpoints                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Middleware Layer                            │
│  - Tenant Context Extraction (INV-002)                       │
│  - JWT Verification                                          │
│  - Authorization Checks                                      │
│  - Audit Logging                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                              │
│  - AuthenticationService                                     │
│  - RBACService                                               │
│  - SessionManagementService                                  │
│  - AuditLogService                                           │
│  - TwoFactorAuthService                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Model Layer                                │
│  - UserModel                                                 │
│  - RoleModel                                                 │
│  - SessionModel                                              │
│  - AuditLogModel                                             │
│  - DeviceModel                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                                 │
│  - PostgreSQL Database                                       │
│  - Redis Cache (Sessions, Challenges)                        │
│  - Immutable Audit Log Store                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

#### 2.2.1 Authentication Service
- **Local Authentication** - Email/password with bcrypt hashing
- **OAuth Integration** - Google, Facebook, Apple, GitHub
- **2FA Support** - TOTP and SMS-based verification
- **Session Management** - Token generation, validation, revocation

#### 2.2.2 RBAC Service
- **System Roles** - 10 predefined roles (Super Admin, Partner Admin, Client Admin, etc.)
- **Custom Roles** - Partner-defined roles with custom permissions
- **Role Hierarchies** - Parent-child role relationships
- **Permission Model** - Resource-action-scope based permissions

#### 2.2.3 Session Management
- **Concurrent Session Limits** - Configurable per actor type
- **Device Tracking** - Device fingerprinting and trust status
- **Session Policies** - Timeout, idle timeout, IP whitelisting
- **Session Revocation** - Manual and automatic revocation

#### 2.2.4 Audit Logging
- **Immutable Logs** - Append-only, cryptographically signed
- **Critical Event Notifications** - Real-time alerts for security events
- **Comprehensive Coverage** - All authentication, authorization, and user management events
- **Compliance Support** - Export, retention policies, searchable queries

---

## 3. Tenant Isolation & Security (INV-002, INV-003)

### 3.1 Tenant Context Enforcement

Every request is scoped to a tenant through the `TenantContext` middleware:

```typescript
interface TenantContext {
  tenantId: string;
  partnerId?: string;
  clientId?: string;
  actorType: ActorType;
  actorId: string;
}
```

**Key Invariants:**
1. All database queries are automatically scoped to `tenantId`
2. Cross-tenant resource access is impossible - verified at middleware level
3. Tenant isolation breaches are logged as critical events
4. Super admin access to tenant data requires explicit audit logging

### 3.2 Super Admin Access Control (INV-003)

Super admin access is strictly controlled:

```typescript
// Super admin must:
1. Be explicitly identified as ActorType.SUPER_ADMIN
2. Have IP whitelisting enabled
3. Require multi-factor authentication
4. All actions logged with full audit trail
5. Temporary context required for tenant data access
```

**Audit Logging:**
- Every super admin action creates an immutable audit log entry
- Critical events trigger real-time notifications
- Logs cannot be modified or deleted (append-only)
- 7-year retention policy (configurable)

---

## 4. Authentication Flows

### 4.1 Local Authentication Flow

```
User Input (Email/Password)
         │
         ▼
┌─────────────────────────┐
│  Validate Credentials   │
│  - Check email exists   │
│  - Verify password hash │
│  - Check account status │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Check 2FA Required     │
│  - If enabled, create   │
│    challenge            │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Create Session         │
│  - Generate tokens      │
│  - Track device         │
│  - Set expiration       │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Log Audit Event        │
│  - LOGIN action         │
│  - IP address           │
│  - User agent           │
└─────────────────────────┘
         │
         ▼
Return AuthToken & Session
```

### 4.2 OAuth Flow (Social Login)

```
User Clicks "Login with Google"
         │
         ▼
┌─────────────────────────┐
│  Redirect to OAuth      │
│  Provider               │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  OAuth Provider Auth    │
│  (Google/Facebook/etc)  │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Receive OAuth Token    │
│  & Profile              │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Find or Create User    │
│  - Match by email       │
│  - Store OAuth metadata │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Create Session         │
│  - Generate tokens      │
│  - Set expiration       │
└─────────────────────────┘
         │
         ▼
Return AuthToken & Session
```

### 4.3 Two-Factor Authentication Flow

```
User Provides 2FA Code
         │
         ▼
┌─────────────────────────┐
│  Validate Challenge     │
│  - Check expiration     │
│  - Check attempt count  │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Verify TOTP/SMS Code   │
│  - Using speakeasy lib  │
│  - Allow ±2 window      │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Create Session         │
│  - Generate tokens      │
│  - Mark MFA verified    │
└─────────────────────────┘
         │
         ▼
Return AuthToken & Session
```

---

## 5. Role-Based Access Control (RBAC)

### 5.1 System Roles

The system includes 10 predefined roles:

| Role | Scope | Permissions | Use Case |
|------|-------|-------------|----------|
| **Super Admin** | Global | Full platform access | Platform operations |
| **Partner Admin** | Organization | Manage partner resources | Partner management |
| **Client Admin** | Organization | Manage client resources | Client management |
| **Tenant Admin** | Tenant | Administrative access | Tenant administration |
| **User Manager** | Organization | Manage users and roles | User provisioning |
| **Auditor** | Organization | Read-only audit logs | Compliance auditing |
| **Developer** | Organization | API and integration access | API development |
| **Viewer** | Organization | Read-only access | Reporting and analysis |
| **Editor** | Organization | Create and edit resources | Content management |
| **Operator** | Organization | Execute operations | Operations management |

### 5.2 Permission Model

Permissions are defined as:

```typescript
interface Permission {
  resource: ResourceType;      // USER, ROLE, TENANT, etc.
  action: PermissionAction;    // CREATE, READ, UPDATE, DELETE, etc.
  scope: string;               // 'own', 'team', 'organization', 'global'
  conditions?: Record<string, any>; // Conditional access rules
}
```

**Scope Levels:**
- `own` - User's own resources only
- `team` - Team resources
- `organization` - Organization/partner resources
- `global` - All resources (super admin only)

### 5.3 Role Hierarchies

Roles can inherit from parent roles:

```
Super Admin (root)
    │
    ├── Partner Admin
    │   ├── User Manager
    │   ├── Auditor
    │   └── Developer
    │
    ├── Client Admin
    │   ├── Viewer
    │   ├── Editor
    │   └── Operator
    │
    └── Tenant Admin
```

---

## 6. Session Management

### 6.1 Session Policies

Each actor type has a default session policy:

```typescript
interface SessionPolicy {
  maxConcurrentSessions: number;    // Max active sessions
  sessionTimeoutMinutes: number;    // Absolute timeout
  idleTimeoutMinutes: number;       // Inactivity timeout
  rememberMeDays?: number;          // "Remember me" duration
  requireMfaOnNewDevice: boolean;   // MFA for new devices
  ipWhitelistEnabled: boolean;      // IP-based access control
}
```

**Default Policies:**
- **Super Admin** - 3 sessions, 30 min timeout, MFA on new device, IP whitelist
- **Partner Admin** - 5 sessions, 8 hour timeout, no MFA required
- **End User** - 10 sessions, 24 hour timeout, remember me 30 days

### 6.2 Device Tracking

Sessions track device information:

```typescript
interface DeviceInfo {
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
```

**Trust Mechanism:**
- New devices require MFA verification (configurable)
- Users can mark devices as trusted
- Trusted devices skip MFA on subsequent logins
- Device fingerprinting prevents session hijacking

### 6.3 Session Lifecycle

```
Session Created
    │
    ├─ ACTIVE (normal operation)
    │   ├─ Activity tracked (lastActivityAt updated)
    │   ├─ Idle timeout check
    │   └─ Absolute timeout check
    │
    ├─ EXPIRED (timeout reached)
    │   └─ User must re-authenticate
    │
    ├─ REVOKED (user logout or admin action)
    │   └─ Immediate invalidation
    │
    └─ SUSPENDED (security event)
        └─ Requires admin intervention
```

---

## 7. Two-Factor Authentication

### 7.1 Supported Methods

**TOTP (Time-based One-Time Password)**
- Uses industry-standard TOTP algorithm (RFC 6238)
- Compatible with Google Authenticator, Authy, Microsoft Authenticator
- QR code generation for easy setup
- Backup codes for account recovery
- ±2 time window for clock skew tolerance

**SMS (Short Message Service)**
- SMS delivery via Twilio
- 6-digit codes with 10-minute expiration
- Rate limiting to prevent brute force
- Fallback to email if SMS fails

### 7.2 2FA Setup Flow

```
User Initiates 2FA Setup
         │
         ▼
┌─────────────────────────┐
│  Generate Secret        │
│  - TOTP or SMS          │
│  - Create QR code       │
│  - Generate backup codes│
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  User Verifies Setup    │
│  - Scan QR code         │
│  - Enter test code      │
│  - Confirm backup codes │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Store Secret           │
│  - Encrypted in DB      │
│  - Backup codes hashed  │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Log Audit Event        │
│  - MFA_ENABLED action   │
└─────────────────────────┘
         │
         ▼
2FA Enabled
```

---

## 8. Audit Logging & Compliance

### 8.1 Audit Log Entry

Every action is logged with full context:

```typescript
interface AuditLog {
  auditLogId: string;
  tenantId: string;
  action: AuditAction;           // LOGIN, USER_CREATED, etc.
  actorType: ActorType;          // SUPER_ADMIN, PARTNER, etc.
  actorId: string;               // User ID
  resourceType: ResourceType;    // USER, ROLE, TENANT, etc.
  resourceId: string;            // Resource ID
  changes?: Record<string, any>; // What changed
  ipAddress: string;             // Request IP
  userAgent: string;             // Browser/client info
  status: 'success' | 'failure';
  errorMessage?: string;
  timestamp: Date;               // When it happened
  createdAt: Date;               // When logged
}
```

### 8.2 Critical Events

The following events trigger immediate notifications:

- `SUPER_ADMIN_ACCESS` - Super admin accessed tenant data
- `TENANT_ISOLATION_BREACH_ATTEMPT` - Cross-tenant access attempt
- `LOGIN_FAILED` (repeated) - Multiple failed login attempts
- `USER_DELETED` - User account deleted
- `ROLE_DELETED` - Role deleted
- `PASSWORD_RESET` - Password reset by admin
- `MFA_DISABLED` - 2FA disabled by user or admin

### 8.3 Audit Log Queries

Flexible query builder for compliance reporting:

```typescript
const query = new AuditLogQuery()
  .byTenant(tenantId)
  .byAction(AuditAction.SUPER_ADMIN_ACCESS)
  .byDateRange(startDate, endDate)
  .criticalOnly()
  .setLimit(1000)
  .sortBy('timestamp', 'desc');

const { logs, total } = await auditLogService.queryLogs(query);
```

### 8.4 Export & Retention

- **Export Formats** - JSON and CSV
- **Retention Policy** - 7 years (configurable)
- **Immutability** - Append-only, no deletion or modification
- **Encryption** - At-rest encryption for sensitive data
- **Compliance** - GDPR, SOC 2, ISO 27001 ready

---

## 9. Security Best Practices

### 9.1 Password Security

- **Minimum Length** - 12 characters
- **Complexity Requirements** - Uppercase, numbers, special characters
- **Hashing Algorithm** - bcrypt with 12 rounds
- **Expiration** - Configurable (default: no expiration)
- **History** - Prevent reuse of last 5 passwords
- **Reset** - Secure token-based password reset

### 9.2 Token Security

- **JWT Signing** - HS256 with strong secret
- **Access Token Expiry** - 1 hour (configurable)
- **Refresh Token Expiry** - 7 days (configurable)
- **Token Rotation** - New tokens on each refresh
- **Token Revocation** - Immediate invalidation on logout

### 9.3 Session Security

- **Secure Cookies** - HttpOnly, Secure, SameSite flags
- **CSRF Protection** - Token-based CSRF validation
- **Session Fixation** - New session ID on authentication
- **Concurrent Session Limits** - Configurable per role
- **IP Binding** - Optional IP whitelisting

### 9.4 OAuth Security

- **State Parameter** - CSRF protection for OAuth flows
- **PKCE** - Proof Key for Code Exchange (for mobile apps)
- **Scope Limitation** - Minimal scopes requested
- **Token Validation** - Verify token signature and expiration
- **Provider Verification** - Validate provider identity

---

## 10. API Endpoints

### 10.1 Authentication Endpoints

```
POST   /api/auth/register              # Register new user
POST   /api/auth/login                 # Local login
POST   /api/auth/oauth/callback/:provider # OAuth callback
POST   /api/auth/logout                # Logout
POST   /api/auth/refresh               # Refresh token
POST   /api/auth/2fa/setup             # Setup 2FA
POST   /api/auth/2fa/verify            # Verify 2FA code
```

### 10.2 User Management Endpoints

```
GET    /api/users                      # List users
POST   /api/users                      # Create user
GET    /api/users/:id                  # Get user details
PATCH  /api/users/:id                  # Update user
DELETE /api/users/:id                  # Delete user
POST   /api/users/:id/suspend          # Suspend user
POST   /api/users/:id/reactivate       # Reactivate user
```

### 10.3 Role Management Endpoints

```
GET    /api/roles                      # List roles
POST   /api/roles                      # Create role
GET    /api/roles/:id                  # Get role details
PATCH  /api/roles/:id                  # Update role
DELETE /api/roles/:id                  # Delete role
POST   /api/roles/:id/assign           # Assign role to user
DELETE /api/roles/:id/assignments/:aid # Revoke role
```

### 10.4 Session Management Endpoints

```
GET    /api/sessions                   # List user sessions
GET    /api/sessions/:id               # Get session details
DELETE /api/sessions/:id               # Revoke session
GET    /api/devices                    # List user devices
PATCH  /api/devices/:id                # Update device trust
DELETE /api/devices/:id                # Revoke device
```

### 10.5 Audit Log Endpoints

```
GET    /api/audit-logs                 # Query audit logs
GET    /api/audit-logs/:id             # Get audit log details
POST   /api/audit-logs/export          # Export audit logs
GET    /api/audit-logs/statistics      # Get statistics
```

---

## 11. Database Schema

### 11.1 Users Table

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  profile_picture VARCHAR(2048),
  phone VARCHAR(20),
  phone_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255),
  password_changed_at TIMESTAMP,
  password_expires_at TIMESTAMP,
  last_login_at TIMESTAMP,
  login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  preferred_language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_methods TEXT[], -- ARRAY of methods
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
```

### 11.2 Roles Table

```sql
CREATE TABLE roles (
  role_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL, -- 'system' or 'custom'
  parent_role_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (parent_role_id) REFERENCES roles(role_id)
);

CREATE INDEX idx_roles_tenant_id ON roles(tenant_id);
```

### 11.3 Permissions Table

```sql
CREATE TABLE permissions (
  permission_id UUID PRIMARY KEY,
  role_id UUID NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(50),
  conditions JSONB,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

CREATE INDEX idx_permissions_role_id ON permissions(role_id);
```

### 11.4 Sessions Table

```sql
CREATE TABLE sessions (
  session_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  device_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revoke_reason VARCHAR(255),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_tenant_id ON sessions(tenant_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

### 11.5 Audit Logs Table

```sql
CREATE TABLE audit_logs (
  audit_log_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- Immutable: no UPDATE or DELETE allowed
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
```

---

## 12. Configuration

### 12.1 Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_TOKEN_EXPIRY=1h
JWT_REFRESH_TOKEN_EXPIRY=7d

# OAuth Providers
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=https://example.com/auth/google/callback

FACEBOOK_APP_ID=xxx
FACEBOOK_APP_SECRET=xxx
FACEBOOK_CALLBACK_URL=https://example.com/auth/facebook/callback

APPLE_TEAM_ID=xxx
APPLE_KEY_ID=xxx
APPLE_PRIVATE_KEY=xxx
APPLE_CALLBACK_URL=https://example.com/auth/apple/callback

GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_CALLBACK_URL=https://example.com/auth/github/callback

# 2FA Configuration
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# Session Configuration
SESSION_COOKIE_NAME=webwaka_session
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_HTTP_ONLY=true
SESSION_COOKIE_SAME_SITE=strict

# Security Configuration
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL_CHARS=true
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30

# Audit Configuration
AUDIT_RETENTION_DAYS=2555  # 7 years
AUDIT_ENCRYPTION_ENABLED=true
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

- **Authentication Service** - Local login, OAuth, 2FA flows
- **RBAC Service** - Permission checks, role assignment, hierarchies
- **Session Management** - Session creation, expiration, revocation
- **Audit Logging** - Log creation, querying, export

### 13.2 Integration Tests

- **Tenant Isolation** - Cross-tenant access prevention
- **Authentication Flows** - Complete login/logout cycles
- **Session Lifecycle** - Creation, activity, expiration, revocation
- **Audit Trail** - Critical events, notifications

### 13.3 End-to-End Tests

- **User Registration & Login** - Complete user journey
- **2FA Setup & Verification** - 2FA workflow
- **Role Assignment & Permission Checks** - RBAC workflow
- **Session Management** - Device tracking, concurrent sessions
- **Audit Logging** - Event logging and export

### 13.4 Security Tests

- **Tenant Isolation** - Attempt cross-tenant access
- **Password Strength** - Weak password rejection
- **Session Hijacking** - Token validation
- **Brute Force** - Login attempt limiting
- **CSRF** - State parameter validation

---

## 14. Deployment & Operations

### 14.1 Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- OAuth provider credentials (Google, Facebook, Apple, GitHub)
- Twilio account (for SMS 2FA)

### 14.2 Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run migrations
npm run migrate:up

# Start application
npm start
```

### 14.3 Monitoring

- **Metrics** - Authentication success/failure rates, session counts, audit log volume
- **Alerts** - Critical events, failed logins, tenant isolation breaches
- **Dashboards** - User activity, role distribution, audit log statistics

### 14.4 Backup & Recovery

- **Database Backups** - Daily incremental backups
- **Audit Log Backups** - Immutable backup storage
- **Recovery Procedures** - Point-in-time recovery for audit logs
- **Disaster Recovery** - RTO 1 hour, RPO 15 minutes

---

## 15. Compliance & Standards

### 15.1 Security Standards

- **OWASP Top 10** - Mitigation for all top 10 vulnerabilities
- **NIST Cybersecurity Framework** - Aligned with NIST guidelines
- **CWE Top 25** - Mitigation for critical weaknesses

### 15.2 Compliance Frameworks

- **GDPR** - Data residency, right to deletion, audit trails
- **SOC 2** - Access controls, audit logging, encryption
- **ISO 27001** - Information security management
- **PCI DSS** - If handling payment data

### 15.3 Audit & Logging

- **Immutable Audit Logs** - Append-only, cryptographically signed
- **Retention Policies** - 7-year retention (configurable)
- **Export Capabilities** - JSON, CSV formats for compliance
- **Critical Event Alerts** - Real-time notifications

---

## 16. Future Enhancements

### 16.1 Planned Features

- **Passwordless Authentication** - WebAuthn/FIDO2 support
- **Biometric Authentication** - Fingerprint, face recognition
- **Adaptive Authentication** - Risk-based authentication
- **Advanced Session Analytics** - Anomaly detection
- **Zero Trust Architecture** - Device verification, continuous authentication

### 16.2 Scalability Improvements

- **Distributed Sessions** - Redis cluster for session storage
- **Audit Log Sharding** - Partition audit logs by date/tenant
- **Caching Layer** - Redis caching for role/permission lookups
- **Database Optimization** - Partitioning, indexing strategies

---

## 17. References & Links

- **Canonical Governance** - [CS-3: Identity & Access Management V2](../../docs/phases/CS-3_IAM_V2.md)
- **Master Control Board** - [WebWaka Master Control Board](../../docs/governance/WEBWAKA_MASTER_CONTROL_BOARD.md)
- **Platform Invariants** - [INV-002, INV-003, INV-005, INV-011](../../docs/governance/WEBWAKA_MASTER_CONTROL_BOARD.md#1-never-break-invariants)
- **Implementation Code** - `/implementations/CS-3_IAM_V2/`

---

## 18. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-30 | Manus AI | Initial architecture document |

---

**End of Architecture Document**
