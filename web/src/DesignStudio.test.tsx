// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DesignStudio from './DesignStudio';
import { api, ConfigurationError } from './api';
import { analysisKey, reviewKey, selectedTacticsOf, tacticsKey } from './designValidity';
import { saveDesignProject } from './design';
import type {
  DesignProject, DesignReviewResponse, DesignScenarioResponse, DesignTacticResponse,
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

beforeEach(() => {
  localStorage.clear();
  // jsdom does not implement native modal lifecycle used by ConfirmDialog.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

it('locks the draft inputs while a generation request is in flight', async () => {
  vi.spyOn(api, 'designScenarios').mockResolvedValue(scenarios);
  vi.spyOn(api, 'designTactics').mockResolvedValue(tactics);
  let release: (value: DesignReviewResponse) => void = () => undefined;
  vi.spyOn(api, 'designReview').mockImplementation(
    () => new Promise<DesignReviewResponse>(resolve => { release = resolve; }));
  const view = render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '考试期间持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '推荐架构战术' }));
  expect(await screen.findByText('心跳检测')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 评审' }));
  expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
  release(review);
  expect(await screen.findByText('方案覆盖了可用性。')).toBeTruthy();
  view.unmount();
  // The pending scenario request must also lock the step-one inputs.
  let hold: (value: DesignScenarioResponse) => void = () => undefined;
  vi.spyOn(api, 'designScenarios').mockImplementation(
    () => new Promise<DesignScenarioResponse>(resolve => { hold = resolve; }));
  localStorage.clear();
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '考试期间持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(screen.getByLabelText('设计标题')).toHaveProperty('disabled', true);
  expect(screen.getByLabelText('场景描述')).toHaveProperty('disabled', true);
  expect(screen.getByLabelText('需求与约束')).toHaveProperty('disabled', true);
  hold(scenarios);
  expect(await screen.findByText('可用性')).toBeTruthy();
});

it('saves typed input before any generation and restores it after remount', () => {
  const view = render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), {
    target: { value: '考试期间持续提供服务' },
  });
  const saved = JSON.parse(localStorage.getItem('chapter-tutor:design:v1:current')!);
  expect(saved.title).toBe('在线考试系统');
  expect(saved.scenario).toBe('考试期间持续提供服务');
  expect(screen.getByText(/已保存到本地/)).toBeTruthy();

  view.unmount();
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect((screen.getByLabelText('设计标题') as HTMLInputElement).value).toBe('在线考试系统');
  expect((screen.getByLabelText('场景描述') as HTMLTextAreaElement).value)
    .toBe('考试期间持续提供服务');
  expect(screen.getByText(/已保存到本地/)).toBeTruthy();
});

it('keeps the saved input when a generation fails', async () => {
  vi.spyOn(api, 'designScenarios').mockRejectedValue(new Error('请求失败（502），请稍后重试。'));
  const view = render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), {
    target: { value: '考试期间持续提供服务' },
  });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem('chapter-tutor:design:v1:current')!).title)
    .toBe('在线考试系统');

  view.unmount();
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect((screen.getByLabelText('设计标题') as HTMLInputElement).value).toBe('在线考试系统');
});

it('warns when storage is unavailable but keeps the form usable', () => {
  const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  expect(screen.getByText(/无法保存到本地/)).toBeTruthy();
  expect((screen.getByLabelText('设计标题') as HTMLInputElement).value).toBe('在线考试系统');
  failing.mockRestore();
});

function seededProject(): DesignProject {
  const value: DesignProject = {
    title: '在线考试系统',
    scenario: '考试期间持续提供服务',
    requirements: '高可用',
    qualityAttributes: scenarios.qualityAttributes,
    scenarios: scenarios.scenarios,
    tactics: tactics.tactics,
    selectedTactics: [tactics.tactics[0].name],
    review: { ...review },
    updatedAt: '2026-11-09T00:00:00.000Z',
  };
  return value;
}

it('marks an edited analysis stale and blocks the next stage', () => {
  const value = seededProject();
  delete value.review;
  value.tactics = [];
  value.selectedTactics = [];
  value.versions = {
    analysis: analysisKey({ ...value, title: '旧标题' }),
  };
  saveDesignProject(localStorage, value);
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect(screen.getByRole('heading', { name: '2. 质量属性与场景' })).toBeTruthy();
  expect(screen.getByText(/输入已修改/)).toBeTruthy();
  expect(screen.getByRole('button', { name: '推荐架构战术' })).toHaveProperty('disabled', true);
});

it('marks the review stale after a tactic change and keeps that on reload', async () => {
  vi.spyOn(api, 'designScenarios').mockResolvedValue(scenarios);
  vi.spyOn(api, 'designTactics').mockResolvedValue(tactics);
  vi.spyOn(api, 'designReview').mockResolvedValue(review);
  const view = render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '考试期间持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '推荐架构战术' }));
  expect(await screen.findByText('心跳检测')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 评审' }));
  expect(await screen.findByText('方案覆盖了可用性。')).toBeTruthy();
  expect(screen.queryByText(/仅供参考/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '返回战术' }));
  fireEvent.click(screen.getByRole('checkbox'));
  view.unmount();
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect(screen.getByText(/方案在此评审后有修改/)).toBeTruthy();
});

it('labels a legacy draft whose version was never recorded', () => {
  saveDesignProject(localStorage, seededProject());
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect(screen.getByText(/历史结果，版本未记录/)).toBeTruthy();
});

it('reports configuration loss and success to the shared connection state', async () => {
  const lost = vi.spyOn(api, 'designScenarios').mockRejectedValue(new ConfigurationError('请配置模型'));
  const onMode = vi.fn();
  const view = render(<DesignStudio mode="ai" onMode={onMode} onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect((await screen.findByRole('alert')).textContent).toContain('请配置模型');
  expect(onMode).toHaveBeenCalledWith('unconfigured');
  view.unmount();

  lost.mockResolvedValue(scenarios);
  const restored = vi.fn();
  render(<DesignStudio mode="ai" onMode={restored} onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  expect(restored).toHaveBeenCalledWith('ai');
});

it('asks before clearing the only practice draft', () => {
  saveDesignProject(localStorage, seededProject());
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect(screen.getByText('方案覆盖了可用性。')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /重新开始/ }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('已生成的质量属性、场景、战术与评审')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '保留草稿' }));
  expect(screen.getByText('方案覆盖了可用性。')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /重新开始/ }));
  fireEvent.click(screen.getByRole('button', { name: '清空实践草稿' }));
  expect((screen.getByLabelText('设计标题') as HTMLInputElement).value).toBe('');
  expect(localStorage.getItem('chapter-tutor:design:v1:current')).toBeNull();
});

const draftKey = 'chapter-tutor:design:v1:current';

function completedProject(stale = false) {
  const value = seededProject();
  value.versions = {
    analysis: analysisKey(value), tactics: tacticsKey(value),
    review: reviewKey(value, selectedTacticsOf(value)),
  };
  if (stale) value.requirements = '新增峰值约束';
  saveDesignProject(localStorage, value);
  return value;
}

function mockExport() {
  const create = vi.fn((_blob: Blob) => 'blob:design');
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return create;
}

it('revisits and exports every saved stage without a key when analysis is stale', async () => {
  completedProject(true);
  const saved = localStorage.getItem(draftKey);
  const scenarioApi = vi.spyOn(api, 'designScenarios');
  const tacticApi = vi.spyOn(api, 'designTactics');
  const reviewApi = vi.spyOn(api, 'designReview');
  const create = mockExport();
  render(<DesignStudio mode="unconfigured" onOpenSource={vi.fn()} />);
  expect(screen.getByRole('heading', { name: '2. 质量属性与场景' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '推荐架构战术' })).toHaveProperty('disabled', true);
  for (const label of ['查看场景', '查看场景分析', '查看战术', '查看评审']) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getAllByRole('button', { name: '导出 Markdown' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }));
  }
  expect(screen.getByText(review.summary)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '查看战术' }));
  expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: '生成 AI 评审' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(localStorage.getItem(draftKey)).toBe(saved);
  expect(create).toHaveBeenCalledTimes(4);
  const blob = create.mock.calls[0][0] as Blob;
  const markdown = await new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(markdown).toContain(review.summary);
  expect(markdown).toContain(tactics.tactics[0].name);
  expect(scenarioApi).not.toHaveBeenCalled();
  expect(tacticApi).not.toHaveBeenCalled();
  expect(reviewApi).not.toHaveBeenCalled();
});

it.each(['analysis', 'tactics', 'review'] as const)('cancels %s replacement without API calls and offers export', stage => {
  completedProject();
  const saved = localStorage.getItem(draftKey);
  const apiCall = vi.spyOn(api, stage === 'analysis' ? 'designScenarios'
    : stage === 'tactics' ? 'designTactics' : 'designReview');
  const create = mockExport();
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: stage === 'analysis' ? '查看场景'
    : stage === 'tactics' ? '查看场景分析' : '查看战术' }));
  fireEvent.click(screen.getByRole('button', { name: stage === 'analysis' ? '生成质量属性与场景'
    : stage === 'tactics' ? '推荐架构战术' : '生成 AI 评审' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText(stage === 'analysis' ? '质量属性与场景分析、架构战术、战术选择及 AI 评审'
    : stage === 'tactics' ? '架构战术、战术选择及 AI 评审' : 'AI 评审')).toBeTruthy();
  fireEvent.click(dialog.getByRole('button', { name: '先导出 Markdown' }));
  expect(create).toHaveBeenCalledOnce();
  expect(apiCall).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole('button', { name: '取消，保留原成果' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(apiCall).not.toHaveBeenCalled();
  expect(localStorage.getItem(draftKey)).toBe(saved);
});

it.each(['analysis', 'tactics'] as const)('keeps all old results on %s failure or stop, replacing only after success', async stage => {
  completedProject();
  const saved = localStorage.getItem(draftKey);
  const scenarioApi = vi.spyOn(api, 'designScenarios').mockRejectedValue(new Error('生成失败'));
  const tacticApi = vi.spyOn(api, 'designTactics').mockRejectedValue(new Error('生成失败'));
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: stage === 'analysis' ? '查看场景' : '查看场景分析' }));
  const generate = () => {
    fireEvent.click(screen.getByRole('button', { name: stage === 'analysis' ? '生成质量属性与场景' : '推荐架构战术' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认重新生成' }));
  };
  generate();
  expect((await screen.findByRole('alert')).textContent).toContain('生成失败');
  expect(localStorage.getItem(draftKey)).toBe(saved);
  let finish: () => void = () => undefined;
  if (stage === 'analysis') scenarioApi.mockImplementation(() => new Promise(resolve => {
    finish = () => resolve({ ...scenarios, qualityAttributes: [{ name: '性能', priority: 'high', reason: '新分析' }] });
  }));
  else tacticApi.mockImplementation(() => new Promise(resolve => {
    finish = () => resolve({ ...tactics, tactics: [{ ...tactics.tactics[0], name: '冗余' }] });
  }));
  generate();
  expect(localStorage.getItem(draftKey)).toBe(saved);
  for (const name of ['查看场景', '查看场景分析', '查看战术', '查看评审']) {
    expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
  }
  const back = screen.queryByRole('button', { name: '修改场景' });
  if (back) expect(back).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: '停止' }));
  await act(async () => finish());
  expect(localStorage.getItem(draftKey)).toBe(saved);
  generate();
  expect(localStorage.getItem(draftKey)).toBe(saved);
  await act(async () => finish());
  const replaced = JSON.parse(localStorage.getItem(draftKey)!);
  expect(replaced.review).toBeUndefined();
  expect(replaced.versions.review).toBeUndefined();
  if (stage === 'analysis') {
    expect(replaced.qualityAttributes[0].name).toBe('性能');
    expect(replaced.tactics).toEqual([]);
    expect(replaced.selectedTactics).toEqual([]);
    expect(replaced.versions.tactics).toBeUndefined();
  } else {
    expect(replaced.qualityAttributes).toEqual(scenarios.qualityAttributes);
    expect(replaced.tactics[0].name).toBe('冗余');
    expect(replaced.selectedTactics).toEqual(['冗余']);
  }
});

it.each(['analysis', 'tactics', 'review'] as const)('keeps old %s results and the current step if saving the replacement fails', async stage => {
  completedProject();
  const saved = localStorage.getItem(draftKey);
  vi.spyOn(api, 'designScenarios').mockResolvedValue(scenarios);
  vi.spyOn(api, 'designTactics').mockResolvedValue(tactics);
  vi.spyOn(api, 'designReview').mockResolvedValue({ ...review, summary: '新评审' });
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: stage === 'analysis' ? '查看场景'
    : stage === 'tactics' ? '查看场景分析' : '查看战术' }));
  const heading = screen.getAllByRole('heading', { level: 2 })[0].textContent;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  fireEvent.click(screen.getByRole('button', { name: stage === 'analysis' ? '生成质量属性与场景'
    : stage === 'tactics' ? '推荐架构战术' : '生成 AI 评审' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认重新生成' }));
  expect(await screen.findByText(/无法保存到本地/)).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 2 })[0].textContent).toBe(heading);
  expect(localStorage.getItem(draftKey)).toBe(saved);
  fireEvent.click(screen.getByRole('button', { name: '查看战术' }));
  expect(screen.getByText('心跳检测')).toBeTruthy();
  expect(screen.getByRole('checkbox')).toHaveProperty('checked', true);
  fireEvent.click(screen.getByRole('button', { name: '查看评审' }));
  expect(screen.getByText(review.summary)).toBeTruthy();
  expect(screen.queryByText('新评审')).toBeNull();
  expect(screen.queryByText(/仅供参考/)).toBeNull();
});

it('keeps legacy drafts without version keys viewable and usable', () => {
  saveDesignProject(localStorage, seededProject());
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '查看战术' }));
  expect(screen.getByText(/历史结果，版本未记录/)).toBeTruthy();
  expect(screen.getByRole('checkbox')).toHaveProperty('disabled', false);
  expect(screen.getByRole('button', { name: '生成 AI 评审' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: '查看场景分析' }));
  expect(screen.getByRole('button', { name: '推荐架构战术' })).toHaveProperty('disabled', false);
});

it('exports an input-only draft and disables viewing missing stages', () => {
  const create = mockExport();
  render(<DesignStudio mode="unconfigured" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '仅有标题' } });
  fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }));
  expect(create).toHaveBeenCalledOnce();
  for (const name of ['查看场景分析', '查看战术', '查看评审']) {
    expect(screen.getByRole('button', { name })).toHaveProperty('disabled', true);
  }
});

it('renders design citations with their stylesheet class', async () => {
  vi.spyOn(api, 'designScenarios').mockResolvedValue(scenarios);
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '在线考试系统' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '考试期间持续提供服务' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  expect(document.querySelector('.design-citations button')).toBeTruthy();
});
