# 本轮新增功能与工作汇总

> 日期：2026-11-05
>
> 分支：`feat/quiz-and-foundation`
>
> 最新提交：`2ad91b9 feat: add OCR-assisted slide context`
>
> 本文件只记录本轮完成内容和已知限制，不分配后续任务。

## 1. 本轮概览

在原有“学习空间 + 章节对话 + 大纲 + 课件预览 + 图解”的基础上，本轮完成了：

1. **结构化自测闭环**：生成题目、作答、判分、解析、章节历史、跨页错题。
2. **跨章搜索**：在 7 章 340 页课件中搜索文字和备注，点击跳转。
3. **OCR 课件辅助**：为 82 个图片型页面补充 OCR 文本，让 AI 能读到图中的文字。
4. **配套文档与测试**：接口契约、扩展点、交接说明、后端/前端/E2E 测试。

原有基线功能仍然保留：学习空间、章节对话、页码引用、主题大纲、课件原图/文字降级、图解画布、无 Key 时 503、章节隔离。

## 2. 环境与运行准备

本轮同时完成了本地开发环境准备：

- Python 3.11.9，`.venv` 虚拟环境，已安装 `requirements.txt`。
- Node.js 22.23.4 便携版；没有使用 Node 26，因为其内置 `localStorage` 会与 jsdom 测试冲突。
- 前端依赖已通过 `npm ci` 安装。
- 340 张 PPT 页面 PNG 已用桌面 PowerPoint 渲染到 `data/slides/`。
- `.env` 已配置 DeepSeek：
  - `LLM_BASE_URL=https://api.deepseek.com`
  - `LLM_MODEL=deepseek-flash`
  - `LLM_API_KEY` 只保存在本地，`.env` 被 Git 忽略。
- 可选 OCR 依赖 `rapidocr_onnxruntime` 已安装，对应 `requirements-ocr.txt`。

本地专属、未提交的内容：

- `.env`
- `data/slides/`
- `data/ocr/`
- `data/verification/`

## 3. 新功能一：结构化自测闭环

### 用户能做什么

- 在章节页点击“本页自测”或工具栏“自测”。
- 根据当前页和所属大纲节点生成 3–5 道单选题。
- 每题 4 个选项（模型侧提示），全部作答后才能提交。
- 提交后显示得分、逐题解析、正确选项和引用页码。
- 引用页码可点击，直接跳到对应 PPT。
- 自动保存本章多次自测历史：页码、得分、时间。
- 汇总本章跨页错题回顾。
- 刷新后历史仍在；切换章节隔离；清空章节时一并清除。
- 未配置模型时不能生成新自测，但已保存历史仍可查看。

### 后端接口

`POST /api/quiz`

```json
{ "chapterId": "chapter-5", "slide": 17 }
```

响应包含 `questions`，每道题有：

```json
{
  "question": "...",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 2,
  "explanation": "...",
  "citations": [{ "slide": 17, "title": "Detect Faults: Heartbeat" }]
}
```

行为与校验：

- 3–5 题；每题 2–6 个非空、不重复选项；`correctIndex` 在范围内。
- 每题 1–4 个引用，引用必须来自本次提供的课件来源。
- 引用标题由后端用真实 PPT 标题重写。
- 未配置 503；章节不存在 404；页码/字段非法 422；模型输出或上游失败 502。
- 当前页和所属大纲节点都没有文字/备注/OCR 时返回 422，不编造题目。
- 上下文最多 8 页：当前页 + 大纲节点页 + 关键词相关页 + 下一页。

### 前端存储

- Key：`chapter-tutor:quiz:v1:{chapterId}`
- 每章最多 20 条记录。
- 记录结构：`id / slide / createdAt / questions / answers`
- 损坏、超长、非法选项的记录会被忽略。

### 主要文件

- `server/quiz.py`
- `server/models.py` 中的 `QuizRequest / QuizQuestion / QuizAnswer / QuizResponse`
- `server/tests/test_quiz.py`
- `web/src/QuizPane.tsx`
- `web/src/QuizQuestionCard.tsx`
- `web/src/QuizReview.tsx`
- `web/src/QuizWrongReview.tsx`
- `web/src/quiz.ts`
- `web/src/quiz.css`
- `web/src/quiz.test.ts`
- `web/src/QuizPane.test.tsx`

## 4. 新功能二：跨章搜索

### 用户能做什么

- 在顶部搜索框输入关键词，跨 7 章搜索课件文字、备注和 OCR 文本。
- 结果展示章节、页码、标题和摘要。
- 点击结果直接跳到目标章节和页码。
- 不需要 AI 配置，未填 Key 也能使用。

### 后端接口

`GET /api/search?q=<关键词>&limit=20`

- `q`：1–200 字符，空白返回 422。
- `limit`：1–50，默认 20。
- 标题命中权重 3；正文、备注、OCR 权重 1。
- 英文按 2+ 字符 token，中文按字符 bigram + 完整片段。
- 不需要模型调用。

### 主要文件

- `server/search.py`
- `server/tests/test_search.py`
- `web/src/GlobalSearch.tsx`
- `web/src/search.css`
- `web/src/GlobalSearch.test.tsx`
- `web/e2e/search.spec.ts`
- `web/src/App.tsx`、`web/src/Tutor.tsx`：搜索跳转逻辑

## 5. 新功能三：OCR 课件辅助

### 解决的问题

最初测试发现：AI 无法识别部分图片型课件。排查结果：

- 340 页中有 **82 页正文和备注为空**，但都有渲染图片。
- 原实现只把 PPT 可提取文字发给模型，图片仅供前端展示。
- 因此这些页面模型只能收到“本页可提取文字不足，图像内容尚未解析”。

### 实现

- 新增离线脚本 `scripts/ocr-slides.py`，使用 RapidOCR 识别图片文字。
- 新增 `requirements-ocr.txt`；OCR 包只用于生成，应用运行时不导入。
- 默认只处理正文/备注不足的页面，输出到 `data/ocr/{chapterId}/{page}.txt`。
- 已为 82 个稀疏页生成 OCR 文本。
- `Slide` 增加可选 `ocrText`；`ChapterStore` 从缓存读取。
- 上下文优先级：**PPT 正文 → 讲者备注 → OCR 文本**。
- 自测的“文字不足”判断和跨章搜索也会使用 OCR 文本。
- 课件页显示“含 OCR 文本”，可展开“OCR 识别文本（可能有误）”。

### 效果验证

Chapter 5 第 21 页 Checksum：

- 接入前：模型回答“本页可提取文字不足，图像内容尚未解析”。
- 接入后：模型能完整解释四步计算过程，并指出 OCR 把 `0x64` 识别成了 `0c64`。
- 该页自测也从 422 变为正常生成题目。

### OCR 质量样本

对 9 个代表性图片页做试验：

- 平均置信度：0.988
- 低于 0.7 的行：0
- 单页耗时：1.5–6.3 秒
- 总耗时：25.1 秒

结论：文字型图片页效果很好；架构图能读到标签，但读不到箭头和结构关系。

### 主要文件

- `scripts/ocr-slides.py`
- `requirements-ocr.txt`
- `server/chapters.py`：读取 OCR 缓存
- `server/tutor.py`：合并 OCR 到上下文
- `server/quiz.py`：OCR 参与自测可用性判断
- `server/search.py`：OCR 参与搜索
- `server/tests/test_ocr.py`
- `web/src/StudyPane.tsx`：OCR 展示
- `web/src/StudyPane.test.tsx`

## 6. 文档与接口

本轮新增或更新：

- `docs/EXTENSION_POINTS.md`：自测、搜索、OCR、组件和错误码契约。
- `README.md`：自测、搜索、OCR 使用说明。
- `docs/AGENT_HANDOVER.md`：当前状态、已完成、设计未完成、可复用接口。
- `docs/spec/architecture.md`：补充 OCR 文本的边界。
- `docs/plan/verification.md`：本轮验证记录。
- `CONTRIBUTING.md`：个人开发指南和可选 OCR 步骤。
- `docs/HANDOVER_TEMPLATE.md`：只记录状态和接口，不分配后续任务。

本轮没有创建 `ROADMAP.md`，也没有给后续轮次分配任务。

## 7. 验证结果

| 检查 | 结果 |
| --- | --- |
| 后端 pytest | 116 passed |
| 前端 Vitest | 48 passed |
| Playwright E2E | 8 passed |
| Vite 生产构建 | 通过 |
| 500 行检查 | 60 个源码文件，0 超限 |
| 真实模型问答 | `deepseek-flash` 约 1.8 秒 |
| 真实模型自测 | `deepseek-flash` 约 5.2 秒 |
| OCR 页问答/自测 | Chapter 5 第 21 页通过 |
| 未配置保护 | 自测/问答返回 503 |

对比：`deepseek-v4-pro` 自测约 40.9 秒，接近 45 秒上游超时，因此默认模型使用 `deepseek-flash`。

## 8. 提交与当前状态

- `486cc26 feat: add structured self-test and cross-chapter search`
- `2ad91b9 feat: add OCR-assisted slide context`

当前分支为 `feat/quiz-and-foundation`，尚未推送到 GitHub。

本地还有：

- `.vscode/`：IDE 生成，未跟踪、未提交。
- `data/ocr/`：82 个 OCR 文本，未跟踪。
- `data/slides/`：340 张页面图片，未跟踪。
- `data/verification/`：本轮真实测试结果，未跟踪。

## 9. 已知限制

- 没有流式输出，问答和自测要等完整结果返回。
- 自测按当前页 + 所属大纲节点出题，可能涉及相邻页，不是严格只考当前页。
- OCR 只补充文字，不理解箭头、布局和图形关系。
- 搜索是关键词匹配，不是语义检索；没有高亮、筛选、分页。
- PDF 教材没有建立索引；不支持上传新课件。
- 没有账号、云同步；清理浏览器数据会丢失本地记录。
- 图解是教学示意，不是原 PPT 重绘；不能编辑或导出。
- 错题回顾不能导出；没有学习进度面板。

## 10. 用户使用路径

1. 启动后端和前端。
2. 打开 `http://127.0.0.1:5173`。
3. 进入 Chapter 5，跳到第 17 页或第 21 页。
4. 点击“本页自测”，生成并作答。
5. 顶部搜索 `heartbeat` 或 `可用性`，点击结果跳页。
6. 打开课件页的“OCR 识别文本（可能有误）”，可以看到 AI 读到的图片文字。
