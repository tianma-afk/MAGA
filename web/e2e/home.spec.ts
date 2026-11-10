import { expect, test, type Page } from '@playwright/test';

const chapters = [
  { id: 'chapter-1', title: '软件体系结构概论', filename: 'a.pptx', slideCount: 20 },
  { id: 'chapter-5', title: 'Chapter 5: Availability（可用性）', filename: 'b.pptx', slideCount: 39 },
];
const question = {
  question: '如何使用心跳发现故障？', options: ['周期消息', '缓存结果'], correctIndex: 0,
  explanation: '周期性地检查进程存活', citations: [{ slide: 17, title: 'Heartbeat' }],
};
const date = '2026-01-01T10:00:00.000Z';

async function fixtures(page: Page) {
  // Fail closed: these tests never reach the locally configured model service.
  await page.route('**/api/**', route => route.abort());
  await page.route('**/api/health', route => route.fulfill({
    json: { status: 'ok', mode: 'unconfigured', missing: ['LLM_API_KEY'] },
  }));
  await page.route('**/api/chapters', route => route.fulfill({ json: chapters }));
  await page.route('**/api/chapters/*/outline', route => route.fulfill({
    json: { chapterId: 'chapter-5', title: '学习路线', nodes: [], edges: [] },
  }));
  await page.route('**/api/chapters/chapter-5', route => route.fulfill({
    json: { ...chapters[1], slides: [{ number: 17, title: 'Heartbeat', text: '真实来源格式', notes: '' }] },
  }));
  await page.addInitScript(({ question, date }) => {
    const project = { title: '在线考试系统设计草稿', scenario: '持续提供服务', requirements: '30秒恢复',
      qualityAttributes: [], scenarios: [], tactics: [], selectedTactics: [], updatedAt: date };
    const workspace = { version: 1, scrollTop: 0, updatedAt: date, draft: {
      id: 'saved-attempt', sourceSlide: 17, kind: 'generated', questions: [question],
      answers: [1], createdAt: date,
    } };
    if (localStorage.getItem('home-fixture-ready')) return;
    localStorage.setItem('chapter-tutor:v2:chapter-5', JSON.stringify({ slide: 17, messages: [] }));
    localStorage.setItem('chapter-tutor:progress:v1:chapter-5', JSON.stringify({ visited: [1, 17], updatedAt: date }));
    localStorage.setItem('chapter-tutor:quiz-workspace:v1:chapter-5', JSON.stringify(workspace));
    localStorage.setItem('chapter-tutor:design:v1:current', JSON.stringify(project));
    localStorage.setItem('home-fixture-ready', 'yes');
  }, { question, date });
}

test('offers three saved tasks and restores each without generating content', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  const tasks = page.getByRole('region', { name: '继续上次任务' });
  await expect(tasks.getByRole('link')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/T11-home-desktop.png' });
  await tasks.getByRole('link', { name: /^继续学习/ }).click();
  await page.getByRole('button', { name: '打开课件' }).click();
  await expect(page.getByLabel('课件页码')).toHaveValue('17');
  await page.getByRole('button', { name: '返回学习空间' }).click();
  await tasks.getByRole('link', { name: /^继续练习/ }).click();
  await expect(page.getByRole('radio', { name: '缓存结果' })).toBeChecked();
  await expect(page.getByRole('button', { name: /生成本页自测/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('radio', { name: '缓存结果' })).toBeChecked();
  await page.getByRole('button', { name: '返回学习空间' }).click();
  await tasks.getByRole('link', { name: /^继续实践/ }).click();
  await expect(page.getByLabel('设计标题')).toHaveValue('在线考试系统设计草稿');
  await expect(page.getByRole('button', { name: '生成质量属性与场景' })).toBeDisabled();
});

test('fits three task cards and a long chapter name at 390px and 320px', async ({ page }) => {
  await fixtures(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const cards = page.getByRole('region', { name: '继续上次任务' }).getByRole('link');
    await expect(cards).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `test-results/T11-home-${width}.png`, fullPage: true });
  }
});
