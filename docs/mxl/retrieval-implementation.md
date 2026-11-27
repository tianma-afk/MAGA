# 课程 RAG 检索的现状、实现与接入约定

**版本快照：**2026-11-24 · `dfdfd3c3`。本文说明**已经实现**的检索机制；最早的方案与取舍记录见 [retrieval-design-and-worklog.md](retrieval-design-and-worklog.md)。

## 1. 三条检索路径不能混为一谈

| 调用者 | 当前入口 | 算法 / 行为 |
| --- | --- | --- |
| 顶部全局搜索 | `GET /api/search` → `search_all` | 原始词法全量扫描 + 固定中英文术语扩展；**不是 Hybrid** |
| 章节 AI 对话/自测 | `/api/chat` / `/api/quiz` | 从当前章选择相关课件，用原始文字构造模型上下文；**未统一使用混合索引** |
| 旧版架构实践 | `POST /api/design/*` → `select_sources` | 手动选 `baseline` / `llm_assisted` / `hybrid`；前两者保留传统词法逻辑 |
| 新版架构实践 | `POST /api/practice/{plan,answer,finalize}` → `select_practice_knowledge` | 每阶段先由 LLM 生成英文 Query，再按会话选定策略获取课程知识 |

`llm_assisted` 是**多 Query 的词法召回**，不是 Embedding。`hybrid` 才使用本地 FTS5 BM25 + Jina 向量。两个阶段的 LLM Query 规划实现也不同：旧实践的 `design_planner.py` 使用固定概念与证据片段约束；新实践的 `practice_knowledge.py` 在每次教学阶段生成 1–3 条英文搜索句。

## 2. 数据准备与索引构建

原始路径：

`book/*.pptx` → `ChapterStore.read()` → 每页 `Slide`（title、text、notes、可选 OCR）→ `slide_rows()` → `rebuild()` → `data/retrieval/index.sqlite3`。

关键实现：`server/retrieval_index.py`。

- 最小检索文档单元是 **Slide（1 页 PPT）**，`doc_id = "{chapterId}:{pageNumber}"`。保留 `chapter_id`、`chapter_title`、页码、标题、正文、备注和 OCR。
- 使用 SQLite 实体表 `slides` 保存页面数据、SHA-256 文本摘要、模型名称与向量 JSON；`slides_fts` 使用 FTS5 `unicode61` 对 `title/body/notes/ocr` 建倒排表（`doc_id` 不参与词法索引）。
- 计算正文时使用 `meaningful_text()` 过滤显著的版权/页脚等文本；OCR 来源于离线生成的 `data/ocr/chapter-N/page.txt`。**搜索和建索引不会自动运行 OCR 模型**。
- 对变化页按 16 条一批向 Jina 发送 passage；模型 `jina-embeddings-v3`、1024 维、`task="retrieval.passage"`；索引端向量与检索端 `retrieval.query` 对应。
- `rebuild()` 比较现存记录的文本摘要、模型和章节标题：内容不变则保留原向量；页被删除则移除记录；改变的页重新向量化。成功后在事务中更新 SQLite。
- **索引更新的触发点**是用户在前端选择 `hybrid` 后调用的 `POST /api/retrieval/index/ensure`（或运维手动运行 `python -m server.retrieval_index`）。没有常驻文件监控、自动同步或查询时逐页比对。

第一轮全量建立索引会把课件文本发送到外部 Jina；检查课件授权、额度、速率限制及数据合规后使用。

## 3. 查询与排序的真实执行

`server/hybrid_search.py` 中的 `hybrid_search(query, limit)`：

1. 检查 `JINA_API_KEY` 与本地索引文件是否存在；缺失即返回异常，不偷偷宣称使用 RAG。
2. 将中文查询经已配置 LLM 重写为英文；如果传入的已是英文，就直接规范化。**新版实践各阶段会预先生成英文 Query**，通常不在这一步再翻译。
3. 对英文查询按正则提取词项（最多 32 个用于 FTS5 查询），通过 `slides_fts MATCH` 执行 OR 词法召回。`bm25(slides_fts, 3.0, 1.0, 1.0, 1.0)` 体现标题额外权重。
4. 向 Jina 请求一次 `retrieval.query` Embedding。
5. 读取本地所有 Slide 向量并计算精确余弦相似度；对本课程小规模语料不使用 ANN 索引。
6. 对所有 Slide 结合 BM25 和向量分数排序，返回带 `chapterId/slide/title/snippet` 的 Top-K，稳定按章节/页码破同分。

融合定义：

`S(d,q) = 0.5 * ((cos(q,d) + 1) / 2) + 0.2 * (BM25(d,q) / maxBM25(q))`。

其中，缺失 BM25 命中的页面其词法贡献为 0；没有正 BM25 命中时整条词法分量为 0。余弦分数映射到 [0,1]；每个查询的 BM25 按当次最大值缩放。**剩余权重 0.3 未分配，不是额外隐藏的 reranker**。对外 `SearchResult.score` 是按缩放后的正整数，仅用于当前查询内排序，不是概率。

注意两个实际限制：

- SQLite FTS5 `unicode61` **不是专门的中文分词器**。新实践主动使用英文查询，借助多语言 Embedding 缓解不同语言表达之间的召回困难，但不保证全部中文自然语言同义表达都能匹配。
- 召回阶段会对全体向量逐个算余弦，成本约随页面数 × 向量维度增长；340 页适用，海量资料时要重新评估向量索引结构、缓存和延迟。

## 4. 阶段检索策略及来源可信度

新版教学流程的统一入口是：

`select_practice_knowledge(store, config, phase, context, strategy, transport)`，每次：

- LLM 生成 **1–3 条英文 Query**，并校验长度、字符、URL/路径/页码污染等条件。
- `baseline`：使用第 1 条 Query 调用 `legacy_sources`（`search_all`）。
- `llm_assisted`：每条 Query 分别进行词法检索。
- `hybrid`：每条 Query 分别调用 `hybrid_search`，再加载 `ChapterStore` 的原始页面内容。
- 多路结果按轮次交错合并、按 `(chapterId, slide)` 去重，最终**最多 8 页**；不是向量与 BM25 各提供固定 8 页再做第二轮生成。
- 对全部候选执行 `validate_selection`，要求页码、标题与课程来源一致；给模型的每条来源内容截到 2,600 字符，减少 Prompt 体积。
- 生成的用户可见引用由 `canonicalize` 验证、纠正标题；禁止引用未提供的页码。未找到课件时 API 报错，不填造来源。
- 需要同步读取文件/执行混合搜索的地方通过 `run_in_threadpool` 避免阻塞 FastAPI 事件循环。

`PracticeSession` 记录每阶段的 Query 字符串和来源引用清单（`KnowledgeReceipt`），前端可查看、导出；此记录**不包含** Jina 原始向量或 API Key。

## 5. 异常、费用与数据一致性边界

- 缺少 Jina Key、索引构建失败：`/api/retrieval/index/ensure` 返回明确的 `RAG_INDEX_UNAVAILABLE`（HTTP 503）；界面保持未就绪、禁止 Hybrid 生成，提供重试。
- 已选择 Hybrid，但检索阶段异常：`RAG_UNAVAILABLE`（HTTP 503），不静默回退词法路径。
- LLM Query 规划失败/格式不合约：明确返回错误；当前新版流程**不**自动降级为无出处的通用模型回答。
- `baseline` 不要求 Jina Key；但新版实践所有核心教学生成（含 Query 规划）仍依赖可用的 LLM。
- 更换 PPT/OCR 后应重新选择 Hybrid 触发索引增量准备，或手动重建。索引“ready”意味着上一次成功建立，而非已开启文件系统实时监听。
- OCR 可能错误，图像中的关系、布局、箭头并未自动理解。真实来源验证只验证**出处身份**，不能自动证明“模型评价在语义上正确”。

## 6. 应如何评价检索改造

不要仅凭“现在用了向量检索”认定质量提高。建议以课程真实问题构建人工标注的 `query → relevant slides` 集合，同时报告：
- Recall@K、MRR、nDCG@K：尤其区分中文提问、英文课件、双语术语、口语化需求；
- p50/p95 查询延迟、首次索引构建耗时、增量更新页数、请求次数/费用；
- 索引变化后引用有效率、无命中率、未授权幻觉引用数；
- 与 `baseline`、`llm_assisted` 的同条件比较（固定 Query、相同数据、固定模型版本）。

已交付的**实现验证**见 [validation-and-risks.md](validation-and-risks.md)；评测仍是交接后的优先任务。

[返回文档索引](README.md)
