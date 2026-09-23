import type { LogFn } from 'pino';

/**
 * Minimal logger shape this codebase actually depends on. Both pino's full
 * `Logger` and Fastify's `FastifyBaseLogger` (a narrower structural subset
 * of pino's interface) satisfy this, so `app.log`, `app.log.child(...)`,
 * and a standalone `pino()` instance are all interchangeable wherever
 * `AppLogger` is required.
 */
export interface AppLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  child: (bindings: Record<string, unknown>) => AppLogger;
}
