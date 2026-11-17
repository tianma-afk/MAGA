import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAttempt, assertAcceptedWorkflow } from './acceptance-verdict.mjs';

function attempt(mode = 'normal') {
  const source = { chapterId: 'chapter-5', slide: 2, title: 'Availability', source: 'real excerpt' };
  return { status: 200, plannerCalls: 1, sourcesValidated: true, oldResultsPreserved: true,
    answer: { mode: 'ai', retrievalFallback: mode === 'fallback', scenarios: [{ citations: [source] }] },
    selection: { sources: [source], diagnostics: { mode, reason: mode === 'fallback' ? 'invalid_plan' : null,
      llm_calls: 1, plan: mode === 'normal' ? { status: 'ready', intents: [{}] } : null } } };
}

test('enhanced success requires real selection, valid citations and successful generation', () => {
  assert.equal(classifyAttempt(attempt()).outcome, 'Enhanced Success');
});
test('planner failure plus valid baseline result is degraded, never enhanced', () => {
  assert.deepEqual(classifyAttempt(attempt('fallback')), { outcome: 'Degraded Success', reason: 'invalid_plan' });
});
test('failed fallback remains failure', () => {
  assert.equal(classifyAttempt({ ...attempt('fallback'), status: 500 }).outcome, 'Failure');
});
test('final generation failure remains failure even with normal planning', () => {
  assert.equal(classifyAttempt({ ...attempt(), status: 502 }).outcome, 'Failure');
});
test('source validation failure blocks normal and degraded results', () => {
  for (const mode of ['normal', 'fallback']) {
    assert.equal(classifyAttempt({ ...attempt(mode), sourcesValidated: false }).outcome, 'Failure');
  }
});
test('forged citation, duplicates, empty and over-budget sources remain blocking', () => {
  const forged = attempt();
  forged.answer.scenarios[0].citations = [{ chapterId: 'invented', slide: 999, title: 'fake' }];
  assert.equal(classifyAttempt(forged).outcome, 'Failure');
  for (const size of [0, 2, 9]) {
    const value = attempt();
    value.selection.sources = Array(size).fill(value.selection.sources[0]);
    assert.equal(classifyAttempt(value).outcome, 'Failure');
  }
});
test('lost old results, repeated calls and hidden fallback remain blocking', () => {
  for (const patch of [{ oldResultsPreserved: false }, { plannerCalls: 2 }]) {
    assert.equal(classifyAttempt({ ...attempt(), ...patch }).outcome, 'Failure');
  }
  const hidden = attempt('fallback');
  hidden.answer.retrievalFallback = false;
  assert.equal(classifyAttempt(hidden).outcome, 'Failure');
});
test('adjudicated mixed workflow passes with separate counts', () => {
  const outcomes = [attempt(), attempt(), attempt('fallback')].map(classifyAttempt);
  assert.deepEqual(assertAcceptedWorkflow(outcomes), { 'Enhanced Success': 2, 'Degraded Success': 1, Failure: 0 });
});
test('all degraded, incomplete and any failure workflows still fail', () => {
  const normal = classifyAttempt(attempt());
  const degraded = classifyAttempt(attempt('fallback'));
  assert.throws(() => assertAcceptedWorkflow([degraded, degraded, degraded]));
  assert.throws(() => assertAcceptedWorkflow([normal, degraded]));
  assert.throws(() => assertAcceptedWorkflow([normal, degraded, { outcome: 'Failure' }]));
});
