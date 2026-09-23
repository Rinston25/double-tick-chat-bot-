import type { Redis } from 'ioredis';
import { SESSION_TTL_SECONDS, type SessionState, type SessionStore } from './store.js';

const KEY_PREFIX = 'mahindra:session:';

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  async get(sessionId: string): Promise<SessionState | null> {
    const raw = await this.redis.get(KEY_PREFIX + sessionId);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  }

  async set(state: SessionState): Promise<void> {
    await this.redis.set(
      KEY_PREFIX + state.sessionId,
      JSON.stringify(state),
      'EX',
      SESSION_TTL_SECONDS,
    );
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(KEY_PREFIX + sessionId);
  }
}
