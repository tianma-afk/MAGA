import type { Chapter, ChapterDetail, ChatResponse, Health, Message, Outline } from './types';
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
};
export class ConfigurationError extends Error {
  readonly code = 'AI_NOT_CONFIGURED';
}
export function errorText(error: unknown) {
  return error instanceof TypeError ? '无法连接服务，请检查后端是否已启动。'
    : error instanceof Error ? error.message : '请求未完成，请重试。';
}
