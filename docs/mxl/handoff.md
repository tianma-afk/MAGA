# MXL → 下一轮开发者交接

**交接范围：**`tianma-afk/MAGA` 的 `feature/mxl-hybrid-retrieval` 分支。截至 **2026-11-24** 功能代码快照 `dfdfd3c3`；本目录新增的是文档提交，不改变已验收功能。

## 1. 一句话交接结论

本轮完成了两个可用、但尚未经过真实教学质量评估的能力：

- **课程 RAG 混合来源检索**：每页 PPT 建立 SQLite FTS5 BM25 + Jina 向量索引，按 `0.2` BM25 + `0.5` Embedding 融合，用户在架构实践里显式选择 `hybrid` 时才启用；索引可在选择时自动增量建立/刷新。
- **案例驱动的架构决策训练**：选案例→可选需求分析→三个架构问题→独立作答与最多两轮追问→综合评审；每个生成阶段先生成英文 Query、检索课件再调用教学 LLM；输出引用校验真实页码。

**不要误判：**没有全站切换成 Hybrid；没有做真正的 Agent Runtime；没有实现正式数值评分或真实代码执行；真实 Jina/LLM 教学效果仍待人工评测。

## 2. 接手前首先阅读

1. [repository-status.md](repository-status.md) —— 当前仓库/分支/功能边界。
2. [work-summary.md](work-summary.md) —— MXL 所有改造任务与提交线索。
3. [retrieval-implementation.md](retrieval-implementation.md) —— 索引、检索融合、Query 和来源校验。
4. [practice-teaching-design.md](practice-teaching-design.md) —— 为什么练习重心是**用户的架构决策与分析**。
5. [practice-architecture.md](practice-architecture.md) —— 具体 API、工作流、状态/持久化。
6. [validation-and-risks.md](validation-and-risks.md) —— 已验证与未验证范围。

若需要追踪“先文档、后代码”的设计过程，再看 [retrieval-design-and-worklog.md](retrieval-design-and-worklog.md) 与 [architecture-practice-v2.md](architecture-practice-v2.md)，以及团队第三轮 [iteration3_jack](../iteration3_jack/) 记录。

## 3. 拉取、配置与本地启动

**选正确分支**，不要在旧版 `main` 上判断新功能是否缺失：

```bash
git fetch origin
git switch feature/mxl-hybrid-retrieval
git pull --ff-only origin feature/mxl-hybrid-retrieval
python -m venv .venv
# 激活虚拟环境后：
python -m pip install -r requirements.txt
npm --prefix web ci
```

在仓库根目录从 `.env.example` 复制为 `.env`；设置可用的 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`。如使用 Hybrid，再设置 `JINA_API_KEY`，通过 [Jina AI](https://jina.ai/) 官方渠道申请密钥。免费额度及速率限制以官方最新政策为准。密钥不能写入 Markdown 或提交 Git。

分别启动后端与前端：

```bash
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
# 另一个终端
npm --prefix web run dev -- --port 5173
```

浏览器进入 `http://127.0.0.1:5173/#/studio`，可选三个案例。旧版教学在 `#/studio/legacy`。HTTP API 文档在 `http://127.0.0.1:8000/docs`。

索引通常**不需手工建立**：在新版实践中选择 Hybrid 后自动调用 `/api/retrieval/index/ensure`，界面会显示状态；索引位置 `data/retrieval/index.sqlite3`。运维排障可手动执行 `python -m server.retrieval_index`。首次处理会把课件文本发给 Jina；使用前确认资源授权。

## 4. 实际运行时的检查清单

- [ ] 首页和章节列表正常；PPT 文件可读取，`book/` 中的页数符合预期。
- [ ] `#/studio` 可选案例，**不填写分析也能点击“生成架构决策问题”**；AI 未配置时则正确阻止生成。
- [ ] `baseline` 正常提出三个目标对应的决策问题，学习者回答后能看到反馈、最多两轮追问及最终报告。
- [ ] `llm_assisted` 模式仍使用英文多 Query 词法检索，不和 `hybrid` 混淆。
- [ ] `hybrid` 选择后显示准备状态、页数及失败重试；只有 ready 才允许生成；不隐式回退到其他策略。
- [ ] 新版实践完整一轮后刷新，原始独立回答/追问/检索记录/最终结果都仍在；首页“继续实践”能进入。
- [ ] `#/studio/legacy` 打开已有 v1 草稿，旧 `/api/design/*` 正常。
- [ ] 任何对课件的引用可打开真实章节/页码；无关或伪造引用应拒绝。
- [ ] 运行测试并把输出贴入 [validation-and-risks.md](validation-and-risks.md) 的新日期小节。
- [ ] 真实模型的 Query、问题、反馈及引用获得课程教师抽样检查；**不要仅看前端显示成功就签收“教学质量正确”**。

## 5. 推荐后续工作的优先顺序

### P0：真实服务验收与关键缺陷修复（交接首要）

**目标：**用获授权的 Jina Key 与兼容 LLM 完成一次闭环，而非只复用 Mock。

- 测试新建索引、再次选择 Hybrid 的增量更新、英文 Query 和混合结果。
- 以每个案例至少一次完整实践验证课程引用、问题针对性、反馈可理解性。
- 记录模型名称、检索策略、Query、召回页、端到端耗时、错误率和消耗。
- 检查上传课程资料至外部 API 的授权/隐私约束，并验证真实网络 429/超时对页面的反馈。
- **验收标准：**三类模式各能跑完整实践且来源有效；失败能明确告警、不会自动伪造成功；原始回答可恢复。

### P1：构造 RAG 与教学质量评测集

**目标：**建立“改造是否值得”的证据。

- 针对真实软件体系结构课件构造包含英文、中文、术语改写、约束型需求的 Query 集，人工标注 relevant Slide。
- 固定 LLM 版本和 Prompt，比较 `baseline`、`llm_assisted`、`hybrid` 的 Recall@K、MRR、nDCG、延迟/费用。
- 为三个案例的典型学生回答制作由教师审核的评价要点；比较独立答与追问修正是否被模型恰当区分。
- 验证每条引用确实支持对应论断，区分**课程证据**与**工程推论**。
- **验收标准：**结果可从固定测试数据和脚本复现，保留负面案例、失败样本及说明，不能只选成功例子展示。

### P2：在验证之后做精准优化

仅在前两项暴露出具体瓶颈后选择：

- 若检索效果不足：改进 Query 生成、文档字段权重、同义词、精排或不同 Chunk 粒度；保持旧模式可作对照。
- 若速度/费用高：缓存同阶段稳定 Query、缓存重复查询结果、评估批量检索与向量 ANN；注意缓存有效性与来源版本。
- 若教学追问泛化弱：完善案例隐含故障、Rubric 与追问结束条件，并做人评，而不是无约束地增加 Agent 自治。
- 若需要多人共享：先设计权限、私有文档上传规则、会话持久化和审计，**不要未经论证就增加消息队列或微服务**。
- 若案例开始体验仍有摩擦：进一步测试表单默认值、可跳过分析、答题长度提示与请求错误展示。

**暂不建议的路线：**一开始做完整 Agent Runtime、在线 IDE、代码运行评测或大规模数据库分布式化；它们不是当前课程训练目标的关键瓶颈。

## 6. 接手修改时的文件定位

| 需要修改什么 | 从这些文件开始 |
| --- | --- |
| 添加一个新课程案例、修改三个考察目标 | `server/practice_cases.py`、`server/tests/test_practice.py` |
| 调整每轮追问策略、问题生成 Prompt、综合报告 | `server/practice.py`、`server/practice_models.py` |
| 改每阶段 Query 规划、选检索器、引用验证 | `server/practice_knowledge.py`、`server/design_sources.py` |
| 改索引建立/升级/失效处理 | `server/retrieval_index.py`、`server/main.py` |
| 调整融合分数与 Jina 适配 | `server/hybrid_search.py`、`server/retrieval_index.py` |
| 改案例 UI、开始按钮、学员答题与反馈呈现 | `web/src/PracticeStudio.tsx`、`PracticeStudio.test.tsx`、`practice.css` |
| 改客户端 API 与本地恢复 | `web/src/api.ts`、`practice.ts`、`resumeTasks.ts` |
| 兼容历史实践流程 | `web/src/DesignStudio.tsx`、`web/src/App.tsx`、`web/e2e/studio.spec.ts` |

## 7. 验证命令与当前证据

```bash
python -m pytest server/tests -q
npm --prefix web test
npm --prefix web run build
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
npm --prefix web run test:e2e
```

最近一次功能代码完整 CI：[Run 45312834087](https://github.com/tianma-afk/MAGA/actions/runs/45312834087) —— 后端 **268 passed**、前端 **162 passed**、Playwright **27 passed**，构建和长度检查通过（Mock Jina/LLM，不代表真实网络验收）。后续提交更改代码需重新运行并记录新证据。

## 8. 交接确认与版本策略

- **交付形态：**工作分支直接提交；混合检索历史存在 [PR #3](https://github.com/tianma-afk/MAGA/pull/3)，现已关闭且**未合并**；本次架构教学与文档改动未另建 PR，也没有把 MXL 变更合并进 `main`。
- **重要迁移策略：**保留 `#/studio/legacy`、`chapter-tutor:design:v1:current` 和 `/api/design/*`；新模式用 `chapter-tutor:practice:v2:current`。若未来废弃旧版，应在数据迁移与使用者确认后进行。
- **核心设计约束：**每次修改教学阶段或检索规则时，先修改对应 `docs/mxl` 设计文档，再修改代码与测试；不丢失真实来源校验、不改动用户的原始独立答复。
- **下轮完成定义：**有可复现的真实环境验收、客观检索质量指标、明确的教学评价依据，以及仍可通过的兼容性回归。

[返回文档索引](README.md)
