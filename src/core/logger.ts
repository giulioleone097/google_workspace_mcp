type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel];
}

function log(level: LogLevel, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;
  const prefix = `[${level.toUpperCase()}]`;
  const output = meta !== undefined ? [prefix, message, meta] : [prefix, message];
  if (level === 'error') {
    console.error(...output);
    return;
  }
  if (level === 'warn') {
    console.warn(...output);
    return;
  }
  console.log(...output);
}

export const logger = {
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
};
