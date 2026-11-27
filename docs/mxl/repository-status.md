# MAGA 当前仓库状况

**核对日期：2026-11-24**。代码快照：`feature/mxl-hybrid-retrieval` 分支的 `dfdfd3c3f77f18b275766b708adc87fca872498b`；下文描述的是该分支，而**不是默认 `main`**。

## 1. 仓库定位与分支

MAGA（章节助教 / 架构师养成器）是面向**软件体系结构课程 PPT**的单用户本地学习工作台。已有按章节阅读、对话与讲解、原始 PPT 预览、自测、跨章搜索、学习记录和架构实践。不是通用多源文档管理系统，不提供生产级多用户账号或正式评分。

- `main`：截至核对时停留在第三轮（iteration 3）合并结果，基线提交 `f3ad65f`（2026-11-18）。
- `feature/mxl-hybrid-retrieval`：相对上述 `main` **ahead 73 commits / behind 0**（建立本文档之前的代码快照）；包括 MXL 混合检索与架构实践 v2 改造；检索阶段曾有 [PR #3](https://github.com/tianma-afk/MAGA/pull/3)，现已**关闭、未合并**；后续架构实践改造与本次文档整理直接提交到功能分支，未新建 PR。
- 第三轮原有的 `baseline` 默认 + `llm_assisted` 可选检索，是历史设计；MXL 在此基础上增加**显式 `hybrid`**，并非替换所有搜索端点。

主要目录：
| 位置 | 当前职责 |
| --- | --- |
| `book/*.pptx` | 课程原始课件：Chapter 1/2/4/5/6/7/8，共约 **340 页** |
| `server/chapters.py` | `ChapterStore`：按章解析幻灯片文本、表格、备注，内存缓存 PPT；额外读取图片和 OCR 文本 |
| `server/search.py`、`retrieval_terms.py` | 全章词法扫描、中文/英文词项及课程同义词；仍服务于全局搜索 |
| `server/retrieval_index.py`、`hybrid_search.py` | Slide 级 SQLite FTS5 + Jina 向量持久化与混合搜索 |
| `server/design*.py` | 旧版质量属性场景/战术/评审流程、来源验证、第三轮查询规划 |
| `server/practice*.py` | 新版案例仓库、教学 API、LLM Query 生成、课程证据检索、追问与最终评审 |
| `server/main.py` | FastAPI 路由、索引准备与 LLM 请求入口 |
| `web/src/PracticeStudio.tsx` | 新版案例驱动架构实践界面 `#/studio` |
| `web/src/DesignStudio.tsx` | 旧版架构实践兼容界面 `#/studio/legacy` |
| `web/src/practice.ts`、`resumeTasks.ts` | 浏览器会话存档、阶段结果、首页继续任务 |
| `server/tests/`、`web/src/*.test.tsx`、`web/e2e/` | 后端、前端和 Playwright 自动化测试 |

## 2. 已有用户能力及其边界

| 能力 | 当前可用方式 | 明确的边界 |
| --- | --- | --- |
| 课件浏览与大纲 | 章节选择、页码导航、原稿图片或文本预览 | 原稿图片需要本机预先渲染；PDF 教材没有纳入检索 |
| AI 章节答疑 | 结合章节原文回答并校验页码引用 | 配置 LLM 才能调用；不是视觉理解原始 PPT 图形 |
| AI 自测与进度 | 单选题、自测记录、错题、当前页与浏览进度 | 使用浏览器 `localStorage`；不是标准化成绩 |
| 顶部跨章搜索 | `GET /api/search` | **仍然是** `search_all` 原有词法扫描，并未全站统一切换到 BM25 |
| 旧版架构实践 | `#/studio/legacy`，质量属性→战术→评审 | 仍兼容旧 API 和历史草稿 |
| 新版架构实践 | `#/studio`，预设案例→决策问答→追问→综合评审 | 无代码编写、架构画布、自动真实工程测试；以教学反馈为目标 |
| 混合 RAG 来源检索 | 在架构实践中**明确选择** `hybrid` | 必须配置 Jina 并使索引 ready；不是所有产品入口默认开启 |
| 课件引用预览 | 点击引用回到真实章节和页码 | 引用身份可校验，不等价于模型所有论证都被课件语义支持 |

## 3. 运行依赖与数据持久化

- 后端：Python 3.11+、FastAPI、Pydantic、python-pptx、httpx、SQLite（系统 Python 标准库）；外部 OpenAI-compatible LLM。
- 前端：Node.js 22+、React + TypeScript + Vite、Vitest、Playwright。
- `.env` 中的 `LLM_API_KEY`、`LLM_MODEL` 用于所有 AI 问答、教学与英文 Query 生成；`LLM_BASE_URL` 设置兼容服务端点。
- 选择混合模式另需 `JINA_API_KEY`（`jina-embeddings-v3`）；**课程文本会发送给外部服务**，本地 `.env` 禁止提交。
- Jina/FTS5 索引：`data/retrieval/index.sqlite3`（Git 忽略）；幻灯片原稿：`data/slides/`；可选 OCR：`data/ocr/`。这些不是随代码一起分发的完整数据集。
- 学习会话、个人作答和历史：浏览器 `localStorage`；清理浏览器数据或换设备不会自动同步。

## 4. 当前可验证交付状态

最新代码快照的 GitHub Actions：[CI #45312834087](https://github.com/tianma-afk/MAGA/actions/runs/45312834087) 于 2026-11-24 **success**：
- 后端 `pytest` **268 passed**（1 warning）；
- 前端 `Vitest` **162 passed**；
- Playwright E2E **27 passed**；
- TypeScript/Vite 生产构建与仓库代码长度检查通过。

以上主要使用 Mock LLM/Jina，验证 API 契约、界面流转与回归行为；**不证明真实 Jina Key、网络额度、模型教学质量、跨语言检索效果或高并发性能**。具体证据与盲区见 [validation-and-risks.md](validation-and-risks.md)。

## 5. 重大待办（非“已经实现”）

- 缺少具有人工标注的检索 Recall@K/MRR/nDCG 和教学反馈质量评测；未证明 Hybrid 在实际课程问题上优于基线。
- 未对真实 LLM + Jina 端到端流程完成可重复验收；API 成本、速率限制与延迟仍需测量。
- 当前索引是“**选择混合模式时检查/增量更新**”，不是文件更改即自动监听重建。
- 目前没有学员账号、跨设备状态同步、生产级鉴权限流；如需公网提供服务，必须单独设计安全与隐私边界。

[返回文档索引](README.md)
