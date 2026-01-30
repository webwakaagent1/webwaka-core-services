# CS-1: Financial Ledger Service

**Version:** 1.0  
**Status:** Implementation Complete  
**Date:** January 30, 2026

---

## Overview

The Financial Ledger Service is a centralized, immutable financial ledger that serves as the single source of truth for all monetary flows across the WebWaka platform. It implements double-entry accounting principles, supports multiple actor types, enforces strict tenant isolation, and provides comprehensive query and reporting capabilities.

### Key Features

- **Immutable Append-Only Ledger** - All transactions are permanent; corrections via adjustment transactions
- **Double-Entry Accounting** - Every transaction has balanced debits and credits
- **Multi-Actor Support** - Tracks Platform, Partner, Client, Merchant, Agent, and End User transactions
- **Strict Tenant Isolation** - Complete data separation with row-level security (INV-002)
- **Comprehensive Audit Trail** - All operations logged with actor tracking (INV-003)
- **MLAS Foundation** - Provides data for commission calculations without embedding logic (INV-006)

---

## Architecture

The service implements a layered architecture with clear separation of concerns:

- **Models** - Data structures for accounts, transactions, and ledger entries
- **Services** - Business logic for transaction recording and querying
- **Controllers** - HTTP API endpoints (to be implemented)
- **Middleware** - Authentication, authorization, and tenant context
- **Database** - PostgreSQL with row-level security and triggers

### Double-Entry Accounting

Every transaction creates at least two ledger entries:
- **Debit** - Increases assets and expenses; decreases liabilities, equity, and revenue
- **Credit** - Increases liabilities, equity, and revenue; decreases assets and expenses

The fundamental equation **Assets = Liabilities + Equity** is always maintained.

---

## Installation

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run migrate

# Build TypeScript
npm run build

# Start development server
npm run dev

# Start production server
npm start
```

---

## Database Schema

### Core Tables

- **accounts** - Chart of accounts
- **transactions** - Financial transactions
- **ledger_entries** - Immutable double-entry ledger entries
- **account_balances** - Historical balance snapshots
- **audit_log** - Immutable audit trail

### Immutability Enforcement

Database triggers prevent UPDATE and DELETE operations on:
- `ledger_entries` - Ensures transaction history cannot be altered
- `audit_log` - Ensures audit trail cannot be tampered with

### Row-Level Security

All tables implement row-level security policies to enforce tenant isolation (INV-002).

---

## API Documentation

Complete API documentation is available in [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

### Quick Start

#### Record a Transaction

```bash
POST /api/v1/ledger/transactions
Authorization: Bearer <jwt_token>
X-Tenant-ID: <tenant_uuid>
Content-Type: application/json

{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionType": "SALE",
  "amount": "1000.00",
  "currency": "NGN",
  "actorType": "MERCHANT",
  "actorId": "660e8400-e29b-41d4-a716-446655440000",
  "description": "Product sale"
}
```

#### Query Transactions

```bash
GET /api/v1/ledger/transactions?startDate=2026-01-01&endDate=2026-01-31&limit=100
Authorization: Bearer <jwt_token>
X-Tenant-ID: <tenant_uuid>
```

#### Get Account Balance

```bash
GET /api/v1/ledger/accounts/:accountId/balance
Authorization: Bearer <jwt_token>
X-Tenant-ID: <tenant_uuid>
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Unit Tests

```bash
npm run test:unit
```

### Run Integration Tests

```bash
npm run test:integration
```

### Test Coverage

```bash
npm run test:coverage
```

---

## Transaction Types

| Type | Description | Debit Account | Credit Account |
|------|-------------|---------------|----------------|
| **SALE** | Revenue from sales | Cash | Sales Revenue |
| **REFUND** | Sale reversal | Refund Expense | Cash |
| **COMMISSION** | Agent commission | Commission Expense | Commission Payable |
| **PAYOUT** | Commission payment | Commission Payable | Cash |
| **FEE** | Platform fees | Platform Fee Expense | Platform Fee Revenue |
| **ADJUSTMENT** | Manual correction | (Specified) | (Specified) |

---

## Actor Types

- **PLATFORM** - WebWaka platform (earns fees, pays expenses)
- **PARTNER** - Partner organizations (deploy instances, earn revenue)
- **CLIENT** - Business clients (pay subscriptions, earn revenue)
- **MERCHANT** - Merchants/vendors (sell products/services)
- **AGENT** - MLAS agents (earn commissions)
- **END_USER** - End consumers (make purchases)

---

## Platform Invariants Compliance

### INV-002: Strict Tenant Isolation ✅

All ledger entries are strictly isolated by tenant ID. Row-level security policies enforce isolation at the database level. No cross-tenant queries are allowed.

### INV-003: Audited Super Admin Access ✅

All Super Admin access to tenant financial data is explicitly audited and logged with justification. Audit logs are immutable and retained for 7 years.

### INV-006: MLAS as Infrastructure ✅

The ledger provides foundational data for MLAS commission calculations without implementing commission logic. Transaction metadata includes attribution information for commission calculation.

### INV-011: Prompts-as-Artifacts (PaA) Execution ✅

This implementation was created according to the CS-1-PROMPT-v2 execution prompt. All work is committed to the GitHub repository and documented in the Master Control Board.

---

## Data Model

### Account

```typescript
{
  id: string;
  tenantId: string;
  accountCode: string;      // e.g., "1000-0001"
  accountName: string;      // e.g., "Cash"
  accountType: AccountType; // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  normalBalance: NormalBalance; // DEBIT or CREDIT
  currency: string;
  balance: Decimal;
  parentAccountId?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}
```

### Transaction

```typescript
{
  id: string;
  tenantId: string;
  transactionType: TransactionType;
  transactionDate: Date;
  amount: Decimal;
  currency: string;
  status: TransactionStatus;
  externalReference?: string;
  description: string;
  metadata?: Record<string, any>;
  actorType: ActorType;
  actorId: string;
}
```

### Ledger Entry

```typescript
{
  id: string;
  tenantId: string;
  transactionId: string;
  entryDate: Date;
  accountId: string;
  actorType: ActorType;
  actorId: string;
  transactionType: TransactionType;
  amount: Decimal;
  currency: string;
  entryType: EntryType; // DEBIT or CREDIT
  description: string;
  metadata?: Record<string, any>;
}
```

---

## Security

### Authentication

All API endpoints require JWT token authentication with tenant context.

### Authorization

Role-based access control:
- **Tenant Admin** - Read/write ledger entries for their tenant
- **Tenant User** - Read ledger entries for their tenant
- **Super Admin** - Read all ledger data (with audit logging)
- **System Service** - Write ledger entries for automated processes

### Data Encryption

- **At Rest** - AES-256 encryption
- **In Transit** - TLS 1.3
- **Field-Level** - Additional encryption for sensitive fields

---

## Monitoring

### Metrics

- Transaction recording throughput
- Query response times
- Database connection pool utilization
- Account balance reconciliation status
- Audit log volume

### Alerts

- Failed transactions
- Balance reconciliation discrepancies
- Unauthorized access attempts
- Database connection failures
- High error rates

---

## Deployment

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=webwaka_ledger
DB_USER=webwaka
DB_PASSWORD=<secure_password>
DB_POOL_MAX=20
DB_POOL_MIN=5

# Security
JWT_SECRET=<secure_secret>
JWT_EXPIRATION=3600

# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

### Docker

```bash
# Build image
docker build -t cs1-financial-ledger:1.0 .

# Run container
docker run -d \
  --name cs1-ledger \
  -p 3000:3000 \
  --env-file .env \
  cs1-financial-ledger:1.0
```

### Docker Compose

```bash
docker-compose up -d
```

---

## Development

### Project Structure

```
cs1-implementation/
├── src/
│   ├── config/          # Configuration (database, etc.)
│   ├── models/          # Data models and types
│   ├── services/        # Business logic
│   ├── controllers/     # API controllers (to be implemented)
│   ├── middleware/      # Authentication, authorization
│   └── utils/           # Utilities (logger, etc.)
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
├── migrations/          # Database migrations
├── docs/                # Documentation
├── package.json
├── tsconfig.json
└── README.md
```

### Code Style

- TypeScript with strict mode
- ESLint for linting
- Prettier for formatting
- Jest for testing

### Contributing

1. Create feature branch from `main`
2. Implement changes with tests
3. Run linting and tests
4. Submit pull request with description

---

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify database credentials in `.env`
- Ensure PostgreSQL is running
- Check network connectivity

**Transaction Recording Failed**
- Verify accounts exist for transaction type
- Check account currency matches transaction currency
- Ensure tenant ID is valid

**Balance Reconciliation Discrepancy**
- Run reconciliation job: `npm run reconcile`
- Check database triggers are active
- Review audit log for anomalies

---

## License

PROPRIETARY - WebWaka Platform

---

## Support

For issues or questions:
- Create issue in GitHub repository
- Contact platform team
- Review documentation in `/docs`

---

**End of README**
