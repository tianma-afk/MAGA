import { describe, expect, it } from 'vitest';
import {
  UNANSWERED, answeredCount, clearQuizWorkspace, commitDraft, emptyQuizWorkspace,
  isDraftComplete, loadQuizWorkspace, newQuizDraft, retryDraft, saveQuizWorkspace,
  workspaceKey,
} from './quizWorkspace';
import { loadQuizStore, newQuizRecord, saveQuizRecord } from './quiz';
import type { QuizQuestion } from './types';

function storage(options: { failSet?: boolean } = {}) {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.failSet) throw new Error('quota');
      values.set(key, value);
    },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function question(text = 'What detects failure?', slide = 2): QuizQuestion {
  return {
    question: text,
    options: ['Heartbeat', 'Latency', 'Throughput', 'Coupling'],
    correctIndex: 0,
    explanation: 'Heartbeat detects failure.',
    citations: [{ slide, title: 'Availability' }],
  };
}

describe('quiz workspace persistence', () => {
  it('round-trips an unfinished draft with unanswered entries', () => {
    const store = storage();
    const draft = newQuizDraft(17, [question('a'), question('b')]);
    expect(draft.answers).toEqual([UNANSWERED, UNANSWERED]);
    draft.answers[0] = 2;
    expect(saveQuizWorkspace(store, 'chapter-5', {
      version: 1, draft, scrollTop: 320, updatedAt: '2026-11-09T00:00:00.000Z',
    })).toBe(true);

    const loaded = loadQuizWorkspace(store, 'chapter-5', 39);
    expect(loaded.draft?.id).toBe(draft.id);
    expect(loaded.draft?.sourceSlide).toBe(17);
    expect(loaded.draft?.answers).toEqual([2, UNANSWERED]);
    expect(loaded.scrollTop).toBe(320);
    expect(answeredCount(loaded.draft)).toBe(1);
    expect(isDraftComplete(loaded.draft)).toBe(false);
  });

  it('isolates chapters and clears only the requested workspace', () => {
    const store = storage();
    saveQuizWorkspace(store, 'a', { version: 1, draft: newQuizDraft(1, [question()]), scrollTop: 0, updatedAt: '' });
    saveQuizWorkspace(store, 'b', { version: 1, draft: newQuizDraft(2, [question()]), scrollTop: 0, updatedAt: '' });
    expect(clearQuizWorkspace(store, 'a')).toBe(true);
    expect(loadQuizWorkspace(store, 'a', 10).draft).toBeUndefined();
    expect(loadQuizWorkspace(store, 'b', 10).draft?.sourceSlide).toBe(2);
  });

  it('retries the record slide instead of the browsed page and commits the draft id', () => {
    const store = storage();
    const record = newQuizRecord(17, [question('a'), question('b')], [0, 1]);
    const draft = retryDraft(record);
    expect(draft?.kind).toBe('retry');
    expect(draft?.sourceSlide).toBe(17);
    expect(draft?.sourceRecordId).toBe(record.id);
    expect(draft?.questions).toHaveLength(1);
    expect(draft?.questions[0].question).toBe('b');

    expect(commitDraft(draft!)).toBeUndefined();
    draft!.answers[0] = 0;
    const committed = commitDraft(draft!);
    expect(committed?.id).toBe(draft!.id);
    expect(committed?.slide).toBe(17);

    saveQuizRecord(store, 'chapter-5', committed!);
    saveQuizRecord(store, 'chapter-5', commitDraft({ ...draft!, answers: [1] })!);
    expect(loadQuizStore(store, 'chapter-5').records).toHaveLength(1);
  });

  it('drops a draft whose commit already reached history', () => {
    const store = storage();
    const draft = newQuizDraft(9, [question()]);
    draft.answers[0] = 0;
    saveQuizRecord(store, 'chapter-5', commitDraft(draft)!);
    saveQuizWorkspace(store, 'chapter-5', {
      version: 1, draft, scrollTop: 88, updatedAt: '2026-11-09T00:00:00.000Z',
    });

    const loaded = loadQuizWorkspace(store, 'chapter-5', 39);
    expect(loaded.draft).toBeUndefined();
    expect(loaded.activeRecordId).toBe(draft.id);
    expect(loaded.scrollTop).toBe(88);
    expect(JSON.parse(store.values.get(workspaceKey('chapter-5'))!).draft).toBeUndefined();
  });

  it('degrades corrupted, out-of-range and wrong-version data to an empty workspace', () => {
    const store = storage();
    const key = workspaceKey('chapter-5');
    for (const raw of [
      'not json',
      JSON.stringify({ version: 2, scrollTop: 0, updatedAt: '' }),
      JSON.stringify({ version: 1, scrollTop: -1, updatedAt: '' }),
    ]) {
      store.values.set(key, raw);
      expect(loadQuizWorkspace(store, 'chapter-5', 39)).toEqual(emptyQuizWorkspace());
    }

    const draft = newQuizDraft(17, [question()]);
    for (const broken of [
      { ...draft, answers: [] },
      { ...draft, answers: [-2] },
      { ...draft, answers: [4] },
      { ...draft, kind: 'review' },
      { ...draft, sourceSlide: 0 },
      { ...draft, sourceSlide: 40 },
      { ...draft, questions: [{ ...question(), correctIndex: 9 }] },
      { ...draft, questions: [{ ...question('a', 40) }] },
    ]) {
      store.values.set(key, JSON.stringify({
        version: 1, draft: broken, scrollTop: 0, updatedAt: '',
      }));
      expect(loadQuizWorkspace(store, 'chapter-5', 39).draft).toBeUndefined();
    }
  });

  it('drops only the invalid draft while preserving valid workspace fields', () => {
    const store = storage();
    const draft = newQuizDraft(17, [question()]);
    saveQuizWorkspace(store, 'chapter-5', {
      version: 1, draft, activeRecordId: 'result-1', scrollTop: 320,
      updatedAt: '2026-11-09T00:00:00.000Z',
    });
    expect(loadQuizWorkspace(store, 'chapter-5', 10)).toEqual({
      version: 1, draft: undefined, activeRecordId: 'result-1', scrollTop: 320,
      updatedAt: '2026-11-09T00:00:00.000Z',
    });
  });

  it('recovers valid fields independently when another field is damaged', () => {
    const store = storage();
    store.values.set(workspaceKey('chapter-5'), JSON.stringify({
      version: 1, scrollTop: -1, activeRecordId: 'result-1', updatedAt: 7,
    }));
    expect(loadQuizWorkspace(store, 'chapter-5', 39)).toEqual({
      version: 1, draft: undefined, scrollTop: 0,
      activeRecordId: 'result-1', updatedAt: '',
    });
  });

  it('reports storage failure without throwing', () => {
    const store = storage({ failSet: true });
    expect(saveQuizWorkspace(store, 'a', emptyQuizWorkspace())).toBe(false);
    expect(loadQuizWorkspace(store, 'a', 10)).toEqual(emptyQuizWorkspace());
  });
});
