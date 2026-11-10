import { expect, test, type Page } from '@playwright/test';

const chapter = { id: 'chapter4', title: '第4章 处理器', filename: 'chapter4.pptx', slideCount: 2 };
const detail = {
  ...chapter,
  slides: [
    { number: 1, title: '处理器概述', text: '课件正文', notes: '' },
    { number: 2, title: '指令执行', text: '执行过程', notes: '' },
  ],
};
const questions = [
  {
    question: '问题一', options: ['正确一', '错误一A', '错误一B', '错误一C'],
    correctIndex: 0, explanation: '解析一', citations: [{ slide: 2, title: '指令执行' }],
  },
  {
    question: '问题二', options: ['错误二A', '正确二', '错误二B', '错误二C'],
    correctIndex: 1, explanation: '解析二', citations: [{ slide: 2, title: '指令执行' }],
  },
  {
    question: '问题三', options: ['错误三A', '错误三B', '正确三', '错误三C'],
    correctIndex: 2, explanation: '解析三', citations: [{ slide: 2, title: '指令执行' }],
  },
];

async function fixtures(page: Page, mode = 'ai') {
  await page.route('**/api/health', route => route.fulfill({
    json: { status: 'ok', mode, missing: mode === 'ai' ? [] : ['LLM_API_KEY', 'LLM_MODEL'] },
  }));
  await page.route('**/api/chapters', route => route.fulfill({ json: [chapter] }));
  await page.route('**/api/chapters/*/outline', route => route.fulfill({
    json: {
      chapterId: chapter.id, title: '处理器学习路线',
      nodes: [
        { id: 'overview', title: '认识处理器', summary: '从部件到功能', slides: [1] },
        { id: 'execute', title: '理解执行', summary: '跟随指令的数据流', slides: [2] },
      ],
      edges: [{ source: 'overview', target: 'execute' }],
    },
  }));
  await page.route('**/api/chapters/chapter4', route => route.fulfill({ json: detail }));
}

async function openQuiz(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: `打开章节：${chapter.title}` }).click();
  await page.getByRole('button', { name: '本页自测' }).click();
}

test('generates, scores, persists, previews a citation and clears with the chapter', async ({ page }) => {
  const quizCalls: number[] = [];
  await fixtures(page);
  await page.route('**/api/quiz', route => {
    quizCalls.push(1);
    return route.fulfill({ json: { mode: 'ai', questions } });
  });
  await openQuiz(page);
  await page.getByRole('button', { name: '生成本页自测' }).click();
  await expect(page.getByText('问题一')).toBeVisible();
  expect(quizCalls).toHaveLength(1);
  await page.getByRole('radio', { name: '正确一' }).check();
  await page.getByRole('radio', { name: '错误二A' }).check();
  await page.getByRole('radio', { name: '错误三A' }).check();
  await page.getByRole('button', { name: '提交自测' }).click();
  await expect(page.locator('.quiz-score strong')).toHaveText('1 / 3');
  await expect(page.locator('.quiz-wrong')).toContainText('问题二');
  await expect(page.locator('.quiz-wrong')).toContainText('问题三');

  await page.reload();
  await page.getByRole('button', { name: '本页自测' }).click();
  await expect(page.locator('.quiz-score strong')).toHaveText('1 / 3');

  await page.locator('.quiz-wrong button').first().click();
  const source = page.locator('.source-dialog');
  await expect(source.getByRole('heading', { name: /第 2 页/ })).toBeVisible();
  await expect(source.getByRole('heading', { name: '指令执行' })).toBeVisible();
  await source.getByRole('button', { name: '关闭来源' }).click();
  await expect(source).toHaveCount(0);
  await expect(page.locator('.quiz-score strong')).toHaveText('1 / 3');

  await page.getByRole('button', { name: '重置本章' }).click();
  await page.getByRole('button', { name: '清空本章' }).click();
  const saved = await page.evaluate(() => localStorage.getItem('chapter-tutor:quiz:v1:chapter4'));
  expect(saved).toBeNull();
});

test('keeps an unfinished quiz across the slides tab, a reload and a chapter reset', async ({ page }) => {
  const quizCalls: number[] = [];
  await fixtures(page);
  await page.route('**/api/quiz', route => {
    quizCalls.push(1);
    return route.fulfill({ json: { mode: 'ai', questions } });
  });
  await openQuiz(page);
  await page.getByRole('button', { name: '生成本页自测' }).click();
  await expect(page.getByText('问题一')).toBeVisible();
  await page.getByRole('radio', { name: '正确一' }).check();
  await expect(page.getByText(/已作答 1 \/ 3/)).toBeVisible();

  await page.getByRole('tab', { name: '课件' }).click();
  await expect(page.getByText('处理器概述')).toBeVisible();
  await page.getByRole('tab', { name: '自测' }).click();
  await expect(page.getByText('问题一')).toBeVisible();
  await expect(page.getByText(/已作答 1 \/ 3/)).toBeVisible();
  expect(quizCalls).toHaveLength(1);

  await page.reload();
  await page.getByRole('button', { name: '本页自测' }).click();
  await expect(page.getByText('问题一')).toBeVisible();
  await expect(page.getByText(/已作答 1 \/ 3/)).toBeVisible();
  expect(quizCalls).toHaveLength(1);

  await page.getByRole('button', { name: '重置本章' }).click();
  await page.getByRole('button', { name: '清空本章' }).click();
  const saved = await page.evaluate(() =>
    localStorage.getItem('chapter-tutor:quiz-workspace:v1:chapter4'));
  expect(saved).toBeNull();
});

test('resumes an unfinished task from home and its deep link without regenerating', async ({ page }) => {
  await fixtures(page);
  let calls = 0;
  await page.route('**/api/quiz', route => {
    calls++;
    return route.fulfill({ json: { mode: 'ai', questions } });
  });
  await openQuiz(page);
  await page.getByRole('button', { name: '生成本页自测' }).click();
  await page.getByRole('radio', { name: '正确一' }).check();
  await page.getByRole('button', { name: '返回学习空间' }).click();
  await page.getByRole('link', { name: `继续练习：${chapter.title}` }).click();
  await expect(page.getByRole('radio', { name: '正确一' })).toBeChecked();
  await expect(page.getByRole('tab', { name: '自测' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/view=quiz$/);
  await page.reload();
  await expect(page.getByRole('radio', { name: '正确一' })).toBeChecked();
  expect(calls).toBe(1);
});

test('keeps generation disabled without AI configuration', async ({ page }) => {
  let quizCalls = 0;
  await fixtures(page, 'unconfigured');
  await page.route('**/api/quiz', route => {
    quizCalls++;
    return route.fulfill({ json: { mode: 'ai', questions } });
  });
  await openQuiz(page);
  await expect(page.getByRole('button', { name: /生成本页自测/ })).toBeDisabled();
  await expect(page.getByText(/可生成自测/)).toBeVisible();
  expect(quizCalls).toBe(0);
});
