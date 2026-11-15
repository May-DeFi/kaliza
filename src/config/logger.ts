type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevelNum(): number {
  const level = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
  return LOG_ORDER[level] ?? 1;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LOG_ORDER[level] < currentLevelNum()) return;

  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
  child: (context: Record<string, unknown>) => ({
    debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, { ...context, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, { ...context, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, { ...context, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, { ...context, ...meta }),
  }),
};
