import { expect, test, type Page } from '@playwright/test';

const chapters = [
  { id: 'chapter-5', title: '第5章 可用性', filename: 'chapter5.pptx', slideCount: 39 },
];
const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };

async function fixtures(page: Page) {
  await page.route('**/api/health', route => route.fulfill({
    json: { status: 'ok', mode: 'ai', missing: [] },
  }));
  await page.route('**/api/chapters', route => route.fulfill({ json: chapters }));
  await page.route('**/api/design/scenarios', route => route.fulfill({
    json: {
      mode: 'ai',
      qualityAttributes: [{ name: '可用性', priority: 'high', reason: '考试不能中断' }],
      scenarios: [{
        stimulus: '组件故障', source: '监控器', artifact: '考试服务',
        environment: '正常运行', response: '检测并恢复', measure: '5 分钟内恢复',
        citations: [citation],
      }],
    },
  }));
  await page.route('**/api/design/tactics', route => route.fulfill({
    json: {
      mode: 'ai',
      tactics: [{
        name: '心跳检测', rationale: '发现故障', tradeoffs: '增加消息开销',
        citations: [citation],
      }],
    },
  }));
  await page.route('**/api/design/review', route => route.fulfill({
    json: {
      mode: 'ai', summary: '方案覆盖了可用性。',
      findings: [{
        area: '可用性', finding: '缺少恢复流程', severity: 'high',
        suggestion: '补充冗余', citations: [citation],
      }],
      questions: ['心跳停止后如何恢复？'],
    },
  }));
}

test('runs the architecture practice flow from the home page', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await page.getByRole('link', { name: /架构实践/ }).click();
  await expect(page.getByRole('heading', { name: '架构实践' })).toBeVisible();
  await page.getByLabel('设计标题').fill('在线考试系统');
  await page.getByLabel('场景描述').fill('考试期间持续提供服务');
  await page.getByLabel('需求与约束').fill('高可用');
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await expect(page.getByRole('heading', { name: '可用性', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推荐架构战术' }).click();
  await expect(page.getByText('心跳检测')).toBeVisible();
  await page.getByRole('button', { name: '生成 AI 评审' }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();
  await expect(page.getByText('心跳停止后如何恢复？')).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('chapter-tutor:design:v1:current'));
  expect(saved).toContain('在线考试系统');
});
