# 当前功能与接口

> 状态快照：2026-11-05
>
> 分支：`feat/quiz-and-foundation`
>
> 功能提交：`486cc26`（自测 + 跨章搜索）、`2ad91b9`（OCR 辅助），以及后续增量（自测小闭环、进度/掌握度、架构实践、CI）
>
> 本文件只记录当前已实现的功能、契约、验证结果和已知限制。历史设计与实施记录已移到 `docs/archive/`。

## 1. 项目定位

MAGA 是一个以真实 PPT 为知识边界的“AI + 软件体系结构”章节学习工作台。

核心原则：

- 课件内容来自 `book/*.pptx`，不伪造章节。
- AI 只基于提供的课件文字、备注和 OCR 文本回答，并给出真实页码引用。
- 未配置模型时明确返回 503，不提供离线模拟回答。
- 每章对话、阅读位置和自测记录在浏览器本地隔离保存。
- 手写代码文件不超过 500 行。

## 2. 当前功能地图

| 区域 | 用户能做什么 |
| --- | --- |
| 学习空间 | 查看 7 个章节、页数和上次阅读位置 |
| 章节对话 | 提问、停止、重试、继续学习、查看 Markdown 回答和页码引用 |
| 主题大纲 | 按主题节点和页码范围导航，点击节点/页码翻页 |
| 课件查看 | 查看原稿图片、文字降级、备注、下载原始 PPT、翻页 |
| 图解画布 | 查看 AI 生成的节点/连线图，缩放、平移、适应画布 |
| 自测 | 生成 3–5 道单选题，作答、判分、看解析、历史和跨页错题 |
| 自测扩展 | 错题重练、删除单条历史、导出错题 Markdown |
| 架构实践 | 从真实场景生成质量属性、场景、战术和 AI 评审，导出 Markdown |
| 学习进度 | 首页显示已学页数、自测次数和平均分 |
| 大纲掌握度 | 大纲节点显示未测或自测次数/正确率 |
| 跨章搜索 | 跨 7 章搜索课件文字、备注和 OCR 文本，点击跳页 |
| OCR 辅助 | 为图片型页面补充 OCR 文本，AI 可读取图中的文字 |
| 工程门禁 | GitHub Actions 跑后端、前端、E2E 和 500 行检查 |
| 配置保护 | 无 Key 时禁用 AI 功能，但保留课件、大纲和搜索 |

原有基线功能仍然保留：学习空间、章节对话、主题大纲、课件原图/文字降级、图解画布、无 Key 503、章节隔离。

## 3. 环境与配置

- Python 3.11+；本项目使用 Python 3.11.9。
- Node.js 22 LTS；不要使用 Node 26，其内置 `localStorage` 会与 jsdom 测试冲突。
- 后端依赖：`requirements.txt`。
- 前端依赖：`web/package-lock.json`，使用 `npm ci`。
- 可选 OCR：`requirements-ocr.txt`，仅用于生成 OCR 文本。
- 模型配置在本地 `.env`：
  - `LLM_API_KEY`
  - `LLM_BASE_URL`
  - `LLM_MODEL`
- 当前实测使用 DeepSeek：
  - `LLM_BASE_URL=https://api.deepseek.com`
  - `LLM_MODEL=deepseek-flash`

`.env`、`data/slides/`、`data/ocr/`、`data/verification/` 都不提交 Git。

## 4. 新功能一：结构化自测闭环

### 用户流程

1. 打开章节，点击“本页自测”或资料抽屉的“自测”。
2. 点击“生成本页自测”。
3. 完成 3–5 道单选题。
4. 提交后查看得分、逐题解析、正确选项和引用页码。
5. 引用可点击跳到对应 PPT。
6. 查看“本章自测历史”和“本章错题回顾”。
7. 刷新后保留；切换章节隔离；清空章节时一并清除。

### 后端接口

`POST /api/quiz`

```json
{ "chapterId": "chapter-5", "slide": 17 }
```

成功响应：

```json
{
  "mode": "ai",
  "questions": [{
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 2,
    "explanation": "...",
    "citations": [{ "slide": 17, "title": "Detect Faults: Heartbeat" }]
  }]
}
```

校验规则：

- 3–5 题；每题 2–6 个非空、不重复选项。
- `correctIndex` 为严格整数且在范围内。
- 每题 1–4 个引用，引用必须来自本次提供的课件来源。
- 引用标题由后端用真实 PPT 标题重写。
- 未配置 503；章节不存在 404；字段/页码非法 422；模型输出或上游失败 502。
- 当前页和所属大纲节点都没有文字、备注或 OCR 时返回 422，不编造题目。
- 上下文最多 8 页：当前页 + 大纲节点页 + 关键词相关页 + 下一页。

### 前端存储

- Key：`chapter-tutor:quiz:v1:{chapterId}`
- 每章最多 20 条记录。
- 记录结构：

```ts
{
  id: string,
  slide: number,
  createdAt: string,
  questions: QuizQuestion[],
  answers: number[]
}
```

- 判分、错题汇总在 `web/src/quiz.ts`。
- 清空章节时由 `Tutor.reset()` 调用 `clearQuizStore`。

### 自测扩展功能

- **只练错题**：从当前结果中提取答错题目，生成新的练习；不调用模型。
- **删除单条历史**：自测历史每行有删除按钮，删除后刷新不恢复。
- **导出错题**：将当前结果的错题导出为 Markdown，包含题目、你的答案、正确答案、解析和页码引用。
- 本地重练记录允许 1–5 题；后端生成仍保持 3–5 题。

### 主要文件

- `server/quiz.py`
- `server/models.py`：`QuizRequest`、`QuizQuestion`、`QuizAnswer`、`QuizResponse`
- `server/tests/test_quiz.py`
- `web/src/QuizPane.tsx`
- `web/src/QuizQuestionCard.tsx`
- `web/src/QuizReview.tsx`
- `web/src/QuizWrongReview.tsx`
- `web/src/quiz.ts`
- `web/src/quiz.css`
- `web/src/quiz.test.ts`
- `web/src/QuizPane.test.tsx`

## 5. 新功能二：跨章搜索

### 用户流程

- 顶部搜索框输入关键词。
- 结果展示章节、页码、标题和摘要。
- 点击结果跳到目标章节和页码。
- 不需要 AI 配置。

### 后端接口

`GET /api/search?q=<关键词>&limit=20`

- `q`：1–200 字符，空白查询返回 422。
- `limit`：1–50，默认 20。
- 标题命中权重 3；正文、备注、OCR 权重 1。
- 英文按 2+ 字符 token，中文按字符 bigram + 完整片段。
- 不调用模型。

响应：

```json
{
  "query": "heartbeat",
  "results": [{
    "chapterId": "chapter-5",
    "chapterTitle": "Chapter 5: Availability",
    "slide": 17,
    "slideTitle": "Detect Faults: Heartbeat",
    "snippet": "...",
    "score": 8
  }]
}
```

### 主要文件

- `server/search.py`
- `server/tests/test_search.py`
- `web/src/GlobalSearch.tsx`
- `web/src/search.css`
- `web/src/GlobalSearch.test.tsx`
- `web/e2e/search.spec.ts`
- `web/src/App.tsx`、`web/src/Tutor.tsx`：搜索跳转

## 6. 新功能三：OCR 课件辅助

### 解决的问题

340 页中有 82 页正文和备注为空，但都有渲染图片。原实现只把可提取文字发给模型，因此这些页面模型会回答“本页可提取文字不足，图像内容尚未解析”。

### 实现

- `scripts/ocr-slides.py` 使用 RapidOCR 离线识别图片文字。
- `requirements-ocr.txt` 只用于生成 OCR；应用运行时不导入 OCR 包。
- 默认只处理正文/备注不足的页面，输出到：
  `data/ocr/{chapterId}/{page}.txt`
- 已生成 82 个稀疏页的 OCR 文本。
- `Slide` 增加可选 `ocrText`；`ChapterStore` 从缓存读取。
- 上下文优先级：**PPT 正文 → 讲者备注 → OCR 文本**。
- 自测的“文字不足”判断、跨章搜索都使用 OCR 文本。
- 课件页显示“含 OCR 文本”，可展开“OCR 识别文本（可能有误）”。

### 实际效果

Chapter 5 第 21 页 Checksum：

- 接入前：模型回答“本页可提取文字不足，图像内容尚未解析”。
- 接入后：模型能解释四步计算，指出 OCR 的 `0c64` 应为 `0x64`，并生成流程图。
- 该页自测从 422 变为正常生成题目。

### OCR 质量样本

9 个代表性图片页：

- 平均置信度：0.988
- 低于 0.7 的行：0
- 单页耗时：1.5–6.3 秒
- 总耗时：25.1 秒

OCR 对文字型页面效果好；架构图能读标签，但读不到箭头和结构关系。

### 主要文件

- `scripts/ocr-slides.py`
- `requirements-ocr.txt`
- `server/chapters.py`
- `server/tutor.py`
- `server/quiz.py`
- `server/search.py`
- `server/tests/test_ocr.py`
- `web/src/StudyPane.tsx`
- `web/src/StudyPane.test.tsx`

## 7. 学习进度与掌握度

### 章节进度

- `web/src/progress.ts` 记录用户访问过的页码。
- Key：`chapter-tutor:progress:v1:{chapterId}`
- 结构：`{ visited: number[], updatedAt: string }`
- 首页显示：
  - 上次读到第 N 页
  - 已学 N / 总页数
  - 自测次数和平均正确率
- 清空章节时由 `Tutor.reset()` 调用 `clearProgress`。

### 大纲掌握度

- `Roadmap` 接收当前章节的 `QuizStore`。
- 按题目的引用页码归属到大纲节点。
- 节点显示：
  - `未测`
  - `N 次自测 · 正确率%`
- 自测提交/删除后通过 `onQuizChange` 刷新 Tutor 中的 `quizStore`。

### 主要文件

- `web/src/progress.ts`
- `web/src/progress.test.ts`
- `web/src/Home.tsx`
- `web/src/Tutor.tsx`
- `web/src/StudyPane.tsx`
- `web/src/Roadmap.tsx`
- `web/src/Roadmap.test.tsx`
- `web/src/learning.css`

## 8. 架构实践工作台（基础版）

入口：

- 首页“架构实践”卡片。
- 侧边栏“架构实践”。
- 路由：`#/studio`。

用户流程：

```text
描述真实场景
→ AI 生成质量属性与质量属性场景
→ AI 推荐架构战术，用户勾选
→ AI 给出形成性评审和答辩追问
→ 导出 Markdown
```

当前范围：

- 文本版 MVP，不做架构图、ADR 可视化和正式评分。
- 所有 AI 结论必须引用课件来源。
- 场景、战术、评审结果保存在浏览器本地草稿。
- 支持返回上一步修改和重新开始。

接口：

```text
POST /api/design/scenarios  -> qualityAttributes + scenarios
POST /api/design/tactics    -> tactics
POST /api/design/review     -> findings + questions
```

本地草稿：

```text
chapter-tutor:design:v1:current
```

主要文件：

- `server/design.py`
- `server/models.py` 中的 `Design*` 模型
- `server/tests/test_design.py`
- `web/src/DesignStudio.tsx`
- `web/src/DesignCitations.tsx`
- `web/src/design.ts`
- `web/src/studio.css`
- `web/src/DesignStudio.test.tsx`
- `web/src/design.test.ts`
- `web/e2e/studio.spec.ts`

已知限制：

- 第一步和第二步各约 24–40 秒，取决于生成条目数。
- 没有架构图、ADR 导出、评分量和答辩交互；这些留给后续优化。
- AI 评审是形成性反馈，不是正式成绩。

## 9. API 契约

| 方法 | 路径 | 用途 | 是否需要 AI |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康状态、是否配置模型 | 否 |
| GET | `/api/chapters` | 章节列表 | 否 |
| GET | `/api/chapters/{id}` | 章节详情与页面 | 否 |
| GET | `/api/chapters/{id}/outline` | 章节主题大纲 | 否 |
| GET | `/api/chapters/{id}/file` | 下载原始 PPTX | 否 |
| GET | `/api/chapters/{id}/slides/{n}/image` | 页面图片 | 否 |
| POST | `/api/chat` | AI 问答 | 是 |
| POST | `/api/quiz` | AI 自测 | 是 |
| GET | `/api/search` | 跨章搜索 | 否 |
| POST | `/api/design/scenarios` | 生成质量属性与场景 | 是 |
| POST | `/api/design/tactics` | 推荐架构战术 | 是 |
| POST | `/api/design/review` | 生成形成性评审 | 是 |

错误约定：

- `503 AI_NOT_CONFIGURED`：缺少模型配置，禁止伪造回答。
- `422`：请求字段/页码不合法，或没有足够文字生成可靠结果。
- `404`：章节/资源不存在。
- `502`：上游失败或输出不符合结构。

所有模型输出都必须经过 Pydantic 校验；引用页码必须来自本次提供的课件来源。

## 10. 数据模型与存储

### 领域模型

- `Chapter`：章节 ID、标题、文件名、页数。
- `Slide`：页码、标题、正文、备注、可选图片 URL、可选 OCR 文本。
- `ChatRequest` / `ChatResponse`：问答请求与结构化回答。
- `QuizRequest` / `QuizQuestion` / `QuizResponse`：自测请求与题目。
- `SearchResult` / `SearchResponse`：跨章搜索结果。

### 浏览器存储

| Key | 内容 | 版本 |
| --- | --- | --- |
| `chapter-tutor:v2:{chapterId}` | 章节消息、当前页 | v2 |
| `chapter-tutor:quiz:v1:{chapterId}` | 自测历史 | v1 |
| `chapter-tutor:progress:v1:{chapterId}` | 访问过的页码 | v1 |
| `chapter-tutor:design:v1:current` | 架构实践当前草稿 | v1 |

新增存储时必须使用独立 key 和版本号，并在加载时逐字段校验。

### 本地生成数据

| 路径 | 内容 | 是否提交 |
| --- | --- | --- |
| `data/slides/` | 340 张 PPT 页面图片 | 否 |
| `data/ocr/` | 82 个 OCR 文本 | 否 |
| `data/verification/` | 真实测试结果 | 否 |
| `.env` | 模型配置和 Key | 否 |

## 11. 前端接口与扩展点

- `web/src/App.tsx`
  - hash 路由：`#/chapter/{id}`
  - `jump` 状态：从搜索跳转到指定章节和页码
  - 顶部栏：返回学习空间、跨章搜索、模型状态
- `web/src/StudyPane.tsx`
  - `Pane = 'slides' | 'outline' | 'quiz' | 'diagram'`
  - 新增资料视图时：扩展联合类型 → 增加标签 → 渲染新组件
- `web/src/QuizPane.tsx`
  - 自测容器：生成、作答、存储、历史、错题
  - 接收 `chapter / page / mode / onMode / onPage`
- `web/src/GlobalSearch.tsx`
  - 跨章搜索输入与结果列表
  - 通过 `onOpen(chapterId, slide)` 交给 App 跳转
- `web/src/DesignStudio.tsx`
  - 架构实践四步流程
  - 通过 `onOpenSource(chapterId, slide)` 跳转到课件来源
- `web/src/App.tsx`
  - `#/studio` 顶层路由；侧边栏和首页入口
- `web/src/state.ts`、`web/src/quiz.ts`
  - 章节会话和自测的本地存储、校验、判分
- `web/src/progress.ts`
  - 章节访问进度；`markVisited`、`loadProgress`、`clearProgress`
- `web/src/Roadmap.tsx`
  - 可选 `quizStore` 属性；按题目引用页码计算大纲节点掌握度
- `web/src/QuizPane.tsx`
  - 可选 `onQuizChange` 回调；自测提交/删除后刷新顶部进度
- 可访问性
  - 单选组使用 `fieldset/legend` 和 radio
  - 得分使用 `aria-live`
  - 关键按钮有可访问名称
  - 支持 Escape 关闭抽屉、Enter 发送

## 12. 后端接口与扩展点

- `server/chapters.py`：课件目录、PPT 解析、图片、OCR 缓存。
- `server/outline.py`：主题大纲与页码映射；内容变化时降级为标题分组。
- `server/tutor.py`：相关页检索、上下文节选。
- `server/llm.py`：聊天模型调用与结构化校验。
- `server/quiz.py`：自测生成与校验。
- `server/search.py`：跨章搜索。
- `server/design.py`：架构实践的场景、战术和评审生成。
- `server/config.py`：读取和校验模型配置。
- `server/main.py`：路由装配。

当前 `llm.py` 和 `quiz.py` 各自处理 httpx 错误映射，尚未抽取共享上游 helper。这是一个可选的后续重构点，不影响现有契约。

## 13. 验证与运行

### 验证结果

| 检查 | 结果 |
| --- | --- |
| 后端 pytest | 134 passed |
| 前端 Vitest | 70 passed |
| Playwright E2E | 9 passed |
| Vite 生产构建 | 通过 |
| 500 行检查 | 72 个源码文件，0 超限 |
| GitHub Actions | 已配置 backend / frontend / e2e 三个 job |
| 真实架构实践 | 场景生成约 24 秒，3 个质量属性 / 3 个场景；引用真实页码 |
| 真实模型问答 | `deepseek-flash` 约 1.8 秒 |
| 真实模型自测 | `deepseek-flash` 约 5.2 秒 |
| OCR 页问答/自测 | Chapter 5 第 21 页通过 |

### 启动

```powershell
# 终端 1
.\.venv\Scripts\python -m uvicorn server.main:app --host 127.0.0.1 --port 8000

# 终端 2
npm --prefix web run dev -- --port 5173
```

浏览器打开 `http://127.0.0.1:5173`。

### 可选 OCR

```powershell
.\.venv\Scripts\python -m pip install -r requirements-ocr.txt
.\.venv\Scripts\python scripts/ocr-slides.py
```

默认只处理正文/备注不足的页面；`--all` 处理全部页面；`--overwrite` 覆盖已有文本。

## 14. 已知限制

- 没有流式输出；问答和自测等待完整结果返回。
- 自测按当前页 + 所属大纲节点出题，可能涉及相邻页，不是严格只考当前页。
- OCR 只补充文字，不理解箭头、布局和图形关系。
- 搜索是关键词匹配，不是语义检索；没有高亮、筛选、分页。
- PDF 教材没有建立索引；不支持上传新课件。
- 没有账号、云同步；清理浏览器数据会丢失本地记录。
- 图解是教学示意，不是原 PPT 重绘；不能编辑或导出。
- 学习进度只记录访问过的页码，不是完整的学习事件流；没有学习时长、计划或推荐引擎。
- 大纲掌握度按题目的引用页码归属，可能与实际作答主题存在偏差。
- 架构实践是文本 MVP：没有架构图、ADR、正式评分和答辩交互。
- 架构实践每步需要一次模型调用，单步约 24–40 秒，取决于条目数量。
- AI 评审是形成性反馈，不能当作正式成绩。
- 没有跨设备同步；进度、自测和设计草稿只保存在当前浏览器。
- 固定支持 `book/` 下的 7 个章节，没有 Chapter 3。
