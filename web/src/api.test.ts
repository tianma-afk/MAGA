import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

it('sends backend-safe context while retaining full client messages', async () => {
  let body: Record<string, unknown> = {};
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ content: '回答', slide: 1, citations: [], mode: 'offline' }));
  });
  const messages = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), role: 'user' as const, content: 'x'.repeat(9000),
  }));
  await api.chat('chapter4', '继续', 1, messages, new AbortController().signal);
  const history = body.history as { role: string; content: string }[];
  expect(history.length).toBeLessThanOrEqual(30);
  expect(history.reduce((sum, m) => sum + m.content.length, 0)).toBeLessThanOrEqual(32000);
  expect(history.every(m => m.content.length <= 8000)).toBe(true);
  expect(messages).toHaveLength(40);
  expect(messages[0].content).toHaveLength(9000);
});
