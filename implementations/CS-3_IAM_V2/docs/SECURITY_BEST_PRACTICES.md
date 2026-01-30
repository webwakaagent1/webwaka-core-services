# CS-3 IAM V2: Security Best Practices Guide for Partners

**Version:** 1.0.0  
**Date:** January 30, 2026  
**Audience:** WebWaka Partners, Clients, Developers

---

## 1. Introduction

This guide provides security best practices for implementing and using the WebWaka CS-3 Identity & Access Management V2 system. Following these practices ensures your platform remains secure, compliant, and resilient against common threats.

---

## 2. User Management Best Practices

### 2.1 User Account Lifecycle

**Creation**
- ✅ Verify email addresses before granting access
- ✅ Set strong temporary passwords for admin-created accounts
- ✅ Require password change on first login
- ✅ Audit all user creation events

**Maintenance**
- ✅ Regularly review active user accounts
- ✅ Disable inactive accounts after 90 days
- ✅ Enforce password changes every 90 days
- ✅ Monitor failed login attempts

**Deletion**
- ✅ Require approval for user deletion
- ✅ Archive user data before deletion (7-year retention)
- ✅ Revoke all active sessions immediately
- ✅ Audit all deletion events

### 2.2 Account Lockout Policy

Implement account lockout to prevent brute force attacks:

```
Failed Login Attempts:
- 1-3 attempts: Allow
- 4 attempts: Warning to user
- 5 attempts: Lock account for 30 minutes
- 10 attempts in 1 hour: Escalate to admin
```

**Configuration:**
```
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 30
ATTEMPT_RESET_MINUTES = 60
```

---

## 3. Password Security Best Practices

### 3.1 Password Requirements

Enforce strong passwords:

```
Minimum Length:     12 characters
Uppercase Letters:  At least 1
Numbers:            At least 1
Special Characters: At least 1 (!@#$%^&*)
```

**Examples of Strong Passwords:**
- ✅ `MyP@ssw0rd2024`
- ✅ `Secure#Pass123`
- ✅ `C0mpl3x!Password`

**Examples of Weak Passwords:**
- ❌ `password123` (no uppercase, no special chars)
- ❌ `MyPassword` (no numbers, no special chars)
- ❌ `Pass1!` (too short)

### 3.2 Password Expiration

- **Standard Users:** 90 days
- **Privileged Users:** 60 days
- **Super Admins:** 30 days

**Notification Schedule:**
- 14 days before expiration: First reminder
- 7 days before expiration: Second reminder
- 1 day before expiration: Final reminder

### 3.3 Password History

Prevent password reuse:

```
Minimum Password History: 5 previous passwords
Cannot reuse: Last 5 passwords
```

### 3.4 Password Reset

Secure password reset process:

1. User requests password reset
2. Verification email sent with token
3. Token expires after 1 hour
4. User sets new password
5. All active sessions revoked
6. Audit event logged

---

## 4. Two-Factor Authentication (2FA)

### 4.1 2FA Enforcement Policy

**Mandatory 2FA:**
- ✅ All super admins (required)
- ✅ All partner admins (required)
- ✅ All users with sensitive permissions (recommended)

**Optional 2FA:**
- ✅ End users (recommended)

### 4.2 TOTP Setup Best Practices

When setting up TOTP:

1. **Use Authenticator Apps:**
   - Google Authenticator
   - Microsoft Authenticator
   - Authy
   - 1Password

2. **Backup Codes:**
   - Store in secure location
   - Print and keep in safe
   - Do not share or email
   - Generate new codes if compromised

3. **Device Synchronization:**
   - Ensure device time is synchronized
   - Use NTP for time sync
   - Verify time before setup

### 4.3 SMS 2FA Best Practices

When using SMS-based 2FA:

1. **Verify Phone Number:**
   - Confirm ownership before enabling
   - Update if phone changes
   - Disable old numbers

2. **SIM Swap Protection:**
   - Use carrier account PIN
   - Register account with carrier
   - Monitor for unauthorized changes

3. **Backup Methods:**
   - Have backup 2FA method enabled
   - Keep backup codes secure
   - Test backup method regularly

### 4.4 2FA Recovery

If user loses access to 2FA:

1. **Backup Codes:** Use one of the backup codes
2. **Alternative Method:** Use SMS if TOTP unavailable
3. **Admin Recovery:** Admin can reset 2FA (with audit log)
4. **Identity Verification:** Verify identity before reset

---

## 5. Session Management Best Practices

### 5.1 Session Timeout Policy

Configure appropriate timeouts:

| User Type | Session Timeout | Idle Timeout |
|-----------|-----------------|--------------|
| Super Admin | 30 minutes | 15 minutes |
| Partner Admin | 8 hours | 1 hour |
| End User | 24 hours | 2 hours |

### 5.2 Concurrent Session Limits

Limit simultaneous sessions:

| User Type | Max Sessions |
|-----------|--------------|
| Super Admin | 3 |
| Partner Admin | 5 |
| End User | 10 |

### 5.3 Device Trust Management

**New Device Flow:**
1. User logs in from new device
2. If MFA required for new devices: request 2FA
3. User marks device as trusted (optional)
4. Device ID stored for future logins

**Trusted Device Benefits:**
- Skip MFA on subsequent logins
- Faster authentication
- Better user experience

**Trusted Device Risks:**
- If device compromised, attacker has access
- Mitigate with IP whitelisting
- Revoke if device lost/stolen

### 5.4 Session Revocation

Revoke sessions when:
- User logs out
- Password changed
- 2FA disabled
- User suspended
- Device revoked
- Suspicious activity detected

---

## 6. Role-Based Access Control (RBAC)

### 6.1 Principle of Least Privilege

**Always apply least privilege:**

```
✅ Good:  User has 'read' permission only
❌ Bad:   User has 'admin' role for everything
```

**Implementation:**
1. Identify minimum required permissions
2. Create custom roles if needed
3. Assign only necessary roles
4. Review quarterly

### 6.2 Role Assignment Best Practices

**Do:**
- ✅ Document why each role is assigned
- ✅ Set expiration dates for temporary roles
- ✅ Review role assignments quarterly
- ✅ Revoke unused roles immediately

**Don't:**
- ❌ Assign multiple roles unnecessarily
- ❌ Create overly permissive roles
- ❌ Leave roles unreviewed for 6+ months
- ❌ Grant 'admin' to non-admins

### 6.3 Custom Role Creation

When creating custom roles:

1. **Document Purpose:** Clear description of use case
2. **Minimal Permissions:** Only required permissions
3. **Scope Limitation:** Limit to necessary scope
4. **Review:** Have security team review
5. **Audit:** Log all role creation

**Example - Good Custom Role:**
```
Role: Content Editor
Permissions:
  - READ: Content
  - CREATE: Content
  - UPDATE: Own Content
  - DELETE: Own Content
Scope: Organization
```

**Example - Bad Custom Role:**
```
Role: Super User
Permissions: All
Scope: Global
(Too permissive!)
```

---

## 7. Audit Logging & Compliance

### 7.1 Critical Events to Monitor

Monitor these critical events:

- ✅ Failed login attempts (5+ in 1 hour)
- ✅ Super admin access to tenant data
- ✅ User account creation/deletion
- ✅ Role assignment/revocation
- ✅ Permission changes
- ✅ Password resets by admin
- ✅ 2FA enabled/disabled
- ✅ Session revocation
- ✅ Tenant isolation breach attempts

### 7.2 Audit Log Review

**Daily:**
- Review failed login attempts
- Check for unusual IP addresses
- Monitor super admin access

**Weekly:**
- Review user account changes
- Check role assignments
- Monitor permission changes

**Monthly:**
- Generate compliance report
- Analyze trends
- Identify anomalies

**Quarterly:**
- Full audit review
- Compliance assessment
- Security recommendations

### 7.3 Audit Log Retention

**Retention Policy:**
- Retain all logs for 7 years
- Archive logs after 1 year
- Encrypt archived logs
- Test recovery procedures

**Export for Compliance:**
```bash
# Export logs in JSON format
GET /api/audit-logs/export?format=json&startDate=2026-01-01&endDate=2026-12-31

# Export logs in CSV format
GET /api/audit-logs/export?format=csv&startDate=2026-01-01&endDate=2026-12-31
```

---

## 8. OAuth & Social Login Security

### 8.1 OAuth Provider Selection

Choose providers carefully:

**Recommended Providers:**
- ✅ Google (enterprise-grade security)
- ✅ Microsoft (enterprise-grade security)
- ✅ Apple (privacy-focused)
- ✅ GitHub (developer-focused)

**Avoid:**
- ❌ Unknown providers
- ❌ Providers without 2FA
- ❌ Providers with poor security records

### 8.2 OAuth Scope Limitation

Request minimal scopes:

```
✅ Good:  scope: 'openid profile email'
❌ Bad:   scope: 'openid profile email phone address'
```

**Scope Justification:**
- `openid` - Required for OpenID Connect
- `profile` - User name, picture
- `email` - User email address
- Avoid: phone, address, payment info

### 8.3 OAuth Token Validation

Always validate OAuth tokens:

1. **Signature Verification:** Verify token signature
2. **Expiration Check:** Ensure token not expired
3. **Issuer Verification:** Verify token issuer
4. **Audience Check:** Verify token audience matches

### 8.4 Account Linking

When linking OAuth accounts:

1. **Verify Ownership:** Confirm email ownership
2. **Prevent Takeover:** Don't auto-link on email match
3. **User Consent:** Require explicit consent
4. **Audit:** Log all account linking events

---

## 9. API Security

### 9.1 API Authentication

Always use JWT tokens:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Management:**
- ✅ Store tokens securely (secure storage, not localStorage)
- ✅ Include token in Authorization header
- ✅ Refresh tokens before expiration
- ✅ Revoke tokens on logout

### 9.2 API Rate Limiting

Implement rate limiting:

```
Authentication Endpoints:
  - 5 requests per minute per IP
  - 100 requests per hour per user

User Management Endpoints:
  - 100 requests per minute per user
  - 1000 requests per hour per user

Audit Log Endpoints:
  - 50 requests per minute per user
  - 500 requests per hour per user
```

### 9.3 CORS Configuration

Configure CORS properly:

```
✅ Good:   Allow specific origins
           Access-Control-Allow-Origin: https://example.com

❌ Bad:    Allow all origins
           Access-Control-Allow-Origin: *
```

### 9.4 HTTPS Requirement

Always use HTTPS:

```
✅ Enforce HTTPS for all endpoints
✅ Use TLS 1.3 or higher
✅ Use strong cipher suites
✅ Implement HSTS headers
```

---

## 10. Data Protection

### 10.1 Encryption at Rest

Encrypt sensitive data:

- ✅ Password hashes (bcrypt)
- ✅ OAuth tokens (AES-256)
- ✅ 2FA secrets (AES-256)
- ✅ Session tokens (AES-256)
- ✅ PII (AES-256)

### 10.2 Encryption in Transit

Use TLS for all communications:

```
✅ TLS 1.3 minimum
✅ Strong cipher suites
✅ Certificate validation
✅ HSTS headers
```

### 10.3 Data Residency

Respect data residency requirements:

- ✅ Store data in configured region
- ✅ Log cross-border data movement
- ✅ Implement geo-fencing if required
- ✅ Document data flow

---

## 11. Incident Response

### 11.1 Security Incident Response Plan

**Detection:**
1. Monitor audit logs for anomalies
2. Set up alerts for critical events
3. Review logs daily

**Response:**
1. Isolate affected accounts
2. Revoke all active sessions
3. Force password reset
4. Enable 2FA if not enabled
5. Notify user immediately

**Investigation:**
1. Review audit logs
2. Identify scope of breach
3. Determine root cause
4. Document findings

**Recovery:**
1. Restore from backups if needed
2. Verify system integrity
3. Re-enable affected accounts
4. Monitor for further incidents

### 11.2 Breach Notification

If data is breached:

1. **Immediate Actions:**
   - Isolate affected systems
   - Stop data exfiltration
   - Preserve evidence

2. **Notification (within 72 hours):**
   - Notify affected users
   - Provide clear information
   - Offer remediation steps

3. **Reporting:**
   - Report to authorities if required
   - Notify regulators
   - Document all actions

---

## 12. Compliance Checklist

### 12.1 GDPR Compliance

- ✅ User consent for data processing
- ✅ Right to access user data
- ✅ Right to delete user data
- ✅ Data breach notification (72 hours)
- ✅ Privacy policy updated
- ✅ DPA in place with processors

### 12.2 SOC 2 Compliance

- ✅ Access controls implemented
- ✅ Audit logging enabled
- ✅ Encryption at rest and in transit
- ✅ Incident response plan
- ✅ Regular security assessments
- ✅ Change management process

### 12.3 ISO 27001 Compliance

- ✅ Information security policy
- ✅ Risk assessment completed
- ✅ Security controls implemented
- ✅ Training provided
- ✅ Incident response plan
- ✅ Regular audits scheduled

---

## 13. Security Checklist

Use this checklist to verify your implementation:

### Authentication
- [ ] Password requirements enforced (12+ chars, uppercase, numbers, special)
- [ ] Password hashing with bcrypt (12 rounds)
- [ ] Account lockout after 5 failed attempts
- [ ] 2FA available for all users
- [ ] 2FA mandatory for admins
- [ ] OAuth providers configured securely
- [ ] Session tokens generated securely
- [ ] Tokens expire appropriately

### Authorization
- [ ] RBAC implemented with least privilege
- [ ] System roles defined and documented
- [ ] Custom roles reviewed by security
- [ ] Role assignments audited
- [ ] Permission checks on all endpoints
- [ ] Tenant isolation enforced
- [ ] Super admin access logged

### Audit & Monitoring
- [ ] All authentication events logged
- [ ] All authorization events logged
- [ ] All user management events logged
- [ ] Critical events identified
- [ ] Audit logs immutable (append-only)
- [ ] Logs retained for 7 years
- [ ] Daily log review scheduled
- [ ] Anomalies monitored

### Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] All communications use HTTPS/TLS 1.3
- [ ] Strong cipher suites configured
- [ ] Data residency respected
- [ ] Backups encrypted
- [ ] Recovery procedures tested

### Incident Response
- [ ] Incident response plan documented
- [ ] On-call team identified
- [ ] Escalation procedures defined
- [ ] Communication templates prepared
- [ ] Recovery procedures tested
- [ ] Breach notification procedures ready

---

## 14. Additional Resources

### Security Standards
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE Top 25](https://cwe.mitre.org/top25/)

### Compliance Frameworks
- [GDPR](https://gdpr-info.eu/)
- [SOC 2](https://www.aicpa.org/soc2)
- [ISO 27001](https://www.iso.org/isoiec-27001-information-security-management.html)

### Tools & Libraries
- [OWASP ZAP](https://www.zaproxy.org/) - Security testing
- [Snyk](https://snyk.io/) - Dependency scanning
- [Burp Suite](https://portswigger.net/burp) - Penetration testing

---

## 15. Support & Questions

For security questions or concerns:

1. **Email:** security@webwaka.com
2. **Slack:** #security channel
3. **Documentation:** See [ARCH_CS3_IAM_V2.md](./ARCH_CS3_IAM_V2.md)

---

**Last Updated:** January 30, 2026  
**Version:** 1.0.0

---

**End of Security Best Practices Guide**
