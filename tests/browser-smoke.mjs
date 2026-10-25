// Run against the local offline server. PLAYWRIGHT_MODULE may point to a bundled install.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = process.env.APP_URL || 'http://127.0.0.1:5173';
const output = fileURLToPath(new URL('../data/verification', import.meta.url));

async function checkNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, width: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.width <= dimensions.viewport, JSON.stringify(dimensions));
}

async function run() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const health = await (await page.request.get(`${origin}/api/health`)).json();
    assert.equal(health.mode, 'offline', 'Smoke tests require offline mode to avoid paid requests.');
    const chapters = await (await page.request.get(`${origin}/api/chapters`)).json();
    assert.deepEqual(chapters.map(c => c.slideCount), [85, 22, 32, 39, 41, 62, 59]);
    await page.goto(origin);
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    await page.getByRole('button', { name: '打开课件', exact: true }).click();
    const image = page.locator('.slide-image');
    await image.waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector('.slide-image');
      return img && img.complete && img.naturalWidth > 0;
    });
    await page.getByRole('combobox', { name: '课件页码' }).selectOption('5');
    await page.getByRole('textbox', { name: '向助教提问' }).fill('继续学习');
    await page.getByRole('button', { name: '发送消息' }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter-1') || '{}').messages?.length === 2);
    assert.equal(await page.getByRole('combobox', { name: '课件页码' }).inputValue(), '6');
    await page.reload();
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    await page.getByRole('button', { name: '打开课件', exact: true }).click();
    assert.equal(await page.getByRole('combobox', { name: '课件页码' }).inputValue(), '6');
    await page.getByRole('button', { name: `章节：${chapters[1].title}`, exact: true }).click();
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    assert.equal(await page.locator('.message-body').count(), 0);
    await page.getByRole('button', { name: '开始讲解', exact: true }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter-2') || '{}').messages?.length === 2);
    assert.ok(await page.locator('.citations button').count() > 0);
    await page.getByRole('button', { name: '继续学习', exact: true }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter-2') || '{}').slide === 2);
    await page.getByRole('button', { name: '重置本章', exact: true }).click();
    await page.getByRole('button', { name: '保留记录', exact: true }).click();
    assert.equal(await page.locator('.message-body').count(), 4);
    await page.getByRole('button', { name: '重置本章', exact: true }).click();
    await page.getByRole('button', { name: '清空本章', exact: true }).click();
    await page.getByRole('button', { name: '开始讲解', exact: true }).waitFor();
    assert.equal(await page.locator('.message-body').count(), 0);
    await page.getByRole('button', { name: `章节：${chapters[0].title}`, exact: true }).click();
    await page.locator('.message-body').first().waitFor();
    assert.equal(await page.locator('.message-body').count(), 2);
    await checkNoOverflow(page);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });

    await page.getByRole('button', { name: `章节：${chapters[3].title}`, exact: true }).click();
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    const detail = await (await page.request.get(`${origin}/api/chapters/chapter-5`)).json();
    const heartbeat = detail.slides.find(s => /heartbeat/i.test(s.text) && /failure|fault/i.test(s.text));
    assert.ok(heartbeat, 'Expected real heartbeat slide');
    await page.getByRole('button', { name: '打开课件', exact: true }).click();
    await page.getByRole('combobox', { name: '课件页码' }).selectOption(String(heartbeat.number));
    await page.getByRole('textbox', { name: '向助教提问' }).fill('画个架构图');
    await page.getByRole('button', { name: '发送消息' }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter-5') || '{}').messages?.length === 2);
    if (!(await page.locator('.react-flow__node').count())) {
      await page.getByRole('tab', { name: '画布', exact: true }).click();
    }
    await page.locator('.react-flow__node').first().waitFor();
    assert.ok(await page.locator('.react-flow__node').count() >= 2);
    await page.screenshot({ path: path.join(output, 'diagram.png'), fullPage: true });

    await page.route('**/api/chat', route => route.fulfill({
      status: 502, contentType: 'application/json', body: '{"detail":"Test outage"}',
    }), { times: 1 });
    await page.getByRole('textbox', { name: '向助教提问' }).fill('导读');
    await page.getByRole('button', { name: '发送消息' }).click();
    await page.getByRole('button', { name: '重试回复' }).waitFor();
    await page.getByRole('button', { name: '重试回复' }).click();
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('chapter-tutor:v1:chapter-5') || '{}').messages?.length === 4);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    await checkNoOverflow(page);
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    await page.getByRole('button', { name: '打开课件', exact: true }).click();
    await page.getByRole('combobox', { name: '课件页码' }).waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector('.slide-image');
      return img && img.complete && img.naturalWidth > 0;
    });
    await checkNoOverflow(page);
    await page.screenshot({ path: path.join(output, 'mobile-slide.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: real slides, navigation, persistence, isolation, diagram, retry, responsive layout.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
