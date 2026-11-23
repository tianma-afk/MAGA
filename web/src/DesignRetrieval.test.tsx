// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DesignStudio from './DesignStudio';
import { api } from './api';
import type { DesignScenarioResponse } from './types';

const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };
const analysis: DesignScenarioResponse = {
  mode: 'ai', retrievalFallback: true,
  qualityAttributes: [{ name: '可用性', priority: 'high', reason: '持续服务' }],
  scenarios: [{ stimulus: '故障', source: '监控', artifact: '服务', environment: '正常',
    response: '恢复', measure: '一分钟', citations: [citation] }],
};

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fill() {
  fireEvent.change(screen.getByLabelText('设计标题'), { target: { value: '系统设计' } });
  fireEvent.change(screen.getByLabelText('场景描述'), { target: { value: '持续服务' } });
}

it('defaults to baseline, opts in for all three stages and safely shows fallback', async () => {
  const first = vi.spyOn(api, 'designScenarios').mockResolvedValue(analysis);
  const second = vi.spyOn(api, 'designTactics').mockResolvedValue({ mode: 'ai', tactics: [
    { name: '心跳', rationale: '检测', tradeoffs: '消息', citations: [citation] },
  ] });
  const third = vi.spyOn(api, 'designReview').mockResolvedValue({ mode: 'ai', retrievalFallback: true, summary: '完成',
    findings: [{ area: '可用性', finding: '可恢复', severity: 'low', suggestion: '验证', citations: [citation] }],
    questions: ['如何恢复？'],
  });
  const view = render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect(screen.getByLabelText('课程来源检索')).toHaveProperty('value', 'baseline');
  fill();
  fireEvent.change(screen.getByLabelText('课程来源检索'), { target: { value: 'llm_assisted' } });
  expect(screen.getByText(/结果不保证更准确/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('增强规划不可用，已使用标准检索。')).toBeTruthy();
  expect(first.mock.calls[0][0].retrievalStrategy).toBe('llm_assisted');
  fireEvent.click(screen.getByRole('button', { name: '推荐架构战术' }));
  expect(await screen.findByText('心跳')).toBeTruthy();
  expect(second.mock.calls[0][0].retrievalStrategy).toBe('llm_assisted');
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 评审' }));
  expect(await screen.findByText('完成')).toBeTruthy();
  expect(third.mock.calls[0][0].retrievalStrategy).toBe('llm_assisted');
  expect(localStorage.getItem('chapter-tutor:design:v1:current')).not.toContain('retrievalStrategy');
  expect(localStorage.getItem('chapter-tutor:design:v1:current')).not.toContain('retrievalFallback');
  view.unmount();
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  expect(screen.getByLabelText('课程来源检索')).toHaveProperty('value', 'baseline');
  expect(screen.getByText('完成')).toBeTruthy();
});

it('locks the mode and generation during a request, then preserves input on failure', async () => {
  let reject!: (error: Error) => void;
  const call = vi.spyOn(api, 'designScenarios').mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(screen.getByLabelText('课程来源检索')).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: '生成质量属性与场景' })).toHaveProperty('disabled', true);
  expect(call.mock.calls[0][0].retrievalStrategy).toBeUndefined();
  reject(new Error('暂时失败'));
  expect(await screen.findByText('暂时失败')).toBeTruthy();
  expect(screen.getByLabelText('设计标题')).toHaveProperty('value', '系统设计');
  expect(screen.getByLabelText('课程来源检索')).toHaveProperty('disabled', false);
});

it('sends an optional strategy through the API and validates fallback metadata', async () => {
  const fetcher = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(analysis)));
  vi.stubGlobal('fetch', fetcher);
  const input = { title: 'x', scenario: 'y', requirements: '', retrievalStrategy: 'llm_assisted' as const };
  const result = await api.designScenarios(input, new AbortController().signal);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).retrievalStrategy).toBe('llm_assisted');
  expect(result.retrievalFallback).toBe(true);
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ...analysis, retrievalFallback: 'secret' })));
  await expect(api.designScenarios(input, new AbortController().signal)).rejects.toThrow('设计接口');
});

it('exposes RAG hybrid retrieval and passes its selection through all design stages', async () => {
  const first = vi.spyOn(api, 'designScenarios').mockResolvedValue({
    ...analysis, retrievalFallback: undefined,
  });
  const second = vi.spyOn(api, 'designTactics').mockResolvedValue({ mode: 'ai', tactics: [
    { name: '心跳', rationale: '检测', tradeoffs: '消息', citations: [citation] },
  ] });
  const third = vi.spyOn(api, 'designReview').mockResolvedValue({ mode: 'ai', summary: '完成',
    findings: [{ area: '可用性', finding: '可恢复', severity: 'low',
      suggestion: '验证', citations: [citation] }], questions: ['如何恢复？'],
  });
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fill();
  fireEvent.change(screen.getByLabelText('课程来源检索'), { target: { value: 'hybrid' } });
  expect(screen.getByText(/BM25（0.2）和 Jina Embedding（0.5）/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect(await screen.findByText('可用性')).toBeTruthy();
  expect(first.mock.calls[0][0].retrievalStrategy).toBe('hybrid');
  fireEvent.click(screen.getByRole('button', { name: '推荐架构战术' }));
  expect(await screen.findByText('心跳')).toBeTruthy();
  expect(second.mock.calls[0][0].retrievalStrategy).toBe('hybrid');
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 评审' }));
  expect(await screen.findByText('完成')).toBeTruthy();
  expect(third.mock.calls[0][0].retrievalStrategy).toBe('hybrid');
});

it('displays an actionable RAG error from the API instead of a silent fallback', async () => {
  const fakeFetch = vi.fn(async () => new Response(JSON.stringify({
    detail: { code: 'RAG_UNAVAILABLE' },
  }), { status: 503 }));
  vi.stubGlobal('fetch', fakeFetch);
  render(<DesignStudio mode="ai" onOpenSource={vi.fn()} />);
  fill();
  fireEvent.change(screen.getByLabelText('课程来源检索'), { target: { value: 'hybrid' } });
  fireEvent.click(screen.getByRole('button', { name: '生成质量属性与场景' }));
  expect((await screen.findByRole('alert')).textContent).toContain('RAG 检索不可用');
  expect((screen.getByLabelText('课程来源检索') as HTMLSelectElement).value).toBe('hybrid');
});
