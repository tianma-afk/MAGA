# 后续开发建议与方向

> 更新日期：2026-11-05
>
> 本文件只记录可选方向、接口建议和演示思路，不分配后续任务，也不要求按顺序完成。

## 1. 产品方向

当前项目已经具备：

- 章节对话与页码溯源
- 主题大纲导航
- 课件原图/文字预览
- 教学示意图
- 结构化自测与错题回顾
- 跨章搜索
- 图片页 OCR 文本

下一步不建议只继续堆“聊天/复习”功能，而应让 AI 真正参与**软件体系结构工作**：

```text
从“课件问答 + 自测”
升级为“课件驱动的架构学习与分析工作台”
```

可以围绕四个层面扩展：

1. **内容泛化**：导入/替换课件，多格式，多课程。
2. **学习机制**：学习事件、掌握度、计划、笔记、复习节奏。
3. **架构分析**：质量属性场景、战术推荐、权衡分析、方案评审、ADR。
4. **可视化与评估**：知识图谱、跨章对比、图表导出、质量评测。

## 2. 当前可复用的基础

- 课件内容入口：`server/chapters.py` 的 `ChapterStore`。
- 上下文构建：`server/tutor.py` 的 `excerpt()`、`relevant_slides()`。
- 模型调用：`server/llm.py`、`server/quiz.py`。
- 搜索：`server/search.py` 的 `search_all()`。
- 前端资料视图：`web/src/StudyPane.tsx` 的 `Pane` 联合类型。
- 自测组件：`web/src/QuizPane.tsx` 及其子组件。
- 存储：`web/src/state.ts`、`web/src/quiz.ts`、`web/src/progress.ts` 的版本化 localStorage。
- 自测闭环：错题重练、删除历史、导出错题、章节进度、大纲掌握度。
- 架构实践基础版：场景 → 质量属性/场景 → 战术 → AI 形成性评审 → 导出 Markdown。
- 工程门禁：`.github/workflows/ci.yml` 已配置 backend / frontend / e2e。
- 严格校验：`server/models.py` 的 `StrictModel` 体系。

新增功能优先复用这些接口，不要重写聊天、课件和自测链路。

## 3. 高优先可选方向

### 3.1 质量属性场景与战术工作台（基础版已实现）

当前已经有一个文本版 MVP：

- 输入真实场景和需求。
- AI 生成质量属性、质量属性场景和战术。
- 用户勾选战术。
- AI 生成形成性评审和答辩追问。
- 导出 Markdown。

尚未实现：

- 场景和战术的手工编辑与保存多套方案。
- 架构图和 ADR。
- 评分量表和多角色正式评审。

为什么值得继续做：

- 直接覆盖 Chapter 4–8 的核心内容。
- 展示 AI 产出“架构分析材料”，而不是普通聊天。
- 有真实课件引用，容易答辩演示。
- 可自然扩展到跨章对比、方案评审和 ADR。

建议接口：

```text
POST /api/scenarios  -> QualityScenario
POST /api/tactics    -> TacticRecommendation[]
GET  /api/scenarios  -> 本章已保存场景
```

建议存储：

```text
chapter-tutor:scenarios:v1:{chapterId}
```

### 3.2 架构知识图谱 / 概念图

把章节大纲从线性节点扩展为可交互图谱：

- 节点类型：质量属性、战术、模式、场景、案例。
- 节点包含来源页码。
- 边表示“用于”“缓解”“依赖”“对比”等关系。
- 点击节点跳到对应课件页。
- 可按章节过滤、按类型高亮。

建议接口：

```text
GET /api/knowledge-graph?chapterId=chapter-5
```

```json
{
  "nodes": [{ "id": "heartbeat", "label": "Heartbeat", "type": "tactic", "slides": [17, 18] }],
  "edges": [{ "source": "heartbeat", "target": "availability", "label": "用于" }]
}
```

前端可复用 `@xyflow/react`，不要重新引入图库。

### 3.3 架构方案评审 / ADR 助手（基础评审已实现）

当前“架构实践”已经提供形成性评审和答辩追问。尚未实现的是：

- 可导出的 ADR 模板。
- 正式评分量表。
- 多角色评审或答辩模式。
- 对架构图的视觉评审。

一个更完整的目标形态：

> 用户提交一个架构设计描述，AI 从多个质量属性视角评审并生成 ADR。

AI 可以输出：

- 涉及的质量属性
- 缺失的场景或风险
- 推荐战术及页码引用
- 权衡和后续问题
- 可导出的 ADR（架构决策记录）

建议接口：

```text
POST /api/review -> ArchitectureReview
POST /api/adr    -> Markdown/JSON
```

`ArchitectureReview` 可包含：`qualityAttributes`、`risks`、`tactics`、`tradeoffs`、`questions`、`citations`。

### 3.4 内容源扩展与本地课件导入

当前只支持 `book/` 下固定的 7 个 PPT。若要让项目更通用：

- 从本地选择/上传 PPTX。
- 自动解析章节，生成标题大纲。
- 可选 OCR。
- 支持多门课程目录。
- 支持替换课件后重新生成大纲。

建议先把 `ChapterStore` 抽象成 `ContentSource`，再增加导入接口。需要处理文件校验、存储位置和替换策略。

### 3.5 完整学习事件与分析（轻量进度已实现）

当前已经实现：

- 访问页记录：`chapter-tutor:progress:v1:{chapterId}`
- 首页已学页数、自测次数和平均分
- 大纲节点掌握度：按题目引用页码归属

尚未实现：

- 完整 `LearningEvent` 事件流（提问、翻页、复习、停留时间）
- 学习时长、学习计划、推荐下一步
- 错题分布和掌握度趋势图

建议接口：

```text
LearningEvent {
  chapterId, slide, type, timestamp, payload
}
```

进度可以先继续用 localStorage；需要多设备或复杂查询时再引入 SQLite。不要为了“事件流”直接引入消息队列或云服务。

### 3.6 笔记、书签、高亮与导出

- 在具体页面做个人笔记。
- 收藏重点页面。
- 高亮 OCR/正文中的术语。
- 笔记参与搜索。
- 导出 Markdown/JSON。

这是把“课件阅读器”变成“个人学习资料”的关键功能，用户价值高，技术风险低。

### 3.7 跨章对比模式

- 选择两个章节或两个质量属性。
- AI 生成对照表：场景、战术、代价、案例。
- 所有结论带页码引用。
- 适合“可用性 vs 性能”“可修改性 vs 互操作性”等主题。

可以复用搜索和问答链路，新增一个 `compare` 教学策略即可。

### 3.8 多题型、闪卡与间隔重复

- 单选 → 多选、判断、填空、案例简答。
- 闪卡：概念、定义、优缺点。
- 基于错题和时间做间隔重复队列。

建议为题型增加判别字段，不要让前端硬编码单一单选题结构。

### 3.9 图解交互与视觉理解

当前图解是教学示意，节点不能跳到来源页。可扩展：

- 节点级引用：每个节点关联课件页。
- 点击节点打开来源页。
- 图解导出 SVG/PNG。
- 视觉模型理解架构图中的箭头、组件关系和布局。

OCR 已解决“图中的文字”，视觉模型解决“图中的结构”。不要混淆这两件事。

### 3.10 质量评测（CI 已实现）

当前已有 GitHub Actions：

- backend：pytest
- frontend：Vitest、生产构建、500 行检查
- e2e：Playwright（模拟接口）

尚未实现的是“AI 质量”本身的可测量评测：

- 金标准问题集：每章若干问题 + 期望页码。
- 检索命中率、引用准确率、自测有效率。
- 模型延迟和成本对比。
- 模型/提示词变更前后的回归对比。

这项功能用户不一定直接看到，但会显著提高项目的可信度。

## 4. 建议预留的接口

### 4.1 ContentSource

```text
list_sources() -> 课程/章节列表
read(chapterId) -> 章节详情
image(chapterId, page) -> 页面图片
ocr(chapterId, page) -> OCR 文本
```

当前对应 `ChapterStore`。未来扩展 PPT/PDF/Markdown 时保持这个边界。

### 4.2 SlideContentProvider

```text
get_content(slide) -> {
  text, notes, ocr, vision,
  provenance, confidence
}
```

当前对应 `excerpt()`。新增视觉模型时只替换提供者，不改聊天/自测业务。

### 4.3 LLMProvider + complete_json

```text
complete_json(config, messages, schema) -> validated object
```

Provider 描述能力：

- JSON mode
- 图片/视觉
- 流式
- token/费用统计
- 超时和重试策略

当前 `llm.py` 和 `quiz.py` 各自处理上游错误映射；出现第三种 AI 功能时再抽取共享 helper。

### 4.4 SearchProvider

```text
search(query, scope, limit) -> SearchResponse
```

当前对应 `search_all()`。后续可替换为 BM25、中文分词或 embedding/混合检索，保持 `SearchResponse` 契约不变。

### 4.5 TeachingStrategy

```text
name
system_prompt
output_schema
build_context()
```

候选策略：

- 讲解
- 苏格拉底式追问
- 场景生成
- 战术推荐
- 方案评审
- 跨章对比

把 Prompt 从业务代码中分离，避免越写越散。

### 4.6 LearningEvent / ProgressStore / MasteryModel

```text
LearningEvent
ProgressStore.append(event)
MasteryModel.compute(events, outline) -> mastery
```

建议先做本地事件日志，再考虑 SQLite 或云同步。

### 4.7 QuizType 注册表

```text
QuizQuestion.type: single | multiple | true_false | short_answer | flashcard
```

新增题型时扩展 schema 和前端卡片，不要复制整套自测页面。

### 4.8 KnowledgeGraph

```text
nodes: { id, label, type, slides }
edges: { source, target, label }
```

节点必须带来源页码；没有来源的 AI 概念不应进入图谱。

### 4.9 QualityScenario / TacticRecommendation / ReviewReport

这三类模型适合做成严格 Pydantic schema：

- `QualityScenario`：刺激、来源、制品、环境、响应、响应度量。
- `TacticRecommendation`：战术、适用条件、代价、引用页码。
- `ReviewReport`：质量属性、风险、战术、权衡、待确认问题、引用。

### 4.10 StorageBackend

```text
get(key), set(key, value), remove(key)
```

当前是 localStorage。未来若要 SQLite/云同步，先抽象存储后端，再替换实现。

## 5. 演示与评分建议

如果老师看重“AI + 体系结构”，建议准备一个 3 场景演示：

1. **学习场景**：Chapter 5 第 17 页问答，展示页码引用和自测。
2. **架构分析场景**：选择一个质量属性，生成场景和战术，展示引用和权衡。
3. **综合场景**：跨章对比或方案评审，展示 AI 如何用课程内容做架构决策。

加分点通常来自：

- 课程贴合度：质量属性、战术、场景、模式。
- AI 深度：结构化输出、引用、检索、评测。
- 可视化：知识图谱、场景画布、对比矩阵。
- 工程完整度：测试、可复现、文档、错误处理。
- 演示：能讲清楚“为什么需要它”和“AI 具体做了什么”。

单纯增加页面、动画或登录系统，通常不会显著加分。

## 6. 可选主线分组

后面四轮可以由每轮同学自行选择一条主线，避免都改同一块代码：

1. **内容泛化**：ContentSource、课件导入、多格式/PDF。
2. **学习机制**：LearningEvent、进度/掌握度、笔记、间隔重复。
3. **AI 与质量**：模型网关、检索升级、评测集、视觉/流式。
4. **可视化与对比**：知识图谱、场景工作台、方案评审、跨章对比。

这只是分组建议，不是任务分配。

## 7. 不建议优先做

- 多 Agent 运行时：复杂度高，对当前产品价值有限。
- 没有评测就上向量数据库：无法判断检索是否真的变好。
- 账号、云同步、公网部署：课程场景不是第一优先级，且引入安全和运维成本。
- 一次铺很多半成品功能：不如把 2–3 个功能做完整。
- 为了“看起来功能多”增加登录、深色模式、动画或营销首页。

## 8. 文档原则

- 只记录当前完成情况、已设计未完成项、可复用接口。
- 不写“下一轮必须做什么”，不替后续同学排期。
- 新增 AI 能力必须保留：无 Key 503、结构化校验、引用边界、章节隔离。
- 同一个功能不要把业务逻辑复制到多个页面；优先抽象 Strategy/Provider/Registry。
