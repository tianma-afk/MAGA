import { describe, expect, it } from 'vitest';
import { loadSession, saveSession, emptySession, sessionReducer, boundedHistory } from './state';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('chapter persistence', () => {
  it('migrates only the page from legacy history, never old assistant interactions', () => {
    const store = storage();
    store.setItem('chapter-tutor:v1:a', JSON.stringify({ slide: 3, messages: [
      { id: 'u', role: 'user', content: '旧问题' },
      { id: 'a', role: 'assistant', content: '旧讲解', mode: 'offline' },
    ] }));
    expect(loadSession(store, 'a', 8)).toEqual({ ...emptySession(), slide: 3 });
  });
  it('isolates chapter messages and resumes the saved page', () => {
    const store = storage();
    const session = { ...emptySession(), slide: 4,
      messages: [{ id: '1', role: 'user' as const, content: 'why?' }] };
    expect(saveSession(store, 'a', session)).toBe(true);
    expect(loadSession(store, 'a', 8).slide).toBe(4);
    expect(loadSession(store, 'a', 8).messages).toEqual(session.messages);
    expect(loadSession(store, 'b', 8).messages).toEqual([]);
  });

  it('recovers from corrupt or unavailable storage', () => {
    const store = storage();
    store.setItem('chapter-tutor:v1:a', '{bad');
    expect(loadSession(store, 'a', 8)).toEqual(emptySession());
    const unavailable = { getItem() { throw Error(); }, setItem() { throw Error(); } };
    expect(loadSession(unavailable, 'a', 8)).toEqual(emptySession());
    expect(saveSession(unavailable, 'a', emptySession())).toBe(false);
  });

  it('clamps resumed pages and rejects invalid stored messages', () => {
    const store = storage();
    store.setItem('chapter-tutor:v1:a', JSON.stringify({
      slide: 99, messages: [{ role: 'system', content: 'bad' }],
    }));
    const result = loadSession(store, 'a', 3);
    expect(result.slide).toBe(3);
    expect(result.messages).toEqual([]);
    expect(result.pending).toBeNull();
  });

  it('never restores an in-flight request', () => {
    const store = storage();
    saveSession(store, 'a', { ...emptySession(), pending: 'r1', error: 'failed' });
    expect(loadSession(store, 'a', 3).pending).toBeNull();
    expect(loadSession(store, 'a', 3).error).toBeNull();
  });
});

describe('request state', () => {
  it('ignores stale completions after cancellation or chapter change', () => {
    const started = sessionReducer(emptySession(), { type: 'start', requestId: 'r1' });
    const cancelled = sessionReducer(started, { type: 'cancel' });
    expect(sessionReducer(cancelled, { type: 'complete', requestId: 'r1',
      message: { id: 'a', role: 'assistant', content: 'late' }, slide: 2,
    })).toEqual(cancelled);
    expect(sessionReducer(emptySession(), { type: 'fail', requestId: 'r1', error: 'late' }))
      .toEqual(emptySession());
  });

  it('adds a successful exchange exactly once and advances the page', () => {
    const started = sessionReducer(emptySession(), { type: 'start', requestId: 'r2' });
    const action = { type: 'complete' as const, requestId: 'r2', slide: 3,
      user: { id: 'u', role: 'user' as const, content: 'continue' },
      message: { id: 'a', role: 'assistant' as const, content: 'explanation' } };
    const done = sessionReducer(started, action);
    expect(done.messages).toHaveLength(2);
    expect(done.slide).toBe(3);
    expect(done.pending).toBeNull();
    expect(sessionReducer(done, action)).toEqual(done);
  });

  it('preserves history on failure so a retry does not duplicate messages', () => {
    const started = sessionReducer(emptySession(), { type: 'start', requestId: 'r3' });
    const failed = sessionReducer(started, { type: 'fail', requestId: 'r3', error: 'offline' });
    expect(failed.messages).toEqual([]);
    expect(failed.error).toBe('offline');
    expect(failed.pending).toBeNull();
    expect(sessionReducer(failed, { type: 'reset' })).toEqual(emptySession());
  });
});

describe('outgoing context limits', () => {
  it('keeps only the latest 30 messages without altering the full UI history', () => {
    const messages = Array.from({ length: 42 }, (_, i) => ({
      id: String(i), role: 'user' as const, content: `question ${i}`,
    }));
    const result = boundedHistory(messages);
    expect(result).toHaveLength(30);
    expect(result[0]).toEqual({ role: 'user', content: 'question 12' });
    expect(result[29].content).toBe('question 41');
    expect(messages).toHaveLength(42);
  });

  it('bounds each message and the total, giving recent context priority', () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), role: 'assistant' as const, content: String(i).repeat(10000),
    }));
    const result = boundedHistory(messages);
    expect(result.map(m => m.content.length)).toEqual([8000, 8000, 8000, 8000]);
    expect(result[0].content).toBe('2'.repeat(8000));
    expect(result[3].content).toBe('5'.repeat(8000));
    expect(messages[5].content).toHaveLength(10000);
  });

  it('uses remaining budget for the oldest retained message', () => {
    const messages = [7000, 7000, 7000, 7000, 7000].map((length, i) => ({
      id: String(i), role: 'user' as const, content: 'x'.repeat(length),
    }));
    expect(boundedHistory(messages).map(m => m.content.length)).toEqual([4000, 7000, 7000, 7000, 7000]);
    expect(boundedHistory([])).toEqual([]);
  });
});
