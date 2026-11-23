// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PracticeStudio from './PracticeStudio';
import { api } from './api';
import { loadPractice } from './practice';

const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };
const receipt = { strategy: 'baseline' as const, queries: ['availability heartbeat'],
  citations: [citation] };
const caseOne = { id: 'campus-booking', title: '校园活动报名与名额管理', level: '中级',
  background: '全校学生报名热门校园活动，名额有限。', requirements: ['避免超卖和重复报名'],
  constraints: ['三千人同时报名'] };
const decisions = ['capacity','notification','evolution'].map((id, i) => ({
  id, question: ['如何保证名额一致，不出现超卖和重复报名？',
    '如何保证报名成功后通知失败不影响交易？',
    '如何根据热点锁竞争进行架构演进？'][i], citations: [citation],
}));
const response = { action: 'complete' as const, feedback: '方案合理但需要评估负载。',
  followup: null, citations: [citation], knowledge: receipt };

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'practiceCases').mockResolvedValue([caseOne]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function begin() {
  fireEvent.click(await screen.findByRole('button', { name: /校园活动报名与名额管理/ }));
  fireEvent.change(screen.getByLabelText('2. 你的需求理解、额外约束与潜在风险'), {
    target: { value: '核心要求是名额一致性和故障恢复，需要关注高并发下锁竞争。' },
  });
  fireEvent.click(screen.getByRole('button', { name: '生成架构决策问题' }));
  expect(await screen.findByRole('heading', { name: /如何保证名额一致/ })).toBeTruthy();
}

it('starts from curated cases, learns through follow-up and produces a review', async () => {
  vi.spyOn(api, 'practicePlan').mockResolvedValue({ decisions, knowledge: receipt });
  vi.spyOn(api, 'practiceAnswer').mockResolvedValueOnce({
    ...response, action: 'followup', feedback: '需要考虑故障窗口。',
    followup: '假设事务失败后名额没有回滚，你会如何处理一致性风险？',
  }).mockResolvedValue(response);
  vi.spyOn(api, 'practiceFinalize').mockResolvedValue({
    summary: '能根据案例约束做出合理设计。', strengths: ['设计一致性明确'],
    improvements: ['加入压测指标'], referenceApproach: '先通过事务保证一致性。',
    citations: [citation], knowledge: receipt,
  });
  const source = vi.fn();
  render(<PracticeStudio mode="ai" onOpenSource={source} />);
  await begin();
  expect(loadPractice()?.decisions).toHaveLength(3);
  const first = '使用数据库事务和唯一索引来限制重复报名和超额报名。';
  fireEvent.change(screen.getByLabelText('你的架构设计思路'), { target: { value: first } });
  fireEvent.click(screen.getByRole('button', { name: '提交回答并获得反馈' }));
  expect(await screen.findByText(/假设事务失败后名额没有回滚/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('回答追问'), {
    target: { value: '事务失败时整体回滚，并做并发压测验证数据库吞吐能力。' },
  });
  fireEvent.click(screen.getByRole('button', { name: '提交回答并获得反馈' }));
  expect(await screen.findByRole('heading', { name: /如何保证报名成功后通知/ })).toBeTruthy();
  for (let i = 0; i < 2; i++) {
    fireEvent.change(screen.getByLabelText('你的架构设计思路'), {
      target: { value: '针对当前约束我优先使用模块化单体，并分析异常情况下的权衡。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交回答并获得反馈' }));
    await screen.findAllByText('方案合理但需要评估负载。');
  }
  fireEvent.click(screen.getByRole('button', { name: '生成综合评审与参考方案' }));
  expect(await screen.findByText('能根据案例约束做出合理设计。')).toBeTruthy();
  expect(loadPractice()?.final?.referenceApproach).toBe('先通过事务保证一致性。');
  fireEvent.click(screen.getAllByRole('button', { name: 'chapter-5 · 第 17 页' })[0]);
  expect(source).toHaveBeenCalledWith('chapter-5', 17);
});

it('blocks generation without configured AI and leaves case selection available', async () => {
  render(<PracticeStudio mode="unconfigured" onOpenSource={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /校园活动报名与名额管理/ }));
  expect(screen.getByRole('button', { name: '生成架构决策问题' })).toHaveProperty('disabled', true);
  expect(screen.getByText(/AI 未配置/)).toBeTruthy();
});

it('blocks hybrid until automatic indexing completes and keeps the strategy', async () => {
  let done!: (value: { status: 'ready'; total: number; updated: number; deleted: number }) => void;
  vi.spyOn(api, 'ensureRetrievalIndex').mockImplementation(() => new Promise(resolve => { done = resolve; }));
  const plan = vi.spyOn(api, 'practicePlan').mockResolvedValue({ decisions, knowledge: receipt });
  render(<PracticeStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('课程来源检索'), { target: { value: 'hybrid' } });
  fireEvent.click(await screen.findByRole('button', { name: /校园活动报名与名额管理/ }));
  fireEvent.change(screen.getByLabelText('2. 你的需求理解、额外约束与潜在风险'), {
    target: { value: '需要保证并发下的名额一致性和可用性，还要处理通知失败问题。' },
  });
  expect(screen.getByRole('button', { name: '生成架构决策问题' })).toHaveProperty('disabled', true);
  done({ status: 'ready', total: 340, updated: 0, deleted: 0 });
  await screen.findByText(/RAG 索引已就绪/);
  fireEvent.click(screen.getByRole('button', { name: '生成架构决策问题' }));
  await screen.findByRole('heading', { name: /如何保证名额一致/ });
  expect(plan.mock.calls[0][0].retrievalStrategy).toBe('hybrid');
  expect(screen.getByLabelText('课程来源检索')).toHaveProperty('disabled', true);
});
