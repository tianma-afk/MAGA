// Chrome + production frontend + real FastAPI/PPT. No page.route API mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium, expect } from '../web/node_modules/@playwright/test/index.mjs';
const [base = 'http://127.0.0.1:5186', backend = 'http://127.0.0.1:8016', output, realFlag] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/acceptance-browser.mjs FRONT BACK NEW_OUTPUT [real]');
await fs.mkdir(output, { recursive: false });
const real = realFlag === 'real';
const identity = await (await fetch(`${backend}/__acceptance__/identity`)).json();
assert.equal(identity.harness, 'p3t6');
assert.equal(identity.real, real);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const key = 'chapter-tutor:design:v1:current';
const scenario = '多个采集节点周期性上报状态，节点停止响应时需要检测并切换备用处理。';
const requestPayload = { title: '设备运行监测', scenario,
  requirements: '目标为故障检测和恢复服务，说明资源开销与恢复时间的权衡。' };
const events = async () => (await (await fetch(`${backend}/__acceptance__/events`)).json());
const control = async fault => {
  assert(!real);
  await fetch(`${backend}/__acceptance__/control`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fault }) });
};
async function pageFor(name) {
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(`${base}/#/studio`);
  await expect(page.getByLabel('课程来源检索')).toHaveValue('baseline');
  await expect(page.getByRole('button', { name: '生成质量属性与场景' })).toBeDisabled();
  await page.getByLabel('设计标题').fill(requestPayload.title);
  await page.getByLabel('场景描述').fill(scenario);
  await page.getByLabel('需求与约束').fill(requestPayload.requirements);
  return { page, context, name };
}
async function finish(run) {
  await run.page.screenshot({ path: `${output}/${run.name}.png`, fullPage: true });
  await run.context.tracing.stop({ path: `${output}/${run.name}-trace.zip` });
  await run.context.close();
}
async function generate(page, stage) {
  const names = ['生成质量属性与场景', '推荐架构战术', '生成 AI 评审'];
  const paths = ['scenarios', 'tactics', 'review'];
  const responsePromise = page.waitForResponse(r => r.url().endsWith(`/api/design/${paths[stage]}`), { timeout: 120000 });
  await page.getByRole('button', { name: names[stage], exact: true }).click();
  await expect(page.getByLabel('课程来源检索')).toBeDisabled();
  const response = await responsePromise;
  const data = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(data));
  await expect(page.getByRole('heading', { name: ['2. 质量属性与场景', '3. 选择架构战术', '4. AI 评审'][stage], exact: true })).toBeVisible();
  return data;
}
async function flow(name, strategies) {
  const before = (await events()).length;
  const run = await pageFor(name);
  try {
    const answers = [];
    for (let stage = 0; stage < 3; stage++) {
      await run.page.getByLabel('课程来源检索').selectOption(strategies[stage]);
      answers.push(await generate(run.page, stage));
    }
    const saved = await run.page.evaluate(k => localStorage.getItem(k), key);
    assert(saved && !saved.includes('retrievalStrategy') && !saved.includes('retrievalFallback'));
    await fs.writeFile(`${output}/${name}-answers.json`, JSON.stringify(answers, null, 2));
    const citation = run.page.getByRole('button', { name: /chapter-\d+ · 第 \d+ 页/ }).first();
    await citation.click();
    await expect(run.page.getByRole('dialog').getByLabel('文本预览')).toBeVisible({ timeout: 20000 }).catch(async () => {
      await expect(run.page.getByRole('dialog').getByAltText(/第 \d+ 页/)).toBeVisible();
    });
    await run.page.getByRole('button', { name: '关闭来源' }).click();
    await run.page.reload();
    await expect(run.page.getByLabel('课程来源检索')).toHaveValue('baseline');
    await expect(run.page.getByRole('heading', { name: '4. AI 评审', exact: true })).toBeVisible();
    assert.equal(await run.page.evaluate(k => localStorage.getItem(k), key), saved);
    const rows = (await events()).slice(before);
    const starts = rows.filter(r => r.kind === 'api_start');
    assert.deepEqual(starts.map(r => r.payload.retrievalStrategy ?? 'baseline'), strategies);
    assert(starts.every((r, i) => strategies[i] !== 'baseline' || !('retrievalStrategy' in r.payload)));
    const plans = rows.filter(r => r.kind === 'upstream_attempt' && r.phase === 'planner');
    assert.equal(plans.length, strategies.filter(s => s === 'llm_assisted').length);
    assert.equal(rows.filter(r => r.kind === 'upstream_attempt' && r.phase === 'generation').length, 3);
    const selections = rows.filter(r => r.kind === 'selection');
    assert.equal(selections.length, 3);
    for (const selection of selections) {
      assert(selection.sources.length > 0 && selection.sources.length <= 8);
      assert.equal(new Set(selection.sources.map(s => `${s.chapterId}:${s.slide}`)).size, selection.sources.length);
      if (real) assert.equal(selection.diagnostics.mode, 'normal', 'Real planner must succeed, not merely fall back');
    }
    results.push({ name, status: 'pass', strategies, plannerCalls: plans.length, restored: true });
    return run;
  } catch (error) {
    await finish(run);
    throw error;
  }
}
try {
  if (real) {
    await finish(await flow('real-enhanced', Array(3).fill('llm_assisted')));
  } else {
    await finish(await flow('default', Array(3).fill('baseline')));
    await finish(await flow('enhanced', Array(3).fill('llm_assisted')));
    const run = await flow('switch', ['baseline', 'llm_assisted', 'baseline']);
    const { page } = run;
    const saved = await page.evaluate(k => localStorage.getItem(k), key);
    await page.getByRole('button', { name: '查看场景', exact: true }).click();
    await page.getByLabel('课程来源检索').selectOption('llm_assisted');
    // Final generation failures must not overwrite the previously complete project.
    for (const fault of ['generation_http', 'generation_timeout', 'generation_json', 'generation_schema', 'citation']) {
      await control(fault);
      const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/design/scenarios'), { timeout: 60000 });
      await page.getByRole('button', { name: '生成质量属性与场景' }).click();
      await page.getByRole('button', { name: '确认重新生成' }).click();
      assert.equal((await responsePromise).status(), 502);
      await expect(page.getByRole('alert')).toBeVisible();
      assert.equal(await page.evaluate(k => localStorage.getItem(k), key), saved);
      results.push({ name: fault, status: 'pass', oldResultsPreserved: true });
    }
    // Cancellation plus late completion, repeated submit and no strategy changes in flight.
    await control('delay');
    await page.getByRole('button', { name: '生成质量属性与场景' }).click();
    await page.getByRole('button', { name: '确认重新生成' }).click();
    await expect.poll(async () => (await events()).filter(r => r.kind === 'held').length).toBe(1);
    const count = (await events()).filter(r => r.kind === 'upstream_attempt').length;
    await expect(page.getByLabel('课程来源检索')).toBeDisabled();
    await expect(page.getByRole('button', { name: '生成质量属性与场景' })).toBeDisabled();
    await page.getByRole('button', { name: '生成质量属性与场景' }).evaluate(b => { b.click(); b.click(); });
    assert.equal((await events()).filter(r => r.kind === 'upstream_attempt').length, count);
    await page.getByRole('button', { name: '停止', exact: true }).click();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), saved);
    await control('none');
    await page.getByLabel('课程来源检索').selectOption('baseline');
    const retry = page.waitForResponse(r => r.url().endsWith('/api/design/scenarios'), { timeout: 60000 });
    await page.getByRole('button', { name: '生成质量属性与场景' }).click();
    await page.getByRole('button', { name: '确认重新生成' }).click();
    assert.equal((await retry).status(), 200);
    await expect(page.getByRole('heading', { name: '2. 质量属性与场景' })).toBeVisible();
    const fresh = await page.evaluate(k => localStorage.getItem(k), key);
    await fetch(`${backend}/__acceptance__/control`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{"release":true}' });
    await expect.poll(async () => (await events()).filter(r => r.kind === 'api_end').length, { timeout: 30000 }).toBeGreaterThan(0);
    // Use server completion as barrier, rather than timing-only assertions.
    const held = (await events()).find(r => r.kind === 'held').request_id;
    await expect.poll(async () => (await events()).some(r => r.kind === 'api_end' && r.request_id === held), { timeout: 30000 }).toBe(true);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), fresh);
    results.push({ name: 'cancel-retry-late-duplicate', status: 'pass', serverMayContinueAfterAbort: true });
    await finish(run);
    // Planner faults via real HTTP API and real course retrieval; UI hint tested below.
    for (const fault of ['json', 'schema', 'empty', 'unknown', 'connection', 'timeout']) {
      await control(fault);
      const response = await fetch(`${backend}/api/design/scenarios`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestPayload, retrievalStrategy: 'llm_assisted' }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).retrievalFallback, true);
      results.push({ name: `planner-${fault}`, status: 'pass' });
    }
    const fallback = await pageFor('fallback');
    await fallback.page.getByLabel('课程来源检索').selectOption('llm_assisted');
    assert.equal((await generate(fallback.page, 0)).retrievalFallback, true);
    await expect(fallback.page.getByText('增强规划不可用，已使用标准检索。')).toBeVisible();
    results.push({ name: 'fallback-ui', status: 'pass' });
    await finish(fallback);
    await control('none');
    for (const payload of [{ ...requestPayload, retrievalStrategy: 'auto' }, { title: '', scenario: '' }]) {
      const response = await fetch(`${backend}/api/design/scenarios`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      assert.equal(response.status, 422);
    }
    results.push({ name: 'invalid-input-422', status: 'pass' });
  }
} catch (error) {
  results.push({ status: 'fail', error: error.stack });
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ identity, chrome: browser.version(), real, results }, null, 2));
  await fs.writeFile(`${output}/events.json`, JSON.stringify(await events(), null, 2));
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}
