import type { Chapter, ChapterDetail, ChatResponse, Message, Mode } from './types';
import { boundedHistory, validDiagram } from './state';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`请求失败（${response.status}），请稍后重试。`);
  try { return await response.json(); }
  catch { throw new Error('服务返回了无效数据，请重试。'); }
}
export const api = {
  health: (signal: AbortSignal) => json<{ status: string; mode: Mode }>('/api/health', { signal }),
  chapters: (signal: AbortSignal) => json<Chapter[]>('/api/chapters', { signal }),
  chapter: (id: string, signal: AbortSignal) =>
    json<ChapterDetail>(`/api/chapters/${encodeURIComponent(id)}`, { signal }),
  async chat(chapterId: string, message: string, slide: number, history: Message[], signal: AbortSignal) {
    const result = await json<ChatResponse>('/api/chat', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId, message, slide,
        history: boundedHistory(history) }),
    });
    if (typeof result.content !== 'string' || !Number.isFinite(result.slide)
      || !Array.isArray(result.citations) || !['offline', 'ai'].includes(result.mode)) {
      throw new Error('回复格式不完整，请重试。');
    }
    result.citations = result.citations.filter(c =>
      Number.isInteger(c?.slide) && typeof c?.title === 'string');
    if (!validDiagram(result.diagram)) result.diagram = undefined;
    return result;
  },
};
export function errorText(error: unknown) {
  return error instanceof TypeError ? '无法连接服务，请检查后端是否已启动。'
    : error instanceof Error ? error.message : '请求未完成，请重试。';
}
