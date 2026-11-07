import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

it('sends backend-safe context while retaining full client messages', async () => {
  let body: Record<string, unknown> = {};
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ content: '回答', slide: 1, citations: [], mode: 'ai' }));
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

it('rejects legacy offline replies', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    content: '旧回复', slide: 1, citations: [], mode: 'offline',
  })));
  await expect(api.chat('a', '问', 1, [], new AbortController().signal)).rejects.toThrow('回复格式');
});

it('surfaces structured configuration instructions from 503', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    detail: { code: 'AI_NOT_CONFIGURED', message: '请配置 OPENAI_API_KEY 并重启后端。' },
  }), { status: 503 }));
  await expect(api.chat('a', '问', 1, [], new AbortController().signal))
    .rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', message: '请配置 OPENAI_API_KEY 并重启后端。' });
});

function quizAnswer() {
  return {
    mode: 'ai',
    questions: [1, 2, 3].map(index => ({
      question: `问题 ${index}`,
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 1,
      explanation: '解析',
      citations: [{ slide: 2, title: 'Availability' }],
    })),
  };
}

it('parses a valid quiz response', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(quizAnswer())));
  const result = await api.quiz('chapter5', 2, new AbortController().signal);
  expect(result.mode).toBe('ai');
  expect(result.questions).toHaveLength(3);
  expect(result.questions[0].options).toHaveLength(4);
});

it('rejects malformed quiz responses', async () => {
  const badIndex = quizAnswer();
  badIndex.questions[0].correctIndex = 9;
  const offline = { ...quizAnswer(), mode: 'offline' };
  for (const body of [badIndex, offline]) {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body)));
    await expect(api.quiz('chapter5', 2, new AbortController().signal))
      .rejects.toThrow('自测格式');
  }
});

it('parses search results and rejects malformed entries', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    query: 'heartbeat',
    results: [{
      chapterId: 'chapter-5', chapterTitle: 'Chapter 5: Availability', slide: 17,
      slideTitle: 'Heartbeat', snippet: 'Heartbeat detects failure.', score: 4,
    }],
  })));
  const response = await api.search('heartbeat', new AbortController().signal);
  expect(response.query).toBe('heartbeat');
  expect(response.results[0].slide).toBe(17);
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
    query: 'x', results: [{ chapterId: 'chapter-5' }],
  })));
  await expect(api.search('x', new AbortController().signal))
    .rejects.toThrow('搜索结果格式');
});
