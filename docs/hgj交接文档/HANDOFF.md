# MAGA 软件体系结构大作业｜给下一位接手人的交接

- 交接人：hgj
- 更新日期：2026-11-10
- 远程仓库：[tianma-afk/MAGA](https://github.com/tianma-afk/MAGA)

## 1. 接手先看这几件事

MAGA 是一个按真实课件组织的 AI 学习与架构实践工作台。学习侧可以读课件、问答、看图解、做自测并回查引用；实践侧可以从一个实际场景出发，分析质量属性、选择战术、做形成性评审并导出 Markdown。

- **从 GitHub 的 `main` 接手。** 这次交付包含 T00–T12、11 月 10 日的 8 类确认问题修复和两份交接文档。`44a1e3f` 是这一轮改进前的基线；不要把它当成交付版本。
- **换电脑时重新准备本地环境。** 克隆或更新仓库后按下文安装依赖、配置自己的模型并准备演示素材。模型配置、个人浏览器数据、依赖和生成缓存不随源码交接。
- **核心功能已做完，可以开始准备演示。** 本机目前没有 `data/slides/` 和 `data/ocr/`，无图片时可看文本并下载原始 PPT；图片型页面的教学效果要等素材补齐再验收。老师的正式提交格式、材料清单和截止时间请向小组或老师确认。

接手后先运行以下只读命令，确认自己拿到的是哪一个版本。有多份本地改动时，先保留现状，不要用重置或清理命令覆盖工作区。

```powershell
git status --short --branch
git log -6 --oneline
git diff --stat
git ls-files --others --exclude-standard
```

建议阅读顺序：本文件 → [当前功能与接口](../FEATURES_AND_INTERFACES.md) → [实施与验收记录](../plan/learning-continuity-v1.md) → [11 月 10 日修复记录](../plan/bugfix-20261110.md)。[原始交接](../archive/AGENT_HANDOVER.md)用于了解来历，里面的分支、测试数和缓存数量是历史快照。接手以来做了哪些工作见本目录的 [hgj 工作记账](MAGA_hgj接手工作记账_截至2026-11-10.md)。评估截图、接口样本等本地证据不随仓库分发，需要时向交接人索取。

## 2. 本地启动和课件准备

下面的命令从仓库根目录执行。新机器推荐 Python 3.11、Node.js 22，和 CI 一致。已有可用环境时可以跳过创建虚拟环境和安装依赖。

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm.cmd --prefix web ci
```

第一次建议先不连模型。打开终端 1，启动后端；下面只改变这个终端的环境变量，不动已有 `.env`。

```powershell
$env:PYTHON_DOTENV_DISABLED = '1'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

在终端 2 启动前端：

```powershell
npm.cmd --prefix web run dev -- --port 5173
```

打开 [学习工作台](http://127.0.0.1:5173) 和 [后端接口文档](http://127.0.0.1:8000/docs)。前端默认把 `/api` 转发到本机 8000 端口。先确认首页有 7 章（1、2、4、5、6、7、8；没有第 3 章），能浏览大纲、课件文本，能搜“心跳”或 `heartbeat` 并打开结果。没有配置模型时，生成入口应提示不可用，阅读和搜索可以继续。

要测真实模型，只在项目根目录的 `.env` 中配置自己的或小组授权的 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`。没有 `.env` 才从 [模板](../../.env.example) 复制；已有文件不要覆盖。选用支持 `/chat/completions` 和 JSON object 输出的兼容服务。在新终端重启后端，确认没有继承 `PYTHON_DOTENV_DISABLED=1`。健康接口能检查配置是否齐备，实际能否生成要发一次真实请求验证。真实请求会发送相关课件摘录和必要的输入，可能产生费用；不要在源码、文档或截图中放密钥。

原始 PPT 在 `book/`。PDF 教材在同一目录，但没有接入索引。演示前可先只准备第 5 章：在有 Windows 桌面 PowerPoint 的机器上，先保存并关闭所有 PowerPoint 窗口，再运行：

```powershell
powershell.exe -NoProfile -STA -File scripts/render-slides.ps1 -Chapter 5
.\.venv\Scripts\python.exe -m pip install -r requirements-ocr.txt
.\.venv\Scripts\python.exe scripts/ocr-slides.py --chapter 5
```

准备全量素材时，去掉两个命令中的章节参数。渲染写到 `data/slides/`；OCR 默认只处理正文或备注不足的页面，写到 `data/ocr/`。用浏览器抽查实际页图、备注和 OCR 页；OCR 只能补文字，不能还原图中的箭头和布局。两类产物都被 Git 忽略，原始 PPT 不应为适配渲染而改写。

## 3. 做到哪里，怎么验

| 阶段 | 已有成果 |
| --- | --- |
| 交到 hgj 手上前 | 原始课件、大纲、AI 问答、页码引用、图解、自测和错题、跨章搜索、OCR 接入、架构实践基础流程 |
| hgj 接手后，T00–T08b | 环境与评估、缺陷修复；未提交练习可恢复，实践输入自动保存，评审和输入关联；统一来源预览、清空确认、错误提示 |
| T09–T12 | Markdown 表格、中英课程术语检索、首页续学/续练/续实践、窄屏搜索面板；改词立即撤掉旧结果，已取消的请求不能更新界面 |
| 11 月 10 日确认问题修复 | 8 类问题已处理，包括草稿和滚动恢复、实践旧成果保护、弹窗 Escape 与拖选、失效引用、中文检索噪声 |

T12 的隔离回归：后端 **178 项**、前端 **149 项**、Edge E2E **25 项**通过，生产构建和 500 行检查通过；后端有一条既有弃用警告。浏览器测试使用 API 测试数据，不需要真实模型。T12 已验证搜索在 320/390px 下的滚动、清空、关闭和焦点返回；不能据此宣称真实手机软键盘、全部抽屉或其他浏览器已经验收。

接手后先建立自己的基线。后端测试用无模型配置的终端；运行标准 E2E 前停止本机其他前后端实例，避免复用演示环境。Windows 默认用 Edge，CI 安装 Chromium。

```powershell
$env:PYTHON_DOTENV_DISABLED = '1'
Remove-Item Env:LLM_API_KEY,Env:LLM_MODEL,Env:LLM_BASE_URL -ErrorAction SilentlyContinue
.\.venv\Scripts\python.exe -m pytest server/tests -q
npm.cmd --prefix web test
npm.cmd --prefix web run build
npm.cmd --prefix web run test:e2e
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
git diff --check
```

如果仍在原机器，也可以复用 `data/verification/t12-20261110/` 中的隔离配置。它使用独立端口，未拦截的 API 不会转到已配置的本地后端；复跑前先另存原来的 `e2e-results.json`，以免覆盖历史验收。该目录被 Git 忽略，新机器默认拿不到。纯前端改动先跑相关单测和浏览器用例，交付前再跑适用的全套检查。

早期报告里的真实模型结果是历史验收，检索评测则是另一组证据。当前固定 20 条查询的核心页 Top-5 命中从 **10/20 提到 18/20**；`security` 和“安全性”仍未命中。复算需要本地 Git 历史中有基线提交 `44a1e3f`，仅有源码副本时不能复算基线：

```powershell
.\.venv\Scripts\python.exe scripts/evaluate-retrieval.py --repo . --cases docs/fixtures/retrieval-terms.json --output data/verification/retrieval-current.json
```

## 4. 改代码从哪里进

结构是 React/Vite 前端 + FastAPI 模块化单体后端。浏览器通过 `/api` 调用后端，后端从课件提取上下文并按需调用模型。会话、进度、练习和实践草稿保存在当前浏览器的 `localStorage`，不需要数据库，也没有账号或云同步。

| 想改什么 | 入口 |
| --- | --- |
| 首页、路由和搜索跳页 | [App.tsx](../../web/src/App.tsx)、[Home.tsx](../../web/src/Home.tsx)、[resumeTasks.ts](../../web/src/resumeTasks.ts) |
| 问答、课件和来源预览 | [Tutor.tsx](../../web/src/Tutor.tsx)、[StudyPane.tsx](../../web/src/StudyPane.tsx)、[SourcePreviewDialog.tsx](../../web/src/SourcePreviewDialog.tsx)；后端 [tutor.py](../../server/tutor.py)、[llm.py](../../server/llm.py) |
| 自测、草稿和错题 | [QuizPane.tsx](../../web/src/QuizPane.tsx)、[useQuizWorkspace.ts](../../web/src/useQuizWorkspace.ts)、[quizWorkspace.ts](../../web/src/quizWorkspace.ts)、[quiz.ts](../../web/src/quiz.ts)；后端 [quiz.py](../../server/quiz.py) |
| 实践、版本与导出 | [DesignStudio.tsx](../../web/src/DesignStudio.tsx)、[design.ts](../../web/src/design.ts)、[designValidity.ts](../../web/src/designValidity.ts)；后端 [design.py](../../server/design.py) |
| 搜索和检索质量 | [GlobalSearch.tsx](../../web/src/GlobalSearch.tsx)、[search.css](../../web/src/search.css)、[search.py](../../server/search.py)、[retrieval_terms.py](../../server/retrieval_terms.py) |
| API、课件和测试 | [main.py](../../server/main.py)、[chapters.py](../../server/chapters.py)、[outline.py](../../server/outline.py)、[前端 API 层](../../web/src/api.ts)、[后端测试](../../server/tests/)、[浏览器测试](../../web/e2e/) |

开发时保持三个约定：章节会话和练习按章节隔离，修改存储时考虑旧数据；AI 输出继续做结构与真实引用范围校验，缺配置时保留可阅读、不可生成的降级；手写源码和测试单文件不超过 500 行。引用来自合法页码，也仍需人工核对内容是否支持结论。

## 5. 下一步建议

1. **从干净目录验证交付版本。** 从 GitHub 获取 `main`，按文档重装启动一次。确认老师是否要求报告、PPT、视频、源码或现场演示，再准备对应材料。
2. **准备两条能讲清楚的演示。** 学习侧用第 5 章第 17 页心跳检测：问答或图解 → 做部分自测 → 查课件来源 → 回到题目并提交。实践侧用“在线考试服务短时故障”：填场景和恢复目标 → 生成质量属性与战术 → 说明选用和不选的理由 → 评审 → 修改战术 → 检查旧评审标记 → 导出。演示前用最新版和授权模型走一遍，准备截图或导出样本作断网备用，并标明是事先生成的。
3. **有时间可以接着做 T13/T13b。** T13 优先收口实践反馈和主要操作；T13b 在真实手机上走一次输入、软键盘弹出、关闭和返回，重点验证来源弹窗和资料抽屉的键盘焦点。当前没有正式完成这些专项。

## 6. 也可以自己选一个方向继续做

上面的顺序适合近期要答辩。如果组里有时间，可以在现有功能上**加东西、做优化或主动找 Bug**。可以先挑一个小点，把它做到能演示、能验证：

| 方向 | 可以先做 | 怎么验收 |
| --- | --- | --- |
| 加功能 | 给实践战术加“选择理由”，写进导出的 Markdown；或给错题增加待复习标记 | 离开再回来能恢复；旧草稿仍能打开；导出与页面内容一致 |
| 做优化 | 搜索高亮或章节筛选；补齐“安全性”的核心页召回；实践生成时更清楚地显示阶段和可重试状态 | 用原来的 20 条固定查询对照；不改期望页凑分；生成失败时保留原草稿 |
| 找 Bug | 重点看草稿恢复、连续提交、慢请求迟到、章节切换、引用失效、弹窗和窄屏；也可以测没有模型或没有课件页图的情况 | 记录版本、步骤、预期、实际和影响；先独立复现，再做小修并加回归；没有复现的列为待确认 |

想扩展更多，可以看[后续方向](../FUTURE_DIRECTIONS.md)。账号、云同步、上传新课件和知识图谱都可以讨论，先看它们能否解决本次作业的实际需求。之前“放弃草稿遇到存储失败后复活”只记录了可疑机制，尚未独立确认。全链路未知 Bug 审查也只留下过方案和准备材料，没有完成新一轮交付；无需为接手启动旧的自动审查。

每次改完留一小段记录：**改了什么、怎么验证、还有什么没测、改动在哪个提交或工作区**。下一位接手时，先读这份交接和当前接口，再按最新代码及验证记录判断状态。
