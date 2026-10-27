/**
 * Logger Service
 * Structured logging with multiple levels and formats
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  constructor() {
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };
  }

  private output(entry: LogEntry): void {
    const colorCodes: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m', // red
      fatal: '\x1b[35m', // magenta
    };
    
    const reset = '\x1b[0m';
    const color = colorCodes[entry.level] || '';
    
    if (process.env.NODE_ENV === 'production') {
      // JSON format for production
      console.log(JSON.stringify(entry));
    } else {
      // Pretty format for development
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? `\n  Error: ${entry.error.message}\n  Stack: ${entry.error.stack}` : '';
      console.log(`${color}[${entry.timestamp}] ${entry.level.toUpperCase()}${reset} ${entry.message}${contextStr}${errorStr}`);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, context));
    }
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, context, error));
    }
  }

  fatal(message: string, context?: Record<string, unknown>, error?: Error): void {
    if (this.shouldLog('fatal')) {
      this.output(this.formatEntry('fatal', message, context, error));
    }
  }

  // Convenience methods
  http(method: string, url: string, statusCode: number, responseTimeMs: number): void {
    this.info(`${method} ${url}`, { statusCode, responseTimeMs });
  }

  db(operation: string, table: string, durationMs: number): void {
    this.debug(`DB ${operation} on ${table}`, { operation, table, durationMs });
  }

  auth(event: string, userId?: string, success?: boolean): void {
    this.info(`Auth: ${event}`, { event, userId, success });
  }

  sync(event: string, provider: string, details?: Record<string, unknown>): void {
    this.info(`Sync: ${event}`, { event, provider, ...details });
  }

  websocket(event: string, clientId?: string, details?: Record<string, unknown>): void {
    this.debug(`WS: ${event}`, { event, clientId, ...details });
  }
}

export const logger = new Logger();
export default logger;