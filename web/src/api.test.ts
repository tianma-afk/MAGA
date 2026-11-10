import { afterEach, expect, it, vi } from 'vitest';
import { api, ConfigurationError } from './api';

afterEach(() => vi.unstubAllGlobals());

function fail(status: number, body: string, contentType = 'application/json') {
  vi.stubGlobal('fetch', async () => new Response(body, {
    status, headers: { 'Content-Type': contentType },
  }));
}

function search() {
  return api.search('heartbeat', new AbortController().signal);
}

async function errorOf(request: Promise<unknown>): Promise<Error> {
  try {
    await request;
  } catch (caught) {
    return caught as Error;
  }
  throw new Error('request unexpectedly succeeded');
}

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

it('uses local configuration guidance instead of echoing the 503 message', async () => {
  fail(503, JSON.stringify({
    detail: { code: 'AI_NOT_CONFIGURED', message: '请配置 OPENAI_API_KEY 并重启后端。' },
  }));
  const error = await errorOf(search());
  expect(error).toBeInstanceOf(ConfigurationError);
  expect((error as ConfigurationError).code).toBe('AI_NOT_CONFIGURED');
  expect(error.message).toContain('LLM_API_KEY');
  expect(error.message).not.toContain('OPENAI_API_KEY');
});

it('translates known business failures and hides unknown details', async () => {
  fail(422, JSON.stringify({
    detail: '本页可提取文字不足，无法生成可靠自测；请切换到有文字内容的页面或查看原稿。',
  }));
  await expect(search()).rejects.toThrow('本页可提取文字不足');

  fail(422, JSON.stringify({ detail: 'upstream-secret-token exploded' }));
  const unknown = await errorOf(search());
  expect(unknown.message).toBe('请求内容不符合要求，请检查输入后重试。');
  expect(unknown.message).not.toContain('upstream-secret-token');

  fail(422, JSON.stringify({ detail: [{ msg: 'Input should be a valid string', input: 'raw' }] }));
  await expect(search()).rejects.toThrow('请求内容不符合要求');

  fail(422, JSON.stringify({
    detail: '没有在课件中找到足够的相关依据；请换一个更具体的场景，或先在章节中学习相关内容。',
  }));
  await expect(search()).rejects.toThrow('课件中没有足够依据');
});

it('distinguishes upstream, unavailable, missing and malformed failures', async () => {
  fail(502, JSON.stringify({ detail: 'provider secret text' }));
  const upstream = await errorOf(search());
  expect(upstream.message).toBe('AI 服务暂时不可用或返回了无法识别的内容，请稍后重试。');
  expect(upstream.message).not.toContain('provider');

  fail(503, JSON.stringify({ detail: 'maintenance' }));
  const unavailable = await errorOf(search());
  expect(unavailable).not.toBeInstanceOf(ConfigurationError);
  expect(unavailable.message).toBe('AI 服务暂时不可用，请稍后重试。');

  fail(404, JSON.stringify({ detail: 'Chapter not found' }));
  await expect(search()).rejects.toThrow('请求的内容不存在');

  vi.stubGlobal('fetch', async () => new Response('<html>bad gateway</html>', {
    status: 502, headers: { 'Content-Type': 'text/html' },
  }));
  await expect(search()).rejects.toThrow('AI 服务暂时不可用或返回了无法识别的内容');
});

it('reports a missing backend and preserves aborts', async () => {
  vi.stubGlobal('fetch', async () => { throw new TypeError('failed to fetch'); });
  await expect(search()).rejects.toThrow('无法连接后端服务');

  vi.stubGlobal('fetch', async () => { throw new DOMException('aborted', 'AbortError'); });
  const controller = new AbortController();
  controller.abort();
  await expect(api.search('x', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
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
