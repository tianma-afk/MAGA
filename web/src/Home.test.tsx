// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Home from './Home';
import { homeSnapshot } from './resumeTasks';
import { saveSession, emptySession } from './state';
import { newQuizDraft, saveQuizWorkspace } from './quizWorkspace';
import { newQuizRecord, saveQuizRecord } from './quiz';
import { emptyDesignProject, saveDesignProject } from './design';
import { analysisKey } from './designValidity';
import type { Chapter } from './types';

const chapters: Chapter[] = [
  { id: 'chapter-1', title: '架构概论', filename: 'a.pptx', slideCount: 20 },
  { id: 'chapter-5', title: '可用性', filename: 'b.pptx', slideCount: 39 },
];
const old = '2026-01-01T10:00:00.000Z';
const recent = '2026-02-01T10:00:00.000Z';
const question = {
  question: '心跳是什么？', options: ['周期消息', '缓存'], correctIndex: 0,
  explanation: '用于检测故障', citations: [{ slide: 17, title: 'Heartbeat' }],
};
function reading(id: string, date: string, page = 2) {
  saveSession(localStorage, id, { ...emptySession(), slide: page });
  localStorage.setItem(`chapter-tutor:progress:v1:${id}`, JSON.stringify({ visited: [1, page], updatedAt: date }));
}
function exercise(id: string, date: string, slide = 17) {
  const draft = { ...newQuizDraft(slide, [question]), createdAt: date, answers: [0] };
  saveQuizWorkspace(localStorage, id, { version: 1, draft, scrollTop: 0, updatedAt: date });
  return draft;
}
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('offers a real start instead of inventing previous learning', () => {
  render(<Home chapters={chapters} />);
  expect(screen.getByRole('link', { name: '开始学习：架构概论' }).getAttribute('href'))
    .toBe('#/chapter/chapter-1');
  expect(screen.queryByRole('region', { name: '继续上次任务' })).toBeNull();
  expect(screen.queryByText(/上次读到/)).toBeNull();
  expect(screen.getAllByText('尚未浏览 · 开始学习')).toHaveLength(2);
});

it('shows one recent learning task, one quiz and the saved practice', () => {
  reading('chapter-1', old);
  reading('chapter-5', recent, 18);
  exercise('chapter-5', recent);
  saveDesignProject(localStorage, {
    ...emptyDesignProject(), title: '考试系统', scenario: '持续服务', updatedAt: recent,
  });
  render(<Home chapters={chapters} />);
  expect(screen.getByRole('link', { name: '继续学习：可用性' }).getAttribute('href'))
    .toBe('#/chapter/chapter-5');
  expect(screen.getByRole('link', { name: '继续练习：可用性' }).getAttribute('href'))
    .toBe('#/chapter/chapter-5?view=quiz');
  expect(screen.getByText('题目来源：第 17 页 · 已作答 1 / 1')).toBeTruthy();
  expect(screen.getByRole('link', { name: '继续实践：考试系统' })).toBeTruthy();
  expect(screen.getByText('场景输入')).toBeTruthy();
  expect(screen.queryByText(/已学/)).toBeNull();
});

it('ignores invalid recency and removed chapters without hiding valid history', () => {
  reading('chapter-1', 'not-a-date', 3);
  reading('chapter-5', recent);
  reading('removed-chapter', '2099-01-01T00:00:00.000Z');
  exercise('chapter-5', '2099-01-01T00:00:00.000Z');
  const value = homeSnapshot(localStorage, chapters);
  expect(value.tasks.find(task => task.kind === 'learning')?.title).toBe('可用性');
  expect(value.tasks.find(task => task.kind === 'quiz')).toBeUndefined();
  expect(value.summaries[0].page).toBe(3);
});

it('selects only the most recent valid unfinished practice', () => {
  const first = { ...newQuizDraft(2, [{ ...question, citations: [{ slide: 2, title: '概述' }] }]),
    createdAt: old };
  saveQuizWorkspace(localStorage, 'chapter-1', {
    version: 1, draft: first, scrollTop: 0, updatedAt: old,
  });
  exercise('chapter-5', recent);
  const snapshot = homeSnapshot(localStorage, chapters);
  expect(snapshot.tasks.filter(task => task.kind === 'quiz')).toHaveLength(1);
  expect(snapshot.tasks.find(task => task.kind === 'quiz')?.title).toBe('可用性');
  expect(localStorage.getItem('chapter-tutor:quiz-workspace:v1:chapter-1')).toContain(first.id);
});

it('does not let corrupted design and progress hide a valid practice', () => {
  localStorage.setItem('chapter-tutor:design:v1:current', '{broken');
  localStorage.setItem('chapter-tutor:progress:v1:chapter-1', '{broken');
  exercise('chapter-5', recent);
  render(<Home chapters={chapters} />);
  expect(screen.getByRole('link', { name: '继续练习：可用性' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: /继续实践/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /继续学习/ })).toBeNull();
});

it('keeps legacy resume positions and degrades damaged or inaccessible storage', () => {
  localStorage.setItem('chapter-tutor:v1:chapter-1', JSON.stringify({ slide: 8 }));
  localStorage.setItem('chapter-tutor:quiz-workspace:v1:chapter-5', '{broken');
  render(<Home chapters={chapters} />);
  expect(screen.getByText(/上次读到第 8 页 · 已浏览/)).toBeTruthy();
  cleanup();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => render(<Home chapters={chapters} />)).not.toThrow();
  expect(screen.queryByRole('region', { name: '继续上次任务' })).toBeNull();
});

it('reconciles an already submitted draft and describes the recent score scope', () => {
  const draft = exercise('chapter-5', recent);
  saveQuizRecord(localStorage, 'chapter-5', {
    ...newQuizRecord(17, [question], [0]), id: draft.id,
  });
  render(<Home chapters={chapters} />);
  expect(screen.queryByRole('link', { name: /继续练习/ })).toBeNull();
  expect(screen.getByText('最近 1 次自测 · 平均正确率 100%')).toBeTruthy();
});

it('describes stale and legacy design stages without claiming current results', () => {
  const project = { ...emptyDesignProject(), title: '旧方案', scenario: '修改后的场景',
    qualityAttributes: [{ name: '可用性', priority: 'high' as const, reason: '持续服务' }],
    updatedAt: recent,
  };
  saveDesignProject(localStorage, { ...project,
    versions: { analysis: analysisKey({ ...project, scenario: '旧场景' }) },
  });
  render(<Home chapters={chapters} />);
  expect(screen.getByText('场景分析 · 有结果待更新')).toBeTruthy();
  cleanup();
  saveDesignProject(localStorage, project);
  render(<Home chapters={chapters} />);
  expect(screen.getByText('场景分析 · 历史结果版本未记录')).toBeTruthy();
});

it('shows no invented chapter task when chapters are unavailable', () => {
  reading('chapter-1', recent);
  render(<Home chapters={[]} />);
  expect(screen.getByText('暂无可用章节。')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /继续学习/ })).toBeNull();
});
