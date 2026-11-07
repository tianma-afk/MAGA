import type {
  Chapter, ChapterDetail, ChatResponse, DesignCitation, DesignFinding,
  DesignQualityAttribute, DesignReview, DesignReviewResponse, DesignScenario,
  DesignScenarioResponse, DesignTactic, DesignTacticResponse, Health, Message,
  Outline, QuizQuestion, QuizResponse, SearchResponse, SearchResult,
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
const DESIGN_ERROR = '设计接口返回格式不完整，请重试。';

function designCitation(value: unknown): DesignCitation {
  const citation = value as Partial<DesignCitation> | null;
  if (!citation || typeof citation.chapterId !== 'string' || !citation.chapterId
    || typeof citation.slide !== 'number' || !Number.isInteger(citation.slide)
    || citation.slide < 1 || typeof citation.title !== 'string') {
    throw new Error(DESIGN_ERROR);
  }
  return citation as DesignCitation;
}

function designCitations(value: unknown): DesignCitation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new Error(DESIGN_ERROR);
  }
  return value.map(designCitation);
}

function designQualityAttribute(value: unknown): DesignQualityAttribute {
  const item = value as Partial<DesignQualityAttribute> | null;
  if (!item || typeof item.name !== 'string' || !item.name.trim()
    || !['high', 'medium', 'low'].includes(item.priority ?? '')
    || typeof item.reason !== 'string') {
    throw new Error(DESIGN_ERROR);
  }
  return item as DesignQualityAttribute;
}

function designScenario(value: unknown): DesignScenario {
  const item = value as Partial<DesignScenario> | null;
  const fields = ['stimulus', 'source', 'artifact', 'environment', 'response', 'measure'] as const;
  if (!item || fields.some(field => typeof item[field] !== 'string' || !item[field]?.trim())) {
    throw new Error(DESIGN_ERROR);
  }
  return { ...item, citations: designCitations(item.citations) } as DesignScenario;
}

function designTactic(value: unknown): DesignTactic {
  const item = value as Partial<DesignTactic> | null;
  if (!item || typeof item.name !== 'string' || !item.name.trim()
    || typeof item.rationale !== 'string' || !item.rationale.trim()
    || typeof item.tradeoffs !== 'string' || !item.tradeoffs.trim()) {
    throw new Error(DESIGN_ERROR);
  }
  return { ...item, citations: designCitations(item.citations) } as DesignTactic;
}

function designFinding(value: unknown): DesignFinding {
  const item = value as Partial<DesignFinding> | null;
  if (!item || typeof item.area !== 'string' || !item.area.trim()
    || typeof item.finding !== 'string' || !item.finding.trim()
    || !['high', 'medium', 'low'].includes(item.severity ?? '')
    || typeof item.suggestion !== 'string' || !item.suggestion.trim()) {
    throw new Error(DESIGN_ERROR);
  }
  return { ...item, citations: designCitations(item.citations) } as DesignFinding;
}

function designReview(value: unknown): DesignReview {
  const item = value as Partial<DesignReview> | null;
  if (!item || typeof item.summary !== 'string' || !item.summary.trim()
    || !Array.isArray(item.findings) || item.findings.length < 1 || item.findings.length > 8
    || !Array.isArray(item.questions) || item.questions.length < 1 || item.questions.length > 8
    || !item.questions.every(question => typeof question === 'string' && !!question.trim())) {
    throw new Error(DESIGN_ERROR);
  }
  return {
    summary: item.summary,
    findings: item.findings.map(designFinding),
    questions: item.questions,
  };
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
  async designScenarios(
    input: { title: string; scenario: string; requirements: string },
    signal: AbortSignal,
  ): Promise<DesignScenarioResponse> {
    const result = await json<{
      mode?: string; qualityAttributes?: unknown; scenarios?: unknown;
    }>('/api/design/scenarios', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (result.mode !== 'ai' || !Array.isArray(result.qualityAttributes)
      || result.qualityAttributes.length < 1 || result.qualityAttributes.length > 6
      || !Array.isArray(result.scenarios)
      || result.scenarios.length < 1 || result.scenarios.length > 6) {
      throw new Error(DESIGN_ERROR);
    }
    return {
      mode: 'ai',
      qualityAttributes: result.qualityAttributes.map(designQualityAttribute),
      scenarios: result.scenarios.map(designScenario),
    };
  },
  async designTactics(
    input: {
      scenario: string; requirements: string;
      qualityAttributes: DesignQualityAttribute[]; scenarios: DesignScenario[];
    },
    signal: AbortSignal,
  ): Promise<DesignTacticResponse> {
    const result = await json<{ mode?: string; tactics?: unknown }>('/api/design/tactics', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (result.mode !== 'ai' || !Array.isArray(result.tactics)
      || result.tactics.length < 1 || result.tactics.length > 8) {
      throw new Error(DESIGN_ERROR);
    }
    return { mode: 'ai', tactics: result.tactics.map(designTactic) };
  },
  async designReview(
    input: {
      title: string; scenario: string; requirements: string;
      qualityAttributes: DesignQualityAttribute[]; scenarios: DesignScenario[];
      tactics: DesignTactic[];
    },
    signal: AbortSignal,
  ): Promise<DesignReviewResponse> {
    const result = await json<Record<string, unknown>>('/api/design/review', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (result.mode !== 'ai') throw new Error(DESIGN_ERROR);
    return { ...designReview(result), mode: 'ai' };
  },
};
export class ConfigurationError extends Error {
  readonly code = 'AI_NOT_CONFIGURED';
}
export function errorText(error: unknown) {
  return error instanceof TypeError ? '无法连接服务，请检查后端是否已启动。'
    : error instanceof Error ? error.message : '请求未完成，请重试。';
}
