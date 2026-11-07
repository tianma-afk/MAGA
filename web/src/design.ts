import type { DesignProject } from './types';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = 'chapter-tutor:design:v1:current';

export function emptyDesignProject(): DesignProject {
  return {
    title: '', scenario: '', requirements: '',
    qualityAttributes: [], scenarios: [], tactics: [],
    selectedTactics: [], updatedAt: '',
  };
}

function isProject(value: unknown): value is DesignProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<DesignProject>;
  return typeof project.title === 'string'
    && typeof project.scenario === 'string'
    && typeof project.requirements === 'string'
    && typeof project.updatedAt === 'string'
    && Array.isArray(project.qualityAttributes)
    && Array.isArray(project.scenarios)
    && Array.isArray(project.tactics)
    && Array.isArray(project.selectedTactics)
    && project.selectedTactics.every(name => typeof name === 'string')
    && (project.review === undefined || (!!project.review
      && typeof project.review.summary === 'string'
      && Array.isArray(project.review.findings)
      && Array.isArray(project.review.questions)));
}

export function loadDesignProject(store: StoragePort): DesignProject {
  try {
    const raw = store.getItem(key);
    if (!raw) return emptyDesignProject();
    const parsed = JSON.parse(raw) as unknown;
    return isProject(parsed) ? parsed : emptyDesignProject();
  } catch {
    return emptyDesignProject();
  }
}

export function saveDesignProject(store: StoragePort, project: DesignProject): boolean {
  try {
    store.setItem(key, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function clearDesignProject(store: StoragePort): boolean {
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function citationsText(citations: { chapterId: string; slide: number; title: string }[]) {
  return citations.map(item => `第 ${item.chapterId} 第 ${item.slide} 页 · ${item.title}`).join('；');
}

export function designMarkdown(project: DesignProject): string {
  const selected = project.tactics.filter(tactic => project.selectedTactics.includes(tactic.name));
  const lines = [
    `# ${project.title || '架构设计草案'}`,
    '',
    '## 场景',
    project.scenario || '（未填写）',
    '',
    '## 需求',
    project.requirements || '（未填写）',
    '',
    '## 质量属性',
  ];
  project.qualityAttributes.forEach(item => {
    lines.push(`- **${item.name}**（${item.priority}）：${item.reason}`);
  });
  lines.push('', '## 质量属性场景');
  project.scenarios.forEach((scenario, index) => {
    lines.push(
      `### ${index + 1}. ${scenario.stimulus}`,
      '',
      `- 来源：${scenario.source}`,
      `- 制品：${scenario.artifact}`,
      `- 环境：${scenario.environment}`,
      `- 响应：${scenario.response}`,
      `- 响应度量：${scenario.measure}`,
      `- 引用：${citationsText(scenario.citations)}`,
      '',
    );
  });
  lines.push('## 选择的战术');
  if (!selected.length) {
    lines.push('（尚未选择战术）');
  } else {
    selected.forEach(tactic => {
      lines.push(
        `### ${tactic.name}`,
        '',
        `- 理由：${tactic.rationale}`,
        `- 权衡：${tactic.tradeoffs}`,
        `- 引用：${citationsText(tactic.citations)}`,
        '',
      );
    });
  }
  lines.push('## AI 评审');
  if (!project.review) {
    lines.push('（尚未生成评审）');
  } else {
    lines.push(project.review.summary, '');
    project.review.findings.forEach(finding => {
      lines.push(
        `- **${finding.area} / ${finding.severity}**：${finding.finding}`,
        `  - 建议：${finding.suggestion}`,
        `  - 引用：${citationsText(finding.citations)}`,
      );
    });
    lines.push('', '### 答辩追问');
    project.review.questions.forEach(question => lines.push(`- ${question}`));
  }
  return lines.join('\n') + '\n';
}
