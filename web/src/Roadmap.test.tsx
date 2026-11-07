// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Roadmap from './Roadmap';
import type { Outline, QuizQuestion, QuizStore } from './types';

const outline: Outline = {
  chapterId: 'chapter5', title: '可用性学习路线',
  nodes: [
    { id: 'overview', title: '认识可用性', summary: '理解服务中断', slides: [1] },
    { id: 'detect', title: '检测故障', summary: '心跳与投票', slides: [2, 3] },
  ],
  edges: [{ source: 'overview', target: 'detect' }],
};

function question(text: string, slide: number, correctIndex: number): QuizQuestion {
  return {
    question: text, options: ['A', 'B', 'C', 'D'], correctIndex,
    explanation: '解析', citations: [{ slide, title: `第 ${slide} 页` }],
  };
}

const quizStore: QuizStore = {
  records: [{
    id: 'r1', slide: 2, createdAt: '2026-11-05T00:00:00.000Z',
    questions: [question('q1', 2, 0), question('q2', 3, 1)],
    answers: [0, 0],
  }],
};

afterEach(cleanup);

it('shows quiz mastery on matching outline nodes', () => {
  render(<Roadmap outline={outline} error="" onRetry={vi.fn()} page={1}
    onPage={vi.fn()} busy={false} quizStore={quizStore} />);
  expect(screen.getByText('1 次自测 · 50%')).toBeTruthy();
  expect(screen.getAllByText('未测')).toHaveLength(1);
});
