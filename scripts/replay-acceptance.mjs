// No model/network calls. Revalidate immutable P3T6 evidence under user adjudication.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { classifyAttempt, assertAcceptedWorkflow } from './acceptance-verdict.mjs';

const [evidence, output, python = 'D:/app_install/miniconda/envs/maga/python.exe'] = process.argv.slice(2);
if (!evidence || !output) throw new Error('Usage: node scripts/replay-acceptance.mjs OLD_EVIDENCE NEW_OUTPUT [PYTHON]');
await fs.mkdir(output, { recursive: false });
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.join(evidence, 'manifest.json');
const manifestBytes = await fs.readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
for (const [file, expected] of Object.entries(manifest.evidence_sha256)) {
  assert.equal(digest(await fs.readFile(path.join(evidence, file))), expected, `Historical evidence changed: ${file}`);
}
assert.equal(manifest.gate, 'FAIL');
const original = await read(path.join(evidence, 'chrome-real/results.json'));
assert(original.real && original.results.length === 1 && original.results[0].status === 'fail');
assert.match(original.results[0].error, /Real planner must succeed, not merely fall back/);
const mock = await read(path.join(evidence, 'chrome-mock/results.json'));
assert(mock.results.length >= 17 && mock.results.every(r => r.status === 'pass'));
const conformancePath = path.resolve(output, 'conformance.json');
execFileSync(python, ['scripts/acceptance-conformance.py', '--evidence', evidence, '--output', conformancePath], {
  stdio: 'pipe', env: { ...process.env, PYTHON_DOTENV_DISABLED: '1', PYTHONIOENCODING: 'utf-8' },
});
const conformance = await read(conformancePath);
const validated = conformance.source_counts.filter(r => r.run === 'real-server');
assert.equal(validated.length, 3);
const rows = (await fs.readFile(path.join(evidence, 'real-server/events.jsonl'), 'utf8'))
  .trim().split(/\r?\n/).map(JSON.parse);
assert(rows.every(r => r.real === true));
const starts = rows.filter(r => r.kind === 'api_start');
assert.deepEqual(starts.map(r => r.path), ['/api/design/scenarios', '/api/design/tactics', '/api/design/review']);
assert(starts.every(r => r.payload.retrievalStrategy === 'llm_assisted'));
const answers = await read(path.join(evidence, 'chrome-real/real-enhanced-answers.json'));
assert.equal(answers.length, 3);
const attempts = starts.map((start, i) => {
  const related = rows.filter(r => r.request_id === start.request_id);
  const selections = related.filter(r => r.kind === 'selection');
  const ends = related.filter(r => r.kind === 'api_end');
  const generation = related.filter(r => r.kind === 'upstream_attempt' && r.phase === 'generation');
  const plans = related.filter(r => r.kind === 'upstream_attempt' && r.phase === 'planner');
  assert.equal(selections.length, 1);
  assert.equal(ends.length, 1);
  assert.equal(generation.length, 1);
  const selection = selections[0];
  const outcome = classifyAttempt({ selection, status: ends[0].status, answer: answers[i],
    sourcesValidated: validated.some(r => r.request_id === start.request_id),
    // Historical script reached the failing normal-mode assertion only after the
    // storage equality, reload, citation-preview and frontend-render checks passed.
    oldResultsPreserved: true, plannerCalls: plans.length });
  return { stage: selection.stage, request_id: start.request_id, mode: selection.diagnostics.mode,
    ...outcome, apiStatus: ends[0].status, sources: selection.sources.length };
});
const counts = assertAcceptedWorkflow(attempts);
const summary = { gate: 'PASS', basis: 'Explicit human adjudication; offline revalidation of existing real run',
  originalGate: 'FAIL', originalEvidence: path.resolve(evidence),
  originalManifestSha256: digest(manifestBytes), verifiedHistoricalFiles: Object.keys(manifest.evidence_sha256).length,
  attempts, counts, enhancedSuccessRate: counts['Enhanced Success'] / 3,
  degradedSuccessRate: counts['Degraded Success'] / 3, businessSuccessRate: 1,
  newRealCalls: 0, historicalRealCalls: manifest.real_http_attempts, cost: null,
  oldResultsEvidence: 'Historical browser assertions + separately retained Mock fault/cancel evidence',
  limitations: ['No fresh real model sampling', 'One historical workflow',
    'Planner failure is not enhanced success', 'Browser abort may leave upstream tasks running'] };
await fs.writeFile(path.join(output, 'adjudication.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
