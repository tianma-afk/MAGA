// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuizPane from './QuizPane';
import { api, ConfigurationError } from './api';
import { newQuizRecord, saveQuizRecord } from './quiz';
import { clearQuizWorkspace, loadQuizWorkspace, newQuizDraft, saveQuizWorkspace } from './quizWorkspace';
import type { ChapterDetail, QuizQuestion } from './types';

const chapter: ChapterDetail = {
  id: 'chapter4', title: '第4章 处理器', filename: 'chapter4.pptx', slideCount: 2,
  slides: [
    { number: 1, title: '处理器概述', text: '课件正文', notes: '' },
    { number: 2, title: '指令执行', text: '执行过程', notes: '' },
  ],
};

const questions: QuizQuestion[] = [
  {
    question: '问题一', options: ['正确一', '错误一A', '错误一B', '错误一C'],
    correctIndex: 0, explanation: '解析一', citations: [{ slide: 2, title: '指令执行' }],
  },
  {
    question: '问题二', options: ['错误二A', '正确二', '错误二B', '错误二C'],
    correctIndex: 1, explanation: '解析二', citations: [{ slide: 2, title: '指令执行' }],
  },
  {
    question: '问题三', options: ['错误三A', '错误三B', '正确三', '错误三C'],
    correctIndex: 2, explanation: '解析三', citations: [{ slide: 2, title: '指令执行' }],
  },
];

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(
  mode: 'ai' | 'unconfigured' = 'ai', onSource = vi.fn(), onMode = vi.fn(),
  onQuizChange = vi.fn(),
) {
  return render(<QuizPane chapter={chapter} page={1} mode={mode} onSource={onSource}
    onMode={onMode} onQuizChange={onQuizChange} />);
}

function mountAt(page: number) {
  return render(<QuizPane chapter={chapter} page={page} mode="ai" onSource={vi.fn()}
    onMode={vi.fn()} onQuizChange={vi.fn()} />);
}

it('generates, submits, scores, reviews wrong answers and persists history', async () => {
  const quiz = vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  const onSource = vi.fn();
  mount('ai', onSource);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  expect(await screen.findByText('问题一')).toBeTruthy();
  expect(quiz).toHaveBeenCalledWith('chapter4', 1, expect.any(AbortSignal));
  expect(screen.getByRole('button', { name: '提交自测' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('radio', { name: '正确一' }));
  fireEvent.click(screen.getByRole('radio', { name: '错误二A' }));
  fireEvent.click(screen.getByRole('radio', { name: '错误三A' }));
  fireEvent.click(screen.getByRole('button', { name: '提交自测' }));
  expect(screen.getByText('1 / 3', { selector: '.quiz-score strong' })).toBeTruthy();
  const wrong = document.querySelector('.quiz-wrong')!;
  expect(within(wrong as HTMLElement).getByText('问题二')).toBeTruthy();
  expect(within(wrong as HTMLElement).getByText('问题三')).toBeTruthy();
  fireEvent.click(within(wrong as HTMLElement).getAllByRole('button')[0]);
  expect(onSource).toHaveBeenCalledWith(2);
  const saved = JSON.parse(localStorage.getItem('chapter-tutor:quiz:v1:chapter4')!);
  expect(saved.records).toHaveLength(1);
  expect(saved.records[0].answers).toEqual([0, 0, 0]);
});

it('keeps saved history readable while generation is disabled', () => {
  saveQuizRecord(localStorage, chapter.id, newQuizRecord(1, questions, [0, 0, 0]));
  mount('unconfigured');
  expect(screen.getByRole('button', { name: /生成本页自测/ })).toHaveProperty('disabled', true);
  expect(screen.getByText(/可生成自测/)).toBeTruthy();
  expect(screen.getByText('1 / 3', { selector: '.quiz-score strong' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^第 1 页/ })).toBeTruthy();
});

it('reports configuration loss without fabricating a quiz', async () => {
  vi.spyOn(api, 'quiz').mockRejectedValue(new ConfigurationError('请配置模型'));
  const onMode = vi.fn();
  mount('ai', vi.fn(), onMode);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',
    expect.stringContaining('请配置模型'));
  expect(onMode).toHaveBeenCalledWith('unconfigured');
  expect(screen.queryByText('问题一')).toBeNull();
});

it('retries only wrong questions and deletes a history record', () => {
  saveQuizRecord(localStorage, chapter.id,
    newQuizRecord(1, questions, [0, 0, 0]));
  const changed = vi.fn();
  mount('ai', vi.fn(), vi.fn(), changed);
  expect(screen.getByText('1 / 3', { selector: '.quiz-score strong' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '导出错题' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '只练错题（2）' }));
  expect(screen.queryByText('问题一')).toBeNull();
  const draft = document.querySelector('.quiz-draft') as HTMLElement;
  expect(within(draft).getByText('问题二')).toBeTruthy();
  expect(within(draft).getByText('问题三')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: '正确二' }));
  fireEvent.click(screen.getByRole('radio', { name: '正确三' }));
  fireEvent.click(screen.getByRole('button', { name: '提交自测' }));
  expect(screen.getByText('2 / 2', { selector: '.quiz-score strong' })).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('chapter-tutor:quiz:v1:chapter4')!).records).toHaveLength(2);
  const deletes = screen.getAllByRole('button', { name: '删除第 1 页自测记录' });
  expect(deletes).toHaveLength(2);
  fireEvent.click(deletes[0]);
  expect(JSON.parse(localStorage.getItem('chapter-tutor:quiz:v1:chapter4')!).records).toHaveLength(1);
  expect(changed).toHaveBeenCalled();
});

it('reports ai mode after a successful generation', async () => {
  vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  const onMode = vi.fn();
  render(<QuizPane chapter={chapter} page={1} mode="ai" onSource={vi.fn()}
    onMode={onMode} onQuizChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  expect(await screen.findByText('问题一')).toBeTruthy();
  expect(onMode).toHaveBeenCalledWith('ai');
});

it('keeps the draft when history cannot be saved and allows a retry', async () => {
  vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  mountAt(1);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  await screen.findByText('问题一');
  fireEvent.click(screen.getByRole('radio', { name: '正确一' }));
  fireEvent.click(screen.getByRole('radio', { name: '错误二A' }));
  fireEvent.click(screen.getByRole('radio', { name: '错误三A' }));
  const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  fireEvent.click(screen.getByRole('button', { name: '提交自测' }));
  expect(screen.getByText('问题一')).toBeTruthy();
  expect(screen.getByText(/无法保存到本地/)).toBeTruthy();
  failing.mockRestore();

  fireEvent.click(screen.getByRole('button', { name: '提交自测' }));
  expect(screen.getByText('1 / 3', { selector: '.quiz-score strong' })).toBeTruthy();
});

it('aborts an in-flight quiz request on unmount', () => {
  let signal!: AbortSignal;
  vi.spyOn(api, 'quiz').mockImplementation((_id, _slide, suppliedSignal) => {
    signal = suppliedSignal;
    return new Promise(() => {});
  });
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  view.unmount();
  expect(signal.aborted).toBe(true);
});

it('keeps a half-finished draft across a remount and a page change', async () => {
  const quiz = vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  const first = mountAt(1);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  await screen.findByText('问题一');
  fireEvent.click(screen.getByRole('radio', { name: '正确一' }));
  expect(screen.getByText(/已作答 1 \/ 3/)).toBeTruthy();
  first.unmount();

  mountAt(2);
  expect(screen.getByText('问题一')).toBeTruthy();
  expect(screen.getByText(/已作答 1 \/ 3/)).toBeTruthy();
  expect(screen.getByText(/正在练习第 1 页内容 · 当前浏览第 2 页/)).toBeTruthy();
  expect(quiz).toHaveBeenCalledTimes(1);
});

it('asks before replacing an unfinished draft and keeps it on cancel', async () => {
  const quiz = vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  mountAt(1);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  await screen.findByText('问题一');
  fireEvent.click(screen.getByRole('radio', { name: '正确一' }));

  fireEvent.click(screen.getByRole('button', { name: '重新生成本页自测' }));
  expect(screen.getByRole('alertdialog', { name: '替换当前练习' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByText('问题一')).toBeTruthy();
  expect(screen.getByText(/已作答 1 \/ 3/)).toBeTruthy();
  expect(quiz).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: '重新生成本页自测' }));
  fireEvent.click(screen.getByRole('button', { name: '替换当前练习' }));
  expect(await screen.findByText(/已作答 0 \/ 3/)).toBeTruthy();
  expect(quiz).toHaveBeenCalledTimes(2);
});

it('retries wrong questions on the record slide, not the browsed page', () => {
  saveQuizRecord(localStorage, chapter.id, newQuizRecord(2, questions, [0, 0, 0]));
  mountAt(1);
  const history = screen.getByRole('region', { name: '本章自测历史' });
  fireEvent.click(within(history).getByRole('button', { name: /^第 2 页/ }));
  fireEvent.click(screen.getByRole('button', { name: '只练错题（2）' }));
  expect(screen.getByText(/正在练习第 2 页内容 · 当前浏览第 1 页/)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: '正确二' }));
  fireEvent.click(screen.getByRole('radio', { name: '正确三' }));
  fireEvent.click(screen.getByRole('button', { name: '提交自测' }));
  const records = JSON.parse(localStorage.getItem('chapter-tutor:quiz:v1:chapter4')!).records;
  expect(records).toHaveLength(2);
  expect(records[0].slide).toBe(2);
  expect(records[0].answers).toEqual([1, 2]);
});

it('shows the actual answered count while a draft is hidden and before replacement', () => {
  const draft = { ...newQuizDraft(1, questions), answers: [0, -1, -1] };
  saveQuizWorkspace(localStorage, chapter.id, { version: 1, draft, scrollTop: 0, updatedAt: '' });
  saveQuizRecord(localStorage, chapter.id, newQuizRecord(2, questions, [0, 0, 0]));
  mountAt(1);
  fireEvent.click(within(screen.getByRole('region', { name: '本章自测历史' }))
    .getByRole('button', { name: /^第 2 页/ }));
  expect(document.querySelector('.quiz-resume')?.textContent).toContain('已作答 1 / 3');
  fireEvent.click(screen.getByRole('button', { name: '重新生成本页自测' }));
  expect(screen.getByRole('alertdialog').textContent).toContain('已作答 1 / 3');
});

it('flushes the last scroll when unmounted within the debounce window', () => {
  vi.useFakeTimers();
  try {
    saveQuizWorkspace(localStorage, chapter.id, {
      version: 1, draft: newQuizDraft(1, questions), scrollTop: 100, updatedAt: '',
    });
    const first = mountAt(1);
    const pane = document.querySelector('.quiz-pane') as HTMLElement;
    pane.scrollTop = 480;
    fireEvent.scroll(pane);
    vi.advanceTimersByTime(50);
    first.unmount();
    expect(loadQuizWorkspace(localStorage, chapter.id, 2).scrollTop).toBe(480);
    mountAt(1);
    expect((document.querySelector('.quiz-pane') as HTMLElement).scrollTop).toBe(480);
  } finally { vi.useRealTimers(); }
});

it('flushes scroll on pagehide and restores a history view in StrictMode', () => {
  const record = newQuizRecord(2, questions, [0, 0, 0]);
  saveQuizRecord(localStorage, chapter.id, record);
  saveQuizWorkspace(localStorage, chapter.id, {
    version: 1, activeRecordId: record.id, scrollTop: 160, updatedAt: '',
  });
  const first = render(<StrictMode><QuizPane chapter={chapter} page={1} mode="ai"
    onMode={vi.fn()} onSource={vi.fn()} /></StrictMode>);
  const pane = document.querySelector('.quiz-pane') as HTMLElement;
  expect(pane.scrollTop).toBe(160);
  pane.scrollTop = 320;
  fireEvent.scroll(pane);
  window.dispatchEvent(new Event('pagehide'));
  expect(loadQuizWorkspace(localStorage, chapter.id, 2).scrollTop).toBe(320);
  first.unmount();
  mountAt(1);
  expect((document.querySelector('.quiz-pane') as HTMLElement).scrollTop).toBe(320);
});

it('does not recreate a cleared workspace when a dirty pane unmounts', () => {
  saveQuizWorkspace(localStorage, chapter.id, {
    version: 1, draft: newQuizDraft(1, questions), scrollTop: 0, updatedAt: '',
  });
  const first = mountAt(1);
  const pane = document.querySelector('.quiz-pane') as HTMLElement;
  pane.scrollTop = 240;
  fireEvent.scroll(pane);
  clearQuizWorkspace(localStorage, chapter.id);
  first.unmount();
  expect(localStorage.getItem('chapter-tutor:quiz-workspace:v1:chapter4')).toBeNull();
});

it('restores the practice scroll position after remounting', async () => {
  vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  const first = mountAt(1);
  fireEvent.click(screen.getByRole('button', { name: '生成本页自测' }));
  await screen.findByText('问题一');
  const pane = document.querySelector('.quiz-pane') as HTMLElement;
  pane.scrollTop = 240;
  vi.useFakeTimers();
  fireEvent.scroll(pane);
  vi.advanceTimersByTime(300);
  vi.useRealTimers();
  first.unmount();

  mountAt(1);
  expect((document.querySelector('.quiz-pane') as HTMLElement).scrollTop).toBe(240);
});
