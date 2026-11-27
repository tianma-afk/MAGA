# MXL 工作总结与变更台账

**范围：**`feature/mxl-hybrid-retrieval` 自 2026-11-23 建立至 2026-11-24 修复开始按钮的全部 73 次代码/文档提交（**不包括**此前团队 `main` 的工作，也不将第三轮 Jack 实验计入 MXL 实施成果）。代码基准 `dfdfd3c3`。

## 1. 工作动机

原有 MAGA 具备课程 PPT 文本来源和旧版架构实践，但：
- 全局与旧版实践常使用 `search_all()` 对所有章节页面进行词法匹配；已有 OCR 离线结果被读取，但没有 BM25/向量持久化的专用索引。
- 中英文混合课件与自由表达的 Query 在纯词法匹配下容易错过相关内容；手工维护中英同义词词典无法穷举任意表述。
- 旧版实践让 AI 主动生成场景、战术和评审，学生往往只负责输入宽泛项目描述；不利于考察学习者**自己**理解约束、做设计决策、讨论替代方案和演进思路的能力。

工作原则：**先设计文档后改代码**；单体架构内分离职责；沿用课程来源真实性校验；保留旧版业务接口；不引入通用 Agent Runtime、线上代码执行环境或微服务拆分。

## 2. 第一主线：课程混合检索

### 2.1 前置研究与设计

1. 阅读并对照 BatMem（`scutll/BatMem`）的 SQLite/FTS5、Embedding Provider、召回和结果合并结构。
2. 确定 **每页 PPT 是一个检索文档**；保留 PPT/备注/OCR 多字段与页码元数据。
3. 决定使用 Python 标准库 SQLite FTS5、Jina `jina-embeddings-v3` 和本地向量存储；小规模语料直接精确计算余弦相似度，不引入额外向量数据库。
4. 在 `docs/mxl/retrieval-design-and-worklog.md` 记录初始方案后才开展实现。

### 2.2 实际代码变更

| 主题 | 位置 | 已完成内容 |
| --- | --- | --- |
| 持久化索引 | `server/retrieval_index.py` | `slides` 文档表、`slides_fts` 倒排表；Slide 级主键；内容摘要与 Jina 模型标识；重建时只对变化页请求 Embedding，移除已删除页 |
| Jina 模型适配 | `server/retrieval_index.py` | passage/query 两类任务、1024 维向量、按批请求、响应数据检查、可重试上游错误 |
| 混合查询 | `server/hybrid_search.py` | 英文 Query、FTS5 BM25、Jina Query Embedding、逐页余弦、两路归一化与加权排序 |
| 显式模式 | `server/models.py`、`design_sources.py` | 在 `baseline` 与 `llm_assisted` 之外增加 `hybrid`，仅用户主动选择时调用 |
| 自动建立/刷新 | `server/main.py` | `POST /api/retrieval/index/ensure`；每应用异步锁、后台工作线程、错误分类 |
| 界面交互 | `web/src/DesignRetrievalMode.tsx`、`useRetrievalIndex.ts`、`DesignStudio.tsx`、`api.ts` | 检索策略选择、索引 building/ready/error、失败重试、准备完成前禁止生成 |
| 配置与教程 | `.env.example`、`README.md` | `JINA_API_KEY`、Jina API 申请、自动索引准备、数据上传说明 |
| 代码回归 | `server/tests/test_hybrid_search.py`、`test_retrieval_index_api.py`、`test_design_sources.py`、`web/src/DesignRetrieval.test.tsx` | 得分、增量更新、缺少索引、来源验证、策略分派、索引准备与失败行为 |

**重要分界：** 原有 `GET /api/search` 和章节聊天并未改成全站混合 RAG。`hybrid` 是架构实践中的**显式检索选项**。索引准备与检索的异常不会悄悄退回基线，避免用户误以为使用了 Hybrid。

### 2.3 关键阶段与可追溯提交

- `ec852962c`：先写 BatMem 对照与 RAG 设计。
- `293bd36c3`：持久化 PPT Slide 索引。
- `7e061fce0`：英文 Query + Jina/BM25 分数融合。
- `9b36bc190`、`90c90bcf2`：实现结果、回归与早期 CI 记录。
- `f3dd14c7e`～`68a280f0a`：架构实践新增明确 Hybrid 策略，保证课件页真实性。
- `b1b587163`：索引准备机制先写方案；`d0880f6ba`、`d3022ce5b`、`f84e6cbec`：服务端/前端实现与分层。
- `9d12bf366`、`6b62f91c0`：自动索引相关测试与文档验收。

## 3. 第二主线：案例驱动的架构教学

### 3.1 为什么重构

原来：学习者自行编写“设计标题、场景描述、需求约束” → AI 生成质量属性 → AI 选战术 → AI 给评审。

现在：学习者**选真实约束案例** → 独立理解需求（允许跳过）→ LLM 针对固定架构能力目标提出问题 → 学习者作答 → 基于课程知识追问与形成性评价 → 对照参考设计思路。

教学重点从**生成一套看似完整的架构**转为**学生对项目中的关键技术点做决策、解释合理性、认识问题并提出优化**。不要求接口协议详图、架构图或代码提交。设计原则与场景详见 [practice-teaching-design.md](practice-teaching-design.md)。

### 3.2 实际代码变更

| 主题 | 文件 | 已完成内容 |
| --- | --- | --- |
| 预设案例 | `server/practice_cases.py` | 校园活动报名、在线考试、图片检索平台；每个案例 3 个保留在服务端的评估目标 |
| 结构化契约 | `server/practice_models.py` | Plan / Answer / Finalize 的 Pydantic 校验、回答历史边界、引用模型 |
| 固定工作流 | `server/practice.py` | 先查询知识再提问/评审；追问或结题；最多 2 次追问；最后综合审查 |
| 阶段知识检索 | `server/practice_knowledge.py` | 每阶段 LLM 生成 1–3 个英文 Query；按策略召回/合并 Top-8；验证原稿引用 |
| 实践 API | `server/main.py` | `GET /api/practice/cases`、`POST /api/practice/plan`、`answer`、`finalize` |
| 用户界面 | `web/src/PracticeStudio.tsx`、`practice.css` | 案例选择、回答和追问、逐点反馈、课件来源、综合评审、错误与加载状态 |
| 本地存档 | `web/src/practice.ts`、`resumeTasks.ts`、`Home.tsx` | 版本化 `localStorage`、首页恢复、首次与追问回答分离、检索查询记录、Markdown 导出 |
| 兼容入口 | `web/src/App.tsx` | 新版 `#/studio`；旧版 `#/studio/legacy`；历史草稿不强制迁移 |
| 测试 | `server/tests/test_practice.py`、`web/src/PracticeStudio.test.tsx`、`web/e2e/practice.spec.ts` | API 回归、非法引用拒绝、轮数控制、案例选取、索引阻塞、保存恢复、完整浏览器流程 |

初始教学设计先提交 `521fd048e`，后再逐个实现业务与测试；`1e11a3c26` 记录落地和首轮完整 CI 证据。

### 3.3 2026-11-24 可用性修复

**用户反馈：** 选完案例后“开始 / 生成架构决策问题”按钮一直灰色，打字才变亮。

**根因：** 前端按钮与 handler 以及三个后端请求模型一致强制 `analysis.trim().length >= 20`，但是界面没有清晰提示且该要求不必要。

**处理：** 将需求分析改为可选；选好案例且 AI/所选检索策略已就绪就允许开始；后端三个阶段同步接受空分析；模型明确区分“用户未提交分析”与“用户做过独立分析”；加入空分析与短分析测试。

先提交记录 `18c709433`；修复 `96a8433f4`、`07054786f`、`7fc7357c5`；回归测试 `317e684b7`、`dfdfd3c3f`。

**注意：** 首个“需求分析”可跳过，但**针对架构问题的回答仍要求至少 20 字**（用于保证有实际可评内容），不应混淆两者。

## 4. 既有能力与未修改的边界

MXL 工作直接复用了团队此前已实现的：
- `ChapterStore` 的 PPT 与可选 OCR 读取；
- `search_all` 和 `retrieval_terms` 的词法检索及词典；
- 旧 `design_planner` 的研究思路与来源契约；
- 课件引用、章节对话、题目、自测历史和前端本地存储；
- 课程第三轮既有实验文档、测试脚本与 CI。

这些是依赖和兼容目标，**不是本轮新实现的全部功能**。本轮对 `main` 的实际增量以 `git diff main...feature/mxl-hybrid-retrieval` 为准。

## 5. PR 与分支状态

混合检索早期曾建立 [PR #3](https://github.com/tianma-afk/MAGA/pull/3)（标题为 `feat: slide-level Jina + BM25 hybrid retrieval (mxl)`），**现已关闭、未合并**。后续案例教学重构、2026-11-24 开始按钮修复以及本次文档编写直接提交到同一功能分支，没有为这些工作重新创建 PR。工作仍未进入 `main`。

## 6. 验证与下一步

最终代码快照 `dfdfd3c3f`：[GitHub Actions CI](https://github.com/tianma-afk/MAGA/actions/runs/45312834087) 后端 **268 passed**、前端 **162 passed**、E2E **27 passed**、构建与代码长度检查通过。测试不调用真实 Jina/LLM 服务。

当前最大剩余任务不是继续叠加功能，而是**真实服务运行验收、检索效果评测、教学反馈质量与课件覆盖度评测**。实施入口见 [handoff.md](handoff.md)。

[返回文档索引](README.md)
