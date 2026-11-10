import type { QuizQuestion, QuizRecord } from './types';
import { isQuizQuestion, loadQuizStore, wrongAnswers } from './quiz';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A generated but unsubmitted practice. Its source slide never follows the
 *  browsing position, so a quiz opened on page 17 still belongs to page 17
 *  after the learner reads page 2. */
export interface QuizDraft {
  id: string;
  sourceSlide: number;
  sourceRecordId?: string;
  kind: 'generated' | 'retry';
  questions: QuizQuestion[];
  answers: number[];
  createdAt: string;
}

export interface QuizWorkspace {
  version: 1;
  draft?: QuizDraft;
  activeRecordId?: string;
  scrollTop: number;
  updatedAt: string;
}

export const MAX_DRAFT_QUESTIONS = 5;
export const UNANSWERED = -1;
const KEY_PREFIX = 'chapter-tutor:quiz-workspace:v1:';

export function workspaceKey(chapterId: string): string {
  return KEY_PREFIX + chapterId;
}

export function emptyQuizWorkspace(): QuizWorkspace {
  return { version: 1, scrollTop: 0, updatedAt: '' };
}

function isDraft(value: unknown, slideCount?: number): value is QuizDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<QuizDraft>;
  if (typeof draft.id !== 'string' || !draft.id) return false;
  if (typeof draft.sourceSlide !== 'number' || !Number.isInteger(draft.sourceSlide)
    || draft.sourceSlide < 1) return false;
  if (slideCount !== undefined && draft.sourceSlide > slideCount) return false;
  if (draft.kind !== 'generated' && draft.kind !== 'retry') return false;
  if (draft.sourceRecordId !== undefined
    && (typeof draft.sourceRecordId !== 'string' || !draft.sourceRecordId)) return false;
  if (typeof draft.createdAt !== 'string' || !draft.createdAt) return false;
  const questions = draft.questions;
  const answers = draft.answers;
  if (!Array.isArray(questions) || questions.length < 1
    || questions.length > MAX_DRAFT_QUESTIONS) return false;
  if (!questions.every(isQuizQuestion)) return false;
  if (!Array.isArray(answers) || answers.length !== questions.length) return false;
  if (!answers.every((answer, index) => typeof answer === 'number'
    && Number.isInteger(answer) && answer >= UNANSWERED
    && answer < questions[index].options.length)) return false;
  if (slideCount !== undefined
    && questions.some(q => q.citations.some(c => c.slide < 1 || c.slide > slideCount))) {
    return false;
  }
  return true;
}

export function loadQuizWorkspace(
  store: StoragePort, chapterId: string, slideCount?: number,
): QuizWorkspace {
  try {
    const raw = store.getItem(workspaceKey(chapterId));
    if (!raw) return emptyQuizWorkspace();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return emptyQuizWorkspace();
    const fields = parsed as Partial<QuizWorkspace>;
    if (fields.version !== 1) return emptyQuizWorkspace();
    const workspace: QuizWorkspace = {
      version: 1,
      draft: isDraft(fields.draft, slideCount) ? fields.draft : undefined,
      activeRecordId: typeof fields.activeRecordId === 'string' && fields.activeRecordId
        ? fields.activeRecordId : undefined,
      scrollTop: typeof fields.scrollTop === 'number' && Number.isFinite(fields.scrollTop)
        && fields.scrollTop >= 0 ? fields.scrollTop : 0,
      updatedAt: typeof fields.updatedAt === 'string' ? fields.updatedAt : '',
    };
    const draft = workspace.draft;
    if (!draft) return workspace;
    // A commit whose draft cleanup failed must not offer the same questions twice.
    const committed = loadQuizStore(store, chapterId).records
      .some(record => record.id === draft.id);
    if (!committed) return workspace;
    const reconciled: QuizWorkspace = {
      version: 1,
      activeRecordId: draft.id,
      scrollTop: workspace.scrollTop,
      updatedAt: workspace.updatedAt,
    };
    saveQuizWorkspace(store, chapterId, reconciled);
    return reconciled;
  } catch {
    return emptyQuizWorkspace();
  }
}

export function saveQuizWorkspace(
  store: StoragePort, chapterId: string, workspace: QuizWorkspace,
): boolean {
  try {
    store.setItem(workspaceKey(chapterId), JSON.stringify(workspace));
    return true;
  } catch {
    return false;
  }
}

export function clearQuizWorkspace(store: StoragePort, chapterId: string): boolean {
  try {
    store.removeItem(workspaceKey(chapterId));
    return true;
  } catch {
    return false;
  }
}

function draftId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function newQuizDraft(
  sourceSlide: number, questions: QuizQuestion[], kind: QuizDraft['kind'] = 'generated',
  sourceRecordId?: string,
): QuizDraft {
  return {
    id: draftId(),
    sourceSlide,
    sourceRecordId,
    kind,
    questions,
    answers: questions.map(() => UNANSWERED),
    createdAt: new Date().toISOString(),
  };
}

/** Retry keeps the original record's slide, not the page being browsed. */
export function retryDraft(record: QuizRecord): QuizDraft | undefined {
  const questions = wrongAnswers(record).map(item => item.question);
  if (!questions.length) return undefined;
  return newQuizDraft(record.slide, questions, 'retry', record.id);
}

export function isDraftComplete(draft: QuizDraft | undefined): boolean {
  return !!draft && draft.answers.length === draft.questions.length
    && draft.answers.every(answer => answer >= 0);
}

export function answeredCount(draft: QuizDraft | undefined): number {
  return draft ? draft.answers.filter(answer => answer >= 0).length : 0;
}

/** Only a complete draft can become history; the draft id is the record id so
 *  a repeated submit cannot create a second entry. */
export function commitDraft(draft: QuizDraft): QuizRecord | undefined {
  if (!isDraftComplete(draft)) return undefined;
  return {
    id: draft.id,
    slide: draft.sourceSlide,
    createdAt: draft.createdAt,
    questions: draft.questions,
    answers: draft.answers,
  };
}
