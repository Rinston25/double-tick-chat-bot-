import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import type { AppLogger } from '../utils/logger.js';
import { MemorySessionStore } from './memoryStore.js';
import { RedisSessionStore } from './redisStore.js';
import type { SessionStore } from './store.js';

export interface SessionStoreHandle {
  store: SessionStore;
  kind: 'redis' | 'memory';
  /** Pings the backing store for the health check. Always true for the memory store. */
  ping: () => Promise<boolean>;
}

export function createSessionStore(logger: AppLogger): SessionStoreHandle {
  if (!env.REDIS_URL) {
    logger.info('REDIS_URL not set — using in-memory session store');
    return { store: new MemorySessionStore(), kind: 'memory', ping: async () => true };
  }

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  redis.on('error', (err) => logger.error({ err: err.message }, 'Redis connection error'));
  logger.info({ url: env.REDIS_URL }, 'Using Redis session store');

  return {
    store: new RedisSessionStore(redis),
    kind: 'redis',
    ping: async () => {
      try {
        const res = await redis.ping();
        return res === 'PONG';
      } catch {
        return false;
      }
    },
  };
}

export type { SessionStore } from './store.js';
export * from './store.js';
