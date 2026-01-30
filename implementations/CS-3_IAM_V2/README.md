# CS-3: Identity & Access Management V2

**Version:** 1.0.0  
**Status:** 🟢 Complete  
**Canonical Reference:** [CS-3: Identity & Access Management V2](../../docs/phases/CS-3_IAM_V2.md)

## Overview

This is the complete implementation of **CS-3 Identity & Access Management V2**, delivering advanced IAM features for the WebWaka platform including:

- ✅ **Social Login** - Google, Facebook, Apple, GitHub OAuth integration
- ✅ **Two-Factor Authentication** - TOTP and SMS-based 2FA
- ✅ **Advanced Session Management** - Configurable policies, device tracking, concurrent session limits
- ✅ **Fine-Grained RBAC** - 10+ system roles, custom roles, role hierarchies
- ✅ **Comprehensive Audit Logging** - Immutable, append-only audit trail with critical event notifications

All implementation strictly adheres to WebWaka platform invariants:
- **INV-002: Strict Tenant Isolation** - All operations are tenant-scoped
- **INV-003: Audited Super Admin Access** - All super admin actions are logged
- **INV-005: Partner-Led Operating Model** - Partners manage their own users and roles
- **INV-011: Prompts-as-Artifacts** - Execution governed by embedded prompt

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run migrate:up

# Start application
npm start
```

### Development

```bash
# Start in development mode with hot reload
npm run dev

# Run tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Check code quality
npm run lint
npm run format
```

## Architecture

The system is organized in a layered architecture:

```
API Layer (Express.js)
    ↓
Middleware (Tenant Context, Auth, Audit)
    ↓
Service Layer (Auth, RBAC, Sessions, Audit)
    ↓
Model Layer (User, Role, Session, AuditLog)
    ↓
Data Layer (PostgreSQL, Redis)
```

For complete architecture details, see [ARCH_CS3_IAM_V2.md](./docs/ARCH_CS3_IAM_V2.md).

## Core Components

### 1. Authentication Service

Handles user authentication with multiple methods:

```typescript
// Local authentication
const result = await authService.authenticateLocal(
  tenantId,
  { email, password },
  ipAddress,
  userAgent
);

// OAuth authentication
const result = await authService.authenticateOAuth(
  tenantId,
  oauthProfile,
  ipAddress,
  userAgent
);

// 2FA verification
const verified = await authService.verify2FA(challengeId, code);
```

### 2. RBAC Service

Manages roles and permissions:

```typescript
// Create custom role
const role = await rbacService.createRole(
  tenantId,
  'Custom Role',
  'Description',
  permissions
);

// Assign role to user
const assignment = await rbacService.assignRole(
  userId,
  roleId,
  tenantId
);

// Check permission
const hasPermission = await rbacService.hasPermission(
  user,
  ResourceType.USER,
  PermissionAction.CREATE
);
```

### 3. Session Management

Manages user sessions with device tracking:

```typescript
// Create session
const { session, tokens } = await authService.createSession(
  userId,
  tenantId,
  deviceId,
  deviceName,
  ipAddress,
  userAgent
);

// Revoke session
await authService.revokeSession(sessionId, 'User logout');
```

### 4. Audit Logging

Comprehensive audit trail for all operations:

```typescript
// Log authentication event
await auditLogService.logAuthEvent(
  tenantId,
  userId,
  AuditAction.LOGIN,
  ipAddress,
  userAgent
);

// Query audit logs
const query = new AuditLogQuery()
  .byTenant(tenantId)
  .byAction(AuditAction.SUPER_ADMIN_ACCESS)
  .byDateRange(startDate, endDate);

const { logs, total } = await auditLogService.queryLogs(query);
```

## API Endpoints

### Authentication

```
POST   /api/auth/register              # Register new user
POST   /api/auth/login                 # Local login
GET    /api/auth/oauth/:provider       # OAuth login
POST   /api/auth/oauth/callback/:provider # OAuth callback
POST   /api/auth/logout                # Logout
POST   /api/auth/refresh               # Refresh token
POST   /api/auth/2fa/setup             # Setup 2FA
POST   /api/auth/2fa/verify            # Verify 2FA code
```

### Users

```
GET    /api/users                      # List users
POST   /api/users                      # Create user
GET    /api/users/:id                  # Get user
PATCH  /api/users/:id                  # Update user
DELETE /api/users/:id                  # Delete user
```

### Roles

```
GET    /api/roles                      # List roles
POST   /api/roles                      # Create role
GET    /api/roles/:id                  # Get role
PATCH  /api/roles/:id                  # Update role
DELETE /api/roles/:id                  # Delete role
POST   /api/roles/:id/assign           # Assign role
DELETE /api/roles/:id/assignments/:aid # Revoke role
```

### Sessions

```
GET    /api/sessions                   # List sessions
GET    /api/sessions/:id               # Get session
DELETE /api/sessions/:id               # Revoke session
GET    /api/devices                    # List devices
PATCH  /api/devices/:id                # Update device
DELETE /api/devices/:id                # Revoke device
```

### Audit Logs

```
GET    /api/audit-logs                 # Query audit logs
GET    /api/audit-logs/:id             # Get audit log
POST   /api/audit-logs/export          # Export logs
GET    /api/audit-logs/statistics      # Get statistics
```

## Security Features

### Password Security
- Minimum 12 characters with uppercase, numbers, special characters
- bcrypt hashing with 12 rounds
- Configurable expiration and history

### Token Security
- JWT signing with HS256
- Access token expiry: 1 hour (configurable)
- Refresh token expiry: 7 days (configurable)
- Token rotation on each refresh

### Session Security
- Secure cookies (HttpOnly, Secure, SameSite)
- CSRF protection with state tokens
- Session fixation prevention
- Concurrent session limits per role
- Optional IP whitelisting

### 2FA Security
- TOTP with ±2 time window
- SMS delivery via Twilio
- Backup codes for recovery
- Rate limiting on verification attempts

### Tenant Isolation (INV-002)
- All requests scoped to tenant
- Cross-tenant access impossible
- Tenant isolation breaches logged as critical events
- Automatic tenant context verification

### Super Admin Access (INV-003)
- Explicit super admin identification required
- IP whitelisting enabled
- Multi-factor authentication required
- All actions logged with full audit trail
- Temporary context for tenant data access

## System Roles

The system includes 10 predefined roles:

| Role | Scope | Use Case |
|------|-------|----------|
| **Super Admin** | Global | Platform operations |
| **Partner Admin** | Organization | Partner management |
| **Client Admin** | Organization | Client management |
| **Tenant Admin** | Tenant | Tenant administration |
| **User Manager** | Organization | User provisioning |
| **Auditor** | Organization | Compliance auditing |
| **Developer** | Organization | API development |
| **Viewer** | Organization | Reporting |
| **Editor** | Organization | Content management |
| **Operator** | Organization | Operations |

## Configuration

### Environment Variables

```bash
# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_TOKEN_EXPIRY=1h
JWT_REFRESH_TOKEN_EXPIRY=7d

# OAuth Providers
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
FACEBOOK_APP_ID=xxx
FACEBOOK_APP_SECRET=xxx
APPLE_TEAM_ID=xxx
APPLE_KEY_ID=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# 2FA
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# Security
PASSWORD_MIN_LENGTH=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30

# Audit
AUDIT_RETENTION_DAYS=2555
AUDIT_ENCRYPTION_ENABLED=true
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests
```

### Generate Coverage Report
```bash
npm run test:coverage
```

## Compliance

- ✅ OWASP Top 10 mitigation
- ✅ NIST Cybersecurity Framework alignment
- ✅ GDPR compliance (data residency, audit trails)
- ✅ SOC 2 compliance (access controls, audit logging)
- ✅ ISO 27001 alignment

## Monitoring & Observability

### Metrics Exposed

- Authentication success/failure rates
- Session creation/revocation rates
- Active session count
- Audit log volume
- Critical event frequency

### Logging

Structured JSON logging with levels:
- ERROR - Error events
- WARN - Warning events
- INFO - Informational events
- DEBUG - Debug events

### Dashboards

Grafana dashboards available for:
- User activity
- Authentication metrics
- Session management
- Audit log statistics

## Deployment

### Production Deployment

```bash
# Build
npm run build

# Set production environment
export NODE_ENV=production

# Run migrations
npm run migrate:up

# Start application
npm start
```

### Docker Deployment

```bash
# Build image
docker build -t webwaka-iam-v2 .

# Run container
docker run -p 3000:3000 \
  -e JWT_SECRET=xxx \
  -e DB_HOST=postgres \
  -e REDIS_HOST=redis \
  webwaka-iam-v2
```

## Troubleshooting

### Database Connection Issues
```bash
# Test PostgreSQL connection
psql -h localhost -U postgres -d webwaka_iam_v2
```

### Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping
```

### JWT Verification Failures
- Check JWT_SECRET is set correctly
- Verify token hasn't expired
- Check token format (Bearer prefix)

## Support & Documentation

- **Architecture** - See [ARCH_CS3_IAM_V2.md](./docs/ARCH_CS3_IAM_V2.md)
- **API Documentation** - See [API.md](./docs/API.md)
- **Security Guide** - See [SECURITY.md](./docs/SECURITY.md)
- **Governance** - See [CS-3 Phase Definition](../../docs/phases/CS-3_IAM_V2.md)

## License

PROPRIETARY - All rights reserved by WebWaka

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-30 | Initial implementation |

---

**For more information, see the [Architecture Document](./docs/ARCH_CS3_IAM_V2.md)**
