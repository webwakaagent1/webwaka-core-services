import winston from 'winston';

/**
 * Logger Configuration for Financial Ledger Service
 * 
 * Provides structured logging with appropriate levels and formats
 * for financial transaction tracking and audit requirements.
 */

const logLevel = process.env.LOG_LEVEL || 'info';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'cs1-financial-ledger' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 30
    })
  ]
});

/**
 * Audit logger for financial operations
 * Separate logger for audit trail with extended retention
 */
export const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'cs1-financial-ledger', type: 'audit' },
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
      maxsize: 52428800, // 50MB
      maxFiles: 365 * 7 // 7 years retention
    })
  ]
});

/**
 * Log financial transaction
 */
export function logTransaction(
  action: string,
  transactionId: string,
  tenantId: string,
  actorId: string,
  metadata: Record<string, any>
): void {
  auditLogger.info('Financial transaction', {
    action,
    transactionId,
    tenantId,
    actorId,
    ...metadata
  });
}

/**
 * Log Super Admin access (INV-003)
 */
export function logSuperAdminAccess(
  adminId: string,
  tenantId: string,
  action: string,
  justification: string,
  metadata: Record<string, any>
): void {
  auditLogger.warn('Super Admin access to tenant data', {
    adminId,
    tenantId,
    action,
    justification,
    ...metadata
  });
}

/**
 * Log security event
 */
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  metadata: Record<string, any>
): void {
  auditLogger.error('Security event', {
    event,
    severity,
    ...metadata
  });
}
