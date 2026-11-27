// Capture real UI screenshots for docs/evaluation. Requires backend :8000 and Vite :5173.
import { mkdirSync } from 'node:fs';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:5173';
const OUT = 'docs/evaluation/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
});
const page = await context.newPage();
page.setDefaultTimeout(30000);

async function shot(name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log('saved', name);
}

async function step(name, fn) {
  try {
    await fn();
  } catch (error) {
    console.log('STEP FAILED', name, '-', error.message.split('\n')[0]);
    await shot(`failed-${name}`).catch(() => {});
  }
}

await step('practice-cases', async () => {
  await page.goto(`${BASE}/#/studio`, { waitUntil: 'networkidle' });
  await page.getByText('校园活动报名与名额管理').waitFor();
  await shot('01-practice-cases');
});

await step('case-selected', async () => {
  await page.getByRole('button', { name: /校园活动报名与名额管理/ }).click();
  await page.waitForTimeout(400);
  await shot('02-case-selected');
});

await step('generate-questions', async () => {
  await page.getByRole('button', { name: '生成架构决策问题' }).click();
  await page.getByText('架构决策训练').waitFor({ timeout: 180000 });
  await page.waitForTimeout(600);
  await shot('03-generated-questions', true);
});

await step('answer-feedback', async () => {
  const box = page.locator('textarea').last();
  await box.fill('我会用数据库事务和唯一约束保证名额不被超卖：报名时在同一个事务里检查剩余名额并扣减，'
    + '同时对学生和活动建立唯一索引防止重复报名；热点活动可以先排队削峰，再异步通知。');
  await page.getByRole('button', { name: '提交回答并获得反馈' }).click();
  await page.getByText('助教反馈').waitFor({ timeout: 180000 });
  await page.waitForTimeout(600);
  await shot('04-answer-feedback', true);
});

await step('citation-dialog', async () => {
  const citation = page.locator('.practice-feedback .design-citations button').first();
  if (await citation.count() === 0) throw new Error('no feedback citation');
  await citation.click();
  await page.locator('dialog.source-dialog[open]').waitFor();
  await page.waitForTimeout(800);
  await shot('05-citation-source');
  await page.keyboard.press('Escape');
});

await step('legacy-selector', async () => {
  await page.goto(`${BASE}/#/studio/legacy`, { waitUntil: 'networkidle' });
  await page.locator('select').first().waitFor();
  await shot('06-legacy-retrieval-selector');
});

await step('hybrid-index-failure', async () => {
  await page.locator('select').first().selectOption('hybrid');
  const error = page.getByText(/RAG 索引构建失败|RAG 索引状态异常/);
  const ready = page.getByText(/RAG 索引已就绪/);
  await Promise.race([error.waitFor({ timeout: 240000 }), ready.waitFor({ timeout: 240000 })]);
  await page.waitForTimeout(500);
  await shot('07-hybrid-index-state');
});

await step('home', async () => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot('08-home');
});

await step('api-docs', async () => {
  await page.goto('http://127.0.0.1:8000/docs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot('09-api-docs');
});

await browser.close();
console.log('done');
