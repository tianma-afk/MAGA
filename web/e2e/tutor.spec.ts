import { expect, test, type Page } from '@playwright/test';

const chapters = [1, 2, 4, 5, 6, 7, 8].map(n => ({
  id: `chapter${n}`, title: `第${n}章 ${n === 4 ? '指令系统' : '计算机组成原理'}`,
  filename: `chapter${n}.pptx`, slideCount: 3,
}));
const answer = {
  content: '指令由操作码和地址码组成。先理解操作的含义，再观察数据的流向。',
  slide: 2, citations: [{ slide: 2, title: '指令的组成' }], mode: 'offline',
  diagram: {
    title: '指令执行过程',
    nodes: [{ id: 'fetch', label: '取指令' }, { id: 'decode', label: '译码' }, { id: 'execute', label: '执行指令' }],
    edges: [{ source: 'fetch', target: 'decode', label: '解析' }, { source: 'decode', target: 'execute' }],
  },
};
async function fixtures(page: Page) {
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', mode: 'offline' } }));
  await page.route('**/api/chapters', route => route.fulfill({ json: chapters }));
  await page.route('**/api/chapters/chapter*', route => {
    const chapter = chapters.find(c => route.request().url().endsWith(c.id))!;
    return route.fulfill({ json: { ...chapter, slides: [1, 2, 3].map(number => ({
      number, title: number === 2 ? '指令的组成' : '计算机组成与体系结构',
      text: '计算机的基本组成\n运算器、控制器、存储器、输入设备和输出设备。\n理解各部件之间的数据传递与控制关系。',
      notes: '从整体结构出发，逐步理解各个部件。',
      // A known tiny PNG verifies image loading mechanics; it is not a real PPT rendering.
      imageUrl: number === 3 ? '/api/test-slide.png' : undefined,
    })) } });
  });
  await page.route('**/api/test-slide.png', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.route('**/api/chat', route => route.fulfill({ json: answer }));
}
async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: '向助教提问' }).fill(text);
  await page.getByRole('button', { name: '发送消息' }).click();
}

test('chapter history, StrictMode graph visibility, citations, image and confirmed reset', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chapters[0].title);
  await expect(page.getByRole('button', { name: `章节：${chapters[2].title}` })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-welcome.png', fullPage: true });
  await send(page, '解释指令系统');
  await expect(page.getByText(answer.content)).toBeVisible();
  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(3);
  for (const node of await nodes.all()) await expect(node).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  await page.screenshot({ path: 'test-results/desktop-diagram.png', fullPage: true });
  await page.reload();
  await expect(page.getByText(answer.content)).toBeVisible();
  await page.getByRole('button', { name: `章节：${chapters[2].title}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chapters[2].title);
  await expect(page.getByText(answer.content)).toHaveCount(0);
  await page.getByRole('button', { name: `章节：${chapters[0].title}` }).click();
  await expect(page.getByText(answer.content)).toBeVisible();
  await page.getByRole('button', { name: '第 2 页 · 指令的组成' }).click();
  await expect(page.getByLabel('课件页码')).toHaveValue('2');
  await page.getByLabel('课件页码').selectOption('3');
  const slideImage = page.getByRole('img', { name: '第 3 页：计算机组成与体系结构' });
  await expect(slideImage).toBeVisible();
  await expect.poll(() => slideImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '重置本章' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '保留记录' }).click();
  await expect(page.getByText(answer.content)).toBeVisible();
  await page.getByRole('button', { name: '重置本章' }).click();
  await page.getByRole('button', { name: '清空本章' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('课件页码')).toHaveValue('1');
  await page.reload();
  await expect(page.getByText(answer.content)).toHaveCount(0);
});

test('mobile drawers, composer and diagram stay inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '展开章节目录' }).click();
  await page.getByRole('button', { name: `章节：${chapters[2].title}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chapters[2].title);
  await page.screenshot({ path: 'test-results/mobile-welcome.png', fullPage: true });
  await send(page, '画出知识结构');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-diagram.png', fullPage: true });
  await page.getByRole('button', { name: '关闭资料', exact: true }).click();
  await expect(page.getByText(answer.content)).toBeVisible();
  await page.getByRole('button', { name: '打开课件' }).click();
  await expect(page.getByLabel('课件页码')).toHaveValue('2');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('课件页码')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('textbox', { name: '向助教提问' })).toBeVisible();
});

test('loading failures retry and switching chapters cancels in-flight work', async ({ page }) => {
  await fixtures(page);
  let listFailing = true;
  await page.route('**/api/chapters', route => listFailing
    ? route.fulfill({ status: 503 }) : route.fulfill({ json: chapters }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('503');
  listFailing = false;
  await page.getByRole('button', { name: '重新连接' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  let replyAttempts = 0;
  await page.route('**/api/chat', async route => {
    replyAttempts++;
    if (replyAttempts === 1) return route.fulfill({ status: 503 });
    if (replyAttempts === 2) return route.fulfill({ json: answer });
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ json: { ...answer, content: '不应串入下一章的回复' } }).catch(() => {});
  });
  await send(page, '重试问题');
  await expect(page.getByRole('alert')).toContainText('503');
  await page.getByRole('button', { name: '重试回复' }).click();
  await expect(page.getByText(answer.content)).toBeVisible();
  await send(page, '慢速问题');
  await expect(page.getByRole('button', { name: '停止回复' })).toBeVisible();
  await page.getByRole('button', { name: `章节：${chapters[2].title}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(chapters[2].title);
  await page.waitForTimeout(800);
  await expect(page.getByText('不应串入下一章的回复')).toHaveCount(0);
  await page.getByRole('button', { name: `章节：${chapters[0].title}` }).click();
  await expect(page.getByText('不应串入下一章的回复')).toHaveCount(0);
  await expect(page.getByText(answer.content)).toBeVisible();
});
