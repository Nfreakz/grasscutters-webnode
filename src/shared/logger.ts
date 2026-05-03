type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, scope: string, message: string, extra?: unknown) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(extra === undefined ? {} : { extra })
  };

  const line = JSON.stringify(payload);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (scope: string, message: string, extra?: unknown) => write('info', scope, message, extra),
  warn: (scope: string, message: string, extra?: unknown) => write('warn', scope, message, extra),
  error: (scope: string, message: string, extra?: unknown) => write('error', scope, message, extra)
};
