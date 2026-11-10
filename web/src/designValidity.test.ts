import { describe, expect, it } from 'vitest';
import {
  analysisKey, analysisStatus, reviewKey, reviewStatus, selectedTacticsOf,
  statusNote, tacticsKey, tacticsStatus,
} from './designValidity';
import { designMarkdown, emptyDesignProject } from './design';
import type { DesignProject } from './types';

const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };
const attribute = { name: '可用性', priority: 'high' as const, reason: '考试不能中断' };
const scenario = {
  stimulus: '节点故障', source: '运行环境', artifact: '考试服务',
  environment: '考试期间', response: '切换到健康节点', measure: '30 秒内恢复',
  citations: [citation],
};
const tactic = {
  name: '冗余实例', rationale: '快速切换', tradeoffs: '增加成本', citations: [citation],
};

function project(): DesignProject {
  const value: DesignProject = {
    title: '在线考试系统',
    scenario: '考试期间持续提供服务',
    requirements: '30 秒内恢复',
    qualityAttributes: [attribute],
    scenarios: [scenario],
    tactics: [tactic],
    selectedTactics: [tactic.name],
    review: {
      summary: '方案覆盖了可用性。',
      findings: [{
        area: '可用性', finding: '缺少恢复验证', severity: 'high',
        suggestion: '补充演练', citations: [citation],
      }],
      questions: ['30 秒如何验证？'],
    },
    updatedAt: '2026-11-09T00:00:00.000Z',
  };
  value.versions = {
    analysis: analysisKey(value),
    tactics: tacticsKey(value),
    review: reviewKey(value, [tactic]),
  };
  return value;
}

describe('design result validity', () => {
  it('treats freshly generated results as current', () => {
    const value = project();
    expect(analysisStatus(value)).toBe('current');
    expect(tacticsStatus(value)).toBe('current');
    expect(reviewStatus(value)).toBe('current');
    expect(statusNote('current', 'review')).toBe('');
  });

  it('marks edited inputs stale and cascades to later stages', () => {
    const value = project();
    value.requirements = '60 秒内恢复';
    expect(analysisStatus(value)).toBe('stale');
    expect(tacticsStatus(value)).toBe('stale');
    expect(reviewStatus(value)).toBe('stale');
  });

  it('marks only the review stale when a tactic selection changes', () => {
    const value = project();
    value.tactics = [tactic, { ...tactic, name: '检查点', rationale: '回滚' }];
    value.selectedTactics = ['冗余实例', '检查点'];
    expect(analysisStatus(value)).toBe('current');
    expect(tacticsStatus(value)).toBe('current');
    expect(reviewStatus(value)).toBe('stale');
    expect(selectedTacticsOf(value).map(item => item.name)).toEqual(['冗余实例', '检查点']);
  });

  it('keeps legacy drafts readable but unverified', () => {
    const value = project();
    delete value.versions;
    expect(analysisStatus(value)).toBe('unrecorded');
    expect(tacticsStatus(value)).toBe('unrecorded');
    expect(reviewStatus(value)).toBe('unrecorded');
    expect(statusNote('unrecorded', 'analysis')).toContain('版本未记录');
  });

  it('reports missing stages before anything is generated', () => {
    const value = emptyDesignProject();
    expect(analysisStatus(value)).toBe('missing');
    expect(tacticsStatus(value)).toBe('missing');
    expect(reviewStatus(value)).toBe('missing');
  });

  it('produces the same key for equivalent content', () => {
    const first = project();
    const second = project();
    second.updatedAt = '2030-01-01T00:00:00.000Z';
    expect(analysisKey(first)).toBe(analysisKey(second));
    expect(tacticsKey(first)).toBe(tacticsKey(second));
    expect(reviewKey(first, [tactic])).toBe(reviewKey(second, [tactic]));
  });

  it('states the result status in the exported markdown', () => {
    const current = designMarkdown(project());
    expect(current).not.toContain('仅供参考');

    const stale = project();
    stale.requirements = '60 秒内恢复';
    const markdown = designMarkdown(stale);
    expect(markdown).toContain('> 输入已修改');
    expect(markdown).toContain('> 上游内容已修改');
    expect(markdown).toContain('> 方案在此评审后有修改');

    const legacy = project();
    delete legacy.versions;
    expect(designMarkdown(legacy)).toContain('历史结果，版本未记录');
  });
});
