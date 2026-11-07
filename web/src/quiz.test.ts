import { describe, expect, it } from 'vitest';
import {
  MAX_RECORDS, chapterWrongAnswers, clearQuizStore, deleteQuizRecord, emptyQuizStore,
  loadQuizStore, newQuizRecord, quizPercent, quizSummary, saveQuizRecord, scoreRecord,
  wrongAnswers, wrongAnswersMarkdown,
} from './quiz';
import type { QuizQuestion } from './types';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function question(text = 'What detects failure?'): QuizQuestion {
  return {
    question: text,
    options: ['Heartbeat', 'Latency', 'Throughput', 'Coupling'],
    correctIndex: 1,
    explanation: 'Heartbeat detects failure.',
    citations: [{ slide: 2, title: 'Availability' }],
  };
}

function record(id = 'r1', slide = 2, answers = [1, 0, 0]) {
  return {
    id, slide, createdAt: '2026-11-03T00:00:00.000Z',
    questions: [question('a'), question('b'), question('c')], answers,
  };
}

describe('quiz persistence', () => {
  it('round-trips records newest first and isolates chapters', () => {
    const store = storage();
    expect(saveQuizRecord(store, 'a', record('r1'))).toBe(true);
    expect(saveQuizRecord(store, 'a', record('r2', 3))).toBe(true);
    expect(loadQuizStore(store, 'a').records.map(item => item.id)).toEqual(['r2', 'r1']);
    expect(loadQuizStore(store, 'b')).toEqual(emptyQuizStore());
    expect(clearQuizStore(store, 'a')).toBe(true);
    expect(loadQuizStore(store, 'a')).toEqual(emptyQuizStore());
  });

  it('allows short local retry records and deletes individual records', () => {
    const store = storage();
    const short = { ...record('short'), questions: [question('a')], answers: [1] };
    expect(saveQuizRecord(store, 'a', short)).toBe(true);
    expect(saveQuizRecord(store, 'a', record('full'))).toBe(true);
    expect(loadQuizStore(store, 'a').records).toHaveLength(2);
    expect(deleteQuizRecord(store, 'a', 'short')).toBe(true);
    expect(loadQuizStore(store, 'a').records.map(item => item.id)).toEqual(['full']);
    expect(deleteQuizRecord(store, 'a', 'missing')).toBe(false);
  });

  it('caps history at the bounded maximum', () => {
    const store = storage();
    for (let i = 0; i < MAX_RECORDS + 5; i++) saveQuizRecord(store, 'a', record(`r${i}`));
    const records = loadQuizStore(store, 'a').records;
    expect(records).toHaveLength(MAX_RECORDS);
    expect(records[0].id).toBe(`r${MAX_RECORDS + 4}`);
  });

  it('ignores corrupt data and unavailable storage', () => {
    const store = storage();
    store.setItem('chapter-tutor:quiz:v1:a', '{bad');
    expect(loadQuizStore(store, 'a')).toEqual(emptyQuizStore());
    const unavailable = {
      getItem() { throw Error(); },
      setItem() { throw Error(); },
      removeItem() { throw Error(); },
    };
    expect(loadQuizStore(unavailable, 'a')).toEqual(emptyQuizStore());
    expect(saveQuizRecord(unavailable, 'a', record())).toBe(false);
    expect(clearQuizStore(unavailable, 'a')).toBe(false);
  });

  it('drops records with mismatched answers or invalid indices', () => {
    const store = storage();
    const good = record('good');
    const short = { ...record('short'), answers: [1, 0] };
    const outOfRange = { ...record('out'), answers: [9, 0, 0] };
    const badQuestion = { ...record('bad'), questions: [{ ...question(), correctIndex: 9 }, question(), question()] };
    store.setItem('chapter-tutor:quiz:v1:a', JSON.stringify({
      records: [short, outOfRange, badQuestion, good],
    }));
    expect(loadQuizStore(store, 'a').records.map(item => item.id)).toEqual(['good']);
  });
});

describe('quiz scoring and review', () => {
  it('scores answers and lists wrong questions', () => {
    const quiz = record('r1', 2, [1, 0, 2]);
    expect(scoreRecord(quiz)).toBe(1);
    expect(wrongAnswers(quiz).map(item => item.index)).toEqual([1, 2]);
  });

  it('aggregates wrong answers across pages without repeating a question', () => {
    const first = record('r1', 2, [0, 0, 0]);
    const second = record('r2', 5, [0, 0, 0]);
    const aggregate = chapterWrongAnswers({ records: [second, first] });
    expect(aggregate).toHaveLength(3);
    expect(aggregate.map(item => item.slide)).toEqual([5, 5, 5]);
  });

  it('creates bounded, identifiable records', () => {
    const quiz = newQuizRecord(4, [question('a'), question('b'), question('c')], [1, 1, 1]);
    expect(quiz.slide).toBe(4);
    expect(quiz.id).toBeTruthy();
    expect(scoreRecord(quiz)).toBe(3);
  });

  it('summarizes attempts and exports wrong answers as markdown', () => {
    const partial = record('a', 2, [1, 0, 0]);
    const perfect = record('b', 2, [1, 1, 1]);
    expect(quizPercent(partial)).toBe(33);
    expect(quizSummary({ records: [partial, perfect] })).toEqual({
      attempts: 2, averagePercent: 67,
    });
    const markdown = wrongAnswersMarkdown(partial, '第5章');
    expect(markdown).toContain('第5章自测错题');
    expect(markdown).toContain('你的答案');
    expect(markdown).toContain('正确答案：Latency');
    expect(markdown).toContain('第 2 页 · Availability');
  });
});
