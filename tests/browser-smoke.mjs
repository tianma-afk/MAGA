// Real API smoke test without credentials; it never simulates AI teaching.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../web/node_modules/playwright');
const origin = process.env.APP_URL || 'http://127.0.0.1:5173';
const output = fileURLToPath(new URL('../data/verification', import.meta.url));

async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

async function loadedSlide(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('.slide-image');
    return image && image.complete && image.naturalWidth > 0;
  });
}

async function run() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const health = await (await page.request.get(`${origin}/api/health`)).json();
    assert.equal(health.mode, 'unconfigured', 'Run without credentials; no paid AI requests.');
    const chapters = await (await page.request.get(`${origin}/api/chapters`)).json();
    assert.equal(chapters.length, 7);
    const outlines = [];
    for (const chapter of chapters) {
      const response = await page.request.get(`${origin}/api/chapters/${chapter.id}/outline`);
      assert.equal(response.status(), 200);
      const outline = await response.json();
      assert.ok(outline.nodes.length > 1);
      assert.deepEqual(outline.nodes.flatMap(node => node.slides),
        Array.from({ length: chapter.slideCount }, (_, i) => i + 1));
      assert.equal(outline.edges.length, outline.nodes.length - 1);
      outlines.push(outline);
    }
    const rejected = await page.request.post(`${origin}/api/chat`, {
      data: { chapterId: chapters[0].id, slide: 1, message: '讲解本页', history: [] },
    });
    assert.equal(rejected.status(), 503);
    assert.equal((await rejected.json()).detail.code, 'AI_NOT_CONFIGURED');

    await page.goto(origin);
    await page.getByRole('heading', { name: '学习空间', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: '向助教提问' }).count(), 0);
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, 'home.png'), fullPage: true });
    await page.getByRole('button', { name: `章节：${chapters[3].title}`, exact: true }).click();
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    assert.ok(await page.getByRole('textbox', { name: '向助教提问' }).isDisabled());
    assert.ok(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled());
    const node = outlines[3].nodes[2];
    if (!(await page.getByRole('button', { name: `学习节点：${node.title}`, exact: true }).count())) {
      await page.getByRole('button', { name: '打开大纲', exact: true }).click();
    }
    await page.getByRole('button', { name: `学习节点：${node.title}`, exact: true }).click();
    await loadedSlide(page);
    assert.equal(await page.getByRole('combobox', { name: '课件页码' }).inputValue(), String(node.slides[0]));
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, 'outline-slide.png'), fullPage: true });
    await page.getByRole('button', { name: '打开大纲', exact: true }).click();
    await page.getByRole('button', { name: `学习节点：${node.title}`, exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'outline.png'), fullPage: true });

    await page.goto(origin);
    await page.getByRole('heading', { name: '学习空间', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: '学习空间', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('heading', { name: '学习空间', exact: true }).waitFor();
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, 'mobile-home.png'), fullPage: true });
    await page.getByRole('button', { name: '展开章节目录', exact: true }).click();
    await page.getByRole('button', { name: `章节：${chapters[3].title}`, exact: true }).click();
    await page.getByRole('textbox', { name: '向助教提问' }).waitFor();
    await page.getByRole('button', { name: '打开大纲', exact: true }).click();
    await page.getByRole('button', { name: `学习节点：${node.title}`, exact: true }).click();
    await loadedSlide(page);
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, 'mobile-outline-slide.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: home, seven complete roadmaps, PPT links, unconfigured API guard, mobile layout.');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
