import { describe, expect, it, vi } from 'vitest';
import { MemorySessionStore } from '../src/session/memoryStore.js';
import { createEmptySession, SESSION_TTL_SECONDS } from '../src/session/store.js';

describe('MemorySessionStore', () => {
  it('returns null for a session that was never set', async () => {
    const store = new MemorySessionStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('round-trips a session through set/get', async () => {
    const store = new MemorySessionStore();
    const session = createEmptySession('s1');
    session.stage = 'NEW_LEAD';
    session.identity.phone = '9876543210';

    await store.set(session);
    const fetched = await store.get('s1');
    expect(fetched?.stage).toBe('NEW_LEAD');
    expect(fetched?.identity.phone).toBe('9876543210');
  });

  it('deletes a session', async () => {
    const store = new MemorySessionStore();
    await store.set(createEmptySession('s1'));
    await store.delete('s1');
    expect(await store.get('s1')).toBeNull();
  });

  it('expires a session after the 2-hour TTL', async () => {
    vi.useFakeTimers();
    try {
      const store = new MemorySessionStore();
      await store.set(createEmptySession('s1'));
      expect(await store.get('s1')).not.toBeNull();

      vi.advanceTimersByTime(SESSION_TTL_SECONDS * 1000 + 1000);
      expect(await store.get('s1')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not expire a session just before the TTL', async () => {
    vi.useFakeTimers();
    try {
      const store = new MemorySessionStore();
      await store.set(createEmptySession('s1'));
      vi.advanceTimersByTime(SESSION_TTL_SECONDS * 1000 - 1000);
      expect(await store.get('s1')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
