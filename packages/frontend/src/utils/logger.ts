type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
  };
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  constructor() {
    this.minLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 
      (import.meta.env.PROD ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
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
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    
    const reset = '\x1b[0m';
    const color = colorCodes[entry.level] || '';
    
    if (import.meta.env.PROD) {
      console.log(JSON.stringify(entry));
    } else {
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const errorStr = entry.error ? `\n  Error: ${entry.error.message}\n  Stack: ${entry.error.stack}` : '';
      console.log(`${color}[${entry.timestamp}] ${entry.level.toUpperCase()}${reset} ${entry.message}${contextStr}${errorStr}`);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      const entry = this.formatEntry('debug', message, context);
      this.addLog(entry);
      this.output(entry);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      const entry = this.formatEntry('info', message, context);
      this.addLog(entry);
      this.output(entry);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      const entry = this.formatEntry('warn', message, context);
      this.addLog(entry);
      this.output(entry);
    }
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    if (this.shouldLog('error')) {
      const entry = this.formatEntry('error', message, context, error);
      this.addLog(entry);
      this.output(entry);
    }
  }

  // Get logs for debugging
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  // Export logs as JSON
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new Logger();

// Global error handler
window.addEventListener('error', (event) => {
  logger.error('Global error', { 
    message: event.message, 
    filename: event.filename, 
    lineno: event.lineno, 
    colno: event.colno 
  }, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', { reason: event.reason }, 
    event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  );
});

export default logger;