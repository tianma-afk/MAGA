// Capture the real hybrid index-ready state and one hybrid practice run.
import { chromium } from '../web/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:5173';
const OUT = 'docs/evaluation/screenshots';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, locale: 'zh-CN',
});
const page = await context.newPage();
page.setDefaultTimeout(30000);

await page.goto(`${BASE}/#/studio`, { waitUntil: 'networkidle' });
await page.getByText('校园活动报名与名额管理').waitFor();
await page.locator('select').first().selectOption('hybrid');
await page.getByText(/RAG 索引已就绪/).waitFor({ timeout: 120000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/10-hybrid-ready.png`, fullPage: false });
console.log('saved 10-hybrid-ready');

try {
  await page.getByRole('button', { name: /校园活动报名与名额管理/ }).click();
  await page.getByRole('button', { name: '生成架构决策问题' }).click();
  await page.getByText('架构决策训练').waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/11-hybrid-questions.png`, fullPage: true });
  console.log('saved 11-hybrid-questions');
} catch (error) {
  await page.screenshot({ path: `${OUT}/11-hybrid-error.png`, fullPage: true });
  const text = await page.locator('body').innerText();
  console.log('practice failed; page tail:', text.slice(-1200));
  console.log('error:', error.message.split('\n')[0]);
}

await browser.close();
