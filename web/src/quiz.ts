import type { QuizQuestion, QuizRecord, QuizStore } from './types';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const MAX_RECORDS = 20;
const key = (chapterId: string) => `chapter-tutor:quiz:v1:${chapterId}`;

export function emptyQuizStore(): QuizStore {
  return { records: [] };
}

export function isQuizQuestion(value: unknown): value is QuizQuestion {
  if (!value || typeof value !== 'object') return false;
  const q = value as Partial<QuizQuestion>;
  if (typeof q.question !== 'string' || !q.question.trim()) return false;
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return false;
  if (!q.options.every(option => typeof option === 'string' && !!option.trim())) return false;
  if (typeof q.correctIndex !== 'number' || !Number.isInteger(q.correctIndex)
    || q.correctIndex < 0 || q.correctIndex >= q.options.length) return false;
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) return false;
  if (!Array.isArray(q.citations) || q.citations.length < 1 || q.citations.length > 4) return false;
  return q.citations.every(c => !!c && Number.isInteger(c.slide) && typeof c.title === 'string');
}

function isRecord(value: unknown): value is QuizRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<QuizRecord>;
  if (typeof record.id !== 'string' || !record.id) return false;
  if (typeof record.slide !== 'number' || !Number.isInteger(record.slide) || record.slide < 1) return false;
  if (typeof record.createdAt !== 'string' || !record.createdAt) return false;
  const questions = record.questions;
  const answers = record.answers;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 5) return false;
  if (!questions.every(isQuizQuestion)) return false;
  if (!Array.isArray(answers) || answers.length !== questions.length) return false;
  return answers.every((answer, index) => typeof answer === 'number'
    && Number.isInteger(answer) && answer >= 0 && answer < questions[index].options.length);
}

export function loadQuizStore(store: StoragePort, chapterId: string): QuizStore {
  try {
    const raw = store.getItem(key(chapterId));
    if (!raw) return emptyQuizStore();
    const parsed = JSON.parse(raw) as { records?: unknown };
    if (!parsed || !Array.isArray(parsed.records)) return emptyQuizStore();
    return { records: parsed.records.filter(isRecord).slice(0, MAX_RECORDS) };
  } catch {
    return emptyQuizStore();
  }
}

export function saveQuizRecord(store: StoragePort, chapterId: string, record: QuizRecord): boolean {
  if (!isRecord(record)) return false;
  const current = loadQuizStore(store, chapterId);
  const records = [record, ...current.records.filter(item => item.id !== record.id)]
    .slice(0, MAX_RECORDS);
  try {
    store.setItem(key(chapterId), JSON.stringify({ records }));
    return true;
  } catch {
    return false;
  }
}

export function clearQuizStore(store: StoragePort, chapterId: string): boolean {
  try {
    store.removeItem(key(chapterId));
    return true;
  } catch {
    return false;
  }
}

export function deleteQuizRecord(
  store: StoragePort, chapterId: string, recordId: string,
): boolean {
  const current = loadQuizStore(store, chapterId);
  const records = current.records.filter(item => item.id !== recordId);
  if (records.length === current.records.length) return false;
  try {
    store.setItem(key(chapterId), JSON.stringify({ records }));
    return true;
  } catch {
    return false;
  }
}

export function newQuizRecord(
  slide: number, questions: QuizQuestion[], answers: number[],
): QuizRecord {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, slide, createdAt: new Date().toISOString(), questions, answers };
}

export function scoreRecord(record: QuizRecord): number {
  return record.questions.reduce(
    (score, question, index) => score + (record.answers[index] === question.correctIndex ? 1 : 0),
    0,
  );
}

export interface WrongAnswer {
  index: number;
  answer: number;
  question: QuizQuestion;
}

export function wrongAnswers(record: QuizRecord): WrongAnswer[] {
  return record.questions.flatMap((question, index) => (
    record.answers[index] === question.correctIndex
      ? [] : [{ index, answer: record.answers[index], question }]
  ));
}

export interface ChapterWrongAnswer extends WrongAnswer {
  slide: number;
  recordId: string;
}

export function chapterWrongAnswers(store: QuizStore): ChapterWrongAnswer[] {
  const seen = new Set<string>();
  const result: ChapterWrongAnswer[] = [];
  for (const record of store.records) {
    for (const wrong of wrongAnswers(record)) {
      if (seen.has(wrong.question.question)) continue;
      seen.add(wrong.question.question);
      result.push({ ...wrong, slide: record.slide, recordId: record.id });
    }
  }
  return result;
}

export function formatQuizDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function quizPercent(record: QuizRecord): number {
  return record.questions.length
    ? Math.round(scoreRecord(record) / record.questions.length * 100) : 0;
}

export function quizSummary(store: QuizStore): { attempts: number; averagePercent: number } {
  if (!store.records.length) return { attempts: 0, averagePercent: 0 };
  const total = store.records.reduce((sum, record) => sum + quizPercent(record), 0);
  return {
    attempts: store.records.length,
    averagePercent: Math.round(total / store.records.length),
  };
}

export function wrongAnswersMarkdown(record: QuizRecord, chapterTitle = ''): string {
  const wrong = wrongAnswers(record);
  const lines = [
    `# ${chapterTitle || '章节'}自测错题`,
    '',
    `- 页码：第 ${record.slide} 页`,
    `- 时间：${formatQuizDate(record.createdAt)}`,
    `- 得分：${scoreRecord(record)} / ${record.questions.length}`,
    '',
  ];
  wrong.forEach((item, index) => {
    lines.push(
      `## ${index + 1}. ${item.question.question}`,
      '',
      `- 你的答案：${item.question.options[item.answer] ?? '未作答'}`,
      `- 正确答案：${item.question.options[item.question.correctIndex]}`,
      `- 解析：${item.question.explanation}`,
      `- 引用：${item.question.citations.map(
        citation => `第 ${citation.slide} 页 · ${citation.title}`,
      ).join('；')}`,
      '',
    );
  });
  return lines.join('\n');
}
