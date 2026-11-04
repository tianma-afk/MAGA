import { expect, test, type Page } from '@playwright/test';

const chapters = [
  { id: 'chapter4', title: '第4章 处理器', filename: 'chapter4.pptx', slideCount: 2 },
  { id: 'chapter5', title: '第5章 可用性', filename: 'chapter5.pptx', slideCount: 2 },
];
const details = {
  chapter4: {
    ...chapters[0],
    slides: [
      { number: 1, title: '处理器概述', text: '课件正文', notes: '' },
      { number: 2, title: '指令执行', text: '执行过程', notes: '' },
    ],
  },
  chapter5: {
    ...chapters[1],
    slides: [
      { number: 1, title: '可用性概述', text: '可用性关注系统在需要时能提供服务。', notes: '' },
      { number: 2, title: '心跳检测', text: '心跳检测用于发现组件故障。', notes: '' },
    ],
  },
};

async function fixtures(page: Page) {
  await page.route('**/api/health', route => route.fulfill({
    json: { status: 'ok', mode: 'unconfigured', missing: ['LLM_API_KEY', 'LLM_MODEL'] },
  }));
  await page.route('**/api/chapters', route => route.fulfill({ json: chapters }));
  await page.route('**/api/chapters/*/outline', route => route.fulfill({
    json: {
      chapterId: 'chapter5', title: '可用性学习路线',
      nodes: [
        { id: 'intro', title: '认识可用性', summary: '理解服务中断', slides: [1] },
        { id: 'heartbeat', title: '心跳检测', summary: '发现组件故障', slides: [2] },
      ],
      edges: [{ source: 'intro', target: 'heartbeat' }],
    },
  }));
  await page.route('**/api/chapters/chapter4', route => route.fulfill({ json: details.chapter4 }));
  await page.route('**/api/chapters/chapter5', route => route.fulfill({ json: details.chapter5 }));
  await page.route('**/api/search*', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    const results = query === 'heartbeat' ? [{
      chapterId: 'chapter5', chapterTitle: '第5章 可用性', slide: 2,
      slideTitle: '心跳检测', snippet: '心跳检测用于发现组件故障。', score: 8,
    }] : [];
    return route.fulfill({ json: { query, results } });
  });
}

test('searches across chapters without AI and jumps to the target slide', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  const input = page.getByRole('searchbox', { name: '跨章搜索' });
  await input.fill('none');
  await input.press('Enter');
  await expect(page.getByText('没有找到相关内容。')).toBeVisible();

  await input.fill('heartbeat');
  await input.press('Enter');
  const result = page.getByRole('button', { name: /第5章 可用性.*第 2 页/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(/#\/chapter\/chapter5/);
  await expect(page.getByRole('heading', { name: '第5章 可用性' })).toBeVisible();
  await expect(page.getByLabel('课件页码')).toHaveValue('2');
});
