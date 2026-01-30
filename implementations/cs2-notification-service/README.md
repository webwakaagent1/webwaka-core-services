# WebWaka CS-2: Notification Service

**Version:** 1.0.0  
**Status:** 🟢 Complete

## Overview

Multi-channel notification service that delivers messages via email, SMS, and push notifications with templating, user preferences, delivery tracking, and retry logic.

## Features

- **Multi-Channel Delivery**: Email, SMS, Push notifications
- **Templating Engine**: Handlebars-based with custom helpers
- **User Preferences**: Per-channel settings, quiet hours, frequency
- **Delivery Tracking**: Status, open rates, click tracking
- **Retry Logic**: Exponential backoff with configurable retries

## Quick Start

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/notifications` | Send notification |
| `GET /api/v1/notifications` | List notifications |
| `POST /api/v1/templates` | Create template |
| `GET /api/v1/templates` | List templates |
| `POST /api/v1/preferences` | Set user preferences |
| `GET /api/v1/preferences/user/:userId` | Get user preferences |

## Environment Variables

```env
DATABASE_URL=postgresql://...
SMTP_HOST=smtp.example.com
SMTP_PORT=587
EMAIL_FROM_ADDRESS=noreply@webwaka.com
SMS_PROVIDER=termii|twilio|africastalking
SMS_API_KEY=...
```

## Standard Templates

1. `welcome` - Welcome message
2. `password-reset` - Password reset
3. `order-confirmation` - Order confirmation
4. `payment-receipt` - Payment receipt
5. `system-alert` - System alerts

## Architecture

See [ARCH_CS2_NOTIFICATION_SERVICE.md](../../docs/architecture/ARCH_CS2_NOTIFICATION_SERVICE.md)

## License

PROPRIETARY - WebWaka Team
