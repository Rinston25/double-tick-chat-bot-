import { SESSION_TTL_SECONDS, type SessionState, type SessionStore } from './store.js';

interface Entry {
  state: SessionState;
  expiresAt: number;
}

/** In-memory fallback session store, used when REDIS_URL is not configured. Not shared across processes. */
export class MemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, Entry>();

  async get(sessionId: string): Promise<SessionState | null> {
    const entry = this.entries.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(sessionId);
      return null;
    }
    return entry.state;
  }

  async set(state: SessionState): Promise<void> {
    this.entries.set(state.sessionId, {
      state,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.entries.delete(sessionId);
  }
}
