import type {
  DesignCitation, DesignFinding, DesignProject, DesignQualityAttribute,
  DesignScenario, DesignTactic,
} from './types';
import { analysisStatus, reviewStatus, statusNote, tacticsStatus } from './designValidity';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = 'chapter-tutor:design:v1:current';

export function emptyDesignProject(): DesignProject {
  return {
    title: '', scenario: '', requirements: '',
    qualityAttributes: [], scenarios: [], tactics: [],
    selectedTactics: [], updatedAt: '',
  };
}

function isCitation(value: unknown): value is DesignCitation {
  const citation = value as Partial<DesignCitation> | null;
  return !!citation && typeof citation.chapterId === 'string' && !!citation.chapterId
    && typeof citation.slide === 'number' && Number.isInteger(citation.slide)
    && citation.slide >= 1
    && typeof citation.title === 'string';
}

function isQualityAttribute(value: unknown): value is DesignQualityAttribute {
  const item = value as Partial<DesignQualityAttribute> | null;
  return !!item && typeof item.name === 'string'
    && ['high', 'medium', 'low'].includes(item.priority ?? '')
    && typeof item.reason === 'string';
}

function isScenario(value: unknown): value is DesignScenario {
  const scenario = value as Partial<DesignScenario> | null;
  const fields = ['stimulus', 'source', 'artifact', 'environment', 'response', 'measure'] as const;
  return !!scenario && fields.every(field => typeof scenario[field] === 'string')
    && Array.isArray(scenario.citations) && scenario.citations.every(isCitation);
}

function isTactic(value: unknown): value is DesignTactic {
  const tactic = value as Partial<DesignTactic> | null;
  return !!tactic && typeof tactic.name === 'string' && !!tactic.name
    && typeof tactic.rationale === 'string' && typeof tactic.tradeoffs === 'string'
    && Array.isArray(tactic.citations) && tactic.citations.every(isCitation);
}

function isFinding(value: unknown): value is DesignFinding {
  const finding = value as Partial<DesignFinding> | null;
  return !!finding && typeof finding.area === 'string' && typeof finding.finding === 'string'
    && ['high', 'medium', 'low'].includes(finding.severity ?? '')
    && typeof finding.suggestion === 'string'
    && Array.isArray(finding.citations) && finding.citations.every(isCitation);
}

function isVersions(value: unknown): value is DesignProject['versions'] {
  if (!value || typeof value !== 'object') return false;
  const versions = value as Record<string, unknown>;
  return ['analysis', 'tactics', 'review'].every(key =>
    versions[key] === undefined || typeof versions[key] === 'string');
}

function isProject(value: unknown): value is DesignProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<DesignProject>;
  return typeof project.title === 'string'
    && typeof project.scenario === 'string'
    && typeof project.requirements === 'string'
    && typeof project.updatedAt === 'string'
    && (project.versions === undefined || isVersions(project.versions))
    && Array.isArray(project.qualityAttributes) && project.qualityAttributes.every(isQualityAttribute)
    && Array.isArray(project.scenarios) && project.scenarios.every(isScenario)
    && Array.isArray(project.tactics) && project.tactics.every(isTactic)
    && Array.isArray(project.selectedTactics)
    && project.selectedTactics.every(name => typeof name === 'string')
    && (project.review === undefined || (!!project.review
      && typeof project.review.summary === 'string'
      && Array.isArray(project.review.findings) && project.review.findings.every(isFinding)
      && Array.isArray(project.review.questions)
      && project.review.questions.every(question => typeof question === 'string')));
}

export function uniqueTactics(tactics: DesignTactic[]): DesignTactic[] {
  // AI output may repeat a tactic name while selection keys on the name, so
  // keep one entry per name to keep choosing, rendering and exporting clear.
  return tactics.filter((tactic, index) =>
    tactics.findIndex(item => item.name === tactic.name) === index);
}

export function loadDesignProject(store: StoragePort): DesignProject {
  try {
    const raw = store.getItem(key);
    if (!raw) return emptyDesignProject();
    const parsed = JSON.parse(raw) as unknown;
    return isProject(parsed)
      ? { ...parsed, tactics: uniqueTactics(parsed.tactics) } : emptyDesignProject();
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
  const analysisNote = statusNote(analysisStatus(project), 'analysis');
  const tacticsNote = statusNote(tacticsStatus(project), 'tactics');
  const reviewNote = statusNote(reviewStatus(project), 'review');
  const lines = [
    `# ${project.title || '架构设计草案'}`,
    '',
    '## 场景',
    project.scenario || '（未填写）',
    '',
    '## 需求',
    project.requirements || '（未填写）',
    '',
  ];
  if (analysisNote) lines.push(`> ${analysisNote}`, '');
  lines.push('## 质量属性');
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
  if (tacticsNote) lines.push(`> ${tacticsNote}`, '');
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
  if (reviewNote) lines.push(`> ${reviewNote}`, '');
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
