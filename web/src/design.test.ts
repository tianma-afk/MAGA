import { describe, expect, it } from 'vitest';
import {
  clearDesignProject, designMarkdown, emptyDesignProject, loadDesignProject,
  saveDesignProject,
} from './design';
import type { DesignProject } from './types';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };
const project: DesignProject = {
  title: '在线考试系统',
  scenario: '考试期间持续提供服务',
  requirements: '高可用',
  qualityAttributes: [{ name: '可用性', priority: 'high', reason: '考试不能中断' }],
  scenarios: [{
    stimulus: '组件故障', source: '监控器', artifact: '考试服务',
    environment: '正常运行', response: '检测并恢复', measure: '5 分钟内恢复',
    citations: [citation],
  }],
  tactics: [{
    name: '心跳检测', rationale: '发现故障', tradeoffs: '增加消息开销',
    citations: [citation],
  }],
  selectedTactics: ['心跳检测'],
  review: {
    summary: '方案覆盖了可用性。',
    findings: [{
      area: '可用性', finding: '缺少恢复流程', severity: 'high',
      suggestion: '补充冗余', citations: [citation],
    }],
    questions: ['心跳停止后如何恢复？'],
  },
  updatedAt: '2026-11-05T00:00:00.000Z',
};

describe('design draft persistence', () => {
  it('round-trips and clears the current draft', () => {
    const store = storage();
    expect(loadDesignProject(store)).toEqual(emptyDesignProject());
    expect(saveDesignProject(store, project)).toBe(true);
    expect(loadDesignProject(store).title).toBe('在线考试系统');
    expect(clearDesignProject(store)).toBe(true);
    expect(loadDesignProject(store)).toEqual(emptyDesignProject());
  });

  it('ignores corrupt or invalid drafts', () => {
    const store = storage();
    store.setItem('chapter-tutor:design:v1:current', '{bad');
    expect(loadDesignProject(store)).toEqual(emptyDesignProject());
    store.setItem('chapter-tutor:design:v1:current', JSON.stringify({ title: 'x' }));
    expect(loadDesignProject(store)).toEqual(emptyDesignProject());
    const unavailable = {
      getItem() { throw Error(); },
      setItem() { throw Error(); },
      removeItem() { throw Error(); },
    };
    expect(loadDesignProject(unavailable)).toEqual(emptyDesignProject());
    expect(saveDesignProject(unavailable, project)).toBe(false);
    expect(clearDesignProject(unavailable)).toBe(false);
  });
});

describe('design markdown export', () => {
  it('includes the scenario, selected tactics, review and sources', () => {
    const markdown = designMarkdown(project);
    expect(markdown).toContain('# 在线考试系统');
    expect(markdown).toContain('## 质量属性');
    expect(markdown).toContain('可用性');
    expect(markdown).toContain('## 选择的战术');
    expect(markdown).toContain('心跳检测');
    expect(markdown).toContain('第 chapter-5 第 17 页');
    expect(markdown).toContain('## AI 评审');
    expect(markdown).toContain('心跳停止后如何恢复？');
  });

  it('handles a draft with no selected tactics or review', () => {
    const markdown = designMarkdown({
      ...project, tactics: [], selectedTactics: [], review: undefined,
    });
    expect(markdown).toContain('（尚未选择战术）');
    expect(markdown).toContain('（尚未生成评审）');
  });
});
