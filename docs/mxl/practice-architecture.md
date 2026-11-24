# 架构实践 v2：工作流、数据结构与接口实现

**版本：**2026-11-24 · 代码快照 `dfdfd3c3`。本文只讲“代码如何实现”；教学原则与案例设计见 [practice-teaching-design.md](practice-teaching-design.md)。

## 1. 分层架构与调用链

`Web PracticeStudio → typed api.ts → FastAPI /api/practice/* → practice.py 固定流程编排 → practice_knowledge.py (LLM Query + Course Retrieval) → design.py 的 _complete_json → Pydantic 结构化结果 / 引用校验 → Web 本地记录`。

| 层 | 文件 | 约束 |
| --- | --- | --- |
| 案例目录 | `server/practice_cases.py` | 服务端定义 3 个案例及各自 3 个 objective；对外 `/cases` 隐藏内部目标与 Rubric |
| 输入/输出 | `server/practice_models.py` | Pydantic `extra=forbid`，限制长度和列表数量；引用复用 `DesignCitation` |
| 流程编排 | `server/practice.py` | `plan_practice`、`answer_practice`、`finalize_practice`；严格 JSON 输出、目标 ID 及出处校验 |
| 课程知识 | `server/practice_knowledge.py` | 每一步生成 1–3 条英文 Query、选检索器、合并 Top-8、验证来源 |
| 路由 | `server/main.py` | 只暴露固定阶段 API；保留已有 `/api/design/*` |
| 前端视图 | `web/src/PracticeStudio.tsx` | 选案例、填写分析、回答、追问、逐点记录、最终评审；加载、异常和终止请求管理 |
| 存储/恢复 | `web/src/practice.ts`、`resumeTasks.ts` | `localStorage` 版本化存档、学习首页任务卡、Markdown 导出 |
| 模式/索引 | `web/src/useRetrievalIndex.ts`、`DesignRetrievalMode.tsx` | 手动策略切换；Hybrid 自动 ensure；未 ready 时阻止发送 |
| 引用跳转 | `web/src/DesignCitations.tsx`、`SourcePreviewDialog.tsx` | 打开真实 PPT 页面原文与原稿预览 |

**不实现**自由工具调度、自动调用外部命令、Agent Runtime、跨请求后台作业或服务端长期会话数据库。每次请求的阶段由前端决定，服务端依据请求契约和固定规则生成受约束的下一步结果。

## 2. 对外 API 契约

| HTTP | 端点 | 必需输入 | 主要响应 |
| --- | --- | --- | --- |
| GET | `/api/practice/cases` | 无 | 案例标题、背景、功能需求、约束，不包含私有 rubric |
| POST | `/api/practice/plan` | `caseId`；可选 `analysis`、`retrievalStrategy` | 与服务端 objective 顺序对应的三个 `PracticeQuestion` + `KnowledgeReceipt` |
| POST | `/api/practice/answer` | `caseId`、`decision`、`turns`；可选 `analysis`/策略 | `action: followup / complete`、`feedback`、`followup`、引用与检索记录 |
| POST | `/api/practice/finalize` | `caseId`、三条**已完成**的 `PracticeDecisionRecord`；可选 `analysis`/策略 | `summary`、`strengths`、`improvements`、`referenceApproach`、引用与检索记录 |
| POST | `/api/retrieval/index/ensure` | 无，使用服务端环境 `JINA_API_KEY` | 索引 ready/total/updated/deleted，或明确 503 |

`analysis` 自 2026-11-24 起对上述三个 POST **默认空字符串**、最长 4000 字；选好案例即可开始。**实际问答 `turns[*].answer` 仍要求 20–4000 字**，首轮的 `question` 必须等于当前决策题干。不要把这两种校验混成一个按钮条件。

`PracticePlanAnswer.decisions` 固定恰好 3 条；`PracticeTurn` 最多 3 轮（1 次初答 + 2 次追问）；`PracticeFinalRequest` 要求恰好 3 个已完成记录。模型生成的 citation 可以为空，但有引用时必须可在检索来源中找到。

## 3. 从输入到输出的精确执行顺序

### 3.1 开始学习

1. 浏览器 `GET /api/practice/cases` 展示案例；学习者选 `caseId`。
2. 学生可填写需求理解/其他约束，也可以跳过。前端仅在**案例已选择、AI 配置 ready、策略索引 ready、没有进行中任务**时允许开始。
3. POST `/api/practice/plan`：后端读取真实案例与私有考察目标。
4. `select_practice_knowledge(..., "plan_architecture_decisions", ...)`：LLM 生成英文 Query → 选定策略检索课程页 → 校验出处。
5. LLM 基于案例、分析、课程来源生成三个问题。校验对应固定 objective ID 与顺序；引用使用实际页标题重新规范化。
6. 页面保存 `PracticeSession`，开始第一个决策点；**不提前展示参考方案或 Rubric**。

### 3.2 回答与追问

1. 页面把当前题目或追问与学习者回答追加为 `PracticeTurn{question, answer}`，向 `/api/practice/answer` 发送当前题目以及该题历史。
2. 后端根据案例和决策 ID 取得固定 objective；再次生成英文 Query，检索相关质量属性、战术或风险知识。
3. LLM 返回 `action = followup | complete`、反馈文字、可选追问和引用。
4. 若已达到三次回答，流程强制结题；否则遵守模型的建议继续一轮或结束。
5. 前端保留初答及每轮答复；展示反馈、可信页引用、本轮英文检索 Query；已完成则进入下一决策点。

**实现说明：** “逐点评价”是 `/answer` 的同一个响应结构，不存在另一个独立评分接口。模型可选择第一轮结束某决策点，所以**最多**两轮追问，不是固定两轮。

### 3.3 最终评审

1. 三个决策点全部完成后前端激活“生成综合评审与参考方案”。
2. `/api/practice/finalize` 校验三个决策点的 ID 顺序与 `assessment.action=complete`。
3. 以**所有初答、追问和反馈**作为输入再次做课程检索；LLM 生成优势、薄弱项和参考设计，引用经过规范化。
4. 前端保存 `final`，保持结果可阅读、可导出、可从首页继续打开。

## 4. 检索嵌入点与来源边界

三个固定入口 **`plan`、每次 `answer`、`finalize`** 都执行：

`LLM 英文查询规划 → 选择课程检索策略 → 原始课件页面验证 → 将 Top-8 课程片段附在教学生成 Prompt → 校验模型引用`。

- `baseline`：只用第一条规划 Query 走传统词法检索。
- `llm_assisted`：1–3 条 Query 走词法检索后交错合并。这不是“旧版 B 策略原样复用全部推断逻辑”；新的 Query Planner 是 `practice_knowledge.py`。
- `hybrid`：1–3 条英文 Query 各走 SQLite FTS5 BM25 + Jina Embedding，再交错合并。单查询分数权重及索引机制见 [retrieval-implementation.md](retrieval-implementation.md)。
- 所有检索结果以真实 `chapterId/slide/title` 为来源，`validate_selection` 防止伪造页，`canonicalize` 只接受 supplied citations；不能保证模型对来源的解释一定正确。
- `KnowledgeReceipt` 保留 `strategy`、`queries` 和引用列表；前端保存第一次规划结果、每轮回答检索与最终检索的记录，避免事后无法解释“为什么问了这个问题”。
- “没有对应课程页”或 Query 结构不合法时给出显式失败，不用无来源的模型答案伪装成功。

## 5. 会话状态与旧版兼容

前端 `PracticeSession` 的有效字段包括：

`caseId, caseTitle, analysis, retrievalStrategy, decisions[3], planKnowledge, final?, updatedAt`。

每条 `PracticeDecision` 包括 `decision`、`turns`、`assessment?`、`pendingFollowup?`、`knowledgeHistory?`。其中 `turns[0]` 是第一次独立回答，后续数组项是追问回答；可与教师或用户复盘。

- 持久化 Key：`chapter-tutor:practice:v2:current`。
- 前端 `loadPractice()` 做基本形状校验，并在启动时恢复当前会话；首页 `resumeTasks.ts` 读取最近记录。
- 旧版数据 Key：`chapter-tutor:design:v1:current`，继续通过 `#/studio/legacy` 打开，旧 `/api/design/*` API 未删除。
- v2 的正常入口：`#/studio`。进行到题目后，检索策略选择器锁定；若要换策略需重新开始，防止混合比较过程来源污染。
- 当前的会话写入是本地浏览器状态，不是服务端权威状态或可抗篡改考试记录。用户可以自行修改 `localStorage` 或请求体；这在形成性教学中可以接受，不能用作正式考试评分系统。

## 6. 关键行为与异常恢复

- 请求进行中展示加载与“停止”控制；成功后再持久化阶段变化，失败不应丢弃已记录的答复。
- Hybrid 第一次选择自动 `ensure`：building 时按钮禁用，ready 才允许生成，error 提供重试；失败用明确的 503 报错，不静默回退。
- 有未填写的需求分析时，`plan` 的系统 Prompt 明确指示“NOT SUBMITTED”，不能伪造学生曾识别约束。
- 中途取消/浏览器断开连接不保证服务端外部模型或正在执行的索引构建被瞬间终止；前端需忽略晚到结果。
- 反馈与参考方案属于模型输出，非自动判定正确的唯一答案。

## 7. 后续修改建议

修改**教学目标或案例**：先改 [practice-teaching-design.md](practice-teaching-design.md) 与 `practice_cases.py`；维护问题目标 ID 与旧会话兼容性。

修改**流程轮数或评审字段**：先变更 `practice_models.py` 与本文，再同步 `practice.py`、`practice.ts`、API 验证和端到端测试。

修改**检索策略或来源预算**：先改 [retrieval-implementation.md](retrieval-implementation.md)，再改 `practice_knowledge.py`，不要复制另一套 RAG 逻辑到页面或 LLM Prompt 中。

[返回文档索引](README.md)
