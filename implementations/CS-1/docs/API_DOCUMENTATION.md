# Financial Ledger Service - API Documentation

**Version:** 1.0  
**Base URL:** `/api/v1/ledger`  
**Date:** January 30, 2026

---

## Table of Contents

1. [Authentication](#authentication)
2. [Transaction Recording API](#transaction-recording-api)
3. [Query API](#query-api)
4. [Reporting API](#reporting-api)
5. [Admin API](#admin-api)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)

---

## Authentication

All API endpoints require JWT token authentication.

### Headers

```
Authorization: Bearer <jwt_token>
X-Tenant-ID: <tenant_uuid>
Content-Type: application/json
```

### Token Claims

```json
{
  "sub": "user_id",
  "tenant_id": "tenant_uuid",
  "role": "tenant_admin|tenant_user|super_admin",
  "permissions": ["ledger:read", "ledger:write"],
  "exp": 1234567890
}
```

---

## Transaction Recording API

### POST /api/v1/ledger/transactions

Record a new financial transaction with automatic double-entry generation.

#### Request

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionType": "SALE",
  "amount": "1000.00",
  "currency": "NGN",
  "actorType": "MERCHANT",
  "actorId": "660e8400-e29b-41d4-a716-446655440000",
  "externalReference": "ORDER-12345",
  "description": "Product sale - Widget A",
  "metadata": {
    "orderId": "ORDER-12345",
    "productId": "PROD-001",
    "quantity": 2
  }
}
```

#### Response (201 Created)

```json
{
  "transaction": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "transactionType": "SALE",
    "transactionDate": "2026-01-30T10:30:00.000Z",
    "amount": "1000.00",
    "currency": "NGN",
    "status": "COMPLETED",
    "externalReference": "ORDER-12345",
    "description": "Product sale - Widget A",
    "metadata": {
      "orderId": "ORDER-12345",
      "productId": "PROD-001",
      "quantity": 2
    },
    "actorType": "MERCHANT",
    "actorId": "660e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-01-30T10:30:00.000Z",
    "updatedAt": "2026-01-30T10:30:00.000Z"
  },
  "entries": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "tenantId": "550e8400-e29b-41d4-a716-446655440000",
      "transactionId": "770e8400-e29b-41d4-a716-446655440000",
      "entryDate": "2026-01-30T10:30:00.000Z",
      "accountId": "990e8400-e29b-41d4-a716-446655440000",
      "actorType": "MERCHANT",
      "actorId": "660e8400-e29b-41d4-a716-446655440000",
      "transactionType": "SALE",
      "amount": "1000.00",
      "currency": "NGN",
      "entryType": "DEBIT",
      "description": "Sale transaction - Debit",
      "createdAt": "2026-01-30T10:30:00.000Z"
    },
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "tenantId": "550e8400-e29b-41d4-a716-446655440000",
      "transactionId": "770e8400-e29b-41d4-a716-446655440000",
      "entryDate": "2026-01-30T10:30:00.000Z",
      "accountId": "bb0e8400-e29b-41d4-a716-446655440000",
      "actorType": "MERCHANT",
      "actorId": "660e8400-e29b-41d4-a716-446655440000",
      "transactionType": "SALE",
      "amount": "1000.00",
      "currency": "NGN",
      "entryType": "CREDIT",
      "description": "Sale transaction - Credit",
      "createdAt": "2026-01-30T10:30:00.000Z"
    }
  ]
}
```

#### Transaction Types

- `SALE` - Revenue from product or service sales
- `REFUND` - Reversal of previous sale
- `COMMISSION` - Affiliate or agent commission
- `PAYOUT` - Money transfer to external account
- `FEE` - Platform or service fees
- `ADJUSTMENT` - Manual correction or adjustment

#### Actor Types

- `PLATFORM` - WebWaka platform
- `PARTNER` - Partner organization
- `CLIENT` - Business client
- `MERCHANT` - Merchant/vendor
- `AGENT` - MLAS agent
- `END_USER` - End consumer

---

### POST /api/v1/ledger/transactions/batch

Record multiple transactions atomically.

#### Request

```json
{
  "transactions": [
    {
      "tenantId": "550e8400-e29b-41d4-a716-446655440000",
      "transactionType": "SALE",
      "amount": "1000.00",
      "currency": "NGN",
      "actorType": "MERCHANT",
      "actorId": "660e8400-e29b-41d4-a716-446655440000",
      "description": "Product sale - Widget A"
    },
    {
      "tenantId": "550e8400-e29b-41d4-a716-446655440000",
      "transactionType": "COMMISSION",
      "amount": "100.00",
      "currency": "NGN",
      "actorType": "AGENT",
      "actorId": "770e8400-e29b-41d4-a716-446655440000",
      "description": "Commission for Widget A sale"
    }
  ]
}
```

#### Response (201 Created)

```json
{
  "results": [
    {
      "transaction": { /* Transaction object */ },
      "entries": [ /* Ledger entries */ ]
    },
    {
      "transaction": { /* Transaction object */ },
      "entries": [ /* Ledger entries */ ]
    }
  ],
  "summary": {
    "totalTransactions": 2,
    "successCount": 2,
    "failedCount": 0
  }
}
```

---

## Query API

### GET /api/v1/ledger/transactions

Retrieve transaction history with filtering and pagination.

#### Query Parameters

- `startDate` (ISO 8601) - Filter by start date
- `endDate` (ISO 8601) - Filter by end date
- `transactionType` - Filter by transaction type
- `actorType` - Filter by actor type
- `actorId` - Filter by actor ID
- `minAmount` - Minimum transaction amount
- `maxAmount` - Maximum transaction amount
- `status` - Transaction status filter
- `limit` (default: 50, max: 1000) - Results per page
- `offset` (default: 0) - Pagination offset
- `sortBy` (date|amount) - Sort field
- `sortOrder` (asc|desc) - Sort order

#### Example Request

```
GET /api/v1/ledger/transactions?startDate=2026-01-01&endDate=2026-01-31&transactionType=SALE&limit=100&sortBy=date&sortOrder=desc
```

#### Response (200 OK)

```json
{
  "transactions": [
    { /* Transaction object */ },
    { /* Transaction object */ }
  ],
  "pagination": {
    "total": 250,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### GET /api/v1/ledger/transactions/:id

Retrieve a specific transaction by ID.

#### Response (200 OK)

```json
{
  "transaction": { /* Transaction object */ },
  "entries": [ /* Ledger entries */ ]
}
```

---

### GET /api/v1/ledger/accounts/:id/balance

Retrieve current balance for a specific account.

#### Query Parameters

- `effectiveDate` (ISO 8601) - Get historical balance at specific date

#### Response (200 OK)

```json
{
  "accountId": "990e8400-e29b-41d4-a716-446655440000",
  "accountCode": "1000-0001",
  "accountName": "Cash",
  "balance": "50000.00",
  "currency": "NGN",
  "effectiveDate": "2026-01-30T10:30:00.000Z",
  "lastTransactionDate": "2026-01-30T09:15:00.000Z"
}
```

---

### GET /api/v1/ledger/accounts/:id/entries

Retrieve all ledger entries for a specific account.

#### Query Parameters

- `startDate` (ISO 8601) - Filter by start date
- `endDate` (ISO 8601) - Filter by end date
- `limit` (default: 50, max: 1000)
- `offset` (default: 0)

#### Response (200 OK)

```json
{
  "entries": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "entryDate": "2026-01-30T10:30:00.000Z",
      "transactionId": "770e8400-e29b-41d4-a716-446655440000",
      "amount": "1000.00",
      "entryType": "DEBIT",
      "runningBalance": "51000.00",
      "description": "Sale transaction - Debit"
    }
  ],
  "pagination": {
    "total": 1500,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Reporting API

### GET /api/v1/ledger/reports/balance-sheet

Generate a balance sheet report.

#### Query Parameters

- `effectiveDate` (ISO 8601) - Report date
- `currency` (default: NGN) - Currency filter

#### Response (200 OK)

```json
{
  "reportDate": "2026-01-30",
  "currency": "NGN",
  "assets": {
    "cash": "50000.00",
    "accountsReceivable": "25000.00",
    "inventory": "15000.00",
    "total": "90000.00"
  },
  "liabilities": {
    "accountsPayable": "10000.00",
    "commissionPayable": "5000.00",
    "total": "15000.00"
  },
  "equity": {
    "ownerEquity": "50000.00",
    "retainedEarnings": "25000.00",
    "total": "75000.00"
  },
  "verification": {
    "assetsEqualsLiabilitiesPlusEquity": true,
    "difference": "0.00"
  }
}
```

---

### GET /api/v1/ledger/reports/income-statement

Generate an income statement report.

#### Query Parameters

- `startDate` (ISO 8601) - Report start date
- `endDate` (ISO 8601) - Report end date
- `currency` (default: NGN) - Currency filter

#### Response (200 OK)

```json
{
  "reportPeriod": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  },
  "currency": "NGN",
  "revenue": {
    "salesRevenue": "100000.00",
    "commissionRevenue": "5000.00",
    "platformFeeRevenue": "2000.00",
    "total": "107000.00"
  },
  "expenses": {
    "costOfGoodsSold": "50000.00",
    "commissionExpense": "10000.00",
    "operatingExpense": "15000.00",
    "total": "75000.00"
  },
  "netIncome": "32000.00"
}
```

---

### GET /api/v1/ledger/reports/transaction-summary

Generate transaction summary statistics.

#### Query Parameters

- `startDate` (ISO 8601)
- `endDate` (ISO 8601)
- `groupBy` (type|actor|date) - Grouping dimension

#### Response (200 OK)

```json
{
  "reportPeriod": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  },
  "summary": {
    "totalTransactions": 1500,
    "totalAmount": "500000.00",
    "averageAmount": "333.33",
    "currency": "NGN"
  },
  "byType": {
    "SALE": { "count": 1000, "amount": "400000.00" },
    "REFUND": { "count": 50, "amount": "20000.00" },
    "COMMISSION": { "count": 400, "amount": "40000.00" },
    "PAYOUT": { "count": 50, "amount": "40000.00" }
  }
}
```

---

### POST /api/v1/ledger/reports/export

Export ledger data in various formats.

#### Request

```json
{
  "reportType": "transactions|balance-sheet|income-statement",
  "format": "csv|json|excel",
  "filters": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-31",
    "transactionType": "SALE"
  },
  "deliveryMethod": "download|email"
}
```

#### Response (202 Accepted)

```json
{
  "exportId": "export-12345",
  "status": "processing",
  "estimatedCompletionTime": "2026-01-30T10:35:00.000Z",
  "downloadUrl": null
}
```

#### Status Check

```
GET /api/v1/ledger/reports/export/:exportId
```

#### Response (200 OK)

```json
{
  "exportId": "export-12345",
  "status": "completed",
  "downloadUrl": "https://exports.webwaka.com/export-12345.csv",
  "expiresAt": "2026-01-31T10:30:00.000Z"
}
```

---

## Admin API

### GET /api/v1/ledger/admin/audit-log

Retrieve audit log (Super Admin only).

**Authorization:** Requires `super_admin` role. All access is logged per INV-003.

#### Query Parameters

- `startDate` (ISO 8601)
- `endDate` (ISO 8601)
- `actorType`
- `actorId`
- `action`
- `limit` (default: 100)
- `offset` (default: 0)

#### Response (200 OK)

```json
{
  "auditEntries": [
    {
      "id": "audit-12345",
      "tenantId": "550e8400-e29b-41d4-a716-446655440000",
      "actorType": "SUPER_ADMIN",
      "actorId": "admin-001",
      "action": "VIEW_TENANT_TRANSACTIONS",
      "resourceType": "transactions",
      "resourceId": "770e8400-e29b-41d4-a716-446655440000",
      "justification": "Customer support request #CS-9876",
      "metadata": {
        "supportTicket": "CS-9876",
        "approvedBy": "manager-001"
      },
      "createdAt": "2026-01-30T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 50,
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### POST /api/v1/ledger/admin/reconcile

Trigger balance reconciliation.

**Authorization:** Requires `super_admin` role.

#### Request

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "reconciliationDate": "2026-01-30"
}
```

#### Response (200 OK)

```json
{
  "reconciliationId": "recon-12345",
  "status": "completed",
  "summary": {
    "accountsChecked": 15,
    "discrepanciesFound": 0,
    "correctiveActionsTaken": 0
  },
  "details": []
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_TRANSACTION",
    "message": "Transaction amount must be positive",
    "details": {
      "field": "amount",
      "value": "-100.00"
    },
    "timestamp": "2026-01-30T10:30:00.000Z",
    "requestId": "req-12345"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate transaction) |
| `UNPROCESSABLE_ENTITY` | 422 | Business logic validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Rate Limiting

API requests are rate-limited to ensure fair usage and system stability.

### Limits

- **Standard endpoints:** 1000 requests per hour per tenant
- **Reporting endpoints:** 100 requests per hour per tenant
- **Admin endpoints:** 500 requests per hour per admin

### Rate Limit Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1706608800
```

### Rate Limit Exceeded Response

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "retryAfter": 3600
  }
}
```

---

**End of API Documentation**
