import type {
  Chapter, ChapterDetail, ChatResponse, Health, Message, Outline, QuizQuestion,
  QuizResponse, SearchResponse, SearchResult,
} from './types';
import { boundedHistory, validDiagram } from './state';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 503 && body?.detail?.code === 'AI_NOT_CONFIGURED') {
      throw new ConfigurationError(typeof body.detail.message === 'string'
        ? body.detail.message : '请配置后端 .env 并重启服务。');
    }
    throw new Error(`请求失败（${response.status}），请稍后重试。`);
  }
  try { return await response.json(); }
  catch { throw new Error('服务返回了无效数据，请重试。'); }
}
function quizQuestion(value: unknown): QuizQuestion {
  const q = value as Partial<QuizQuestion> | null;
  if (!q || typeof q.question !== 'string' || !q.question.trim()) {
    throw new Error('自测格式不完整，请重试。');
  }
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6
    || !q.options.every(option => typeof option === 'string' && !!option.trim())) {
    throw new Error('自测格式不完整，请重试。');
  }
  if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex)
    || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
    throw new Error('自测格式不完整，请重试。');
  }
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) {
    throw new Error('自测格式不完整，请重试。');
  }
  if (!Array.isArray(q.citations) || q.citations.length < 1 || q.citations.length > 4
    || !q.citations.every(c => !!c && Number.isInteger(c.slide) && typeof c.title === 'string')) {
    throw new Error('自测格式不完整，请重试。');
  }
  return q as QuizQuestion;
}
function searchResult(value: unknown): SearchResult {
  const result = value as Partial<SearchResult> | null;
  if (!result || typeof result.chapterId !== 'string' || typeof result.chapterTitle !== 'string'
    || typeof result.slide !== 'number' || !Number.isInteger(result.slide) || result.slide < 1
    || typeof result.slideTitle !== 'string' || typeof result.snippet !== 'string'
    || typeof result.score !== 'number' || !Number.isInteger(result.score) || result.score < 1) {
    throw new Error('搜索结果格式不完整。');
  }
  return result as SearchResult;
}
export const api = {
  health: (signal: AbortSignal) => json<Health>('/api/health', { signal }),
  chapters: (signal: AbortSignal) => json<Chapter[]>('/api/chapters', { signal }),
  chapter: (id: string, signal: AbortSignal) =>
    json<ChapterDetail>(`/api/chapters/${encodeURIComponent(id)}`, { signal }),
  outline: (id: string, signal: AbortSignal) =>
    json<Outline>(`/api/chapters/${encodeURIComponent(id)}/outline`, { signal }),
  async chat(chapterId: string, message: string, slide: number, history: Message[], signal: AbortSignal) {
    const result = await json<ChatResponse>('/api/chat', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId, message, slide,
        history: boundedHistory(history) }),
    });
    if (typeof result.content !== 'string' || !Number.isFinite(result.slide)
      || !Array.isArray(result.citations) || result.mode !== 'ai') {
      throw new Error('回复格式不完整，请重试。');
    }
    result.citations = result.citations.filter(c =>
      Number.isInteger(c?.slide) && typeof c?.title === 'string');
    if (!validDiagram(result.diagram)) result.diagram = undefined;
    return result;
  },
  async quiz(chapterId: string, slide: number, signal: AbortSignal): Promise<QuizResponse> {
    const result = await json<{ mode?: string; questions?: unknown }>('/api/quiz', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId, slide }),
    });
    if (result.mode !== 'ai' || !Array.isArray(result.questions)
      || result.questions.length < 3 || result.questions.length > 5) {
      throw new Error('自测格式不完整，请重试。');
    }
    return { mode: 'ai', questions: result.questions.map(quizQuestion) };
  },
  async search(query: string, signal: AbortSignal): Promise<SearchResponse> {
    const result = await json<{ query?: string; results?: unknown }>(
      `/api/search?q=${encodeURIComponent(query)}`, { signal },
    );
    if (typeof result.query !== 'string' || !Array.isArray(result.results)) {
      throw new Error('搜索结果格式不完整。');
    }
    return { query: result.query, results: result.results.map(searchResult) };
  },
};
export class ConfigurationError extends Error {
  readonly code = 'AI_NOT_CONFIGURED';
}
export function errorText(error: unknown) {
  return error instanceof TypeError ? '无法连接服务，请检查后端是否已启动。'
    : error instanceof Error ? error.message : '请求未完成，请重试。';
}
