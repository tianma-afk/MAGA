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
  await page.route('**/api/chapters/chapter-5', route => route.fulfill({
    json: {
      ...chapters[0],
      slides: [
        { number: 1, title: '可用性概述', text: '可用性正文', notes: '' },
        { number: 17, title: 'Heartbeat', text: '心跳正文', notes: '讲者备注' },
      ],
    },
  }));
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

test('keeps practice input across a reload before any generation', async ({ page }) => {
  await fixtures(page);
  await page.goto('/#/studio');
  await page.getByLabel('设计标题').fill('在线考试系统');
  await page.getByLabel('场景描述').fill('考试期间持续提供服务');
  await expect(page.getByText(/已保存到本地/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('设计标题')).toHaveValue('在线考试系统');
  await expect(page.getByLabel('场景描述')).toHaveValue('考试期间持续提供服务');
});

test('opens a cited source in a dialog and returns to the same review', async ({ page }) => {
  await fixtures(page);
  await page.goto('/#/studio');
  await page.getByLabel('设计标题').fill('在线考试系统');
  await page.getByLabel('场景描述').fill('考试期间持续提供服务');
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await expect(page.getByRole('heading', { name: '可用性', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推荐架构战术' }).click();
  await expect(page.getByText('心跳检测')).toBeVisible();
  await page.getByRole('button', { name: '生成 AI 评审' }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();

  await page.getByRole('button', { name: 'chapter-5 · 第 17 页' }).first().click();
  const dialog = page.locator('.source-dialog');
  await expect(dialog.getByRole('heading', { name: /第5章 可用性 · 第 17 页/ })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Heartbeat' })).toBeVisible();
  await dialog.getByLabel('课件页码').selectOption('1');
  await expect(dialog.getByRole('heading', { name: '可用性概述' })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭来源' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();
});

test('confirms before clearing the only practice draft', async ({ page }) => {
  await fixtures(page);
  await page.goto('/#/studio');
  await page.getByLabel('设计标题').fill('在线考试系统');
  await page.getByLabel('场景描述').fill('考试期间持续提供服务');
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await expect(page.getByRole('heading', { name: '可用性', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推荐架构战术' }).click();
  await expect(page.getByText('心跳检测')).toBeVisible();
  await page.getByRole('button', { name: '生成 AI 评审' }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();

  await page.getByRole('button', { name: /重新开始/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('已生成的质量属性、场景、战术与评审');
  await dialog.getByRole('button', { name: '保留草稿' }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();

  await page.getByRole('button', { name: /重新开始/ }).click();
  await page.getByRole('button', { name: '清空实践草稿' }).click();
  await expect(page.getByLabel('设计标题')).toHaveValue('');
  const saved = await page.evaluate(() => localStorage.getItem('chapter-tutor:design:v1:current'));
  expect(saved).toBeNull();
});

async function completeDraft(page: Page) {
  await page.goto('/#/studio');
  await page.getByLabel('设计标题').fill('在线考试系统');
  await page.getByLabel('场景描述').fill('考试期间持续提供服务');
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await expect(page.getByRole('heading', { name: '可用性', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推荐架构战术' }).click();
  await expect(page.getByText('心跳检测')).toBeVisible();
  await page.getByRole('button', { name: '生成 AI 评审' }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();
}

test('revisits and exports a stale completed draft without an AI key', async ({ page }) => {
  await fixtures(page);
  await completeDraft(page);
  await page.getByRole('button', { name: '查看场景', exact: true }).click();
  await page.getByLabel('需求与约束').fill('新的峰值约束');
  await page.route('**/api/health', route => route.fulfill({
    json: { status: 'ok', mode: 'unconfigured', missing: ['API_KEY'] },
  }));
  let generations = 0;
  await page.route('**/api/design/**', route => { generations += 1; return route.abort(); });
  await page.reload();
  await expect(page.getByRole('heading', { name: '2. 质量属性与场景' })).toBeVisible();
  await expect(page.getByText('AI 尚未配置', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('chapter-tutor:design:v1:current'));
  await page.getByRole('button', { name: '查看战术', exact: true }).click();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: '生成 AI 评审' })).toBeDisabled();
  await page.getByRole('button', { name: '查看评审', exact: true }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 Markdown', exact: true })).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('architecture-design.md');
  expect(await page.evaluate(() => localStorage.getItem('chapter-tutor:design:v1:current'))).toBe(saved);
  expect(generations).toBe(0);
});

test('preserves old results when regeneration is cancelled or fails and replaces on success', async ({ page }) => {
  await fixtures(page);
  await completeDraft(page);
  const saved = await page.evaluate(() => localStorage.getItem('chapter-tutor:design:v1:current'));
  let generations = 0;
  await page.route('**/api/design/scenarios', route => {
    generations += 1;
    return route.fulfill({ status: 502, json: { detail: 'fixture generation failed' } });
  });
  await page.getByRole('button', { name: '查看场景', exact: true }).click();
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('质量属性与场景分析、架构战术、战术选择及 AI 评审');
  await dialog.getByRole('button', { name: '取消，保留原成果' }).click();
  expect(generations).toBe(0);
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await dialog.getByRole('button', { name: '确认重新生成' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('chapter-tutor:design:v1:current'))).toBe(saved);
  await page.getByRole('button', { name: '查看评审', exact: true }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();
  await fixtures(page);
  await page.getByRole('button', { name: '查看场景', exact: true }).click();
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await dialog.getByRole('button', { name: '确认重新生成' }).click();
  await expect(page.getByRole('heading', { name: '2. 质量属性与场景' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看战术', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '查看评审', exact: true })).toBeDisabled();
  const replaced = await page.evaluate(() => JSON.parse(localStorage.getItem('chapter-tutor:design:v1:current')!));
  expect(replaced.tactics).toEqual([]);
  expect(replaced.selectedTactics).toEqual([]);
  expect(replaced.review).toBeUndefined();
});

test('marks the review stale after changing a selected tactic', async ({ page }) => {
  await fixtures(page);
  await page.goto('/#/studio');
  await page.getByLabel('设计标题').fill('在线考试系统');
  await page.getByLabel('场景描述').fill('考试期间持续提供服务');
  await page.getByRole('button', { name: '生成质量属性与场景' }).click();
  await expect(page.getByRole('heading', { name: '可用性', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推荐架构战术' }).click();
  await expect(page.getByText('心跳检测')).toBeVisible();
  await page.getByRole('button', { name: '生成 AI 评审' }).click();
  await expect(page.getByText('方案覆盖了可用性。')).toBeVisible();
  await expect(page.getByText(/仅供参考/)).toHaveCount(0);

  await page.getByRole('button', { name: '返回战术' }).click();
  await page.getByRole('checkbox').uncheck();
  await page.reload();
  await expect(page.getByText(/方案在此评审后有修改/)).toBeVisible();
});
