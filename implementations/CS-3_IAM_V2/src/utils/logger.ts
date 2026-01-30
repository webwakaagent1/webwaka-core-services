/**
 * Logger Utility
 * Centralized logging for the IAM V2 system
 */

enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 10000;

  /**
   * Log an error
   */
  error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
    console.error(`[ERROR] ${message}`, context);
  }

  /**
   * Log a warning
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
    console.warn(`[WARN] ${message}`, context);
  }

  /**
   * Log info
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
    console.log(`[INFO] ${message}`, context);
  }

  /**
   * Log debug
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${message}`, context);
    }
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    this.logs.push(entry);

    // Keep logs bounded
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * Get all logs
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(l => l.level === level);
    }
    return this.logs;
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }
}

export const logger = new Logger();
