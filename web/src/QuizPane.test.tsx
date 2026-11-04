// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QuizPane from './QuizPane';
import { api, ConfigurationError } from './api';
import { newQuizRecord, saveQuizRecord } from './quiz';
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

function mount(mode: 'ai' | 'unconfigured' = 'ai', onPage = vi.fn(), onMode = vi.fn()) {
  return render(<QuizPane chapter={chapter} page={1} mode={mode} onPage={onPage} onMode={onMode} />);
}

it('generates, submits, scores, reviews wrong answers and persists history', async () => {
  const quiz = vi.spyOn(api, 'quiz').mockResolvedValue({ mode: 'ai', questions });
  const onPage = vi.fn();
  mount('ai', onPage);
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
  expect(onPage).toHaveBeenCalledWith(2);
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
  expect(screen.getByRole('button', { name: /第 1 页/ })).toBeTruthy();
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
