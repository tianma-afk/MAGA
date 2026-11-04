# 软件体系结构 AI 伴学工作台（MAGA）—— Agent 工作交接文档

> 本文档整理了本项目从立项到当前阶段的**全部交流过程、最初需求演进、技术架构、完成情况及后续开发指引**，旨在让任何接手本项目的 AI Agent 或开发者能够零成本获取完整的项目上下文，无缝继续工作。

---

## 0. 当前状态（2026-11-05）

- 当前分支：`feat/quiz-and-foundation`
- 本轮新增：结构化自测（多次历史 + 跨页错题回顾）、跨章搜索、当前接口/扩展文档。
- 当前验证：后端 113 项、前端 47 项、E2E 8 项、Vite 生产构建、500 行检查均通过。真实模型冒烟需要在 `.env` 填写自己的 Key/模型后手动执行。
- 当前 API 契约、存储格式和可复用扩展点：见 `docs/EXTENSION_POINTS.md`。
- 已设计但未完成：共享上游调用 helper、检索质量评测、完整错题本导出、流式输出、OCR/视觉理解。
- 下方历史内容保留原貌；如与当前代码不一致，以当前代码和 `docs/EXTENSION_POINTS.md` 为准。

---

## 1. 项目背景与最初需求

### 1.1 项目性质与目标
- **项目定位**：大三“软件体系结构”课程期末大作业（AI + 软件体系结构）。
- **核心目标**：针对授课教师提供的课件与讲义（存放于项目根目录 `book/` 下），打造一个能够以“真实课件为依据”、以“章节为学习单元”的**软件体系结构 AI 伴学工作台**。
- **项目代号**：MAGA（Multi-Agent / Architecture Guided Assistant）
- **远程仓库**：`git@github.com:tianma-afk/MAGA.git`（分支：`main`）

### 1.2 最初的痛点与输入状态
1. **课件繁杂且混乱**：原始 `book/` 目录下存放了教师分发的多种 PPT 文件，其中存在多章合并的情况（如 `Chapter 2-4-zikun.pptx` 和 `Chapter 6-8.pptx`），无法直接作为系统化助教的数据源。
2. **缺乏结构化导航**：PPT 动辄数十上百页，学生难以把握全书的逻辑脉络与架构演化线。
3. **传统 AI 助教的弊端**：普通大模型容易脱离教材“自由发挥”或产生幻觉，缺乏对具体 PPT 页码的真实溯源和图解能力。

---

## 2. 历次对话交流全记录与需求演进

本项目通过多次对话迭代演进，各阶段的核心沟通与关键决策如下：

### 阶段一：课件拆分与数据源标准化（第 1 次对话）
- **用户指令**：*“请把 book 下的 2-4 的 ppt 和 6-8 的 ppt 分别拆分成 2 个 ppt。”*
- **沟通与重要发现**：
  - 通过解析 `Chapter 2-4-zikun.pptx` 的 XML 结构，发现原作者**并未制作 Chapter 3** 的内容，课件实际上由 Chapter 2（第 1~22 页）和 Chapter 4（第 23~54 页）组成。
  - 用户确认：“是不是没有区分 chapter3，然后 7 和 8 可以再拆下”。
  - 最终使用 Windows COM 自动化脚本将课件精确拆分并规整为：
    - `book/Chapter 2-zikun.pptx`（22 页）
    - `book/Chapter 4-zikun.pptx`（32 页）
    - `book/Chapter 6.pptx`（41 页：Interoperability 互操作性）
    - `book/Chapter 7.pptx`（62 页：Modifiability 可修改性）
    - `book/Chapter 8.pptx`（59 页：Performance 性能）
  - 结合已有的 Chapter 1（85 页）与 Chapter 5（39 页），**确立了全书 7 个核心章节、共 340 页的规范化课件基础**。

### 阶段二：系统方案设计与全栈工程落地（第 2 次对话）
- **用户指令**：*“我们想做一个 AI+软件体系结构的大作业，主要是通过 AI 助手教授 book 下的讲义。然后我们想要请你做出一个大致的方案来。”*
- **架构方案与演进沟通**：
  1. **工作台主页（学习空间 Home）**：放弃“开屏直接进入第一章”的简陋做法，增加独立的学习空间主页，呈现 7 个章节卡片、页码总览，并记忆各章节的本地阅读进度。
  2. **串联 PPT 的“章节思路大纲（Roadmap）”**：为 7 个章节梳理出不重不漏的主题节点链，完全覆盖 340 页 PPT。用户可在界面上点击大纲节点或页码直接跳转查看对应原稿。
  3. **拒绝虚假演示，全面采用纯真实 API 模式**：
     - **关键决策**：彻底移除“离线/模拟 AI 回答”，未配置 `LLM_API_KEY` 时明确返回 `503 AI_NOT_CONFIGURED`，并在前端给出明确引导。只有在用户配置真实兼容 API 时才发起调用，确保教学的真实性与学术诚信。
  4. **架构图解可视化（Diagram Canvas）**：当学生提出“请画出故障检测图”等请求时，后端通过结构化 JSON 返回节点与连线，前端以无渲染依赖的高性能 Canvas/SVG 展现。
  5. **工程规范**：严格执行“单文件不超过 500 行”的代码红线，完备构建 Python pytest、Vitest、Playwright E2E 测试用例。

### 阶段三：测试验收与 Git 远端推送（第 3 次对话）
- **用户指令**：*“请确认现有代码情况，提交 git 到远程仓库。”*
- **执行过程与结果**：
  - 运行全套验证流水线：后端 78 个测试通过、前端 30 个测试通过、TypeScript + Vite 构建成功、E2E 测试通过。
  - 安全审查：强化 `.gitignore` 规则，确保真实 `.env` 永远不入库，仅维护空模板 `.env.example`。
  - 完成本地提交并将分支成功推送到 GitHub 远程仓库：
    - `7410636`: `feat: add chapter tutoring workspace baseline`
    - `8f2cfd4`: `feat: add learning outlines, roadmap navigation, and configuration management`

### 阶段四：跨会话信息整合与 Agent 交接（当前对话）
- **用户指令**：*“请把我们在对话过程中的交流信息，最初的需求，项目的完成情况等信息整理成一个 md，放在 docs 下，方便其他 agent 交接工作。写完后提交到远程 github。”*
- 形成本文档 `docs/AGENT_HANDOVER.md` 并推送到 GitHub 远端仓库。

---

## 3. 系统技术架构与核心模块清单

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Frontend (React 19)                  │
│  - 学习空间主页 (Home.tsx)   - 章节思路大纲 (Roadmap.tsx)     │
│  - 伴学问答区 (Chat.tsx)     - 课件预览 (SlideViewer.tsx)    │
│  - 架构图解画布 (DiagramViewer.tsx)                         │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON API (/api)
┌──────────────────────────────▼──────────────────────────────┐
│                    FastAPI Backend (Python)                 │
│  - 路由与服务装配 (main.py)   - 课件解析目录 (catalog.py)      │
│  - 章节大纲映射 (outline.py)  - 教学协调服务 (tutor.py)        │
│  - 模型调用网关 (model_gateway.py)                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
     本地数据与课件资产               配置的上游 LLM 服务
   - book/*.pptx (原始课件)         - OpenAI 兼容接口
   - data/slides/*.png (渲染原稿)   - JSON 结构化输出
```

### 3.1 核心代码清单与职责划分

| 文件路径 | 职责说明 | 关键约束与设计 |
| --- | --- | --- |
| `server/chapters.py` | 课件目录、PPT 解析、mtime 缓存 | 读取 `book/*.pptx`，不修改原文件 |
| `server/outline.py` | 章节主题大纲与页码映射 | 内容签名匹配失败时降级为标题分组 |
| `server/tutor.py` | 章节内相关页检索与上下文节选 | 关键词排序，不建立向量库 |
| `server/llm.py` | 聊天模型调用与结构化输出校验 | 无配置 503；引用必须来自上下文 |
| `server/quiz.py` | 自测生成与输出校验 | 3–5 题、引用边界、稀疏页面 422 |
| `server/search.py` | 跨章关键词搜索 | 标题加权；无需 AI；中英文 token |
| `server/config.py` | 读取并校验模型配置 | Key 只在服务端读取 |
| `server/main.py` | FastAPI 路由装配 | `/api/chat`、`/api/quiz`、`/api/search` 等 |
| `web/src/App.tsx` | 路由、章节列表、搜索跳转 | hash 路由；`jump` 状态 |
| `web/src/Home.tsx` | 学习空间主页 | 章节卡片与上次阅读页 |
| `web/src/Tutor.tsx` | 章节会话容器 | 请求中止、重置、跳页、自测入口 |
| `web/src/Roadmap.tsx` | 大纲导航 | 节点/页码驱动翻页 |
| `web/src/StudyPane.tsx` | 课件/大纲/自测/画布抽屉 | `Pane` 联合类型 |
| `web/src/QuizPane.tsx` | 自测生成、判分、历史、错题 | 按章节隔离 |
| `web/src/GlobalSearch.tsx` | 跨章搜索入口 | 点击结果跳章节/页码 |
| `web/src/state.ts` | 章节会话存储与 reducer | `chapter-tutor:v2:{id}` |
| `web/src/quiz.ts` | 自测存储、判分、错题汇总 | `chapter-tutor:quiz:v1:{id}` |
| `scripts/render-slides.ps1` | PPT 逐页渲染 | 需要桌面 PowerPoint |
| `scripts/check-file-lengths.mjs` | 500 行检查 | 手写源码卡点 |

---

## 4. 历史阶段完成情况（截至 2026-11-01）

以下为历史阶段记录；本轮新增的自测和跨章搜索见第 0 节和 `docs/EXTENSION_POINTS.md`。

| 模块 / 需求 | 完成状态 | 验收与验证依据 | 备注 |
| --- | :---: | --- | --- |
| **课件拆分与规范化** | 100% | 7 个章节文件存在且解析正常 | 原始 PPT 保存在 `book/` 目录 |
| **学习空间主页** | 100% | Vitest 单测 + Playwright E2E | 路径 `# /`，支持卡片跳转与阅读记忆 |
| **章节思路大纲 (Roadmap)** | 100% | `test_outline.py` 78 个用例覆盖 | 覆盖 340 页，连续无重叠，支持双向联动 |
| **课件图片/文字预览** | 100% | 340 张页面图片渲染并支持降级 | 静态文件通过 `/slides/` 路由提供 |
| **真实 AI 教学问答** | 100% | 支持所有兼容 OpenAI 规范的模型 | 提示词强制要求引用课件页码 |
| **体系结构图解生成** | 100% | 架构图数据结构校验 + 画布渲染 | 适用于高可用、故障恢复等复杂拓扑示意 |
| **安全与无离线伪造** | 100% | `browser-smoke.mjs` 测试通过 | 未配 Key 明确报 503，不欺骗用户 |
| **自动化测试覆盖** | 100% | 后端 pytest + 前端 Vitest + E2E | 持续保证主干随时可运行 |
| **代码规范（500行限制）** | 100% | 40 个源码文件全数通过检查 | 依靠自动脚本校验 |

---

## 5. Agent 必须遵守的核心设计规范与红线

后续任何接手本项目的 Agent 必须严格遵守以下原则：

1. **单文件 500 行限制**：
   - 任何新增或修改的手写代码文件（`.py`, `.ts`, `.tsx`, `.js`, `.mjs`, `.css`, `.ps1`）行数**绝不能超过 500 行**。
   - 每次修改后必须运行 `node scripts/check-file-lengths.mjs` 进行校验。超限时须进行组件拆分或模块化解耦。
2. **凭据安全与环境变量保护**：
   - 永远不得将真实的 API Key、Base URL 或私密配置写入代码仓库。
   - `.env` 必须保持被 Git 忽略；所有新增的环境变量必须同步声明在 `.env.example`（仅保留空值与注释）。
3. **真实 AI 原则（禁止 Fake AI）**：
   - 绝不允许引入离线硬编码的伪造“老师回答”。
   - 当缺少模型配置时，服务端必须如实返回 503，前端引导用户前往 `.env` 进行配置。
4. **页码溯源与真实课件绑定**：
   - AI 的回答与教学图必须基于当前章节所提取的实际文本内容。
   - 引用的页码必须落在当前章节的有效页码范围（1 ~ `slide_count`）内，严禁捏造不存在的页码。
5. **章节上下文隔离**：
   - 各章节之间的问答记录、阅读进度保存在浏览器端 `localStorage` 中，必须以 `chapterId` 为命名空间进行严格隔离，切换章节时不能发生串章或消息泄露。

---

## 6. 新 Agent 快速上手指南（Runbook）

### 6.1 本地环境准备
- **运行要求**：Windows 操作系统（PowerPoint 渲染脚本依赖）、Python 3.11+、Node.js 22+。
- **依赖安装**：
  ```powershell
  # 1. Python 环境
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt

  # 2. 前端环境
  npm --prefix web ci
  ```

### 6.2 环境变量配置
```powershell
# 复制模板配置
Copy-Item .env.example .env

# 在 .env 中填写真实配置：
# LLM_API_KEY=your_key
# LLM_BASE_URL=https://api.openai.com/v1 (或兼容中转地址)
# LLM_MODEL=gpt-4o (或其它模型名)
```

### 6.3 必跑验证套件
在每次修改提交前，执行以下完整验证指令：
```powershell
# 1. 后端单元测试
python -m pytest server/tests -q

# 2. 前端单元测试
npm --prefix web test

# 3. 前端构建测试
npm --prefix web run build

# 4. 代码 500 行规则检查
node scripts/check-file-lengths.mjs

# 5. 浏览器端 E2E（本机 Edge / Chromium）
npm --prefix web run test:e2e
```

### 6.4 启动服务
```powershell
# 终端 1：启动 FastAPI 后端 (端口 8000)
.\.venv\Scripts\python -m uvicorn server.main:app --host 127.0.0.1 --port 8000

# 终端 2：启动 Vite 前端 (端口 5173)
npm --prefix web run dev -- --port 5173
```
浏览器访问：`http://127.0.0.1:5173`。

---

## 7. 可扩展方向（仅供参考，不分配任务）

以下是当前设计中尚未完成或可继续探索的方向。它们只是接口/思路，不要求后续接手者按顺序完成；具体契约见 `docs/EXTENSION_POINTS.md`。

- **视觉/OCR**：课件图片尚未被模型理解，图片型页面目前明确提示信息不足。若要让模型理解图中内容，可接入视觉模型或 OCR，并保留来源与错误提示。
- **检索质量评测**：可离线测 `relevant_slides` 的 Hit/Recall，再决定是否升级中文分词、BM25 或混合检索。
- **自测扩展**：当前已支持多次历史和跨页错题；可继续增加题型、按大纲节点聚合、错题本导出。
- **跨章搜索扩展**：当前搜索是关键词打分；可在保持 `SearchResponse` 契约的前提下替换为 embedding/混合检索，或增加筛选、分页、高亮。
- **部署与多用户**：当前是单用户本地应用；公网部署前需要鉴权、限流、审计、TLS、预算控制和隐私策略。
- **流式输出**：当前结构化 JSON + 校验优先；若做流式，需要重新设计边流边校验的协议。

---
*最后更新：2026-11-05*

*维护者：项目团队*
