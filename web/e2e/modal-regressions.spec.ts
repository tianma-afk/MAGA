import { expect, test, type Page } from '@playwright/test';

const chapter = { id: 'modal-fixture', title: '弹窗回归课件', filename: 'fixture.pptx', slideCount: 2 };
const detail = { ...chapter, slides: [1, 2].map(number => ({
  number, title: `来源页${number}`, text: '可拖选的课件正文，用于跨遮罩选择测试。', notes: '',
})) };
const question = { question: '保留的历史问题', options: ['正确', '错误'], correctIndex: 0,
  explanation: '历史解析', citations: [{ slide: 2, title: '历史引用' }] };

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function setup(page: Page) {
  const state = { stale: false, hold: false, calls: 0, unexpected: [] as string[], release: () => {} };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  state.release = release;
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    const base = new URL(page.url() === 'about:blank' ? test.info().project.use.baseURL! : page.url());
    if (url.origin !== base.origin) { state.unexpected.push(url.href); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/health') return route.fulfill({ json: { status: 'ok', mode: 'ai', missing: [] } });
    if (url.pathname === '/api/chapters') return route.fulfill({ json: [chapter] });
    if (url.pathname === `/api/chapters/${chapter.id}/outline`) return route.fulfill({
      json: { chapterId: chapter.id, title: '路线', nodes: [], edges: [] },
    });
    if (url.pathname === `/api/chapters/${chapter.id}`) return route.fulfill({
      json: state.stale ? { ...detail, slides: [detail.slides[0]] } : detail,
    });
    if (url.pathname === '/api/quiz') {
      state.calls++;
      if (state.hold) await gate;
      return route.fulfill({ json: { mode: 'ai', questions: [1, 2, 3].map(n => ({ ...question, question: `新问题${n}` })) } }).catch(() => {});
    }
    if (url.pathname === '/api/chat') return route.fulfill({ json: {
      mode: 'ai', content: '含旧引用的聊天回复', slide: 1, citations: [{ slide: 9, title: '旧聊天引用' }],
    } });
    state.unexpected.push(url.pathname);
    return route.abort(); // No API request may reach a real backend.
  });
  await page.addInitScript(({ chapter, question }) => {
    localStorage.setItem(`chapter-tutor:quiz:v1:${chapter.id}`, JSON.stringify({ records: [{
      id: 'fixture-history', slide: 1, createdAt: '2026-11-10T00:00:00Z', questions: [question], answers: [1],
    }] }));
  }, { chapter, question });
  await page.goto('/');
  await page.getByRole('link', { name: `打开章节：${chapter.title}` }).click();
  await page.getByRole('button', { name: '本页自测' }).click();
  return state;
}
async function openSource(page: Page) {
  await page.locator('.quiz-review').getByRole('button', { name: '第 2 页 · 历史引用' }).click();
  const source = page.locator('.source-dialog');
  await expect(source).toBeVisible();
  expect(await source.evaluate(element => element.matches(':modal'))).toBe(true);
  return source;
}

test('native Escape preserves quiz state and an in-flight generation', async ({ page }) => {
  const state = await setup(page);
  state.hold = true;
  await page.getByRole('button', { name: '重新生成本页自测' }).click();
  await expect.poll(() => state.calls).toBe(1);
  const source = await openSource(page);
  await page.keyboard.press('Escape');
  await expect(source).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '自测', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '停止', exact: true })).toBeVisible();
  await expect(page.getByText('保留的历史问题', { exact: true }).first()).toBeVisible();
  state.release();
  await expect(page.getByRole('radio', { name: '正确', exact: true }).first()).toBeVisible();
  await page.getByRole('radio', { name: '正确', exact: true }).first().check();
  await page.locator('.quiz-wrong').getByRole('button', { name: '第 2 页 · 历史引用' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio', { name: '正确', exact: true }).first()).toBeChecked();
  expect(state.calls).toBe(1);
  expect(state.unexpected).toEqual([]);
});

test('real text selection across backdrop stays open, full backdrop click closes', async ({ page }) => {
  const state = await setup(page);
  const source = await openSource(page);
  const text = source.locator('.slide-text p');
  const box = (await text.boundingBox())!;
  const modal = (await source.boundingBox())!;
  const outside = { x: Math.max(1, modal.x - 20), y: box.y + box.height / 2 };
  await page.mouse.move(box.x + Math.min(box.width / 2, 120), box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 15 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0);
  await expect(source).toBeVisible();
  await page.mouse.click(outside.x, outside.y);
  await expect(source).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});

test('native confirmation preserves records on drag, Escape and backdrop dismissal', async ({ page }) => {
  const state = await setup(page);
  const saved = await page.evaluate(() => localStorage.getItem(`chapter-tutor:quiz:v1:modal-fixture`));
  await page.getByRole('button', { name: '重置本章', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '重新开始本章？' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  const text = dialog.getByText('对话记录与当前阅读页', { exact: true });
  const box = (await text.boundingBox())!;
  const modal = (await dialog.boundingBox())!;
  const outside = { x: Math.max(1, modal.x - 20), y: box.y + box.height / 2 };
  await page.mouse.move(box.x + 50, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(outside.x, outside.y, { steps: 10 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '自测', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置本章', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(outside.x, outside.y);
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem(`chapter-tutor:quiz:v1:modal-fixture`))).toBe(saved);
  expect(state.unexpected).toEqual([]);
});

test('stale history and chat citations need explicit recovery to current pages', async ({ page }) => {
  const state = await setup(page);
  state.stale = true;
  let source = await openSource(page);
  await expect(source.getByRole('alert')).toContainText('引用来源已失效，课件可能更新');
  await expect(source.getByLabel('课件页码')).toHaveCount(0);
  await expect(source.getByText(/此页未提取到文字/)).toHaveCount(0);
  await source.getByRole('button', { name: '查看当前课件首页' }).click();
  await expect(source.getByLabel('课件页码')).toHaveValue('1');
  await expect(source.getByRole('alert')).toContainText('原引用：第 2 页');
  await expect(source.getByRole('alert')).toContainText('当前浏览：第 1 页');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '向助教提问' }).fill('旧引用测试');
  await page.getByRole('button', { name: '发送消息' }).click();
  await page.getByRole('button', { name: '第 9 页 · 旧聊天引用' }).click();
  source = page.locator('.source-dialog');
  await expect(source.getByRole('alert')).toContainText('原引用：第 9 页');
  await expect(source.getByLabel('课件页码')).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});
