import type {
  DesignProject, DesignQualityAttribute, DesignScenario, DesignTactic,
} from './types';

export type StageStatus = 'current' | 'stale' | 'unrecorded' | 'missing';
export type DesignStep = 'scenario' | 'attributes' | 'tactics' | 'review';

/** Resume the earliest explicitly stale input, preserving legacy result access. */
export function initialDesignStep(project: DesignProject): DesignStep {
  if (analysisStatus(project) === 'stale') return 'attributes';
  if (tacticsStatus(project) === 'stale') return 'attributes';
  if (project.review && reviewStatus(project) !== 'stale') return 'review';
  if (project.tactics.length) return 'tactics';
  if (project.scenarios.length || project.qualityAttributes.length) return 'attributes';
  return 'scenario';
}

const SEVERITY: Record<StageStatus, number> = {
  current: 0, unrecorded: 1, stale: 2, missing: 3,
};

function attributesPayload(items: DesignQualityAttribute[]) {
  return items.map(item => [item.name, item.priority, item.reason]);
}

function scenariosPayload(items: DesignScenario[]) {
  return items.map(item => [
    item.stimulus, item.source, item.artifact, item.environment,
    item.response, item.measure,
    item.citations.map(citation => [citation.chapterId, citation.slide, citation.title]),
  ]);
}

function tacticsPayload(items: DesignTactic[]) {
  return items.map(item => [
    item.name, item.rationale, item.tradeoffs,
    item.citations.map(citation => [citation.chapterId, citation.slide, citation.title]),
  ]);
}

/** Keys are deterministic JSON of the exact fields sent to the model. */
export function analysisKey(project: Pick<DesignProject, 'title' | 'scenario' | 'requirements'>) {
  return JSON.stringify([
    project.title.trim(), project.scenario.trim(), project.requirements.trim(),
  ]);
}

export function tacticsKey(project: DesignProject) {
  return JSON.stringify([
    project.scenario.trim(),
    project.requirements.trim(),
    attributesPayload(project.qualityAttributes),
    scenariosPayload(project.scenarios),
  ]);
}

export function reviewKey(project: DesignProject, selected: DesignTactic[]) {
  return JSON.stringify([
    project.title.trim(),
    project.scenario.trim(),
    project.requirements.trim(),
    attributesPayload(project.qualityAttributes),
    scenariosPayload(project.scenarios),
    tacticsPayload(selected),
  ]);
}

export function selectedTacticsOf(project: DesignProject): DesignTactic[] {
  return project.tactics.filter(tactic => project.selectedTactics.includes(tactic.name));
}

/** A missing upstream result cannot vouch for a downstream one. */
function upstreamStatus(status: StageStatus): StageStatus {
  return status === 'missing' ? 'unrecorded' : status;
}

function combine(own: StageStatus, upstream: StageStatus): StageStatus {
  if (own === 'missing') return 'missing';
  return SEVERITY[upstream] > SEVERITY[own] ? upstream : own;
}

export function analysisStatus(project: DesignProject): StageStatus {
  if (!project.qualityAttributes.length && !project.scenarios.length) return 'missing';
  const recorded = project.versions?.analysis;
  if (!recorded) return 'unrecorded';
  return recorded === analysisKey(project) ? 'current' : 'stale';
}

export function tacticsStatus(project: DesignProject): StageStatus {
  if (!project.tactics.length) return 'missing';
  const recorded = project.versions?.tactics;
  const own: StageStatus = !recorded ? 'unrecorded'
    : recorded === tacticsKey(project) ? 'current' : 'stale';
  return combine(own, upstreamStatus(analysisStatus(project)));
}

export function reviewStatus(project: DesignProject): StageStatus {
  if (!project.review) return 'missing';
  const recorded = project.versions?.review;
  const own: StageStatus = !recorded ? 'unrecorded'
    : recorded === reviewKey(project, selectedTacticsOf(project)) ? 'current' : 'stale';
  return combine(own, upstreamStatus(tacticsStatus(project)));
}

export function isCurrent(status: StageStatus): boolean {
  return status === 'current';
}

/** Only an explicit mismatch blocks the next stage; legacy drafts stay usable. */
export function blocksNextStage(status: StageStatus): boolean {
  return status === 'stale';
}

export function statusNote(status: StageStatus, stage: 'analysis' | 'tactics' | 'review'): string {
  if (status === 'stale') {
    return stage === 'analysis'
      ? '输入已修改，以下分析对应旧版本，仅供参考；生成下一阶段前请先重新生成。'
      : stage === 'tactics'
        ? '上游内容已修改，以下战术对应旧版本，仅供参考；生成评审前请重新推荐。'
        : '方案在此评审后有修改，以下评审对应旧版本，仅供参考。';
  }
  if (status === 'unrecorded') {
    return '历史结果，版本未记录：无法确认它是否对应当前输入，请核对后使用。';
  }
  return '';
}
