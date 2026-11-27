# 章节助教

以一个章节 PPT 为一次持续学习对话的软件体系结构伴学工作台。
默认进入“学习空间”主页，选择章节后进入独立的学习对话。
每章具有串联 PPT 的主题节点大纲；课件与体系结构画布按需展开。

## 本地启动

需要 Python 3.11+、Node.js 22+。在项目根目录运行：

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm --prefix web ci
.\.venv\Scripts\python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

另一个终端启动前端：

```powershell
npm --prefix web run dev -- --port 5173
```

浏览器打开 `http://127.0.0.1:5173`。后端接口文档在
`http://127.0.0.1:8000/docs`。前端 `/api` 默认代理至 8000 端口。
若端口被占用，可更换前端端口；更换后端端口时同步修改
`web/vite.config.ts` 中的代理地址。

## 配置 AI（必需）

首次使用，将根目录 `.env.example` 复制为 `.env`：

```powershell
Copy-Item .env.example .env
```

已有 `.env` 时不要覆盖。填写所用服务商的配置：

```dotenv
LLM_API_KEY=your-provider-key
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL=your-model-name
```

需要支持 `/chat/completions` 和 JSON object 输出的兼容服务。
重启后端后刷新浏览器。密钥仅在服务端读取，不会写入前端。
启用后会向所配置服务发送问题、部分对话历史和相关课件文字。
模型服务费由配置的账号承担。

旧版架构实践默认使用“标准检索”，可手动选择“AI 增强检索”；新版架构决策实践也支持上述模式及 RAG 混合检索。增强会在每次生成前额外进行一次需求规划，可能更慢且不保证更准确；已知规划失败会回退标准检索，最终生成失败仍明确报错。选择只影响后续生成，重新打开页面恢复标准模式。实现见[双策略集成记录](docs/iteration3_jack/phase3-dual-strategy-integration.md)。Phase 3 已于2026-11-17经人工裁定与复验达到 Gate PASS、ADR Accepted；原始 FAIL 保留，真实工作流为2次增强成功、1次降级成功。当前交付限制及团队人工确认事项见[最终交接](docs/iteration3_jack/phase4-final-handoff.md)。

**没有离线教学模式。** 缺少密钥或模型名时，主页和对话区提示配置，
AI 讲解、自测和图解不可用，聊天 API 返回 503。此时仍可浏览讲义和
章节大纲，但不会产生任何模拟老师回答。上游接口失败也会明确报错。

Git 仅跟踪 `.env.example`，忽略 `.env` 和 `.env.*`。
不要在模板或前端环境变量中填写真实密钥。

## 混合检索索引（可选）

MAGA 可使用本地 SQLite FTS5 BM25 与 Jina `jina-embeddings-v3` 混合检索，每页 PPT 作为一个检索单元。权重为 Embedding **0.5**、BM25 **0.2**，剩余 **0.3** 暂不分配；按查询内 BM25 归一化以及余弦得分融合。查询使用英文，中文查询在已配置 LLM 时先翻译为英文。仅在“架构实践 → 课程来源检索”明确选择“RAG 混合检索”时使用；RAG 索引或服务失败会明确报错，不会静默降级。标准检索与 AI 增强检索保持原行为。

在 [Jina AI](https://jina.ai/) 注册并获取可用的免费 API Key（额度、速率限制以其官网当前说明为准），将其填写在根目录 `.env`：

```dotenv
JINA_API_KEY=your-jina-api-key
```

**无需手动建立索引。**启动前后端后，在架构实践页面选择“RAG 混合检索”，系统会自动检查并增量构建本地索引。构建中界面禁止继续生成；构建就绪后自动解锁。失败时展示原因并可点击“重试构建 RAG 索引”。首次运行可能需要向 Jina 发送全部课件文本，耗时取决于网络、额度与速率限制。

需要排障或批量维护时仍可在项目根目录手动执行 `python -m server.retrieval_index`，但这不是正常使用的前置步骤。

索引保存至被 Git 忽略的 `data/retrieval/index.sqlite3`，保留课件页码和真实内容。下次选择 RAG 时仅对变化页面重新请求 Embedding。**索引构建会发送 PPT 文本至 Jina API**；请确认课程资料允许上传，且不把密钥提交 Git。索引和模型版本需要一致；不配置 Jina 时保留原搜索行为。架构设计和测试计划见 [docs/mxl/retrieval-design-and-worklog.md](docs/mxl/retrieval-design-and-worklog.md)。

## 课件

当前课件为 Chapter 1、2、4、5、6、7、8，共 340 页。系统读取
`book/*.pptx` 的标题、正文、表格和备注，按章节数字排序。
PDF 教材保留在 book 中，但当前未建立全书索引。

当前机器已生成 `data/slides/chapter-N/页码.png` 原稿图片。
这些生成文件被 Git 忽略；新电脑需要重新生成：

```powershell
pwsh -NoProfile -STA -File scripts/render-slides.ps1
```

渲染需要 Windows 桌面版 PowerPoint，运行前关闭已有 PowerPoint 窗口。
只重新渲染某章：

```powershell
pwsh -NoProfile -STA -File scripts/render-slides.ps1 -Chapter 5 -Overwrite
```

没有 PowerPoint 或未渲染时，前端显示明确标注的文本预览，并可下载
原始 PPT。原稿图片展示不等于模型已识别图中内容；文字、备注和可选的
OCR 文本会进入模型上下文，但图中的箭头和结构仍不会被理解。

### 可选 OCR

图片型页面默认没有可提取文字。若要让 AI 读取图中的文字：

```powershell
.\.venv\Scripts\python -m pip install -r requirements-ocr.txt
.\.venv\Scripts\python scripts/ocr-slides.py
```

脚本默认只处理正文/备注不足的页面，输出 `data/ocr/chapter-N/页码.txt`，
该目录被 Git 忽略。后端会自动读取这些文本；运行应用本身不需要 OCR 包。
OCR 结果可能有误，且不能理解箭头、布局和图形结构。

## 使用

学习空间优先显示“继续学习、继续练习、继续实践”任务卡，恢复最近阅读位置、未提交答案或实践草稿；没有记录时可直接开始学习。下方保留章节列表。
选择章节后，通过学习大纲查看
“主题节点 → PPT 页组 → 下一主题”的顺序。节点关联真实页码，
可打开对应讲义页；大纲是导航元数据，不是模拟的 AI 回答。

配置 AI 后可输入问题、继续学习或自测。打开课件可手动翻页，
点击回答或自测解析中的引用可在来源预览中查看对应页，关闭后回到原任务。
请求图解时，模型可以生成节点/连线画布；图形为教学示意，不是原稿重绘或完整仿真。

每章的消息和当前页保存在当前浏览器本地；刷新后继续，章节之间隔离。
清空章节需要确认。浏览器清理站点数据会删除记录。

### 自测与跨章搜索

- 打开章节后，点击“本页自测”或资料抽屉中的“自测”标签，可根据当前页和所属大纲节点生成 3–5 道单选题。
- 提交后显示得分、逐题解析和引用页码；本章的多次自测历史、跨页错题回顾会保存在浏览器本地。
- 自测结果支持“只练错题”、删除单条历史和导出错题 Markdown。
- 首页显示每章已浏览页数、最近保留的自测次数和平均正确率；大纲节点显示未测或正确率。
- 清空章节会同时清除该章的对话、自测记录和学习进度。未配置模型时不能生成新自测，但已保存的历史仍可查看。
- 自测题目由模型生成，必须对照课件核对，不作为正式成绩。
- 点击顶部“搜索课件”，输入关键词后点击“搜索”或按回车。可跨 7 章检索课件文字、备注和已有 OCR，点击结果直接跳到对应章节和页码；未配置模型也可使用。

### 架构实践（案例驱动的架构决策训练）

- 从首页或侧边栏进入 `#/studio`，选择一个**预设项目案例**：校园活动报名、在线考试或图片素材检索。案例提供背景、业务需求与已知约束，无需自行编造项目。
- 学习者可以先填写**需求理解、补充约束和潜在风险**，也可以**跳过分析直接开始**；系统根据案例的三个固定考察目标生成架构决策问题。**不要求绘制架构图、定义完整接口或编写代码**。
- 对每个决策点独立提出方案和设计理由，AI 根据实际回答进行有针对性的追问，最多两次追问；回答完成后记录形成性反馈。最后生成整体评价、改进建议与对照性的参考设计思路。首次独立作答和追问后的修正分别保留。
- 每次生成问题、追问及最终评审前，LLM 均生成 **1～3 条英文课程检索 Query**；检索器根据用户选择的“标准检索 / AI 增强检索 / RAG 混合检索”取得课件内容，再交给 LLM 进行提问与评价。引用必须是**真实 PPT 章节和页码**；无法由课件直接证明的工程推理不能冒充课程原文。
- 混合 RAG 会自动准备 Jina 索引；索引构建失败时停止生成并展示错误，不会假称已经使用 RAG。检索策略在当前实践开始后锁定。浏览器保存当前的完整问答、课程查询记录和评审结果，支持刷新恢复与导出 Markdown。
- 模型反馈属于**形成性学习评价**，不是经过人工验证的标准化成绩。调用需要配置模型；查询规划会增加额外的模型调用与延迟。

**旧版兼容：** 原有“质量属性与场景 → 战术 → 评审”的草稿仍可通过 `#/studio/legacy` 查看和继续，首页旧版实践草稿的恢复链接也会跳转到该页面。原有 `/api/design/*` 接口仍保留。完整设计、检索嵌入点与状态模型见 [架构实践 v2 设计记录](docs/mxl/architecture-practice-v2.md)。

答辩演示路径：学习空间 → Chapter 5 → 心跳检测相关页面 → AI 课程讲解 → 自测 →
架构实践中选择“校园活动报名” → 提交需求分析 → 完成并发一致性、可靠通知、架构演进三个决策点 → 查看课程来源与综合评审。真实教学需先配置模型。

## 模块与验证

| 目录 | 责任 |
| --- | --- |
| `server/` | 课件解析、教学策略、自测、跨章搜索、架构实践、模型调用、API 与测试 |
| `web/src/` | 对话与状态、章节导航、课件、画布、自测、跨章搜索、架构实践 |
| `scripts/` | 原稿渲染、可选 OCR 生成、500 行限制检查 |
| `docs/FEATURES_AND_INTERFACES.md` | 当前功能、API/存储/组件接口、验证与限制 |
| `docs/FUTURE_DIRECTIONS.md` | 可选功能方向、接口建议和演示思路 |
| `docs/mxl/README.md` | MXL 当前工作文档索引：现状、工作总结、检索设计、教学流程、测试与交接 |
| `docs/archive/` | 历史设计、实施、验收与交接记录 |

```powershell
python -m pytest server/tests -q
npm --prefix web test
npm --prefix web run build
npm --prefix web run test:e2e
node --test scripts/check-file-lengths.test.mjs
node scripts/check-file-lengths.mjs
```

浏览器端验收脚本为 `tests/browser-smoke.mjs`，在前后端已启动且
未配置模型密钥时执行，检查主页、大纲导航和配置保护，不伪造教学。
需可用的 Playwright 与 Chromium；可通过
`PLAYWRIGHT_MODULE` 环境变量指定现有 Playwright 安装目录，然后运行
`node tests/browser-smoke.mjs`。截图写入 `data/verification/`。

手写代码文件限制为 500 行；依赖、生成资源和锁文件不参与该限制。
这是单用户本地项目，没有账号系统、云同步或正式成绩管理。
公网部署前需要补充认证、限流和隐私控制。

