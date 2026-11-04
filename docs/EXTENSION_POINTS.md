# 扩展接口与当前契约

> 更新日期：2026-11-05。本文只记录**当前状态、稳定契约和可复用扩展点**，不规定后续轮次必须做什么。

## 1. 自测（已实现）

### API

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
    "citations": [{ "slide": 17, "title": "Heartbeat" }]
  }]
}
```

错误约定：

- 未配置 `LLM_API_KEY` / `LLM_MODEL`：`503`，`detail.code = "AI_NOT_CONFIGURED"`。
- 章节不存在：`404`；页码越界或请求字段非法：`422`。
- 当前页及所属大纲节点都没有可提取文字/备注：`422`，不会编造题目。
- 模型输出非法、引用越界、上游失败：`502`，不泄漏上游内容。

服务端校验：

- 3–5 题；每题 2–6 个非空且不重复的选项；`correctIndex` 在范围内。
- 每题 1–4 个引用；引用必须来自本次提供给模型的课件页，标题由后端用真实 PPT 标题重写。
- 上下文最多 8 页：当前页 + 当前大纲节点页 + 关键词相关页 + 下一页。

### 数据模型

`server/models.py`：`QuizRequest`、`QuizQuestion`、`QuizAnswer`、`QuizResponse`。
模型使用 `StrictModel`（`extra="forbid"`），新增字段会拒绝旧客户端或非预期输出。

### 前端存储

- Key：`chapter-tutor:quiz:v1:{chapterId}`
- 结构：

```ts
{
  records: [{
    id: string,
    slide: number,
    createdAt: string, // ISO
    questions: QuizQuestion[],
    answers: number[]  // 已提交记录的答案索引
  }]
}
```

- 每章最多保留 20 条；加载时逐字段校验，损坏或超限记录被忽略。
- 判分、错题汇总在 `web/src/quiz.ts`：`scoreRecord`、`wrongAnswers`、`chapterWrongAnswers`。
- 清空章节时由 `Tutor.reset()` 调用 `clearQuizStore`。

### 前端组件

- `QuizPane`：自测容器，负责生成请求、中止、存储、历史和错题展示。
- `QuizQuestionCard`：单选题目渲染。
- `QuizReview`：单次结果的得分与逐题解析。
- `QuizWrongReview`：本章跨页错题汇总。
- 接入点：`StudyPane` 的 `Pane` 联合类型已包含 `'quiz'`。

### 可扩展思路（不分配任务）

- 新增题型：在 `QuizQuestion` 增加判别字段（如 `type`），后端校验和前端卡片按类型分支；旧的单选题数据可保留默认类型。
- 完整错题本：当前已按章汇总；可扩展为按大纲节点聚合、导出 Markdown/CSV。
- 共享上游调用：`server/quiz.py` 和 `server/llm.py` 目前各自处理 httpx 错误映射；如果后续新增第三种 AI 功能，再抽取公共 helper，避免现在为两个消费者过度抽象。

## 2. 跨章搜索（已实现）

### API

`GET /api/search?q=<关键词>&limit=20`

- `q`：1–200 字符，空白查询返回 422。
- `limit`：1–50，默认 20。
- 不需要 AI 配置；未配置 Key 时仍可用。

响应：

```json
{
  "query": "heartbeat",
  "results": [{
    "chapterId": "chapter-5",
    "chapterTitle": "Chapter 5: Availability",
    "slide": 17,
    "slideTitle": "Heartbeat",
    "snippet": "…心跳检测…",
    "score": 8
  }]
}
```

### 模块边界

- `server/search.py` 暴露 `search_all(store, query, limit) -> SearchResponse`。
- 当前打分：标题命中权重 3，正文/备注权重 1；英文按 2+ 字符 token，中文按字符 bigram + 完整片段。
- `ChapterStore` 负责 PPT 解析和缓存；搜索不修改课件。
- 前端 `GlobalSearch` 只负责输入、结果列表和回调 `onOpen(chapterId, slide)`；跳转由 `App` 的 `jump` 状态和 `Tutor` 的 `jump` 属性完成。

### 可扩展思路（不分配任务）

- 把 `server/search.py` 的 `search_all` 替换为调用 embedding/混合检索，只要保持 `SearchResponse` 契约不变，前端无需改动。
- 可增加按章节/大纲节点过滤、搜索历史、分页；当前版本明确不做。
- 搜索摘要目前是字符窗口；若需要高亮，可在前端对 `snippet` 做安全的文本分段，不执行 HTML。

## 3. 前端资料抽屉扩展

- `web/src/StudyPane.tsx` 的 `Pane = 'slides' | 'outline' | 'quiz' | 'diagram'`。
- 新增资料视图的建议路径：扩展联合类型 → 在 tabs 增加按钮 → 渲染新组件 → 复用 `onPage`/`onMode` 回调。
- 章节隔离由 `App` 以 `key={chapter.id}` 重挂载 `Tutor`，所有本地存储 key 都带 `chapterId`。

## 4. 后端路由与错误码

- 路由装配：`server/main.py` 的 `create_app()`。
- 章节读取：`ChapterStore.read()` 带 mtime 缓存；新增只读接口优先复用它。
- 错误码：
  - `503 AI_NOT_CONFIGURED`：缺少模型配置，禁止伪造回答。
  - `422`：请求字段/页码不合法，或没有足够文字生成可靠结果。
  - `404`：章节/资源不存在。
  - `502`：上游失败或输出不符合结构。
- 所有模型输出都必须经过 Pydantic 校验；引用页码必须来自本次提供的课件来源。

## 5. 已设计但本轮未完成

以下只是接入点/思路，不代表必须实现：

- 共享上游调用 helper：`llm.py` 与 `quiz.py` 有少量重复的 httpx 错误映射。
- 检索质量评测：可离线测 `relevant_slides` 的 Hit/Recall，再决定是否升级中文分词或 BM25。
- 流式输出：当前结构化 JSON + 校验优先；若做流式，需要重新设计“边流边校验”的协议。
- 完整错题本导出、按节点聚合、搜索高亮与过滤。
- 视觉/OCR：课件图片尚未被模型理解，当前对图片型页面明确提示信息不足。
