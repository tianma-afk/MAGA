import { expect, test, type Page } from '@playwright/test';

const citation = { chapterId: 'chapter-5', slide: 17, title: 'Heartbeat' };
const decisions = [
  { id: 'capacity', question: '你将如何避免报名超卖和重复报名，同时控制系统复杂度？', citations: [citation] },
  { id: 'notification', question: '通知服务发生故障时，怎样保障核心报名交易的可靠性？', citations: [citation] },
  { id: 'evolution', question: '面对热点扩容和性能瓶颈，你会怎样选择架构演进方案？', citations: [citation] },
];
const knowledge = { strategy: 'baseline', queries: ['availability heartbeat'], citations: [citation] };
const caseOne = { id: 'campus-booking', title: '校园活动报名与名额管理', level: '中级',
  background: '四名开发者设计校园活动报名系统。', requirements: ['名额不能超卖', '通知异步处理'],
  constraints: ['热门活动可能有数千人同时报名'] };

async function routes(page: Page) {
  let answers = 0;
  await page.route('**/api/health', route => route.fulfill({
    json: { status: 'ok', mode: 'ai', missing: [] },
  }));
  await page.route('**/api/chapters', route => route.fulfill({
    json: [{ id: 'chapter-5', title: '第5章 可用性', slideCount: 39, filename: 'f.pptx' }],
  }));
  await page.route('**/api/practice/cases', route => route.fulfill({ json: [caseOne] }));
  await page.route('**/api/practice/plan', route => route.fulfill({ json: { decisions, knowledge } }));
  await page.route('**/api/practice/answer', route => {
    answers++;
    return route.fulfill({ json: { action: answers === 1 ? 'followup' : 'complete',
      feedback: '需要分析事务与可靠性的权衡。',
      followup: answers === 1 ? '如果数据库发生故障，你如何保证名额和报名记录保持一致？' : null,
      citations: [citation], knowledge } });
  });
  await page.route('**/api/practice/finalize', route => route.fulfill({ json: {
    summary: '在追问后能合理解释一致性与演进策略。',
    strengths: ['问题识别准确'], improvements: ['增加压测与故障验证'],
    referenceApproach: '使用数据库事务确保报名一致性，再独立异步通知。',
    citations: [citation], knowledge,
  } }));
  await page.route('**/api/chapters/chapter-5', route => route.fulfill({ json: {
    id: 'chapter-5', title: '第5章 可用性', slideCount: 39, filename: 'f.pptx',
    slides: [{ number: 17, title: 'Heartbeat', text: 'A heartbeat monitors failure', notes: '' }],
  } }));
}

test('runs a case-based decision interview and persists first and revised answers', async ({ page }) => {
  await routes(page);
  await page.goto('/#/studio');
  await expect(page.getByRole('heading', { name: '架构实践' })).toBeVisible();
  await page.getByRole('button', { name: /校园活动报名与名额管理/ }).click();
  await page.getByLabel('2. 你的需求理解、额外约束与潜在风险').fill(
    '我认为最重要的约束是并发情况下的名额一致性，还需要讨论通知失败和数据库性能问题。');
  await page.getByRole('button', { name: '生成架构决策问题' }).click();
  await expect(page.getByRole('heading', { name: /你将如何避免报名超卖/ })).toBeVisible();
  await page.getByLabel('你的架构设计思路').fill(
    '我会使用数据库事务与唯一索引，并通过压测验证吞吐量。');
  await page.getByRole('button', { name: '提交回答并获得反馈' }).click();
  await expect(page.getByText(/如果数据库发生故障/)).toBeVisible();
  await page.getByLabel('回答追问').fill(
    '必须保证扣减名额和保存报名处在同一事务中，失败时回滚，并监控重试。');
  await page.getByRole('button', { name: '提交回答并获得反馈' }).click();
  await page.getByLabel('你的架构设计思路').fill(
    '使用异步事件和失败重试让通知与报名解耦，同时避免通知失败影响核心交易。');
  await page.getByRole('button', { name: '提交回答并获得反馈' }).click();
  await page.getByLabel('你的架构设计思路').fill(
    '先监控并验证瓶颈，再评估引入排队和弹性扩容所带来的响应语义变化。');
  await page.getByRole('button', { name: '提交回答并获得反馈' }).click();
  await page.getByRole('button', { name: '生成综合评审与参考方案' }).click();
  await expect(page.getByText('在追问后能合理解释一致性与演进策略。')).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('chapter-tutor:practice:v2:current'));
  expect(saved).toContain('数据库事务与唯一索引');
  expect(saved).toContain('必须保证扣减名额');
  await page.reload();
  await expect(page.getByText('在追问后能合理解释一致性与演进策略。')).toBeVisible();
});

test('opens verified course citation and returns to the same practice', async ({ page }) => {
  await routes(page);
  await page.goto('/#/studio');
  await page.getByRole('button', { name: /校园活动报名与名额管理/ }).click();
  await page.getByLabel('2. 你的需求理解、额外约束与潜在风险').fill(
    '我认为最重要的约束是高并发的一致性、事务与服务故障的影响。');
  await page.getByRole('button', { name: '生成架构决策问题' }).click();
  await page.getByRole('button', { name: 'chapter-5 · 第 17 页' }).first().click();
  await expect(page.locator('.source-dialog')).toBeVisible();
  await page.locator('.source-dialog').getByRole('button', { name: '关闭来源' }).click();
  await expect(page.getByRole('heading', { name: /你将如何避免报名超卖/ })).toBeVisible();
});
