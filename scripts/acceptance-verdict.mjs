// Adjudicated business-continuity rules. Used by live Chrome and offline replay.
import assert from 'node:assert/strict';

export function classifyAttempt({ selection, status, answer, sourcesValidated,
  oldResultsPreserved, plannerCalls }) {
  const failure = reason => ({ outcome: 'Failure', reason });
  if (status !== 200 || !answer || answer.mode !== 'ai') return failure('business_failed');
  if (!oldResultsPreserved) return failure('old_results_not_protected');
  if (!sourcesValidated) return failure('source_validation_failed');
  if (plannerCalls !== 1) return failure('planner_call_budget');
  const sources = selection?.sources;
  if (!sources?.length || sources.length > 8) return failure('source_budget_or_missing');
  const keys = sources.map(s => `${s.chapterId}:${s.slide}`);
  if (new Set(keys).size !== sources.length) return failure('duplicate_sources');
  const citations = [];
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (Array.isArray(value.citations)) citations.push(...value.citations);
      Object.entries(value).filter(([key]) => key !== 'citations').forEach(([, v]) => visit(v));
    }
  }
  visit(answer);
  if (!citations.length || citations.some(c => !sources.some(s =>
    s.chapterId === c.chapterId && s.slide === c.slide && s.title === c.title))) {
    return failure('untrusted_citation');
  }
  const diagnostics = selection.diagnostics;
  if (diagnostics.llm_calls !== 1) return failure('planner_diagnostics_mismatch');
  if (diagnostics.mode === 'normal' && diagnostics.reason === null
      && diagnostics.plan?.status === 'ready' && diagnostics.plan.intents?.length >= 1
      && diagnostics.plan.intents.length <= 3 && answer.retrievalFallback === false) {
    return { outcome: 'Enhanced Success', reason: null };
  }
  if (diagnostics.mode === 'fallback' && typeof diagnostics.reason === 'string'
      && diagnostics.reason.length && answer.retrievalFallback === true) {
    return { outcome: 'Degraded Success', reason: diagnostics.reason };
  }
  return failure('inconsistent_planning_or_fallback');
}

export function assertAcceptedWorkflow(attempts) {
  assert.equal(attempts.length, 3, 'All three business stages required');
  const counts = { 'Enhanced Success': 0, 'Degraded Success': 0, Failure: 0 };
  for (const attempt of attempts) {
    assert(Object.hasOwn(counts, attempt.outcome), 'Unknown outcome');
    counts[attempt.outcome]++;
  }
  assert.equal(counts.Failure, 0, 'Business/source/fallback failures remain blocking');
  assert(counts['Enhanced Success'] >= 1, 'At least one successful real enhanced business required');
  return counts;
}
