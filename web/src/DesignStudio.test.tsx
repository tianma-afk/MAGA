// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DesignStudio from './DesignStudio';
import { api } from './api';
import type {
  DesignReviewResponse, DesignScenarioResponse, DesignTacticResponse,
} from './types';

const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };
const scenarios: DesignScenarioResponse = {
  mode: 'ai',
  qualityAttributes: [{ name: '可用性', priority: 'high', reason: '考试不能中断' }],
  scenarios: [{
    stimulus: '组件故障', source: '监控器', artifact: '考试服务',
    environment: '正常运行', response: '检测并恢复', measure: '5 分钟内恢复',
    citations: [citation],
  }],
};
const tactics: DesignTacticResponse = {
  mode: 'ai',
  tactics: [{
    name: '心跳检测', rationale: '发现故障', tradeoffs: '增加消息开销',
    citations: [citation],
  }],
};
const review: DesignReviewResponse = {
  mode: 'ai',
  summary: '方案覆盖了可用性。',
  findings: [{
    area: '可用性', finding: '缺少恢复流程', severity: 'high',
    suggestion: '补充冗余', citations: [citation],
  }],
  questions: ['心跳停止后如何恢复？'],
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('runs the scenario, tactics and review flow and restores the draft', async () => {
  const scenarioApi = vi.spyOn(api, 'designScenarios').mockResolvedValue(scenarios);
  vi.spyOn(api, 'designTactics').mockResolvedValue(tactics);
  vi.spyOn(api, 'designReview').mockResolvedValue(review);
  const onOpen = vi.fn();
  const view = render(<DesignStudio mode="ai" onOpenSource={onOpen} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '考试期间持续提供服务' } });
  fireEvent.change(screen.getByLabelText('需求与约束'), { target: { value: '高可用' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  expect(scenarioApi).toHaveBeenCalledWith({
    title: '在线考试系统', scenario: '考试期间持续提供服务', requirements: '高可用',
  }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: '推荐架构战术' }));
  expect(await screen.findByText('心跳检测')).toBeTruthy();
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', true);
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 评审' }));
  expect(await screen.findByText('方案覆盖了可用性。')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'chapter-5 · 第 17 页' }));
  expect(onOpen).toHaveBeenCalledWith('chapter-5', 17);
  expect(localStorage.getItem('chapter-tutor:design:v1:current')).toBeTruthy();
  view.unmount();
  render(<DesignStudio mode="ai" onOpenSource={onOpen} />);
  expect(screen.getByText('方案覆盖了可用性。')).toBeTruthy();
});

it('disables generation when AI is unconfigured', () => {
  const scenarioApi = vi.spyOn(api, 'designScenarios');
  render(<DesignStudio mode="unconfigured" onOpenSource={vi.fn()} />);
  expect(screen.getByRole('button', { name: '生成质量属性与场景' })).toHaveProperty('disabled', true);
  expect(screen.getByText(/AI 尚未配置/)).toBeTruthy();
  expect(scenarioApi).not.toHaveBeenCalled();
});

it('keeps AI tactics that share a name as one selectable tactic', async () => {
  vi.spyOn(api, 'designScenarios').mockResolvedValue(scenarios);
  vi.spyOn(api, 'designTactics').mockResolvedValue({
    mode: 'ai',
    tactics: [
      { name: '心跳检测', rationale: '第一条理由', tradeoffs: '增加消息开销', citations: [citation] },
      {
        name: '心跳检测', rationale: '第二条理由', tradeoffs: '引入额外延迟',
        citations: [{ ...citation, slide: 18 }],
      },
    ],
  });
  const view = render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '考试期间持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '推荐架构战术' }));
  expect(await screen.findByText('第一条理由')).toBeTruthy();
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes).toHaveLength(1);
  expect(screen.queryByText('第二条理由')).toBeNull();
  expect(checkboxes[0]).toHaveProperty('checked', true);
  fireEvent.click(checkboxes[0]);
  expect(checkboxes[0]).toHaveProperty('checked', false);
  const draft = JSON.parse(localStorage.getItem('chapter-tutor:design:v1:current') ?? '{}');
  expect(draft.tactics).toHaveLength(1);
  view.unmount();
});
